"""Detecta as seções da música (intro, verso, refrão, ponte...) a partir dos stems.

Usa o all-in-one-infer (MIT; modelo treinado no Harmonix Set), que lê os 4
stems do Demucs. As dependências dele ficam numa pasta própria (--lib), fora
do venv da separação, e as partes que o app não usa (gráficos e sonificação,
que puxariam matplotlib/librosa) são desligadas.

Saída: JSON com a lista de seções {start, end, label}, já juntando as
seções seguidas com o mesmo rótulo.
"""
import argparse
import contextlib
import json
import os
import shutil
import sys
import tempfile
import types
import urllib.request


def emit(**kwargs):
    print(json.dumps(kwargs), flush=True)


def fail(msg):
    emit(type="error", message=msg)
    sys.exit(1)


HF_URL = "https://huggingface.co/taejunkim/allinone/resolve/main/"
SKIP_LABELS = {"start", "end"}


def install_shims(models_dir):
    # gráficos e sonificação nunca são chamados pelo app
    for name, fn in (("allin1_infer.visualize", "visualize"), ("allin1_infer.sonify", "sonify")):
        mod = types.ModuleType(name)
        setattr(mod, fn, lambda *a, **k: None)
        sys.modules[name] = mod

    # o modelo são 8 arquivos pequenos (~11MB no total): baixa direto, sem a
    # cadeia de dependências do huggingface_hub
    def hf_hub_download(repo_id, filename, cache_dir=None, **_):
        os.makedirs(models_dir, exist_ok=True)
        path = os.path.join(models_dir, filename)
        if not os.path.exists(path):
            part = path + ".part"
            urllib.request.urlretrieve(HF_URL + filename, part)
            os.replace(part, path)
        return path

    hub = types.ModuleType("huggingface_hub")
    hub.hf_hub_download = hf_hub_download
    sys.modules["huggingface_hub"] = hub

    # do librosa o pós-processamento só usa frames_to_time (frames * hop / sr);
    # instalar o librosa inteiro traria o numba junto
    import numpy as np

    librosa = types.ModuleType("librosa")
    librosa.frames_to_time = lambda frames, sr=22050, hop_length=512, **_: (
        np.asanyarray(frames) * hop_length / float(sr)
    )
    sys.modules["librosa"] = librosa


def merged_segments(segments):
    out = []
    for seg in segments:
        label = seg.label
        if label in SKIP_LABELS or seg.end - seg.start < 0.5:
            continue
        if out and out[-1]["label"] == label:
            out[-1]["end"] = round(float(seg.end), 3)
            continue
        out.append({"start": round(float(seg.start), 3), "end": round(float(seg.end), 3), "label": label})
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--stems-dir", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--lib", required=True)
    parser.add_argument("--models", required=True)
    parser.add_argument("--device", default="auto")
    args = parser.parse_args()

    # no Windows a saída redirecionada usa cp1252 e a biblioteca imprime "✓"
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    emit(type="progress", stage="sections", pct=0, message="Detecting sections")
    sys.path.insert(0, args.lib)
    install_shims(args.models)
    try:
        import numpy as np
        import soundfile as sf
        import torch

        # checkpoints do repositório oficial do modelo trazem a config junto do
        # state_dict; o torch >= 2.6 recusa isso com weights_only=True
        _load = torch.load
        torch.load = lambda *a, **k: _load(*a, **{**k, "weights_only": False})
        from allin1_infer import analyze
    except Exception as e:
        fail(f"sections engine unavailable: {e}")

    stems_dir = args.stems_dir
    for name in ("bass", "drums", "other", "vocals"):
        if not os.path.exists(os.path.join(stems_dir, f"{name}.wav")):
            fail(f"missing stem {name}.wav")

    work = tempfile.mkdtemp(prefix="sm-sections-")
    try:
        # o modelo foi treinado com os 4 stems do Demucs: guitarra e piano
        # (motor de 6 fontes) voltam para dentro de "other"
        other, sr = sf.read(os.path.join(stems_dir, "other.wav"), dtype="float32")
        for extra in ("guitar", "piano"):
            path = os.path.join(stems_dir, f"{extra}.wav")
            if os.path.exists(path):
                data, _ = sf.read(path, dtype="float32")
                n = min(len(other), len(data))
                other = other[:n] + data[:n]
        sf.write(os.path.join(work, "other.wav"), np.clip(other, -1, 1), sr)
        stems = {"other": os.path.join(work, "other.wav"), "identifier": "song"}
        for name in ("bass", "drums", "vocals"):
            stems[name] = os.path.join(stems_dir, f"{name}.wav")

        device = args.device
        if device == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"
        try:
            # mensagens da biblioteca vão para o stderr: o stdout é só dos eventos JSON
            with contextlib.redirect_stdout(sys.stderr):
                result = analyze(
                    stems_input=[stems],
                    device=device,
                    multiprocess=False,
                    demix_dir=os.path.join(work, "demix"),
                    spec_dir=os.path.join(work, "spec"),
                )
        except Exception as e:
            fail(f"section detection failed: {e}")
        if isinstance(result, list):
            result = result[0]

        sections = merged_segments(result.segments)
        if not sections:
            fail("no sections detected")
        with open(args.out, "w") as f:
            json.dump({"version": 1, "sections": sections}, f)
        emit(type="done", sections=len(sections))
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
