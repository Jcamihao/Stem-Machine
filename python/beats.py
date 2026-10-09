"""Detecta as batidas de uma música e grava a grade do click inteligente.

Usa o beat_this (rede neural da JKU Linz, licença MIT) para achar as batidas e
o "1" de cada compasso, e depois transforma isso numa grade estável:

- um pulso só na música inteira (a rede às vezes conta um trecho no dobro);
- o click segue andando nas pausas, em vez de sumir;
- o "1" segue uma contagem única, sem reiniciar no meio da música.

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


def follow_grid(beats, downbeats, beats_per_bar=4):
    """Click sempre no passo do andamento dominante: a cada passo encaixa na
    batida detectada mais próxima; sem batida perto (pausa, trecho contado no
    dobro), segue sozinho no mesmo passo."""
    period = float(np.median(np.diff(beats)))
    grid = [float(beats[0])]
    local = period
    while grid[-1] + 0.5 * local < beats[-1]:
        expected = grid[-1] + local
        k = int(np.argmin(np.abs(beats - expected)))
        grid.append(float(beats[k]) if abs(beats[k] - expected) <= 0.2 * local else expected)
        if len(grid) > 4:
            # acompanha pequenas variações de andamento sem mudar de "oitava"
            local = float(np.clip(np.median(np.diff(grid[-9:])), 0.9 * period, 1.1 * period))
    grid = np.array(grid)
    # fase do "1": a posição (de 0 a 3) que mais coincide com os "1" da rede
    near = [int(np.argmin(np.abs(grid - d))) for d in downbeats if np.min(np.abs(grid - d)) < 0.08]
    counts = np.bincount([i % beats_per_bar for i in near], minlength=beats_per_bar)
    phase = int(counts.argmax()) if near else 0
    return grid, grid[phase::beats_per_bar], 60.0 / period


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--checkpoint", required=True)
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
        tracker = Audio2Beats(checkpoint_path=args.checkpoint, device="cpu", dbn=False)
        beats, downbeats = tracker(signal, sr)
    except Exception as e:
        fail(f"beat detection failed: {e}")

    beats = np.asarray(beats, dtype=float)
    downbeats = np.asarray(downbeats, dtype=float)
    if len(beats) < 8:
        fail("not enough beats detected")

    grid, bars, bpm = follow_grid(beats, downbeats)
    result = {
        "version": 1,
        "bpm": round(bpm, 2),
        "beatsPerBar": 4,
        "beats": [round(float(t), 4) for t in grid],
        "downbeats": [round(float(t), 4) for t in bars],
    }
    with open(args.out, "w") as f:
        json.dump(result, f)
    emit(type="done", bpm=result["bpm"], beats=len(grid))


if __name__ == "__main__":
    main()
