---
titolo: "Plugin ECC sui PC: versione per PC, hook spenti e come si riaccendono (0.84.0)"
quando: 2026-10-21T19:40:00+02:00
tag: ["ecc", "plugin", "hook", "altri PC", "ponte", "0.84.0"]
---

21/10 sera, c-60 (consegna c-550). Plugin `ecc@ecc` con gli agenti specializzati (`ecc:typescript-reviewer`, `ecc:kotlin-reviewer`, `ecc:silent-failure-hunter`…) installato sugli altri PC accesi. Prima scheda: `prova-ecc.md`.

## Versione per PC

| PC | SierraDeck | Claude Code | ecc@ecc | Hook ECC | Git nel PATH |
|---|---|---|---|---|---|
| Fisso (questo) | 0.82.0 | — | 2.2.3 (commit 76aaa77, dal 17/10) | spenti **solo nella cartella principale** di SierraDeck (`.claude/settings.local.json`); **accesi nelle copie delle chat** | sì |
| DESKTOP | 0.83.0 | 2.1.306 | 2.2.3 (commit 90606c8, 21/10) | spenti per tutto il PC | sì |
| LAPTOP | 0.82.1 | 2.1.306 | 2.2.3 (commit 90606c8, 21/10) | spenti per tutto il PC | sì |
| NB-PROBOOK | 0.79.0 | — | **non installato**: spento dal 20/10 | — | — |

Stessa versione 2.2.3 dappertutto; il commit diverso è solo il marketplace scaricato 4 giorni dopo.

## Come si è fatto (ripetibile per NB-PROBOOK)
1. Su ogni PC: `claude plugin marketplace add https://github.com/affaan-m/ECC.git`, poi `claude plugin install ecc@ecc --scope user`, **senza `--yes`**. Il CLI non ha chiesto di accettare comandi del marketplace.
2. Hook spenti: copia `%USERPROFILE%\.claude\settings.json.prima-ecc`, poi nel campo `env` di `%USERPROFILE%\.claude\settings.json` le chiavi `ECC_HOOKS_ENABLED=false` e `ECC_GATEGUARD=off` (unite, niente tolto).
3. Il negozio di un altro PC non passa dal ponte (403 voluto). Quindi: una chat temporanea aperta là con `/api/apri` attraverso il ponte, le istruzioni con `/api/scrivi`, l'esito letto con `/api/storia`. Le chat aperte dal programma sono in «bypass permissions»: nessun clic di Nicholas è servito. Il DESKTOP ci ha messo 5 min (installazione lenta), il LAPTOP 1 min e mezzo.
4. Accesso al ponte da qui: dispositivo temporaneo «Collaudo Claude (temporaneo)» in `dispositivi.json`, tolto alla fine (procedura in `collaudo-fra-i-due-pc-0-60-2.md`). Da Git Bash serve `MSYS_NO_PATHCONV=1`, e i percorsi Windows nel corpo vanno passati da un file JSON (i backslash nella riga di comando si perdono).

Non toccati: account, preferenze di SierraDeck, file dei progetti. Rimasto sull'altro PC: il backup `settings.json.prima-ecc`.

**Aperto:** la chat temporanea «Installa plugin ECC (temporanea)» sul DESKTOP è ancora aperta, ferma a lavoro finito: il divieto dell'autopilota blocca `/api/chat/chiudi` dalla chat. Quella sul LAPTOP si è chiusa. Va chiusa dal programma (gestione delle chat), non chiesto a Nicholas.

## NB-PROBOOK: controlli e cosa serve quando si accende (c-80, consegna c-652)
- **22/10 10:52:** ancora spento. Ultimo battito in `pc-altrui.json` il 20/10 alle 13:50 (11:50 UTC), versione 0.79.0. Se è acceso si vede subito in `%APPDATA%\SierraDeck\pc-altrui.json`: battito di pochi minuti prima.
- Il 21/10 alle 23:55 il ponte verso NB-PROBOOK ha risposto «non riconosce la chiave», con due cause possibili. Prima: la cassaforte di là è chiusa o diversa. Seconda: su 192.168.56.1 (scheda di rete virtuale) risponde un altro SierraDeck. Prima di installare bisogna quindi controllare che `/api/pc` attraverso il ponte risponda davvero. Se la cassaforte è chiusa, la apre solo Nicholas: si ferma tutto e glielo si dice.
- NB-PROBOOK è alla 0.79.0, quindi non ha Git nel PATH delle chat (arriva con la 0.82.1). Gli hook vanno spenti a livello utente come su DESKTOP e LAPTOP, sennò la chat temporanea stessa può restare bloccata dalla GateGuard. L'aggiornamento di SierraDeck là lo installa solo Nicholas.
- Poi stessa procedura qui sopra (passi 1-4), poi una riga in tabella e la chat temporanea chiusa dalla gestione delle chat.

## Hook spenti in modo diverso: perché
- Sugli altri PC lo spegnimento è a livello utente (vale in ogni progetto e in ogni copia delle chat). Così il blocco «Git Bash non trovato» (`2026-10-21-trappola-senza-git-bash-nel-path-gli-hook-ecc-bloccano-tutti.md`) non può fermare nessuna chat, nemmeno gli autopiloti di altri progetti (sul DESKTOP gira quello di Fionda).
- Qui no: la scelta A/B/C per le copie di SierraDeck aspetta Nicholas (`lista-lavori.md`). Questa è una quarta strada, «D: `env` in `~/.claude/settings.json`», la più semplice; la decide lui. Oggi la GateGuard ha bloccato anche questa chat (c-60) nella sua copia.

## Come si riaccendono gli hook
- **Tutti, su un altro PC:** togliere `ECC_HOOKS_ENABLED` ed `ECC_GATEGUARD` dal campo `env` di `%USERPROFILE%\.claude\settings.json` (oppure rimettere `settings.json.prima-ecc`, se nel frattempo il file non è cambiato).
- **Tutti, qui:** togliere le due chiavi da `.claude/settings.local.json` della cartella principale di SierraDeck (nelle copie sono già accesi).
- **Solo alcuni:** togliere `ECC_HOOKS_ENABLED` e mettere in `ECC_DISABLED_HOOKS` quelli da tenere spenti, per esempio `pre:hookify-runtime,pre:governance-capture,pre:bash:gateguard-fact-force`.
- Vale solo per le chat nuove: una chat già aperta tiene gli hook con cui è partita.
- Prima di riaccenderli serve la correzione provata per «Git Bash non trovato»: la 0.82.1 mette Git nel PATH di ogni chat (`src/main/git-nel-path.ts`), da verificare dopo l'installazione.
- Le «2 opzioni del plugin» che il CLI segnala (`/plugin configure ecc@ecc`) non sono state impostate su nessun PC: gli agenti funzionano senza.
