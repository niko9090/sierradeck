---
titolo: "Chat in sottofondo (0.58.4): usare da qui una chat che vive su un altro PC ed è chiusa là"
quando: 2026-10-10T21:00:00Z
tag: ["altri PC", "sottofondo", "riquadro remoto", "pty", "telefono", "pagina", "decisione di Nicholas"]
---

# Il problema (10/10, «non mi fa scrivere»)

Dopo la 0.58.2 il riquadro di «MT5» puntava finalmente al portatile, ma lì la chat era chiusa. Il riquadro mostrava «Riprendila là», e **il campo di scrittura era disabilitato**: `RiquadroRemoto.tsx` aveva `disabled={chatId === undefined}`, cioè scriveva solo se la chat là era già aperta.

«Riapri là» (`/api/sessioni/riprendi`) apriva la chat **in una finestra** del PC di casa (`client:apri`, con cambio di workspace): rubava lo schermo a chi stava al portatile.

**Decisione di Nicholas:** la chat deve girare **in sottofondo** sul PC di casa, senza mostrarla. Lui lavora da qui su progetti diversi mentre il portatile fa altro.

# Com'era fatto (lo schema)

1. Un pty nasce solo da `pty:spawn` (`ipc.ts`), chiamato da una **finestra**. Il registro gli dà come proprietario quella finestra, e quando la finestra si chiude i suoi pty muoiono (D13).
2. Il cancello della casa (`fermaSeCasaAltrove`) e quello della cartella (`risolviCartella`) stanno dentro lo spawn.
3. Il pty host tiene un tampone di ciò che ogni terminale ha scritto. `pty:attach` lo rimanda, e un riquadro creato con `ptyId` si riaggancia così.
4. Schermo, stato «aspetta», scrittura e tasti delle chat stanno **nella finestra**: l'xterm del riquadro (`registraSchermo`, `client:chiediRighe`, `client:scrivi`, `client:tasti`).
5. La finestra annuncia le sue chat (`client:chat`), che diventano `chatAperte` → `/api/stato` e battito.
6. Un PC remoto trova la chat in `/api/stato` (per sessione), legge `/api/storia` ogni 2 s e scrive con `/api/scrivi` (con `idMessaggio`, senza doppioni).
7. «Riapri là» = `/api/sessioni/riprendi` → `client:apri` a **una** finestra, che va nel workspace della chat e apre un riquadro.
8. Il PIN si controlla su `deps.chat()` per chi guarda (`g.chiusa(visore, c)`). La chiave di casa la controlla `client-server` (firma).

# Come funziona adesso (0.58.4)

- **`src/main/sottofondo.ts`** (`creaSottofondo`), nel processo principale del PC di casa:
  - il pty parte con `avviaPtySenzaFinestra`: stesso avvio di `pty:spawn` (stessi cancelli, stesse opzioni), ma **nessun proprietario**;
  - gli eventi arrivano con `ascoltaSenzaFinestra`;
  - lo schermo sta in un **terminale senza finestra** (`@xterm/headless` 6.0.0, nel build con un alias perché il campo `module` del pacchetto punta a un file che non c'è);
  - le chat compaiono in `chatAperte` con id `sf-<sessione>` e il campo `sottofondo: {id, nome}`, quindi `/api/stato`, `/api/storia`, `/api/scrivi`, `/api/scegli`, il PIN e il battito funzionano come per le altre;
  - l'elenco sta in `sottofondo.json`, con il testo in coda: dopo un riavvio le chat ripartono da sole (20 s dopo l'avvio). Non stanno in nessun workspace, quindi ripristino e riordino non le toccano.
- **Rotte:**
  - `POST /api/sottofondo/avvia {cartella, sessione, titolo, testo?, idMessaggio?}`;
  - `POST /api/sottofondo/stato {sessione}`;
  - sono nel canale WebRTC e nel ponte del telefono.
- **Cancelli** (`cancelliSottofondo`, provati in `tests/main/sottofondo-rotte.test.ts`): firma di casa, cartella conosciuta, PIN (423), casa della chat = questo PC, cartella esistente. Se la chat è già in un riquadro di qui, il testo va lì.
- **Mai due `claude --resume` sulla stessa chat:** se una finestra apre una conversazione che gira in sottofondo, `pty:spawn` la **adotta** (`impostaAdozioneSottofondo` + `attach`, e il riquadro scrive il tampone). «Mostra qui» usa la stessa strada (`client:apri`).
- **Chi scrive:**
  - PC: `RiquadroRemoto`. Il campo è sempre attivo, il primo testo chiama `remoto:sottofondo`, e il Core segue `/api/sottofondo/stato` scrivendo `[apertura] …` nel registro fino a «testo … consegnato … — apertura remota riuscita». Il riquadro mostra «La sto avviando su X…» o, se fallisce, il perché con Riprova.
  - Pagina: «Riprendi» → una chat «su un altro PC» → riquadro «Scrivi a …» via `/api/ponte`.
  - App 2.58.4: `DialogoSottofondo` (`Sottofondo.kt`). I testi sono gli stessi ovunque (`testoAvvio`).
- **PC di casa:** «⧉ Usate da altri PC (n)» nella barra (`SottofondoQui.tsx`), con chi la usa, lo stato, «Mostra qui» e «Chiudi».

# Trappole viste dal vero (copia di prova, 10/10)

- **La domanda di fiducia della cartella ha «❯ No, exit»:**
  - il solo «❯» faceva credere la chat pronta, e il testo veniva scritto mentre Claude Code caricava la conversazione ripresa: spariva;
  - adesso «pronta» = `campoPronto` (ultima riga «❯» vuota con il piede «bypass permissions / ? for shortcuts» sotto) + 1,5 s di quiete + niente domanda o lavoro sullo schermo;
  - un testo perso (`testoPerso`) torna in coda e si riscrive, al massimo 3 volte, poi resta **fermo in coda** finché non si preme Riprova. Prima veniva segnato «consegnato» per errore.
- **Quella domanda è un selettore senza numeri,** che `scelteDiTerminale` non riconosceva: da lontano non si poteva rispondere, e vale anche per le chat normali. Ora c'è `selettoreSenzaNumeri`, con il piede «Enter to confirm · Esc to cancel» e la scelta con le frecce.

# Prova dal vero (copia di prova `SIERRADECK_PROVA`, porte 47650/47651, chat di prova creata apposta)

1. Il «telefono» di prova ha chiesto l'avvio con un testo. Nel registro: `avviata in sottofondo … nessun riquadro, nessuna finestra` → domanda di fiducia → risposta con `/api/scegli` → `chat pronta: scrivo il testo prova-2` → `testo consegnato (prova-2)`. Sullo schermo è comparso «● SOTTOFONDO-OK».
2. Finestre della copia: sempre 1. Riquadri nei workspace: 0.
3. Riavviata la copia: `1 chat in sottofondo ripartite dopo l’avvio`, con il testo ancora in coda.
4. «Mostra qui»: è comparso un riquadro con tutta la storia, e i `claude.exe` di quella sessione sono rimasti gli stessi (nessun secondo avvio).
5. **Da fare con Nicholas:** la catena vera fra due PC (questo PC → portatile). Bisogna installare la 0.58.4 su tutti e due e scrivere in MT5 da qui. Nel registro di questo PC deve comparire `[apertura] … testo … consegnato su LAPTOP… — apertura remota riuscita`.

# Il push di git (403)

Il Credential Manager di Windows dava una credenziale negata. In questo repository è impostato `credential.https://github.com.helper = !gh auth git-credential`, solo locale.
