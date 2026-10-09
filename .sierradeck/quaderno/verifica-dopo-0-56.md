---
titolo: "Verifica dopo la 0.56.0 (0.56.2, app 2.56.2): PC vecchi, consegne, segnali, servizio, ripasso dei flussi"
quando: 2026-10-09T13:40:00+02:00
tag: ["verifica", "compatibilita", "pc-vecchi", "installa-la", "servizio", "segnali", "consegne", "prove-dal-vero"]
---

# Perché

Nicholas (09/10): dopo la 0.56.0 «funziona ancora peggio di prima». Non ha detto cosa: il supervisore ha mandato cinque punti presi dal registro del PC.

# 1. PC con versioni vecchie

Il 09/10 sul Drive ci sono DESKTOP alla 0.54 (poi 0.56) e il portatile alla 0.50.

**Risposte vere** di quelle versioni alle richieste della 0.55/0.56, generate dai tag: in `android/app/src/test/resources/pc/0.50.0/` e `0.54.0/`.
- **Come si generano:** `git worktree add --detach ../SierraDeck.sierradeck-wt/vX vX`, una giunzione a `node_modules`, un test in `tests/genera/` che chiama `rotteClient` di quella versione con dipendenze minime e scrive `.json`/`.stato`. Poi si toglie la giunzione **prima** di `git worktree remove`.
- **Cosa rispondono:**
  - dormi, sposta, rinomina workspace, PIN, ospite, archivia, modelli, «Installa là» → 404 «non trovato»;
  - chat nuova e Affida → **200**, ma **ignorano** nome, workspace, modello, criteri e partenza.

**Corretto:**
- App:
  - `FunzionePc.PARITA` (0.56.0) e `INSTALLA_LA` (0.56.2): il messaggio cita la versione giusta. Prima diceva 0.55.0 anche per le azioni della 0.56.
  - `spiegaGestione` aggiunge «Si aggiorna con «Installa là»», e spiega il 403 «cartella non conosciuta» dei PC di prima della 0.55.
  - Chat nuova su un PC vecchio: la nota dice che nome, workspace e modello non arrivano. Affida lo diceva già.
  - `BandaPcIndietro`, in cima alle chat e ai Lavori di un altro PC e nell'elenco «Altri computer»: «NOME ha la versione X, il PC a cui è collegato il telefono la Y. Là non ci sono ancora: …» e il tasto **Installa là**.
- PC: rotte `/api/installa-la` (solo dal telefono accoppiato, mai da un altro PC) e `/api/installa-la/stato`. Usano lo stesso `avviaInstallaLa` della Salute; un PC che non è della cassaforte riceve 404 subito (prima riprovava per sempre).
- Test: `CompatibilitaVecchiTest.kt` sulle risposte vere; le rotte in `parita-0-56.test.ts`.

# 2. Consegna persa al riavvio

Corretta nella 0.56.1: scheda `consegne-due-workspace-una-finestra.md`.

# 3. «Nessun segnale da Claude Code»

**Non era un guasto.**
- La riga si scrive una volta per chat quando, dopo l'avvio, la chat non ha ancora fatto niente: c'è nei registri dal 06/10, a ogni riavvio.
- I due claude.exe veri hanno l'hook `http://127.0.0.1:47640/api/segnale` nelle `--settings`.
- Sulla copia di prova una chat è passata a `fonteStato: segnali`.

Il registro però non diceva mai quando i segnali arrivano. Adesso:
- «arrivano i segnali di Claude Code (primo: …)» al primo segnale di ogni chat;
- la riga di prima dice «ancora nessun segnale … (la chat non ha ancora fatto niente)».

**Trappola delle prove:** con una `CLAUDE_CONFIG_DIR` nuova, Claude Code si ferma sulle schermate iniziali (tema, avvisi, fiducia nella cartella) e non manda segnali. Nel `.claude.json` di prova servono `hasCompletedOnboarding`, `theme`, `bypassPermissionsModeAccepted` e `projects[cartella].hasTrustDialogAccepted`.

# 4. Il servizio «riavviato» alle 09:14:43 (e due volte alle 07:45:02)

Non erano riavvii.
- `assicuraServizio` chiedeva `/salute` con 3 s di tempo massimo. Con il servizio occupato la salute scadeva e il Gestore ne avviava **un altro**.
- Il nuovo scriveva «sessione avviata», trovava la porta presa e usciva senza dirlo nel registro.
- Due chiamate insieme facevano due doppioni nello stesso istante (07:45:02, a 28 ms).

Adesso:
- una verifica alla volta;
- prima di avviare si guarda se la porta è in ascolto (`portaInAscolto`): se sì, «è occupato, non ne avvio un altro»;
- il doppione che trova la porta presa lo scrive nel registro.

Il mio script di arresto della copia di prova non tocca il servizio vero, che sta in un altro percorso (`…\resources\app.asar\out\main\autopilot-host.js`).

Test: `autopilot-client.test.ts`.

# 5. Ripasso dei flussi 0.55/0.56 sulla copia di prova

Provati con le rotte del telefono:
- workspace nuovo;
- chat nuova con nome e modello (nasce nel workspace scelto, con quel nome);
- modelli;
- dormi e sveglia;
- sposta;
- rinomina ed elimina workspace;
- ospite;
- PIN:
  - senza PIN sul PC → 409 spiegato;
  - con il PIN → la chat è «chiusa» per il telefono;
  - togliere senza PIN → 423;
  - PIN sbagliato → 403, giusto → 200, poi si toglie;
- archivia;
- «Installa là»;
- ponte verso un PC sconosciuto (502 spiegato).

Impostazioni del PC e «Riprendi» erano già provati dal vero nella 0.56.0.

Non provato dal vero, solo con i test: due autopiloti in due workspace al riavvio, e l'indicatore del collegamento sul telefono vero.
