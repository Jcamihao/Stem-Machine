# chordrec

Reconhecimento de acordes de vocabulário grande, extraído de
[music-x-lab/ISMIR2019-Large-Vocabulary-Chord-Recognition](https://github.com/music-x-lab/ISMIR2019-Large-Vocabulary-Chord-Recognition)
(licença MIT, ver `LICENSE`), commit `481f4ce`.

- `model.py`: rede (CNN + LSTM), só inferência
- `xhmm.py`: decodificador Viterbi com penalidade de troca por batida
- `complex_chord.py`: representação dos acordes (np.int corrigido)
- `submission_chord_list.txt`: vocabulário de acordes

Os pesos (5 modelos, ~28MB) são baixados pelo `python/chords.py` na primeira vez.
