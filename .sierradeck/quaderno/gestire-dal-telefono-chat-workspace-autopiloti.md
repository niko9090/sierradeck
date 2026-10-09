---
titolo: "Gestire chat, workspace e autopiloti dal telefono (0.55.0, app 2.55.0): le cause del 09/10, la parità con il PC, la copia di prova"
quando: 2026-10-09T10:15:00+02:00
tag: ["telefono", "app", "pagina", "ponte", "workspace", "chat", "autopiloti", "parità", "prove-dal-vero", "copia-di-prova"]
---

# La segnalazione (Nicholas, 09/10)

«Ho provato nell'app sul cell di aprire un workspace nuovo e una chat nuova ma non si riesce, va in errore, e poi non posso eliminare workspace o chat. Quando voglio lanciare un autopilota non mi chiede dove lanciarlo e tante altre info nell'app sul cell».

Nel registro del PC non c'era traccia degli errori. Il telefono era collegato e quella mattina guardava l'altro PC attraverso il ponte.

# Le cause (provate con le rotte vere)

Le ho trovate facendo girare l'`Api` vera dell'app (test Kotlin `ProvaDalVeroTest`) contro una **copia di prova** del programma (vedi sotto).

1. **Il ponte rifiutava tutto quello che non era «guardare e scrivere».**
   - `Ponte.ROTTE` nell'app e `ROTTE_PONTE`/`ROTTE_VIA_CANALE` sul PC lasciavano passare solo stato, storia, scrivi, scegli, riprendi, apri, PIN, allegati e file.
   - Crea workspace, sfoglia, cartelle, chiudi, crea autopilota verso un altro PC finivano in un **403 dell'app stessa**, prima di chiamare il PC. Per questo nel registro del PC non c'era niente.
   - Sul PC accoppiato, invece, crea workspace e apri chat funzionavano.
2. **Con due o più finestre aperte sul PC, una chat chiesta dal telefono nasceva due volte.**
   - `apriChat` mandava `client:apri` a **tutte** le finestre, e ogni finestra apriva la sua copia.
   - Provato dal vero: due finestre, una richiesta, due chat «Altro».
   - Valeva anche per la cassetta degli altri PC.
3. **Eliminare un workspace dal telefono passava per una strada diversa dal pannello.**
   - Mancava la copia `workspaces.prima-dell-eliminazione.json`.
   - Non c'era `spegni`: i claude.exe del workspace eliminato restavano accesi senza una vista da cui spegnerli.
   - Nell'app e nella pagina la funzione c'era, ma **nessun tasto la chiamava**.
4. **L'autopilota dal telefono** si affidava solo sul PC accoppiato e solo in una cartella già vista da Claude Code. Mancavano nome, criteri e workspace, e il nome era tagliato a 40 caratteri.
5. **Attraverso il ponte i campi dell'errore dell'altro PC si perdevano** (`campo`, la `chat` da aprire con il PIN): restava solo la frase. Adesso `ErroreRemoto.altro` li porta, e `ponteVersoPc` li gira interi.

# Come è fatto adesso

- **Regole e testi condivisi** in `src/shared/azioni-telefono.ts`. Li usano il pannello del PC, le rotte, la pagina (come dati JSON) e l'app (`AzioniTelefono.kt`, confrontata da `AzioniTelefonoTest` con `resources/azioni/azioni-0.55.json`, scritto con `AGGIORNA=1`).
  - `controllaBozzaAutopilota`: la validazione unica dell'autopilota nuovo.
  - `controllaNomeWorkspace`.
  - Le conferme: `confermaDormi`, `confermaChiudi`, `confermaSposta`, `confermaEliminaWorkspace` (il testo del PC, parola per parola), `confermaRinominaWorkspace`, `confermaEliminaAutopilota`.
  - `PARTENZE`.
- **Le azioni del telefono le fa la finestra, con il codice dei suoi tasti.**
  - Il Core manda `client:azione`, la finestra risponde con `client:esitoAzione` (`azioneAlleFinestre` in `index.ts`). Il listener sta in `App.tsx`.
  - Workspace: crea, elimina, rinomina (`azioniDiFinestra().crea/elimina`, `workspace.rinomina`). Va a **una** finestra.
  - Chat: dormi (⏸ `iberna`), sveglia, chiudi (× `closePane`), sposta (⇄ `spostaInWorkspace`). Va a tutte e risponde solo quella che ha il riquadro.
  - Senza finestre si usano le strade di prima, ed eliminare fa comunque la copia di sicurezza.
