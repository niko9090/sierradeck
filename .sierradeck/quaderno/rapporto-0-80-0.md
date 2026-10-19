---
titolo: "Rapporto 0.80.0: pubblicata da a22c1df, non installata"
quando: 2026-10-19T18:15:00+02:00
tag: ["0.80.0", "release", "rapporto"]
---

# SierraDeck 0.80.0 (app 2.80.0)

**Pubblicata il 19/10/2026 da c-12.** Non è una bozza ed è la «latest». **Non l'ha installata nessuno di noi**, su nessun PC: la installa Nicholas con «Installa».

- **Codice:** la 0.80.0 è esattamente **a22c1df**. Il tag `v0.80.0` su origin punta lì (`git ls-remote --tags origin v0.80.0` → `a22c1dff9f35…`).
- **Allegati (5):**
  - `SierraDeck-Setup-0.80.0.exe` (115 299 532 byte);
  - `.blockmap`;
  - `latest.yml`, che dice `version: 0.80.0` con la stessa `size` dell'installer;
  - `SierraDeck-2.80.0.apk`, release firmato «O=Ferrari Consulenze», versionCode 136;
  - `app-android.json`, che dice 2.80.0 per il programma 0.80.0.
- **«latest»:** anche l'indirizzo `releases/latest/download/latest.yml` dice 0.80.0 (controllato dopo un minuto di cache).

## Cosa c'è dentro
Le novità in italiano sono quelle di `src/shared/novita.ts` in a22c1df, 8 righe:
- le chat finite si chiudono da sole;
- il workspace cambia solo quando lo sceglie Nicholas;
- niente workspace dal primo messaggio né cartelle vuote per i progetti di altri PC;
- gli elenchi non si svuotano più;
- un workspace senza autopilota lo dice;
- più veloce;
- stati uguali dappertutto e meno notifiche;
- gestione delle chat più precisa;
- la grafica rifinita su PC, pagina e app.

## Controlli e risultati
| Controllo | Dove | Esito |
|---|---|---|
| `npm run typecheck` | main 97f8f99 (= a22c1df meno le novità) | 0 errori |
| `npm test` (suite intera) | main 97f8f99 | 421 file passati e 1 saltato; 4302 test passati e 2 saltati |
| `gradle testDebugUnitTest assembleDebug` | main 97f8f99 | uscita 0; 368 JUnit, 0 falliti, 1 saltato |
| test delle novità + `tests/main` + typecheck | dopo il cambio delle novità (a22c1df) | verdi |
| `gradle testDebugUnitTest assembleDebug` | worktree a a22c1df, file in uscita, codice letto | uscita 0; 368 JUnit, 0 falliti, 1 saltato |
| installer da a22c1df | `app.asar` estratto | ci sono la grafica di c-12 e le novità nuove; **non** ci sono le stringhe arrivate dopo, come `/api/workspace/ripristina`, `elencoRecuperoWorkspace`, `[notifica] Telegram` e `worktree remove --force` |
| APK | worktree a a22c1df | `assembleRelease` fresco delle 18:06 (output-metadata 2.80.0/136); firma verificata; stessa impronta dell'allegato |

## Come è stata fatta (per la prossima volta)
1. **Bozza:** `gh release create v0.80.0 --draft --target main`, poi `GH_TOKEN=$(gh auth token) npm run pubblica`. Ha caricato exe, blockmap e latest.yml, senza 422.
2. **Main si è mosso durante la build:** è arrivato «Elimina workspace» (c7b4934, 17:27). L'APK quindi **non** è stato costruito da main: worktree a a22c1df con la sola `android/local.properties` copiata (la chiave sta in `~/.sierradeck-chiave.jks`), poi gradle e `node scripts/allega-apk.mjs` da lì.
3. **Il tag:** `gh release edit --target a22c1df` con l'id corto dà «target_commitish is invalid». Il tag l'ho creato a mano su a22c1df, l'ho spinto, poi `--draft=false --latest`.
4. **Trappola:** `git worktree remove` non ha finito: «Filename too long», per le cartelle di build di gradle. Il worktree non è più registrato, ma la cartella `SierraDeck.sierradeck-wt/rilascio-0-80-0` è rimasta con dentro solo file copiati e di build. Non l'ho cancellata a mano: va tolta con i percorsi lunghi abilitati, oppure da Nicholas.

## Cosa resta per la 0.81.0
- **«Elimina workspace»** con il recupero di 30 giorni e «Ripristina» (c7b4934 e correzioni e312f56): è in main **dopo** a22c1df, quindi è nella 0.81.0, non in questa.
- **Il criterio Android è rosso su main dopo le unioni di c-10/c-11:** lo sistema chi ha unito. La 0.80.0 non è toccata, perché a a22c1df era verde.
- **Notifiche solo utili**, raggruppate e scritte nel registro. L'app manda ancora «aspetta te» per le chat a fine turno (`Avvisi.kt`).
- **Rapporto di analisi con i numeri**, prima e dopo, in `analisi-0-80-0.md`.
- **I due workspace sbagliati del 19/10** («visitafacile» e «dentro al mio server nexora c'è gia un»): li toglie Nicholas da «⋯» → Elimina, con il recupero.
- **Barra in basso della pagina** («Auto-piloti», «Imposta-zioni» a capo): c'è la proposta per Nicholas in `grafica-prima-0-80-0.md` (nomi più corti oppure carattere più piccolo).
- **«Strumenti ▾» → «Account ▾»:** rinominato, si rimette se Nicholas preferisce.
- **Compiti nuovi di Nicholas (c-168, c-174):** lo storico degli errori con l'invio al PC di sviluppo; un errore arrivato avvia un lavoro dell'autopilota, che prima manda un riepilogo a Nicholas.
