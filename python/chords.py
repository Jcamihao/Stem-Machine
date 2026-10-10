"""Reconhece os acordes da música (vocabulário grande: 7, 7M, sus, inversões...).

Usa a rede da music-x-lab (ISMIR 2019, MIT; código em vendor/chordrec): CQT do
áudio -> 5 modelos (média das probabilidades) -> decodificador Viterbi. As
batidas do metrônomo (beats.json) entram no decodificador: o acorde só troca
em cima de um tempo, com preferência para o "1" do compasso.

As dependências (librosa e companhia) ficam numa pasta própria (--lib), fora
do venv da separação. Os pesos (~28MB) são baixados na primeira vez.

Saída: JSON com a lista de acordes {start, end, label} (rótulo no formato
"E:maj/3", "C#:min7"...; "N" = sem acorde).
"""
import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
import wave

import numpy as np

SR = 22050
HOP = 512
# pesos fixos numa versão do repositório (commit 481f4ce)
MODELS_URL = (
    "https://raw.githubusercontent.com/music-x-lab/ISMIR2019-Large-Vocabulary-Chord-Recognition/"
    "481f4ce703f8822b99f4037e9104ba1760e21ea3/cache_data/"
)
MODEL_NAMES = ["joint_chord_net_ismir_naive_v1.0_reweight(0.0,10.0)_s%d.best.sdict" % i for i in range(5)]


def emit(**kwargs):
    print(json.dumps(kwargs), flush=True)


def fail(msg):
    emit(type="error", message=msg)
    sys.exit(1)


def read_wav_mono(path):
    # o mix.wav do app é sempre PCM 16 bits (ver convertToWav no pipeline)
    with wave.open(path, "rb") as w:
        if w.getsampwidth() != 2:
            fail(f"unsupported wav sample width: {w.getsampwidth()}")
        sr = w.getframerate()
        channels = w.getnchannels()
        frames = w.readframes(w.getnframes())
    signal = np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0
    if channels > 1:
        signal = signal.reshape(-1, channels).mean(axis=1)
    return signal, sr


def ensure_models(models_dir):
    os.makedirs(models_dir, exist_ok=True)
    paths = []
    for name in MODEL_NAMES:
        path = os.path.join(models_dir, name)
        if not os.path.exists(path):
            part = path + ".part"
            urllib.request.urlretrieve(MODELS_URL + urllib.parse.quote(name), part)
            os.replace(part, path)
        paths.append(path)
    return paths


def beat_array(beats_path, n_frames):
    """Marca, quadro a quadro, onde o acorde pode trocar: 4 = tempo, 3 = meio do
    compasso, 2 = "1" (troca mais barata), 0 = entre tempos (não troca), 1 = sem
    batidas detectadas (troca livre, com penalidade fixa)."""
    arr = np.ones(n_frames, dtype=np.int8)
    if not beats_path or not os.path.exists(beats_path):
        return arr
    with open(beats_path) as f:
        grid = json.load(f)
    delta = HOP / SR
    frames = [int(round(t / delta)) for t in grid.get("beats", [])]
    frames = [f for f in frames if 0 <= f < n_frames]
    if len(frames) < 2:
        return arr
    for a, b in zip(frames, frames[1:]):
        arr[a + 1:b] = 0
    arr[frames] = 4
    per_bar = int(grid.get("beatsPerBar") or 4)
    downs = {int(round(t / delta)) for t in grid.get("downbeats", [])}
    for i, f in enumerate(frames):
        if f in downs:
            arr[f] = 2
            if per_bar % 2 == 0 and i + per_bar // 2 < len(frames):
                arr[frames[i + per_bar // 2]] = 3
    return arr


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--models", required=True)
    parser.add_argument("--lib", required=True, action="append")
    parser.add_argument("--beats", default="")
    parser.add_argument("--device", default="auto")
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    emit(type="progress", stage="chords", pct=0, message="Detecting chords")
    for lib in reversed(args.lib):
        sys.path.insert(0, lib)
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "vendor"))
    try:
        import librosa
        import soxr
        import torch
        from chordrec.model import ChordNet
        from chordrec.xhmm import XHMMDecoder
    except Exception as e:
        fail(f"chords engine unavailable: {e}")

    try:
        model_paths = ensure_models(args.models)
    except Exception as e:
        fail(f"could not download the chord models: {e}")

    try:
        signal, sr = read_wav_mono(args.input)
    except (OSError, wave.Error) as e:
        fail(f"could not read audio: {e}")
    if sr != SR:
        signal = soxr.resample(signal, sr, SR)

    try:
        # mesma CQT do treino (extractors/cqt.py CQTV2): 288 bandas, 36 por oitava, a partir de F#0
        cqt = librosa.hybrid_cqt(
            y=signal.astype(np.float32),
            sr=SR,
            hop_length=HOP,
            fmin=librosa.note_to_hz("F#0"),
            n_bins=288,
            bins_per_octave=36,
            tuning=None,
        )
        features = np.abs(cqt).T.astype(np.float32)

        device = args.device
        if device == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"
        x = torch.tensor(features, device=device)
        probs = []
        with torch.no_grad():
            for path in model_paths:
                # checkpoint do repositório oficial: dict com 'net' (pesos) + estado do treino
                state = torch.load(path, map_location=device, weights_only=False)
                net = ChordNet().to(device).eval()
                net.load_state_dict(state["net"])
                probs.append(net.inference(x))
        # média dos 5 modelos, saída por saída (tríade, baixo, 7ª, 9ª, 11ª, 13ª)
        probs = [np.mean([p[i] for p in probs], axis=0) for i in range(len(probs[0]))]

        decoder = XHMMDecoder(
            template_file=os.path.join(os.path.dirname(os.path.abspath(__file__)), "vendor", "chordrec", "submission_chord_list.txt")
        )
        tags = decoder.decode(probs, beat_array(args.beats, probs[0].shape[0]))
    except Exception as e:
        fail(f"chord detection failed: {e}")

    delta = HOP / SR
    chords = []
    start = 0
    for i in range(len(tags)):
        if i + 1 == len(tags) or tags[i + 1] != tags[i]:
            chords.append({"start": round(start * delta, 3), "end": round((i + 1) * delta, 3), "label": tags[i]})
            start = i + 1
    with open(args.out, "w") as f:
        json.dump({"version": 1, "chords": chords}, f)
    emit(type="done", chords=len(chords))


if __name__ == "__main__":
    main()