- **Rotte nuove o cambiate:**
  - `/api/chat/dormi|sveglia|sposta` e `/api/workspace/rinomina`;
  - `/api/apri` accetta `workspace`;
  - `/api/workspace/elimina` risponde 404 se il workspace non c'è, 409 se è l'ultimo, 423 se dentro c'è una chat protetta dal PIN e chiusa per chi guarda;
  - `/api/autopilota/crea` ha gli stessi campi del PC.
  - Le rotte delle chat sono in `ROTTE_DENTRO_CHAT`, quindi il PIN vale.
- **La cartella di un autopilota** non deve più essere fra quelle già viste: dal PC si sceglie «Altra cartella…», dal telefono si sfoglia. Deve però esistere, e **non** può essere la radice di un disco né la cartella dell'utente (`radiceAmmessa`, 403 con `campo: 'cwd'`).
- **«Parte da solo»** (`partenza: 'subito'`): `src/main/partenze-subito.ts` tiene l'elenco su disco e ogni 15 secondi dà il «Vai» a chi è `pronto`. Il servizio non lo sa. Vale anche dal pannello del PC (select «Partenza»).
- **Il ponte** (`ROTTE_PONTE` = `ROTTE_VIA_CANALE` = `Ponte.ROTTE`) adesso lascia passare workspace, chat (chiudi/dormi/sveglia/sposta/nome), sfoglia, cartelle, sessioni, autopiloti e quaderno.
  - Restano fuori Drive, aggiornamenti, account, negozio e preferenze di un altro PC.
  - Solo verso PC della stessa cassaforte: è la regola della 0.47, invariata.
- **Una chat nuova creata su un altro PC nasce là**: la sua casa è il PC scelto. Il test `gestire-dal-telefono.test.ts` lo controlla: è il portatile ad aprirla, non il PC accoppiato.
- **App 2.55.0:**
  - menu della chat: Rinomina, Metti a dormire/Svegliala, Sposta in…, Chiudi;
  - «Workspace» nell'elenco delle chat e nella scheda Computer (`GestioneWorkspace`);
  - «+ Nuova» e «Riprendi» anche sugli altri PC, con la scelta del workspace;
  - «Affida un lavoro» rifatto (`Delega`);
  - la scheda Lavori segue il PC guardato (`SuPc`).
  - Un PC di prima lo dice per esteso con `spiegaGestione`: rotta mancante, oppure ponte vecchio che risponde «riquadro remoto».
- **Pagina:**
  - workspace: rinomina ed elimina quello davanti;
  - chat: dormi, sveglia, sposta e chiudi, con le conferme intere;
  - «Affida»: con i campi del PC.
  - La validazione la fa il PC e il motivo torna nella nota.

# Parità PC ↔ telefono (dopo la 0.55.0)

| Cosa | PC | App 2.55.0 | Pagina | Note |
|---|---|---|---|---|
| Chat nuova (cartella) | ✓ (+ nome, modello, Drive) | ✓ sfoglia, workspace, anche altri PC | ✓ cartelle note | modello, nome e «sul Drive» solo dal PC |
| Rinominare una chat | ✓ | ✓ (ora anche il nome della conversazione) | ✓ | |
| Mettere a dormire / svegliare | ✓ ⏸ | ✓ | ✓ | nuovo |
| Chiudere (togliere dal workspace) | ✓ × (senza conferma) | ✓ con conferma | ✓ con conferma | |
| Spostare in un altro workspace | ✓ ⇄ | ✓ | ✓ | nuovo |
| Spostare in un'altra finestra | ✓ | — | — | non ha senso sul telefono |
| Riprendere una conversazione | ✓ | ✓ anche altri PC | ✓ | |
| Buttare le conversazioni | ✓ (cestino) | — | — | lasciato al PC: non si disfa dal telefono |
| PIN: aprire | ✓ | ✓ | ✓ | |
| PIN: proteggere / togliere | ✓ | — | — | da decidere con Nicholas (un PIN messo dal telefono…) |
| Ospite «Ospitata da» | ✓ | — (si vede «il progetto è in mano a…») | — | da fare: scelta con conferma lunga |
| Workspace: creare, andarci | ✓ | ✓ | ✓ | |
| Workspace: rinominare | ✓ | ✓ | ✓ (quello davanti) | nuovo |
| Workspace: eliminare | ✓ | ✓ | ✓ (quello davanti) | nuovo; copia di sicurezza, ultimo protetto |
| Workspace: spegnere quelli dietro | ✓ | — | — | da valutare |
| Autopilota: creare | ✓ | ✓ PC, cartella, workspace, nome, criteri, regola, cloud, partenza | ✓ stessi campi | validazione condivisa |
| Autopilota: ferma / riprendi / vai / elimina / riavvio / dialogo / correggi | ✓ | ✓ anche altri PC | ✓ | |
| Autopilota: archiviare | ✓ | — | — | manca la rotta; da fare |
| Autopilota: cambiare criteri e compiti a mano | ✓ | — (si fa scrivendogli) | — | |

