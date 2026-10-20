---
titolo: "Copia nuova del progetto: Electron 43 scarica il binario al primo require, e test e misure si fermano"
quando: 2026-10-20T18:30:00+02:00
tag: ["electron", "worktree", "npm ci", "test", "misure", "trappola"]
---

# Electron non c'è in una copia appena fatta con `npm ci`

**Sintomo.** In una copia nuova del progetto (worktree con `npm ci`), `npx vitest run tests/main` si ferma su `aggiornamenti.test.ts` e `aggiornamento-da-solo.test.ts`. Nel log compare `Downloading Electron binary...` e poi più niente fino al tetto di tempo (900 s il 20/10). Anche `scripts/misure/misura.mjs avvia` non trova `node_modules/electron/dist/electron.exe`.

**Causa.** Con Electron 43, `npm ci` non scarica il binario. Lo scarica `node_modules/electron/index.js` al primo `require('electron')`, con uno `spawnSync` che blocca il worker di vitest finché il download non finisce. `src/main/aggiornamenti.ts` importa `electron`, e i due test lo caricano senza `vi.mock('electron')`.

**Come lo so.** Manca `node_modules/electron/dist` e manca `path.txt`. La cartella principale li ha, e lì la trappola non si vede.

**Rimedio.** Subito dopo `npm ci`, prima di test e misure:

```
node node_modules/electron/install.js
```

Non è la causa del criterio `tests/main` che scade nella cartella principale, dove Electron è già installato.
