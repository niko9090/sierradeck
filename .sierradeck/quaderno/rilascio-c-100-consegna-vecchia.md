---
titolo: "Rilascio c-100: consegna con il compito vecchio della 0.79.0 (18/10)"
quando: 2026-10-18T15:30:00+02:00
tag: ["rilascio", "autopilota", "trappola"]
---

La consegna c-100 (chat c-9, ruolo Rilascio) aveva l'**obiettivo della 0.80.0** ma il **compito della 0.79.0**: «versione 0.79.0, pubblica come bozza…». E in fondo diceva «niente push e niente pubblicazione».

La 0.79.0 è **già pubblicata** (Latest, 18/10 mattina). Per la 0.80.0 non c'è ancora niente da rilasciare: i lavori c-10, c-11 e c-12 sono ancora nei loro worktree, fermi a 76ed7c2. Quindi non ho alzato la versione e non ho pubblicato niente.

Come stava `main` alle 15:25:
- Guardia delle cancellazioni: verde.
- Typecheck: verde.
- Gradle (`testDebugUnitTest assembleDebug`): verde.
- `npm test`: 16 rossi su 4193 quando girava insieme a gradle; da solo, 1 rosso (`verifiche-shell` «non aspetta i processi…», dipende dai tempi). Lanciato da solo, il file passa.
- Un'altra chat stava già correggendo nella cartella principale i test lenti a macchina carica (`bb684f2`, `44c4e78`, più 3 file non salvati in `tests/`). Non toccati.

**Trappola:** se il rilascio della 0.80.0 arriva prima che le correzioni siano unite, il controllo di fine della chat continua a dire «npm test fallito». Non dipende da chi rilascia. Il rilascio va dato dopo l'unione di c-10/c-11/c-12, con il compito «Rilascio 0.80.0».

**21/10, consegna c-427 (stessa chat c-9):** la stessa cosa si è ripetuta con l'obiettivo 0.83.0 (ristrutturazione dell'app Android). Il compito era ancora «Rilascio 0.79.0». La 0.82.0 era Latest; i rami della 0.83.0 (c-10 mappa, c-11 e c-439 app) non erano uniti. Il rilascio non è partito. Quindi il testo del compito di Rilascio resta quello della 0.79.0 a ogni nuovo obiettivo: va riscritto con la versione giusta quando il lavoro è unito.