# Prove dal vero (09/10)

Sulla copia di prova, con le rotte del telefono e **tre finestre aperte**:
- un workspace nuovo, poi una chat nel workspace scelto: **una sola** chat, e Claude Code partito;
- la chat messa a dormire e svegliata, rinominata e spostata in un altro workspace;
- il workspace rinominato ed eliminato, con `workspaces.prima-dell-eliminazione.json` scritto;
- gli errori spiegati per esteso: workspace inesistente, chat inesistente, radice del disco, obiettivo vuoto;
- un autopilota vero con «parte da solo»: `intervista` → `pronto` dopo 20 secondi → `lavoro` dopo 30, con nel registro «gli ho dato il via»; poi l'ho eliminato.

Anche `ProvaDalVeroTest` (Kotlin, l'`Api` dell'app) è passato contro la copia di prova.

# La copia di prova del programma (per le prove future)

- **`SIERRADECK_PROVA=<cartella>`** (0.55.0): dati, `userData` e lucchetto in quella cartella, e `APPDATA` dei processi figli (il servizio degli autopiloti) puntato lì.
  - Senza `APPDATA` il servizio della copia leggeva **gli autopiloti veri**. È successo una volta il 09/10: niente cambiato negli autopiloti, l'ho fermata subito.
- In `<cartella>/SierraDeck/impostazioni.json` vanno porte diverse: `portaClient` 47650 e `portaAutopiloti` 47651, più `SIERRADECK_PORTA_AUTOPILOTI=47651`.
- **`CLAUDE_CONFIG_DIR`** in una cartella di prova, con una copia delle credenziali senza `refreshToken`.
- Il «telefono»: un `dispositivi.json` con il segno (sha256) di una chiave nota.
- Con `SIERRADECK_PROVA` l'account è un utente d'esempio: senza, la finestra resta alla schermata d'accesso e le chat non partono.
- **Mai lanciare `electron .` senza `SIERRADECK_PROVA`**: Windows non legge `%APPDATA%` per la cartella dei dati, la copia trova il lucchetto del programma vero e gli apre **una finestra in più** (successo il 09/10).
- Per leggere dentro la finestra: `--remote-debugging-port=9333` e il protocollo DevTools.
- Gli script di prova stanno nello scratchpad della sessione. La cartella di lavoro è `note/prova-app` (ignorata da git): va cancellata alla fine.

# Trappole

- La pagina servita è un template literal. Un `\'` scritto nel sorgente arriva alla pagina come `'`: per un apice dentro una stringa JS della pagina ci vuole `\\'`, come nel resto del file.
- Gli script Python scritti con un heredoc di Bash perdono le barre rovesciate (di nuovo, il 09/10): scriverli con Write.
- `com.sun.net.httpserver` non c'è nei test unitari di Android: il PC finto si fa con un `ServerSocket` (`PcFintoHttp`).

# Da provare con Nicholas, o non fatto

- Sul telefono vero:
  - crea workspace e chat sull'altro PC;
  - dormi, sposta e chiudi;
  - elimina workspace;
  - Affida su un altro PC con «parte da solo».
- Nel PC, `ModaleSessioni` (Riprendi) apre una conversazione locale **senza** `sessionUuid` (`addPane(cwd, titolo)`), quindi potrebbe partire una chat nuova invece di riprenderla. L'ha visto l'inventario leggendo il codice, non l'ho provato e non l'ho toccato.
- Mancano ancora, vedi la tabella:
  - ospite e PIN dal telefono;
  - archiviare un autopilota;
  - nome e modello della chat nuova.
