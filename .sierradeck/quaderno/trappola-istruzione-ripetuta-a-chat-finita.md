---
titolo: "Trappola: chat finita e unita che riceve di nuovo «prosegui con l'ultima istruzione valida»"
quando: 2026-10-23T15:45:00+02:00
tag: ["autopilota", "supervisore", "stop-hook", "trappola", "0.85.0"]
---

**Visto il 23/10 su c-129** (velocità misurata, 0.85.0). La chat aveva finito: ramo unito in main (`0de3a3a4`), segnale «fatto». Ma quando il supervisore non risponde in tempo, l'hook Stop rimanda alla chat **la stessa consegna di prima** («Il supervisore non ha risposto in tempo… prosegui con l'ultima istruzione valida»), con l'istruzione completa da rifare. È successo 4 volte di fila.

- Ogni volta è un turno della chat sprecato, e una chat ingenua potrebbe rifare il lavoro da capo (doppioni, conflitti).
- **Cosa fa la chat**: controlla `git merge-base --is-ancestor HEAD main` e, se il ramo è già dentro, risponde solo `SEGNALE: fatto` senza toccare niente.
- **Cosa dovrebbe fare il programma**: se il supervisore manca e l'ultimo segnale della chat è «fatto» con il ramo già unito, non rimandare l'istruzione di prima: chiudere la chat (`chiudiChat`) o lasciarla ferma. Da guardare nel percorso «supervisore mancato» (`SupervisoreMancato`, `ultimeIstruzioni` in `src/shared/autopilota.ts`, e dove `server.ts` le riusa).
