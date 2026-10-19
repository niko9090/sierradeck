---
titolo: "chiudiChat con il ramo già unito o mancante (0.80.0): cosa resta dopo la correzione di c-11"
quando: 2026-10-19T13:00:00+02:00
tag: ["autopilota", "git", "worktree", "chiudiChat", "0.80.0", "regola di Nicholas"]
---

La correzione valida è quella di c-11 in main (`aafccdb`, `unisciRamo` con `ramoMancante`). Anche c-12 ne aveva scritta una (`4e1a0f3`, con `statoRamo`/`cartellaPulita`), ma nell'unione del 19/10 è stato tenuto il codice di main: c-12 non ha lasciato codice doppio.

## Regola di Nicholas (19/10)
**Mai chiedergli di chiudere una chat a mano**, né aspettare che lo faccia. Se `chiudiChat` non riesce perché il ramo è già unito o non esiste più, la chat si lascia ferma, senza mandarle messaggi, e si va avanti.

## Due casi che la versione di main non copre (li ha visti la Revisione di c-12)
1. **Specialisti con Revisione e ramo già unito.** Una chat `sviluppo`/`interfaccia`… con il ramo già nel principale passa comunque dalla Revisione: il primo ramo di `chiudiChat` guarda il ruolo prima che `unisciRamo` venga chiamato. La chat si chiude lo stesso (diventa `finita`), ma con un giro di Revisione su un ramo senza niente di nuovo.
2. **Lavoro non salvato con ramo già unito.** Il ramo è già contenuto nel principale e `salvaLavoro` non ha fatto commit, per esempio perché la cartella non è su un ramo `ap/…`. In questo caso `togliWorktree` usa `git worktree remove --force` e i file fuori dai commit si perdono. La protezione proposta era: togliere il worktree solo se `git status --porcelain` nella cartella è vuoto.

Se servono, si riprendono dalla patch `4e1a0f3`.

## Trappola nei test
Il `gitFinto` di `server.test.ts` risponde codice 1 a ogni `rev-parse --verify` e 0 a tutto il resto. Con la versione di main, quindi, ogni ramo «non esiste» per il finto.
