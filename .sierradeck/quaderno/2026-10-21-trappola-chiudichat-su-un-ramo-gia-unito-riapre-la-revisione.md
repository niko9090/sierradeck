---
titolo: "Trappola: chiudiChat su un ramo già unito riapre la Revisione (21/10)"
quando: 2026-10-21T03:36:53.184Z
tag: ["autopilota"]
---

Dopo il «finito» della 0.82.0, chiedere chiudiChat su c-32 (ramo già in main, 85795bb9) ha fatto riusare c-40 per rivederlo di nuovo, e il «finito» è stato rimandato tre volte. Rimedio: se un ramo ha 0 commit fuori da main e la chat è già «finita», non chiedere chiudiChat: basta dichiarare finito senza mosse.

**Aggiornamento 23/10 (c-82, consegna c-814).** Stesso schema dalla parte della Revisione: ha chiesto di «correggere il ramo c-82 perché rompe main», ma c-82 era già stato unito via c-79 (`cfada715`) e cancellato; la cartella `SierraDeck.sierradeck-wt/ap-f1e631f5-c-82` non è più un worktree (niente `.git`), quindi lì non si può fare commit. Su main (`1975a66e`) tutto quello che la Revisione elencava passava: `tsc --noEmit` pulito, `vitest run` 5099 passati / 2 saltati, D1–D4 corretti, `collaudo-domande-risposte-0-84-1` verde senza `.fails`. Nota: `frenoPiano: false` sta in `src/autopilot-host/index.ts`, non in `src/main`. Controllo da fare prima di toccare qualsiasi cosa: dal repo principale `git branch -a | grep c-NN` e `git worktree list`; se il ramo non c'è più ed è in main, rispondere che non c'è nulla da correggere.
