---
titolo: "Rifare il giro dei criteri come il servizio: Temp corta, o «Filename too long» (19/10)"
quando: 2026-10-19T13:30:00.000Z
tag: ["autopilota", "test", "trappola"]
---

**Come rifare il giro del servizio:** il servizio crea `sierradeck-criterio-*` nella Temp di Windows (`os.tmpdir()`, vedi `esecutoreReale` in `src/autopilot-host/verifiche.ts`) e lancia lì `npm test` con TEMP, TMP e TMPDIR. Per rifarlo a mano usa la **stessa Temp corta**.

**Trappola:** con TEMP nella cartella scratchpad di Claude (un percorso di circa 130 caratteri) il 19/10 sono caduti 14 test. Erano worktree, criteri-veloci, file-autopilota, prove-senza-avanzi e updater-sorgente. Tutti per «Filename too long»: i test aggiungono `sierradeck-test-finta-*/casa/AppData/Local/Temp/…` e si supera il limite di Windows. Non è un difetto del programma.

**Esito del 19/10:** come il servizio, cioè con la Temp corta, `npm test` dà 0 (4194 passati, 276 s). Dalla cartella principale `npx vitest run --maxWorkers=2` dà 0.

**Se il criterio del servizio resta rosso**, la causa probabile è il tetto di 10 minuti (`TIMEOUT_PREDEFINITO_MS`): con `--maxWorkers=2` c-7 ha misurato 863 s. Nell'uscita del criterio lo dice la riga «[comando interrotto dopo 600s]». Il tetto si cambia nel programma, quindi è lavoro di c-11: non si corregge con i test.
