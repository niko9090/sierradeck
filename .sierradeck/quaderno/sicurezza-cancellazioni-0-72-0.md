---
titolo: "0.72.0: le protezioni dopo la cancellazione di AppData\\Local (guardia unica, criteri controllati, test con cartelle finte)"
quando: 2026-10-15T11:30:00+02:00
tag: ["sicurezza", "cancellazioni", "autopilota", "criteri", "test", "0.72.0", "incidente 14/10"]
---

Il 14/10, fra le 09:02 e le 09:10 ora di casa, il contenuto di `%LOCALAPPDATA%` (AppData\Local) è stato cancellato. La causa e le prove sono in `cancellazione-appdata-local-14-10.md`. Nicholas: «metti in sicurezza il programma perché una cosa del genere non può più succedere».

# Cosa c'è adesso

**1. Niente comandi senza nessuno davanti.**
- Il «ricontrollo da solo» della 0.71.0 è tolto: era un `setInterval` di 10 minuti in `src/autopilot-host/index.ts` che rimisurava i criteri (npm test, gradle, download…) degli autopiloti finiti.
- Adesso i criteri si misurano solo mentre l'autopilota lavora, o con «Ricontrolla i criteri»: un tasto nel pannello autopiloti sul PC, che chiama `POST /autopiloti/<id>/ricontrolla-criteri`.
- Un test in `server.test.ts` fallisce se torna un giro a orario.

**2. Guardia unica delle cancellazioni: `src/shared/cancella-sicura.ts`.**
- `cancellaSicura(percorso, { dentro: [cartelle permesse] })` serve per ogni `rmSync` ricorsivo.
- `cestinoSicuro(...)` serve per ogni `shell.trashItem`.
- Rifiuta le radici dei dischi, la casa, AppData (Local, Roaming, LocalLow), Temp intera, Documenti, Desktop, Download, `.claude`, `.ssh`, Program Files, ProgramData, Windows e `C:\Users`, e **qualsiasi loro antenato**.
- Accetta solo un percorso **dentro** una cartella permessa, mai la cartella stessa.
- Se il percorso sta dentro una cartella protetta, anche la cartella permessa deve stare dentro quella. Così il permesso «Temp» vale per `Temp\sierradeck-criterio-x`, ma il permesso «casa» non vale per `AppData\Local\Chrome`.
- Ripete il controllo sul percorso vero (`realpathSync.native`): una giunzione in `note\` che punta ad AppData non passa.
- Con `come: { modo: 'recupero', cartella }` sposta invece di cancellare.
- **Dove si usa:**

  | Chiamata | Cartella permessa |
  |---|---|
  | `verifiche.ts`: la cartella del criterio | Temp |
  | `copie-di-versione.ts`: la potatura | la sua cartella |
  | `trasferimenti/servizio.ts`: elimina locale | la cartella che guardi |
  | Cestino delle skill, delle trascrizioni, dei progetti tolti e dell'«Elimina» del pannello File | — |

- **Anche `npm run pulisci-dist`** (prima di costruire l'installer) era un `rmSync('dist', {recursive})` con percorso relativo dentro package.json. Adesso è `scripts/pulisci-dist.mjs`, che importa `cancella-sicura.ts` direttamente con Node 24 (toglie i tipi da solo). **Trappola:** in `cancella-sicura.ts` niente proprietà nei parametri del costruttore né enum, che Node non sa togliere.
- **Controllo automatico:** `tests/shared/cancellazioni-solo-dalla-guardia.test.ts` legge `src/`, `scripts/` e gli script di `package.json`. Fallisce se trova `rmSync` o `rm` ricorsivo, `emptyDir`, `rimraf`, `Remove-Item -Recurse`, `rd /s` o `rm -r` fuori da `cancella-sicura*`, o un `trashItem` senza `cestinoSicuro`. Il criterio della consegna c-17 è il `git grep` più stretto.
- **Trappola:** l'elenco dei verbi che cancellano (che contiene «rimraf») sta in `src/shared/cancella-sicura-comandi.ts`, apposta: altrimenti il `git grep` del criterio lo segnalava dentro `divieti.ts`.
- **Trappola:** il `git grep` del criterio guarda anche i **commenti**, a differenza del test. Un commento che cita il vecchio `rmSync(…recursive…)` lo fa fallire: è successo in `scripts/pulisci-dist.mjs`, corretto il 15/10. Nei commenti si descrive a parole.

**3. I criteri passano dai divieti.**
- `conDivieti(esecutoreReale())` in `src/autopilot-host/index.ts` usa `giudicaCancellazioni` di `divieti.ts`, lo stesso giudizio dell'hook PreToolUse delle chat governate.
- Un criterio che cancella fuori dalla cartella del progetto, la cartella stessa, o un percorso con una variabile (`rm -rf "$d"`, `del %X%`) **non parte**: esce con il codice 126 e risulta «non misurato», con il motivo.
- Il controllo delle variabili vale anche per le chat governate.
- Ogni criterio gira con TEMP/TMP/TMPDIR puntati sulla sua cartella temporanea, che a fine criterio se ne va dalla guardia.

**4. Test con cartelle finte.**
- `tests/setup/cartelle-finte-globale.ts` (globalSetup) e `tests/setup/cartelle-finte.ts` (setupFiles) puntano HOME, USERPROFILE, APPDATA, LOCALAPPDATA, TEMP, TMP e TMPDIR su `sierradeck-test-finta-*`.
- Le funzioni di `fs` che scrivono, spostano o cancellano sono sorvegliate (con `syncBuiltinESMExports`).
- Toccare la casa, AppData o Temp veri fuori dalla cartella finta e dal progetto fa fallire il test, anche se il codice provato inghiotte l'errore: c'è un controllo in `afterEach`.
- Alla fine la cartella finta se ne va dalla guardia.
- Lo prova `tests/shared/test-con-cartelle-finte.test.ts`.

**5. Il servizio scrive nel registro.**
- Il Gestore avvia il servizio con `stdio: 'ignore'`, e tutte le sue righe andavano perse: del 14/10 non c'era traccia dei comandi eseguiti.
- Adesso `consoleNelRegistro` copia ogni riga nel file del giorno con il tag `[servizio]`.
- Ogni criterio scrive `[criterio] parte in <cartella>: <comando>` e `[criterio] finito con <codice> in <s>`.

# Regole per chi lavora qui
- Non scrivere mai `rmSync(..., { recursive: true })`: si usa `cancellaSicura` con la cartella permessa più stretta possibile.
- Mai comandi pesanti o distruttivi a orario, senza qualcuno davanti.
- I test devono passare anche con le cartelle finte: se un test ha bisogno della casa vera, è sbagliato il test.
