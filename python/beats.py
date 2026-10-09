"""Detecta as batidas de uma música e grava a grade do click inteligente.

Usa o beat_this (rede neural da JKU Linz, licença MIT) para achar as batidas e
o "1" de cada compasso, e depois transforma isso numa grade estável:

- compasso coerente: pós-processamento DBN (madmom_infer, da pasta das
  seções) quando disponível; sem ele, usa a saída direta da rede;
- um pulso só na música inteira, escolhido pelo TEMPO de música em cada
  andamento (a rede às vezes conta um trecho no dobro ou na metade);
- o click segue andando nas pausas, em vez de sumir;
- o "1" é escolhido por trechos (gravação ao vivo pode ganhar/perder um tempo).

Saída: JSON com bpm, beats (segundos) e downbeats (segundos).
"""
import argparse
import json
import sys
import wave

import numpy as np


def emit(**kwargs):
    print(json.dumps(kwargs), flush=True)


def fail(msg):
    emit(type="error", message=msg)
    sys.exit(1)


def read_wav(path):
    # o mix.wav do app é sempre PCM 16 bits (ver convertToWav no pipeline)
    with wave.open(path, "rb") as w:
        if w.getsampwidth() != 2:
            fail(f"unsupported wav sample width: {w.getsampwidth()}")
        sr = w.getframerate()
        channels = w.getnchannels()
        frames = w.readframes(w.getnframes())
    signal = np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0
    if channels > 1:
        signal = signal.reshape(-1, channels)
    return signal, sr


def dominant_period(beats):
    """Andamento que ocupa mais TEMPO da música (não o que tem mais batidas:
    num trecho contado no dobro há o dobro de batidas votando)."""
    ibi = np.diff(beats)
    order = np.argsort(ibi)
    cum = np.cumsum(ibi[order])
    return float(ibi[order][np.searchsorted(cum, cum[-1] / 2)])


def follow_grid(beats, period):
    """Click sempre no passo do andamento dominante: a cada passo encaixa na
    batida detectada mais próxima; sem batida perto (pausa, trecho contado em
    outro andamento), segue sozinho no mesmo passo."""
    grid = [float(beats[0])]
    local = period
    while grid[-1] + 0.5 * local < beats[-1]:
        expected = grid[-1] + local
        k = int(np.argmin(np.abs(beats - expected)))
        grid.append(float(beats[k]) if abs(beats[k] - expected) <= 0.2 * local else expected)
        if len(grid) > 4:
            # acompanha pequenas variações de andamento sem mudar de "oitava"
            local = float(np.clip(np.median(np.diff(grid[-9:])), 0.9 * period, 1.1 * period))
    return np.array(grid)


def bar_phases(grid, beats, downbeats, period, beats_per_bar, block_bars=8):
    """Fase do "1" por blocos de compassos. Só votam os "1" da rede em trechos
    onde ela contou no mesmo andamento do click; bloco sem voto claro herda a
    fase do anterior (evita o acento ficar trocando à toa)."""
    ibi = np.diff(beats)
    votes = []
    for d in downbeats:
        i = int(np.argmin(np.abs(grid - d)))
        if abs(grid[i] - d) > 0.08:
            continue
        j = int(np.clip(np.searchsorted(beats, d), 1, len(ibi)))
        local = float(np.median(ibi[max(0, j - 4):j + 4]))
        if abs(local - period) <= 0.15 * period:
            votes.append(i)
    if not votes:
        return np.zeros(len(grid), dtype=int)
    votes = np.array(votes)
    block = block_bars * beats_per_bar
    phases = np.zeros(len(grid), dtype=int)
    current = int(np.bincount(votes % beats_per_bar, minlength=beats_per_bar).argmax())
    for start in range(0, len(grid), block):
        in_block = votes[(votes >= start) & (votes < start + block)]
        if len(in_block) >= 3:
            counts = np.bincount(in_block % beats_per_bar, minlength=beats_per_bar)
            if counts.max() >= 0.6 * len(in_block):
                current = int(counts.argmax())
        phases[start:start + block] = current
    return phases


def build_grid(beats, downbeats):
    period = dominant_period(beats)
    grid = follow_grid(beats, period)
    # compasso: o tamanho mais comum entre "1"s da rede, nos trechos no andamento dominante
    gaps = np.diff(np.searchsorted(beats, downbeats))
    gaps = gaps[(gaps == 3) | (gaps == 4)]
    beats_per_bar = int(np.bincount(gaps).argmax()) if len(gaps) else 4
    phases = bar_phases(grid, beats, downbeats, period, beats_per_bar)
    bars = grid[[i for i in range(len(grid)) if (i - phases[i]) % beats_per_bar == 0]]
    return grid, bars, 60.0 / period, beats_per_bar


def load_dbn(lib):
    """DBN do madmom_infer (vem com o motor de seções). Sem ele, None."""
    if not lib:
        return None
    sys.path.insert(0, lib)
    try:
        import madmom_infer
        import madmom_infer.features
        import madmom_infer.features.downbeats as downbeats_mod
    except Exception:
        return None
    # o beat_this procura o pacote com o nome original
    sys.modules["madmom"] = madmom_infer
    sys.modules["madmom.features"] = madmom_infer.features
    sys.modules["madmom.features.downbeats"] = downbeats_mod
    return downbeats_mod


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--lib", default="")
    args = parser.parse_args()

    emit(type="progress", stage="beats", pct=0, message="Detecting beats")
    try:
        from beat_this.inference import Audio2Beats
    except Exception as e:
        fail(f"beat engine unavailable: {e}")

    try:
        signal, sr = read_wav(args.input)
    except (OSError, wave.Error) as e:
        fail(f"could not read audio: {e}")
    try:
        # CPU de propósito: leva poucos segundos e não disputa a GPU com a separação
        use_dbn = load_dbn(args.lib) is not None
        tracker = Audio2Beats(checkpoint_path=args.checkpoint, device="cpu", dbn=use_dbn)
        beats, downbeats = tracker(signal, sr)
    except Exception as e:
        fail(f"beat detection failed: {e}")

    beats = np.asarray(beats, dtype=float)
    downbeats = np.asarray(downbeats, dtype=float)
    if len(beats) < 8:
        fail("not enough beats detected")

    grid, bars, bpm, beats_per_bar = build_grid(beats, downbeats)
    result = {
        "version": 2,
        "bpm": round(bpm, 2),
        "beatsPerBar": beats_per_bar,
        "beats": [round(float(t), 4) for t in grid],
        "downbeats": [round(float(t), 4) for t in bars],
    }
    with open(args.out, "w") as f:
        json.dump(result, f)
    emit(type="done", bpm=result["bpm"], beats=len(grid), dbn=use_dbn)


if __name__ == "__main__":
    main()
