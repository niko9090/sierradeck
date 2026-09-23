---
titolo: "Avvio silenzioso, diagnosi «chat che non si apre», risoluzione avanzata (0.34.0 / app 2.37.0)"
quando: 2026-09-23T14:20:00+02:00
tag: ["decisione", "avvio", "istantanee", "chat", "diagnosi", "agente"]
---

# Cosa ha deciso Nicholas (23/09, notte)

1. All'avvio torna sempre, in silenzio, l'ultima composizione (workspace, chat, finestre, autopiloti). Niente finestra «Riprendi».
2. Spariscono «Salva istantanea» e i salvataggi con nome: PC, pagina servita, app Android.
3. Rete di sicurezza invisibile: le ultime 3 chiusure automatiche, in Impostazioni → «Torna a com'era».
4. Una chat che non si apre dice quale caso e' e cosa fare; il perche' va nel registro.
5. «Risoluzione avanzata»: un agente (Claude Code) in una mini finestra temporanea valuta il caso con l'utente.

# Com'e' fatto (0.34.0)

## Avvio e chiusure
- Il layout tornava gia' da solo da `workspaces.json` + `finestre.json`; la finestra «Riprendi» era un controllo in piu' (`App.tsx`, effetto su `istantanee.elenca()`): tolta, insieme a `ModaleIstantanee.tsx`, al tasto «Salvataggi» della Console, alla preferenza «salva alla chiusura» (ora sempre) e ai pannelli del telefono.
- `istantanee-store.salva('Ultima chiusura')` **scala**: Ultima → Penultima → Terzultima, la quarta esce (`NOMI_CHIUSURE` in `shared/istantanea.ts`). I nomi restano in `istantanee.json`, che viaggia sul Drive come prima (PER_PC).
- `SezioneTornaIndietro` in `PannelloImpostazioni.tsx`: `istantanee.carica(nome)` + `cambiaVista(layout)` con conferma.
- Rotte `/api/salvataggi` (elenco vuoto + nota) e `/api/salvataggi/carica` (410 con spiegazione) restano per le app vecchie.

## Diagnosi nel riquadro
- `aggancio.ts` ha `suEsito` (uscita / errore / spawn-fallito) e **dimentica l'id all'uscita** (cosi' `rilancia()` puo' ripartire: prima con un id in mano non faceva niente). Attenzione: dopo `exit` non si ascolta piu' quel pty (test aggiornato: l'errore va consegnato prima dell'uscita).
- `diagnosi-chat.ts` (puro): dal segnale + ultime righe (senza sequenze ANSI) → caso (`cartella-sparita`, `claude-assente`, `sessione-in-uso`, `trascrizione-assente`, `accesso`, `host`, `morta`, `lenta`, `sconosciuto`), testo per esteso, azioni. Tetto «lenta» = max(20 s, 2× previsto); un'uscita dopo il prompt e oltre 90 s dall'avvio e' l'utente che ha chiuso, non un guasto.
- `Terminal.tsx`: ring delle ultime 60 righe, `promptVisto` da `SEGNI_DI_PROMPT` (ora esportato da `ultime-righe.ts`), timer ogni 2 s, overlay `chat-guasto` con i tasti; lo spawn legge `avvio.current` (non piu' `iniziale`), cosi' «Scegli la cartella…» (`sistema.scegliCartella` + `impostaCartella`) fa ripartire nella cartella nuova. Il motivo va nel registro con `log.errore`.

## Risoluzione avanzata
- Niente seconda `BrowserWindow`: il Core tratta ogni finestra come una finestra di chat (40+ posti). E' un pannello galleggiante `FinestraTemporanea.tsx` (portal) con dentro `TerminaleSemplice`; chiuderlo uccide il pty.
- IPC `risoluzione:apri` (in `registerPreparazioneIpc`, ipc.ts): scrive il dossier in `%TEMP%\sierradeck-risoluzione-<id>.md` (`main/risoluzione.ts`: `componiDossier`, puro) e avvia `claude "<prompt>" --dangerously-skip-permissions --append-system-prompt <ISTRUZIONI_AGENTE>` nella cartella della chat se esiste, altrimenti a casa. Il dossier: diagnosi, cwd (esiste?), trascrizione (esiste? byte), claude.exe trovato, accesso (`leggiAccesso`), ultime righe del terminale e del registro (`ultimeRighe(readFileSync(registro.file()), 80)`).
- Le stesse mini finestre servono a «Rifai l'accesso» (`preparazione.accedi`) e «Installa Claude Code» (`preparazione.installa`).

# Trappole
- `client-pagina.ts` e' un template dentro un template: gli anchor con backtick vanno cercati per marker, non per testo esatto.
- Nel test dell'aggancio l'`error` dopo l'`exit` non arriva piu' (il pty uscito viene scartato dal bus).
