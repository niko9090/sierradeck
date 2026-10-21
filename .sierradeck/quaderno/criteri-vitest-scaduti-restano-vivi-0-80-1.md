---
titolo: "Criterio dei test che scade: non è un file appeso, sono le corse scadute che restano vive (0.80.1 installata)"
quando: 2026-10-20T17:35:00+02:00
tag: ["criteri", "vitest", "tempo-limite", "0.81.0", "processi-orfani"]
---

**Sintomo (20/10).** I criteri `npx vitest run tests/main --maxWorkers=2` e `… tests/autopilot-host tests/renderer tests/shared tests/pty-host …` scadono anche lanciati da soli. L'ipotesi era un file di test appeso.

**Misurato da c-289 sul main delle 16:18:**
- `tests/main` con `--maxWorkers=2`: 189 file, **1804 test passati, 0 falliti**, durata 1317 s;
- di questi, solo **597 s** sono test veri; il resto è trasformazione (757 s) e import (822 s), sommati sui processi;
- il file più lento è `cassaforte-sincronia.test.ts` con 56 s, seguito da `file-autopilota` (55 s), `gestione-chat` (50 s) e `pty-host-client` (44 s). **Nessun file resta appeso.**
- C'è stato un solo «Worker exited unexpectedly», nessun test rosso.
- Gli altri test (servizio, renderer, condivisi, pty): **2724/2724** in 1077 s.

**Causa vera.** Alle 17:25 c'erano **~20 corse di vitest insieme**. Tredici erano **orfane**, partite fra le 15:41 e le 17:00:
- in cima a ogni catena c'è una `bash.exe /e/Programs/LTS/npx vitest run …` **senza processo padre**: il criterio era già scaduto e il servizio aveva chiuso il suo figlio diretto;
- il resto della catena (bash → npx → cmd → vitest.mjs) restava vivo per ore.

Ogni criterio scaduto lascia una corsa in più, il PC si carica ancora di più, e il criterio dopo scade a sua volta. Il servizio installato è la **0.80.1**. La correzione c'è solo in main: 1e9add64, «un criterio scaduto chiude anche i processi che la bash di Git avvia fuori dall'albero di Windows». **Si risolve con l'install della 0.81.0.**

**Fatto alle 17:30 (c-289).** Chiuse con `taskkill /T /F` le 13 radici orfane: `bash.exe` con «npx vitest run», padre morto, più vecchie di 25 minuti. Non ho toccato le corse vive delle chat (c-10, c-25, c-27, c-28, c-12-salva) né la bash di una chat Claude.

**Come riconoscerle di nuovo** (PowerShell): processi `bash.exe` con `vitest` nella riga di comando, il cui `ParentProcessId` non esiste più.

**Trappole:**
- più chat che fanno girare la suite intera insieme (5 alle 17:30) la portano sopra i 20 minuti da sole, anche senza orfani;
- non far girare la suite intera in più chat insieme: va lanciata solo sui file toccati, e la suite intera la fa una sola chat (il Rilascio).
