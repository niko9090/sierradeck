---
titolo: "c-12-salva: correzione di salvaLavoro da unire (c-12, 20/10)"
quando: 2026-10-20T14:15:00Z
tag: ["0.81.0", "rami", "revisione", "autopilota"]
---

**Per chi unisce in main (c-289).** Il ramo `ap/ap-f1e631f5/c-12-salva` (443cf036, worktree `SierraDeck.sierradeck-wt/c-12-salva`) è c-241 più un commit: la correzione trovata dalla Revisione di c-241.

**Il difetto, già in main con c-241.** La guardia di `salvaLavoro` voleva che la cartella fosse esattamente la radice di git. Un autopilota su un progetto in una sottocartella (`repo/app`) lavora in `<worktree>/app`: lì git risale al worktree, la guardia scartava la cartella e il lavoro non finiva mai in un commit. Si perdeva quando il worktree veniva tolto.

**La correzione.** Si accetta anche la sottocartella, se il ramo la contiene già (`git ls-tree -d HEAD -- rel`). La cartella rimasta di una chat chiusa dentro un altro worktree non è nel ramo, quindi resta scartata come voleva c-241. C'è un test in `tests/autopilot-host/salva-solo-sul-suo-ramo.test.ts` e i 3 test sono verdi.

**Esito.** `c-12-salva` è in main (c1ad7e20, unito da c-289). c-289 ha notato che `normale()` metteva il percorso in minuscolo, ma `git ls-tree` distingue le maiuscole: una cartella «App» restava scartata. La correzione è sul ramo `ap/ap-f1e631f5/c-12-salva2` (c3abdd26): il percorso relativo si calcola su quello vero, senza minuscole. Su Windows `relative` confronta già senza maiuscole. Il test usa «App»: fallisce con il codice di prima e passa con la correzione. Ha un tempo suo di 60 s, perché col PC carico ogni comando di git prende secondi e i 20 s non bastano.

**Altre note di Revisione (c-12, 20/10).**
- c-10 e c-18: nessun difetto bloccante.
- c-24: il tetto dell'hook di 3600 s può essere corto con due criteri vitest (stessa nota di c-3: 5400).

**Trappola.** Alle 15:39 c-12 ha unito il suo ramo in main mentre anche c-3 e c-289 univano: tre chat avevano la stessa consegna. Prima di unire, guardare `git reflog -5 main`.
