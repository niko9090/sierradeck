---
titolo: "Analisi 0.80.0: numeri misurati e problemi in ordine di importanza (PC, pagina, app)"
quando: 2026-10-20T13:30:00+02:00
tag: ["0.80.0", "analisi", "prestazioni", "memoria", "errori silenziosi", "codice doppio", "grafica"]
---

# Analisi 0.80.0

Fatta su main a 4416a72 (misure) e riletta su aafccdb (codice). Nessun codice cambiato.
Le correzioni vengono dopo, su un ramo, ciascuna con il suo test e la Revisione.

**Facce:**
- **PC** = la finestra (`src/renderer`) e il processo principale (`src/main`);
- **pagina** = la pagina servita al telefono (`src/main/client-pagina.ts`);
- **app** = l'app Android (`android/`).

Ogni voce dice: dove sta nel codice (file:riga), cosa vede Nicholas, la correzione proposta e la faccia.
**«serve il sì di Nicholas»** segna le voci che toglierebbero o sposterebbero una funzione.

---

## 1. I numeri

### Come sono stati presi (per rifarli uguali dopo le correzioni)

**La copia di prova:**
- `npm run build` nella cartella principale.
- Una cartella di prova con `dati/SierraDeck/impostazioni.json` = `{"preferenze":{"portaClient":47670,"portaAutopiloti":47671}}`.
- `claude/projects` copiata da quella vera, per avere un indice realistico: 699 sessioni, 32 cartelle, 1,4 GB.
- Lancio: `electron.exe . --remote-debugging-port=9363` con `SIERRADECK_PROVA=<prova>\dati` e `CLAUDE_CONFIG_DIR=<prova>\claude`.
- Mai senza `SIERRADECK_PROVA`, mai sulle porte vere 47630/47640.
- Drive configurato ma **non collegato** (la copia non usa l'account vero). Nessun altro PC raggiungibile.

**Lo script:** `misura-080.mjs`, solo Node 24 con CDP, niente Playwright.

| Cosa | Come si misura |
|---|---|
| Avvio | Dal lancio a: CDP agganciabile; primo disegno di React (`#root` con figli); interfaccia completa (`.console`/`.riquadro`/`.pan-corpo`/`.progetti` presenti); `/api/ciao` che risponde sulla porta della pagina. |
| Memoria | 20 s dopo l'avvio e di nuovo alla fine del giro (circa 3 minuti di uso). Albero dei processi da `Win32_Process`, con working set e memoria privata. Il servizio degli autopiloti si conta a parte perché si stacca dal programma. |
| Schermate | Si apre con l'evento `sierradeck:apri-pannello` (Progetti, Impostazioni, Negozio, Autopiloti, Salute); con il tasto «↺ Riprendi» (elenco chat); con «Account e Drive» nelle Impostazioni (Drive); con l'interruttore «Panoramica» partendo da «Tutte le chat affiancate». Si misura **appare** (il dialogo c'è) e **pronto** (il DOM resta fermo 400 ms, esclusi i 400 ms). Due aperture: fredda, poi calda dopo Esc. |
| Ponte (`/api/*` in locale) | `fetch` con la chiave di un «telefono di prova» scritto in `dispositivi.json` (solo il segno sha256). Tre chiamate per rotta: la prima è quella fredda. |
| Pagina servita | Edge `--headless=new` a 412×915 `mobile`, senza cache. Si misura dal `Page.navigate` alla pagina disegnata e ferma, più `transferSize` e numero di risorse. |
| App | Lettura di `android/app/build.gradle.kts` e `unzip -l` dell'APK firmato già costruito (2.79.0). Niente emulatore. |

**Tre giri:**
- giro A = il primissimo avvio della copia nuova (migrazioni, cache vuote);
- giri B e C = avvii normali.

Un quarto giro è stato scartato: un'altra chat aveva avviato la sua copia sulla stessa porta di debug 9363, e la macchina era al 100% di CPU con 13 processi di vitest. Lì Progetti misurava 15 s.

**Da ricordare per rifare le misure:** controllare prima le porte con `Get-NetTCPConnection -State Listen`. Se 47670/47671/9363 sono occupate, usare 47680/47681/9373 e misurare a macchina quieta.

### Tabella

Numeri in ms dove non è detto altro. Per ogni giro: A / B / C.

| Misura | A (primo avvio) | B | C | Nota |
|---|---|---|---|---|
| Avvio: CDP agganciabile | 7905 | 4096 | 2835 | |
| Avvio: primo disegno React | — | 6399 | 4558 | in A non misurato |
| **Avvio: interfaccia completa** | **28324** | **9241** | **7648** | 5 s fra primo disegno e interfaccia |
| Avvio: pagina in ascolto (`/api/ciao`) | 7709 | 4007 | 2804 | |
| Memoria a 20 s, main (WS/privata MB) | 136/130 | 128/112 | 129/113 | |
| Memoria a 20 s, finestra | 111/51 | 111/52 | 114/58 | |
| Memoria a 20 s, pty host | 50/21 | 52/25 | 50/23 | |
| Memoria a 20 s, servizio autopiloti | 66/27 | 64/25 | 65/27 | |
| Memoria a 20 s, GPU + utility | 146/111 | 156/144 | 151/142 | |
| **Memoria totale a 20 s (WS)** | **509 MB** | **511 MB** | **509 MB** | |
| Memoria dopo circa 3 min di giro, main | — | 158/139 | 160/142 | +30 MB |
| Memoria dopo circa 3 min di giro, finestra | — | 136/73 | 145/82 | +25/+30 MB |
| Progetti, pronto (fredda / calda) | 646 / 234 | 519 / 254 | 332 / 242 | la più lenta delle schermate |
| Impostazioni, pronto | 201 / 109 | 150 / 71 | 127 / 64 | |
| Negozio, pronto | 70 / 18 | 75 / 286 | 72 / 17 | |
| Autopiloti, pronto | 145 / 150 | 25 / 18 | 22 / 17 | nessun autopilota nella copia |
| Salute, pronto | 42 / 33 | 51 / 21 | 32 / 57 | |
| Elenco chat («Riprendi»), pronto | 187 / 217 | 195 / 110 | 266 / 147 | 699 sessioni |
| Drive (Account e Drive), pronto | — | 76 / 76 | 83 / 74 | Drive non collegato |
| Panoramica, pronto | 27 | 18 / 17 | 18 / 17 | workspace vuoto: numero poco indicativo |
| `/api/ciao` | 7·4·3 | 7·4·4 | 7·5·4 | |
| `/api/stato` | 72·11·16 | 16·36·12 | 21·12·10 | 684 B |
| `/api/domande` | 28·32·26 | 33·17·15 | 32·16·8 | |
| `/api/panoramica` | (400) | 28·31·16 | 16·23·13 | |
| `/api/salute` | 31·15·22 | 32·12·19 | 20·40·29 | |
| **`/api/negozio`** | **12908**·26·23 | 26·27·31 | 31·21·29 | la prima volta in assoluto 12,9 s, poi tenuto in cache sul disco |
| `/api/drive/pannello` | 218·231·210 | 217·222·236 | 240·233·227 | **537 KB** a ogni chiamata, anche a Drive scollegato |
| **`/api/chat/gestione/spazio`** | **2296·2251·2048** | **1785·1936·2131** | **2112·1970·2053** | 262 KB, nessuna memoria fra una chiamata e l'altra |
| `/api/file/progetti` | 32·25·17 | 30·18·19 | 27·29·18 | |
| `/api/cartelle` | 23·14·12 | 10·9·17 | 10·10·16 | |
| `/api/ponte` (nessun PC) | 20·4·7 | 21·13·4 | 10·13·16 | 502: nessun altro PC nella copia, il ritardo vero del ponte non è misurabile qui |
| **Pagina: peso** | 417 KB | 417 KB | 417 KB | HTML **non compresso**, più 5 risorse (4 KB) e 4 chiamate `/api` |
| Pagina: pronta (tre caricamenti) | 1154·1519·1377 | 790·945·833 | 968·713·773 | |
| **APK release 2.79.0** | 16,0 MB | | | `isMinifyEnabled = false`: 52 MB di dex non compressi in 3 file |
| APK debug | 25,2 MB | | | |

**Cosa dicono i numeri:**
- **L'avvio è lento:** 8-9 s a programma già conosciuto, 28 s la prima volta. Fra il primo disegno e l'interfaccia completa passano 5 s.
- **La memoria a riposo è di circa mezzo GB.** Main e finestra crescono di 25-30 MB in 3 minuti di aperture.
- **«Spazio delle chat»** costa 2 s a ogni chiamata.
- **Il pannello del Drive** manda mezzo MB anche a Drive scollegato.
- **La pagina del telefono** ripete 417 KB non compressi a ogni apertura.
- **Le schermate del PC** si aprono tutte sotto i 300 ms tranne Progetti alla prima apertura (330-650 ms).

### Numeri dopo (19/10 pomeriggio, main `836d2dd`, c-10)

**Come sono stati presi:**
- copia nuova con `scripts/misure/prepara.mjs --conversazioni` (le stesse conversazioni vere copiate, 31 cartelle);
- misure con `scripts/misure/misura.mjs` (`avvia`, `apri` per 6 chat, `rotte` con la mediana di 5 giri, `cpu` per 30 s);
- il PC era **al 100% di CPU** per il lavoro delle altre chat, quindi i tempi d'avvio sono pessimisti, mentre memoria e mediane delle rotte sono confrontabili.

«Interfaccia pronta» qui vuol dire più di 5 tasti nel DOM. È più vicino al «primo disegno» della tabella sopra che all'«interfaccia completa».

| Misura | Prima | Dopo | |
|---|---|---|---|
| Avvio normale, interfaccia pronta | 6,3 s (c-10), 7,6–9,2 s (tabella sopra) | **5,3 · 5,6 · 6,0 s** | meglio, nonostante il carico |
| Primo avvio con le conversazioni | 23–28 s | **72 s** | vedi sotto: carico, non codice |
| Memoria programma, vuota (privata) | 380 MB | **335–345 MB** | −40 MB |
| Memoria programma con 6 chat | 469 MB | **452 MB** | finestra 79 MB, main 139, pty-host 92 |
| `/api/file/progetti` (Progetti) | 177–272 ms | **54 ms** | ×3–5 più veloce (`225636e`) |
| `/api/drive/pannello` | 516–537 KB, 190–230 ms | 524 KB, 187 ms; **46 KB compresso** | il peso resta, il filo è leggero |
| Pagina del telefono `/` | 417 KB non compressa | **116 KB compressa** (gzip) | −72% (`e244ef9`) |
| `/api/chat/gestione/spazio` | 1,8–2,3 s | **0,93–1,1 s** | metà, ancora senza memoria fra chiamate |
| `/api/negozio` alla prima | 12,9–30 s | **7,3 s** | poi 30 ms |
| `/api/stato`, `/api/sessioni`, `/api/panoramica` | 8–36 ms | 15 · 16 · 27 ms | uguali |
| CPU in 30 s, 6 chat ferme | 0,36 s ogni 15 s | finestra 0,34 s, main 0,56 s, GPU 0,08 s | uguale: a chat ferme non si vede |

**Il primo avvio da 72 s non è un peggioramento del codice.**
- Quasi tutto il tempo (66 s, dalle 14:01:31 alle 14:02:37) è la rimappatura delle 11 chat con la cartella di un altro PC.
- Nel «prima» la stessa riga aveva impiegato 14 s. Il lavoro è uguale (riscrive le trascrizioni a flusso), quindi la differenza è il carico del PC.
- Nella copia il registro dei progetti è vuoto, per cui quelle chat sembrano senza casa: vengono adottate in 6 cartelle **vuote** di «Progetti SierraDeck». Sul PC vero il registro dice dove vivono (`altrove`) e la cartella non si crea (`aa3579b`). Per provare quel caso nella copia serve un registro dei progetti con un altro PC residente.

**Nuovo nel registro della copia:**
- `MaxListenersExceededWarning: 11 before-quit listeners` all'avvio. Si vede solo da quando gli avvisi del main vanno nel registro (`6bdf5e9`).
- **Non è una perdita.** Sono 12 `app.on('before-quit', …)` fissi in `index.ts` e `finestre-pannello.ts`, uno per timer, registrati una volta sola all'avvio.
- L'effetto è solo una falsa riga `[ERRORE]` a ogni avvio, che sporca la conta degli errori nel registro.
- Rimedio da una riga: `app.setMaxListeners(30)` in cima al main. Va in Bassa.

**Non misurato dopo:**
- la CPU con le chat al lavoro, cioè la situazione dell'84% di un core sul programma vero: servono chat che scrivono, quindi consumo del piano. Si misura sul PC vero dopo l'installazione, con lo stesso `misura.mjs cpu`;
- le foto «dopo» della grafica, che fa c-12.

**Non misurato:**
- il Drive vero e il primo giro di un PC nuovo sul Drive (serve un account di prova);
- il ponte verso un altro PC (servono due PC);
- l'app su un telefono.

---

## 2. Criteri chiesti da Nicholas il 19/10 (in cima all'elenco)

### (a) Le chat finite non si chiudono se il ramo è già unito o non esiste più · PC (servizio autopiloti)

- **Dove:** `src/autopilot-host/worktree.ts:135-155` (`unisciRamo`) e `src/autopilot-host/server.ts:2464-2472` (mossa `chiudiChat`).
  - Con il ramo mancante, `merge-base --is-ancestor` dava 128 e `git merge` rispondeva «not something we can merge»: risultato `ok:false` senza conflitto.
  - `if (!unita) continue` lasciava la chat in `lavoro`, senza un limite di tentativi.
  - Il supervisore la richiedeva a ogni giro.
- **Stato:** **corretto in main con aafccdb** (cherry-pick di 12f85e0 di c-11). Ora il ramo mancante o già contenuto nel principale vale «niente da unire», e gli avvisi LF/CRLF non contano più come conflitti. Test in `tests/autopilot-host/worktree.test.ts`.
- **Resta da fare:**
  1. `server.ts:2450-2462`: con il ramo mancante la chat va ancora mandata in Revisione su un ramo che non c'è. Va chiusa subito.
  2. Un tetto ai tentativi falliti di `chiudiChat` per chat, poi una domanda a Nicholas. Oggi il ciclo è infinito per ogni altro motivo di `ok:false`, per esempio la cartella principale con file non salvati.
  3. `server.ts:2731-2739`: l'unione finale ripete l'unione su chat già chiuse e lascia «non riuscita» nel diario.
  4. Il test di `server.ts` con git vero (ramo assente, già unito, con lavoro nuovo) che controlli `stato: 'finita'`.
- **Nota:** la correzione vale per Nicholas solo dopo l'installazione: il servizio vero gira con la versione installata.

### (b1) Un progetto che vive su un altro PC crea qui una cartella vuota · PC

- **Dove:** `src/main/index.ts:2641-2658` (`progettoPerWorkspaceGlobale`).
  - Il controllo «vive altrove» (riga 2648) confronta solo il **nome** con il registro dei progetti. Non guarda la residenza (`unaCasa.casaDi('progetto:<id>')`), i riquadri `remoto` del workspace né i workspace nei battiti degli altri PC.
  - Poi `mkdirSync` (riga 2652) e `unaCasa.memorizza(... pc: io.id, da: 'nicholas')`: questo PC diventa «residente», come se l'avesse deciso Nicholas.
- **Peggio:** la cartella nasce anche **solo leggendo**:
  - `sistema:cartelleBase` (`index.ts:4049`), che `ModaleNuovaChat.tsx:45` chiama a ogni apertura del modale;
  - `cartellaPerChatNuova` (`index.ts:5048`);
  - `dopoCreato` di `workspace:crea` (`ipc.ts:1212`).
- **Secondo punto:** `src/main/cassaforte/sincronia.ts:883` (`ripristinaProgetto`) chiama `preparaRipristino()` senza `soloId`. `src/main/progetti/sincronia-progetti.ts:84-101` crea la cartella di **tutti** i progetti del registro, senza guardare `esclusi` né la residenza. Lo stesso alla riga 1437.
- **Effetto per Nicholas:**
  - cartelle vuote nella cartella dei progetti;
  - il progetto risulta «residente qui»;
  - le chat nuove partono in una cartella vuota invece di dire «vive su <PC>».

  È il caso del 19/10.
- **Correzione:**
  - separare la lettura dalla creazione: `cartelleBase` e `cartellaPerChatNuova` solo leggono;
  - prima di `mkdirSync` controllare residenza, riquadri remoti e battiti; se vive altrove, rispondere `{ viveSu }` e mostrarlo nel modale;
  - `ripristinaProgetto` con `new Set([id])`;
  - `preparaRipristino` deve saltare gli esclusi e i residenti altrove.
- **Test:** `progetto-per-workspace.test.ts` (dopo aver estratto la funzione in un modulo puro), `cassaforte-sincronia.test.ts`, `progetti-presenza.test.ts`.

### (b2) Il primo messaggio all'autopilota diventa il nome di un workspace, con la sua cartella · PC, pagina, app

- **Dove:**
  - `src/shared/azioni-telefono.ts:202-204, 240` (`nomeDaObiettivo`): le prime 8 parole del messaggio, al massimo 60 caratteri.
  - PC: `src/renderer/components/PannelloAutopiloti.tsx:128-135`. «Suo workspace» è acceso di default (riga 71). `nomeWorkspacePerAutopilota(r.nome …)` → `workspace:crea` → `progettoPerWorkspaceGlobale` → cartella (vedi b1).
  - Telefono: `client-pagina.ts:2655-2663` → `/api/autopilota/crea` (`client-rotte.ts:1752-1772`) → `creaAutopilota` (`index.ts:5429-5440`) → `workspaceDellAutopilota(r.nome, r.cwd)` (`azioni-telefono.ts:138-146`), che usa prima il nome e poi la cartella.
- **Effetto:** un workspace che si chiama come metà di una frase, più una cartella vuota omonima registrata come progetto di qui. È il caso del 19/10.
- **Correzione:**
  - il workspace dell'autopilota prende il nome dalla **cartella** scelta (`basename(cwd)`) o dal progetto esistente;
  - il nome scritto da Nicholas vale solo se l'ha scritto lui (distinguere il nome scritto da quello ricavato);
  - creare un workspace non crea cartelle.
- **Test:** `tests/shared/azioni-telefono-app.test.ts` e `tests/shared/workspace-autopilota.test.ts`.

### (c) Un workspace nuovo nasce senza autopilota, e niente lo dice · PC (poi pagina e app)

- **Dove:**
  - `src/main/workspace-operazioni.ts:113-128` e `src/main/ipc.ts:1208-1215`: nasce solo `{ nome, perSlot: {} }`.
  - Il «dormiente» (il posto per l'autopilota) si calcola una volta sola nella migrazione 0.74.1 (`src/shared/migrazione-elenco.ts:91-111`). `App.tsx:2167-2168` lo passa solo ai workspace di allora.
  - `src/renderer/components/WorkspacePanoramica.tsx:489`, nella vista predefinita, mostra solo una frase in grigio, senza tasto. `ElencoWorkspace.tsx:113-116` invece ha «Avvia un autopilota».
- **Effetto:** in un workspace nuovo Nicholas non trova il modo di dargli un autopilota.
- **Correzione:**
  - una funzione pura `dormienteDi(workspace, archivio, migrazione)` calcolata per ogni workspace senza autopilota;
  - nella Panoramica: «Questo workspace non ha ancora un autopilota» con «Crea l'autopilota ?», che apre il modulo con il workspace già scelto;
  - stessa cosa su pagina e app.
- **Test:** `tests/shared/migrazione-elenco.test.ts` e `tests/renderer/workspace-panoramica.test.tsx`.

### (d) Segnalate da Nicholas, compito a parte nel piano («Workspace che cambia da solo e notifiche») · PC, pagina, app

- **Il workspace sullo schermo cambia da solo.**
- **Arrivano mille notifiche quando un autopilota lavora.**

Oggi nel registro non c'è nessuna riga per i cambi di workspace né per le notifiche. Il primo passo è scriverle (chi cambia il workspace e perché; ogni notifica con il motivo), poi provare nella copia di prova.

Piste da verificare, non verificate qui:
- il cambio di workspace alla ripresa delle chat (`finestraPerRipresa` in `index.ts` intorno alla riga 1120) e al `client:chiudiChat` dal telefono;
- le notifiche per ogni consegna o turno delle chat specialiste, mai raggruppate.

---

## 3. Elenco ordinato per importanza

Ordine: prima ciò che perde dati o nasconde guasti, poi la velocità che Nicholas sente ogni giorno, poi i testi e la grafica che dicono cose sbagliate, poi il resto.

### Alta

**1. Gli errori del processo principale non arrivano nel registro** · PC (con effetti su pagina e app)
- **Dove:** circa 120 `console.error`/`console.warn` nel main. Fra i più importanti:
  - `src/shared/scrittura-atomica.ts:46, 78`;
  - `src/main/workspace-store.ts:160`;
  - `src/main/index.ts:1090, 4753, 6138`;
  - `src/main/client-server.ts:162`;
  - `src/main/pty-host-client.ts:151`;
  - `src/main/ipc.ts:1652, 1837, 1844`.

  Il servizio autopiloti li copia nel registro (`src/autopilot-host/index.ts:212-215`), il main no.
- **Effetto:** non lasciano traccia i salvataggi falliti di `workspaces.json`, il servizio che non parte, gli autopiloti non ripresi e gli errori 500 del telefono. Per questo «il workspace cambia da solo» non lascia segni.
- **Correzione:** all'avvio del main, `console.error` e `console.warn` passano anche da `registroGlobale`.
- **Costo:** piccolo. **Guadagno:** rende visibili quasi tutti gli altri guasti.

**2. Se `workspaces.json` non si legge un istante, la scrittura successiva cancella tutti i workspace** · PC
- **Dove:** `src/main/workspace-store.ts:96-100`: alla lettura fallita, `console.error` e archivio vuoto. Chi legge e riscrive: `index.ts:5551` (`store.scrivi(creaWorkspace(store.leggi(), nome))`), `index.ts:354-356`, `index.ts:6055-6062`.
- **Stesso schema:** `src/main/workspace-ritrova.ts:22-26` e `src/main/chiuse-store.ts:24`.
- **Effetto:** con il file preso un attimo dall'antivirus, un workspace creato dal telefono lascia solo quello nuovo, senza nessuna riga nel registro.
- **Correzione:** fuori da `ENOENT`, riprovare una volta; poi segnare «non leggibile» e rifiutare `scrivi` con il motivo nel registro.

**3. `/api/stato` e `/api/domande` rileggono due file per ogni chat, ogni 2 secondi** · PC, pagina, app
- **Dove:** `src/main/index.ts:1573-1576` (`conAltrove`), `1812` (`progettoDi`), `3696-3699`, `src/main/progetti/registro.ts:302-310`, `src/main/progetti/pc.ts:69-72, 94-101`. `progetti-drive.json` e `pc.json` vengono letti e analizzati in modo sincrono per ogni chat aperta e salvata.
- **Quanto spesso:** telefono e pagina ogni 2 s; ogni finestra del PC ogni 3 s (`App.tsx:1110`).
- **Effetto:** centinaia di letture sincrone ogni 2 s sul thread principale; scatti del terminale quando il telefono è aperto.
- **Correzione:** cache su mtime+size (come `workspace-store.ts:76-93`), identità del PC in memoria.

**4. Un download dal Drive ogni 10 secondi solo per sapere se il Drive è attivo** · PC
- **Dove:** `src/main/index.ts:4992-4999` (`driveAttivoAdesso`), chiamato da `client:chat` (`index.ts:5984-5987`, ogni 2 s per finestra) → `src/main/cassaforte/sincronia.ts:693-700` → `scaricaChiavi()` (`:641-645`). In più, `sync:stato` ogni 30 s per finestra (`App.tsx:633-641`).
- **Effetto:** oltre 360 richieste l'ora a Google con il programma aperto: rete, quota delle API e stato dell'autopilota in ritardo quando il Drive è lento.
- **Correzione:** `driveAttivo` = `driveConnesso() && maestra !== undefined && auto()`; il confronto remoto solo all'apertura del pannello o al massimo ogni 10 minuti.

**5. Il pannello del Drive e «Spazio delle chat» rifanno tutto da capo a ogni chiamata** · PC, pagina, app
- **Misurato:** `/api/drive/pannello` 210-240 ms e **537 KB** a ogni chiamata, anche a Drive scollegato; `/api/chat/gestione/spazio` **1,8-2,3 s** a ogni chiamata (699 sessioni).
- **Dove:** `src/main/index.ts:2575-2579` (`existsSync` su ogni `.jsonl`), `2585-2603` (`statSync` su ogni sessione), `2944-2951` (`leggiPannello`), `2991`.
- **Quanto spesso:** ogni 2 s in `VistaProgetti.tsx:69-75` durante un lavoro, ogni 2,5 s dalla pagina (`client-pagina.ts:4787`) e dall'app (`PannelloDrive.kt:347`).
- **Effetto:** pagina lenta e PC che scatta durante traslochi e unioni; sul telefono mezzo MB ogni 2,5 s.
- **Correzione:**
  - usare `sizeBytes`/`mtimeMs` già nell'indice SQLite;
  - una memoria di qualche secondo per lo spazio;
  - nel pannello mandare solo le chat del progetto aperto, oppure un «non cambiato» (impronta).

**6. Gli autopiloti si rileggono interi, con `decisioni` che crescono senza tetto** · PC, pagina, app
- **Dove:** `src/autopilot-host/server.ts:3123-3131` (`GET /autopiloti` restituisce tutto, archiviati compresi); `decisioni: [...a.decisioni, …]` senza limite (`src/shared/autopilota.ts:799-810`).
- **Chi lo chiama:** `App.tsx:1354-1357` ogni 5 s per finestra (più `JSON.stringify` alla riga 1304), `FinestraPannello.tsx:36` ogni 2 s, e `/api/stato`, `/api/domande`, `/api/autopilota` e `/api/panoramica`.
- **Effetto:** dopo settimane, MB serializzati e analizzati ogni pochi secondi su servizio, main e finestra. È probabilmente una parte della crescita della memoria.
- **Correzione:** tetto a `decisioni` (circa le ultime 200), una rotta leggera per gli elenchi senza archiviati, un «non cambiato».

**7. «/api/domande» moltiplica le chiamate al servizio** · PC, pagina, app
- **Dove:** `src/main/client-rotte.ts:1231-1257` (`leggiConversazioni`: tre chiamate HTTP al servizio più la voce 3).
- **Chi la interroga:**
  - PC: `App.tsx:1110` (3 s), `PannelloDomande.tsx:46` (2 s), `LinguettaAutopilota.tsx:28-36` (2 s);
  - pagina: `client-pagina.ts:5970-5975` (2 s);
  - app: `Domande.kt:75-86` (2 s), `DomandeALato.kt:54-59` (2,5 s).
- **Correzione:** una sola lettura in volo nel main, tenuta 1-2 s e condivisa da tutti; meglio, un evento quando qualcosa cambia.

**8. L'avvio richiede 8-9 secondi (28 la prima volta)** · PC
- **Misurato:** primo disegno a 4,6-6,4 s, interfaccia completa a 7,6-9,2 s.
- **Correzione:** prima trovare dove va il tempo, con una traccia di avvio scritta nel registro (fasi con i millisecondi). Sospetti, da verificare con la traccia: la migrazione, l'indicizzazione, la lettura di `projects` e le richieste sincrone delle voci 3 e 5 che partono subito.
- Nessuna funzione va tolta.

**9. Nell'app il grigio «quieto» esce blu** · app
- **Dove:** `android/…/PannelloDrive.kt:303-310` (`coloreVista`): `else -> Color(0xFF4AA3FF)` prende anche `"quieto"`.
- **Effetto:** «ferma», «dorme», «fermo», «spento», «disponibile» compaiono in blu. Il blu vuol dire «al lavoro» o «lo guida un autopilota»: Nicholas vede una chat ferma come se lavorasse.
- **Dove compare:** `Conversazioni.kt:135`, `Lavori.kt:1310`, `Negozio.kt:449`, `Computer.kt:1194`, `Salute.kt:130`.
- **Correzione:** `"quieto" -> Banco.testoQuieto`, `"blu" -> Banco.accento`, `else` grigio.

**10. «Riavvia il computer ora» riavvia solo SierraDeck** · pagina, app
- **Dove:** `client-pagina.ts:2192`, `Drive.kt:163`. Dietro c'è `app.relaunch()` (`src/main/index.ts:5343-5359`); il PC dice giusto («il programma si riavvia», `ContenutoDrive.tsx:33`).
- **Effetto:** Nicholas pensa che il PC di casa si spenga e non preme il tasto.
- **Correzione:** «Riavvia SierraDeck sul computer».

**11. Lo stato di una chat ha due vocabolari: «aspetta te» vuol dire due cose** · PC, pagina, app
- **Dove:** PC `src/shared/chat-vista.ts:12-33` (`statoChat`); pagina `client-pagina.ts:1505-1532`; app `StatoChat.kt:33-60, 69-80, 105-113`.

| Situazione | PC | Pagina e app |
|---|---|---|
| Elenco di scelte aperto | «aspetta te» | «aspetta che tu scelga» |
| Turno finito | «ferma» | «aspetta te» |
| Ibernata | «dorme» | «spenta» |

- **Effetto:** la stessa chat dice cose opposte sul PC e sul telefono.
- **Correzione:** una sola `statoChat` in `src/shared` con fixture per Kotlin; la pagina la prende con `toString()` (come `ansiInHtml`, `client-pagina.ts:647-651`).

**12. Autopilota «finito ✓» verde nell'elenco, «da verificare» ambra nella Panoramica** · PC, pagina, app
- **Dove:** `src/shared/autopiloti-vista.ts:42-53` (`vistaAutopilota`), `src/shared/panoramica.ts:229-237` (`statoCoerente`), `src/shared/autopilota-vista.ts:26-43` (`ledDi`: «pronto» ambra, mentre la pillola è blu), `:188-249` (`descriviAutopilota`).
- **Correzione:** il «finito» passa da `statoCoerente`; `ledDi` prende il colore da `vistaAutopilota`; un test che le confronta.

**13. La pagina del telefono pesa 417 KB e si ricostruisce a ogni apertura** · pagina
- **Misurato:** 417 KB a ogni caricamento, senza compressione e senza cache; pronta in 0,7-1,5 s in locale. Via Tailscale o rete mobile il peso conta molto di più.
- **Dove:** `src/main/client-pagina.ts:75` (`paginaClient()` ricostruisce l'intero testo a ogni GET); in `client-server.ts` non c'è né `content-encoding` né `cache-control`/`ETag`.
- **Correzione:** costruire la pagina una volta per versione; gzip o brotli (circa 70-80 KB attesi); `ETag` con risposta 304.

**14. L'APK pesa 16 MB perché non è ridotto** · app
- **Dove:** `android/app/build.gradle.kts:64` `isMinifyEnabled = false`. `material-icons-extended` porta migliaia di icone: 52 MB di dex non compressi in tre file.
- **Effetto:** download e aggiornamenti lenti sul telefono; avvio dell'app più lento.
- **Correzione:** R8 con `isMinifyEnabled = true` e `isShrinkResources = true`, più le regole per `kotlinx-serialization` e `okhttp`. Atteso 3-5 MB. Va provato con i test e un'installazione di prova fatta da Nicholas.

**15. La pagina mostra «0,0 MB» per i file piccoli: è tornato un difetto già corretto** · pagina
- **Dove:** `client-pagina.ts:2509` (`inMb`), usato alle righe 3624 e 3559. La regola giusta è in `src/shared/file-telefono.ts:263-267` (`misura`), e l'app la usa già.
- **Correzione:** incorporare `misura` nella pagina; un test che controlli una misura.

### Media

**16. Chat adottate: la stessa istruzione può essere scritta due volte** · PC
- **Dove:** `src/main/adozione-chat.ts:210` (`.catch(() => undefined)`); il messaggio resta in `perAdottate` (`src/shared/adozione.ts:170-175`).
- **Correzione:** l'errore va nel registro e gli id scritti si ricordano finché il servizio non conferma.

**17. L'esito delle consegne degli autopiloti si può perdere** · PC
- **Dove:** `src/main/index.ts:1314, 4217, 6014` (`postaAlServizio('/consegne/esito')` con `.catch(() => undefined)`); il servizio toglie dalla coda solo con «partita» (`server.ts:3655-3658`).
- **Effetto:** Istruzioni ferma su «in attesa», con il rischio di consegnare due volte.
- **Correzione:** tre tentativi con attesa crescente e una riga nel registro.

**18. Coda e posta dal telefono: ogni guasto diventa «serve la cassaforte sbloccata»** · pagina, app
- **Dove:** `src/main/client-rotte.ts:2088, 2096, 2103, 2136, 2144, 2151`.
- **Correzione:** restituire e registrare il motivo vero.

**19. Il sottofondo ridisegna lo schermo di ogni chat ogni 500 ms** · PC
- **Dove:** `src/main/index.ts:1348-1351`, `src/main/sottofondo.ts:228-231, 388-406`.
- **Correzione:** `chat()` solo quando arrivano dati (c'è già `cambiato`); 2 s per le chat ferme.

**20. «File» dell'autopilota: cinque comandi git per cartella ogni 2-4 s** · PC, pagina, app
- **Dove:** `src/main/file-autopilota.ts:40-62, 68, 92`. Interrogato da `client-pagina.ts:2723-2725` (2 s), `FileAutopilota.tsx:8,36` (4 s), `Lavori.kt:1458-1462` (4 s).
- **Effetto:** circa 20 processi git ogni 2 s con 4 cartelle; ventole accese.
- **Correzione:** cache legata a HEAD e alla data di `.git/index`, una sola esecuzione per autopilota alla volta.

**21. Dettaglio autopilota sul telefono: due rotte pesanti ogni 2 s** · pagina, app
- **Dove:** `client-pagina.ts:2707-2714`, `Lavori.kt:264-268`. `/api/autopilota` (`client-rotte.ts:1377-1412`) scarica tutto l'elenco per trovarne uno.
- **Correzione:** rotta `/autopiloti/:id` sul servizio; la Panoramica ogni 5-10 s.

**22. La Salute legge interi i registri di oggi e di ieri** · PC, pagina, app
- **Dove:** `src/main/index.ts:2384-2388` (fino a 200 MB al giorno, `registro.ts:58-59`), `2391-2400`, `2368` (Drive, voce 4).
- **Correzione:** errori delle ultime 24 h tenuti in memoria (oppure lettura della sola coda del file), archiviati esclusi, cache di 60 s.

**23. Memoria che cresce: segnali, polsi e tempi degli autopiloti** · PC
- **Segnali** (`src/main/index.ts:388, 390, 423`; `src/renderer/segnali-vivi.ts:9`): mai potati, fino a 40 segnali da 2000 caratteri per sessione. Tenere al massimo circa 300 sessioni, o potare dopo `SessionEnd`.
- **Polsi** (`src/main/index.ts:443-454`): `polso-chat.json` cresce per sempre e si riscrive intero ogni 2 s. Le sessioni più vecchie di 8 giorni vanno sommate in un totale.
- **Tempi** (`src/autopilot-host/tempi.ts:93-95`): il tetto vale solo alla prima lettura, poi `tempi.jsonl` cresce. Tagliare in `aggiungi`.
- **Servizio** (`src/autopilot-host/server.ts:576, 583, 2003, 2006, 2008`; `istruzioni.ts:34`): pulire all'archiviazione di un autopilota.
- **Server del telefono** (`client-rotte.ts:782-793`; `client-server.ts:151`): potare come `statoDal` (riga 1315).
- **Misurato:** main e finestra +25-30 MB in 3 minuti di aperture.

**24. Traslochi seguiti per sempre, con gli errori ingoiati** · PC
- **Dove:** `src/main/index.ts:568, 3169-3184` (`.catch` alla riga 3182). I traslochi finiti si interrogano ogni 10 minuti per sempre; quelli fermi su un PC spento risultano «in corso» per sempre.
- **Correzione:** togliere i finiti dopo 24 h, salvare e mostrare `ultimoErrore`.

**25. Il ponte WebRTC, se parte lento, resta rotto fino al riavvio** · PC
- **Dove:** `src/main/rtc/ponte-rtc.ts:74, 115-118`: dopo 15 s la finestra nascosta resta accesa e non si ricrea più.
- **Correzione:** `w.destroy()` e azzerare `pronta`/`finestra` allo scadere.

**26. App: JSON analizzato due volte sul thread dell'interfaccia e preferenze scritte ogni 2 s** · app
- **Dove:** `App.kt:427-445`, `Api.kt:128-131`, `Ronda.kt:104-136`, `Notifiche.kt:103-107`.
- **Correzione:** decodifica in `Dispatchers.Default`, un solo parsing, scrittura solo se cambia, `creaCanali` una volta.

**27. App: le schermate interrogano il PC anche in secondo piano** · app
- **Dove:** `Chat.kt:497-557`, `Domande.kt:75-86`, `Lavori.kt:109-112, 264-274`, `Computer.kt:149-154` (`/api/aggiornamento` ogni 2 s, sempre), `DomandeALato.kt:56-58`, `Drive.kt:91-99`.
- **Effetto:** batteria e rete del telefono, più carico sul PC.
- **Correzione:** `repeatOnLifecycle(STARTED)` o `PolsoApp.tocca` in ogni ciclo.

**28. Finestra del PC ridotta a icona: il lavoro periodico continua** · PC
- **Dove:** `App.tsx:342-358` (400 ms), `395-460` (2 s, lo schermo letto 3 volte per riquadro), `1337-1358` (5 s).
- **Correzione:** con `document.hidden` allungare i periodi (come già alla riga 1111); una sola lettura dello schermo per riquadro.

**29. Pagina e app: il «?» è troppo piccolo per il dito e sulla pagina non dice di cosa parla** · pagina, app
- **Dove:**
  - pagina: `.aiuto` 24×24 px (`client-pagina.ts:212-217`), sempre `aria-label="Spiegazione"` (riga 692);
  - app: zona di 32 dp (`Aiuto.kt:60`).
- **Correzione:** zona toccabile di 44 px / 48 dp con il cerchio visibile che resta piccolo; «Spiegazione: <soggetto>».

**30. Pagina: spiegazioni solo nel `title`, che sul telefono non si apre** · pagina
- **Dove:** `client-pagina.ts:2912` (il «?» del dialogo con l'autopilota è uno `span title=…`), 2911 (Allega), 1867 (Archivia), 4659 (catena dell'account).
- **Correzione:** `aiuto('…', …)`, già presente nella pagina.

**31. Stati blu che sul telefono non sono blu; «al lavoro» verde nelle chat ma blu nei Progetti** · pagina, app
- **Dove:**
  - `.pan-tel-stato--blu { color: var(--blu) }` (`client-pagina.ts:149`), ma `--blu` non esiste nella tavolozza (`src/shared/preferenze.ts:306-340`);
  - `coloreParola` senza `"blu"` (`Panoramica.kt:280`);
  - `progetti-vista.ts:105` colora blu «al lavoro», mentre `chat-vista.ts:27` lo colora verde.
- **Correzione:** `--blu` nella tavolozza; «al lavoro» sempre verde, blu solo per «spostamento in corso».

**32. Le spie del menu principale hanno regole diverse sulle tre facce** · PC, pagina, app
- **Dove:** PC `Console.tsx:286-288`, pagina `client-pagina.ts:1675-1690`, app `App.kt:683-693`. Lo stesso caso è ambra sulla pagina e rosso nell'app; sul PC il numero degli autopiloti li conta tutti.
- **Correzione:** una regola condivisa in `src/shared/menu-principale.ts` per colore, priorità e numero.

**33. Colori di stato scritti a mano invece dei token: il verde «ok» ha cinque valori** · PC, pagina
- **Dove:**
  - `console.css:2024-2285` (`#57d38c`);
  - `client-pagina.ts:4656` (`#3fb950`, `#f85149`, `#8b949e`);
  - `#3c9` e `#5cb85c`;
  - rossi `#e5534b` e `#c0392b`;
  - pagina Salute (righe 2142 e 2160).
- **Viola:** tre valori diversi, e lo stesso viola vuol dire «altro PC» e «ruolo Interfaccia».
- **Correzione:** `var(--verde)`, `var(--ambra)`, `var(--rosso)`, `var(--testo-quieto)`; i token `--viola` e `--remoto`, ben distinti.

**34. Testi lunghi a vista senza «?»** · PC, pagina, app
- **App:** `Lavori.kt:659` (circa 210 caratteri), `Drive.kt:157` (190), `Computer.kt:216` (160, con un numero di versione dentro), `Lavori.kt:1166`, `QuadernoPersonale.kt:119`, `Negozio.kt:462-465` (la spiegazione dello stato sempre visibile, mentre il PC la mette dietro il «?»).
- **PC:** `ContenutoDrive.tsx:162`, `FinestraPannello.tsx:76`.
- **Correzione:** una riga corta più «?». L'avviso di sicurezza del Negozio resta a vista.

**35. Ricerca nel Quaderno diversa fra PC e telefono** · PC, pagina, app
- **Dove:** il PC cerca nel corpo intero (`src/shared/quaderno.ts:139-146`); pagina (`client-pagina.ts:4576-4622`) e app (`QuadernoVista.kt:15-25`) cercano solo nell'assaggio di 90 caratteri (`index.ts:5694-5696`).
- **Correzione:** ricerca fatta dal PC (`q` in `/api/quaderno`) più una fixture.

**36. Fasi della lettura del Drive riscritte tre volte** · PC, pagina, app
- **Dove:** `src/shared/catalogo-progresso.ts:28-65`, `client-pagina.ts:975, 2196-2221`, `Drive.kt:302-341`. Sul telefono la pagina scrive «questo PC»; la percentuale differisce di un punto.
- **Correzione:** frasi «qui»/«sul computer» nello shared, incorporate nella pagina, più una fixture per l'app.

**37. Account → Drive → Cassaforte → Salvataggio: il motivo non si legge sul telefono** · pagina, app
- **Dove:** pagina `client-pagina.ts:4659` (solo `title`), app `Computer.kt:1190-1196` (quattro tessere in una riga, `maxLines = 1`).
- **Correzione:** griglia 2×2 e motivo dietro «?».

**38. Salute nell'app: le azioni che non può fare spariscono senza dirlo** · app
- **Dove:** `Salute.kt:82-85` scarta anche «Installa»; la pagina lo mostra (2145) e per le altre scrive «…: dal computer» (2148).
- **Correzione:** «installa» con `api.installaAggiornamento`, «…: dal computer» per le altre.

**39. Domande nell'app: un filtro che si alterna invece di due linguette** · app
- **Dove:** `Conversazioni.kt:121-123`; PC `PannelloDomande.tsx:281-282` e pagina 1159-1160 hanno «Aspettano te N» e «Tutte N».
- **Correzione:** due `FilterChip` sempre visibili, alti 48 dp.

**40. Pagina: diversi tasti sotto i 44 px** · pagina
- **Dove:** pastiglie dei filtri (righe 1159-1160, 2157, 4606-4607, 4991), `.linguetta` (613), chiusura dell'avviso del Drive (202).
- **Correzione:** `min-height: 44px`.

**41. Panoramica: nell'app manca il «?», e «Solo mia» si cambia solo dal PC** · app, pagina
- **Dove:** `Panoramica.kt:321-397`; PC `WorkspacePanoramica.tsx:189, 373`; pagina 2776 e 2841 (scrive «solo tua»).
- **Correzione:** stesso «?» e una sola dicitura («solo mia»). L'interruttore sul telefono aggiunge un comando: **serve il sì di Nicholas**.

**42. «Archivia» di un autopilota: significati e testi diversi; sul telefono non si toglie** · PC, pagina, app
- **Dove:** `PannelloAutopiloti.tsx:469-472`, `client-pagina.ts:1867`, `Lavori.kt:748`.
- **Correzione:** testo condiviso, tasto corto con «?», «Togli dall'archivio» anche sul telefono. **Serve il sì di Nicholas** (aggiunge un comando sul telefono).

**43. «Salva ora» indicato in Progetti, ma sul telefono non c'è** · pagina, app
- **Dove:** `client-pagina.ts:2312`, `src/shared/impostazioni-struttura.ts:29`.
- **Correzione:** «sul computer: Progetti → Salvataggio». In alternativa aggiungere «Salva ora» al telefono: **serve il sì di Nicholas**.

**44. Grandezze e numeri scritti in modi diversi** · PC, pagina, app
- **Grandezze:** punto o virgola, «kB» o «KB» (`PannelloTrasferimenti.tsx:46-51`, `attesa-chat.ts:47-48`, `progresso-sync.ts:41`, `ModaleRiordina.tsx:18-20` contro `src/shared/spazio-drive.ts:438-444`).
- **Token** in tre formati (`src/shared/consumi.ts:151-159`, `Computer.kt:58-62`, `client-pagina.ts:4332-4337`).
- **«1 minuti fa»** nella Salute (`src/shared/salute.ts:86-96`).
- **Singolare e plurale** di interventi e criteri (`autopilota-vista.ts:199, 228, 240`, `client-pagina.ts:1799, 2972`, `Lavori.kt:808, 1340`).
- **Correzione:** una funzione condivisa per ciascuno, incorporata nella pagina e con fixture per l'app.

**45. Tre filtri diversi per le righe di servizio di Claude Code** · PC, app
- **Dove:** `src/shared/panoramica.ts:135-156` (copiato in `Panoramica.kt:220-238`), `src/renderer/ultime-righe.ts:52-54`, `src/shared/chat-vista.ts:59-70` (non usato).
- **Effetto:** nella Panoramica l'«ultima azione» può essere «Enter to confirm · Esc to cancel».
- **Correzione:** una sola lista condivisa.

**46. App: risposta da notifica senza `goAsync()`** · app
- **Dove:** `RispostaVeloce.kt:49`. La notifica può restare su «Mando…» senza che la risposta parta.
- **Correzione:** `goAsync()`, con `finish()` nel `finally`.

**47. App: «Manda adesso» di un autopilota fallisce in silenzio** · app
- **Dove:** `Lavori.kt:330` (`catch (_: Exception) { }`), 456, 545.
- **Correzione:** `tenta(...)` / `Nota.mostra`.

**48. App: i file ricevuti oltre i 200 restano sul telefono ma spariscono dall'elenco** · app
- **Dove:** `Consegne.kt:89`.
- **Correzione:** cancellare i file delle voci scartate.

### Bassa

**49. Altri giri del PC da diradare** · PC
- Battito del postino: `listSessions` intero ogni 30 s (`index.ts:1868-1886`).
- Consumi e `cartelle()`: `SELECT *` a ogni richiesta (`ipc.ts:610-615`, `index.ts:5224-5235`).
- `autopilota:elenca` con un controllo di salute ogni volta (`ipc.ts:1454-1457`).
- Preferenze rilette dal disco a ogni accesso (`impostazioni-store.ts:80-85`).
- `appendFileSync` per ogni riga di registro (`registro.ts:108-120`).
- «Sta facendo» rilegge 512 KB ogni 2 s (`LinguettaAutopilota.tsx:60-74`).
- Ronda e postino del Drive (`progetti/presenza.ts:176-207`, `progetti/posta.ts:233, 282, 326-337`).

**50. «Sfoglia» dal telefono controlla A:…Z: in modo sincrono** · pagina, app
- **Dove:** `src/main/index.ts:5262-5304`. Con un disco di rete scollegato il main si blocca per secondi.

**51. `ultimoDettoDa` legge tutta la trascrizione in modo sincrono** · servizio autopiloti
- **Dove:** `src/autopilot-host/index.ts:64-72`.
- **Correzione:** leggere solo la coda, come `src/main/anteprima.ts:96-106`.

**52. Rendering del PC** · PC
- `App.tsx:1289` (`useSessionStore()` senza selettore) ridisegna tutta l'App 7 volte al secondo durante l'indicizzazione.
- `Terminal.tsx:179-185` (`ricordaRighe`) gira anche dopo che il prompt è stato visto.

**53. App: guardia e sveglia** · app
- `GuardiaService.kt:67-99` aggiorna la notifica ogni 5 s anche se non cambia niente.
- `Sentinella.kt:46` ha un `catch` vuoto.
- `Sentinella.kt:61, 79-87` sveglia il telefono ogni 2 minuti.

**54. Errori ingoiati di poco peso** · PC, pagina
- `PannelloAccount.tsx:201-206` (interruttore del salvataggio automatico).
- `client-pagina.ts:3898` («Annulla» del Drive).
- `client-pagina.ts:5487, 5501-5571`: notifiche della pagina mai potate; su Chrome per Android `new Notification` va in errore e nessuno lo sa.
- `cassaforte/sincronia.ts:1408`: un errore di rete diventa «niente sul Drive».

**55. Codice doppio senza controllo, oggi uguale** · PC, pagina, app
- `client-pagina.ts:1473-1497` e `Raggruppo.kt:29-50`.
- `client-pagina.ts:2785-2795` e `src/shared/panoramica.ts:399-409`.
- `ChiuseDaTe.kt:22-29`, `client-pagina.ts:2604` e `src/shared/chiuse.ts:75-79`.
- Rotte coda e posta gemelle (`client-rotte.ts:2076-2155`).
- Otto `quando` uguali nel renderer.
- `chiuse-store.ts:28-35` scrive su un `.tmp` dal nome fisso invece di usare `scriviJsonAtomico`.
- Limite del nome della chat: 80 dal telefono, 200 dal PC (`client-rotte.ts:2575` contro `src/shared/titolo.ts:30`).

**56. Testi da sistemare** · pagina, app, PC
- «Chiudi» con due significati nella stessa finestra (`Chat.kt:1068, 1075`; pagina 4264): la chiusura della finestra diventa «Fatto».
- Il cursore «Chiarore» promette un chiaro che non c'è (pagina 2328): «0 più scuro, 100 meno scuro».
- I titoli delle Impostazioni dell'app usano il colore d'accento (`Computer.kt:1360`).
- Quaderno senza «?» su pagina e app (pagina 4591; `QuadernoVista.kt`).
- Ordine delle sezioni delle Impostazioni della pagina diverso dalla struttura condivisa (righe 2289-2337): **serve il sì di Nicholas**, perché sposta una sezione.
- Notifiche diverse fra pagina e app (`Avvisi.kt:169-170, 205`; `client-pagina.ts:5505-5530`).

**57. Accessibilità** · PC, app
- PC: «×» e «⟳» senza `aria-label` in `ColonnaConsumi.tsx:141`, `PannelloDomande.tsx:286`, `PannelloTrasferimenti.tsx:844`.
- App: «×» dell'avviso Drive senza descrizione e in rosso (`DriveScollegato.kt:107-108`); la barra in basso legge il nome due volte (`App.kt:730-733`).

---

## 4. Test del programma (`npm test`)

**Esito.** `npx vitest run --maxWorkers=2` su main a 6c38f66, 19/10 dalle 12:56 alle 13:12, senza file modificati nella cartella. Le altre chat erano al lavoro sulla stessa macchina.

- **File:** 405 passati, 1 caduto, 1 saltato.
- **Test:** 4193 passati, 1 caduto, 2 saltati.
- **Durata:** 926 s, di cui 487 s solo per gli `import`. È il segno della macchina carica: a macchina libera la suite dura una frazione di questo tempo.

**Il test caduto**
- **Dove:** `tests/main/collegamento-rtc.test.ts:208`, «il canale si chiude: si torna a «spento» (non fallito), e la prossima chiamata lo riapre».
- **Errore:** `expected 'fallito' to be 'spento'`.
- **Da solo passa:** `npx vitest run tests/main/collegamento-rtc.test.ts` tre volte, 9/9 ogni volta, in 6-7 s. Non è un difetto del programma, quindi **non va in Alta**.
- **Perché cade sotto carico:** `finche` (riga 94) aspetta al massimo 2 s e non dice se la condizione è arrivata.
  - La prima attesa (riga 204, canale `aperto`) può scadere prima che il canale si apra.
  - A quel punto `chiudiTutto()` interrompe un tentativo ancora in corso.
  - `collegamento-rtc.ts:291` lo conta giustamente come `fallito`.
- **Correzione del test, non del programma:**
  - controllare che `aperto` sia stato davvero raggiunto, con `expect` dopo la riga 204;
  - un tetto più largo per `finche` in questo test, per esempio 10 s.

  Da fare sul ramo delle correzioni.

**`rimozione-sicura.test.ts` (rosso delle 10:12)**
- In questa suite è passato.
- Il caso «le rotte del residente: solo fra PC della stessa cassaforte» cadeva per i 20 s del solo import di `client-rotte` a macchina carica.
- Il tetto è stato alzato a 60 s da un'altra chat (531799e).

Nessun test di `tests/autopilot-host/server.test.ts` né dei file corretti da bea1fa9 è caduto in questa suite.

**Sulla verifica stessa: il comando misura più del criterio.**
- «I test passano» vuol dire «il codice è giusto».
- Sulla macchina condivisa, però, la suite intera misura anche il carico delle altre chat: copie di prova, altre suite di vitest in parallelo, fino a 17 processi di vitest e CPU al 100%.
- Tutti i rossi visti oggi su main (`verifiche-shell`, `pty-host-client`, `rimozione-sicura`, `collegamento-rtc`) passavano lanciati da soli. Erano tetti di tempo troppo stretti, non difetti.

**Comando proposto per il criterio:** `npx vitest run --maxWorkers=2 --retry=1`.
- Un test che cade una volta sola per il carico viene ripetuto.
- Un difetto vero cade due volte e resta rosso.
- I test ripetuti vanno comunque annotati, perché sono tetti da allargare.

In alternativa, il comando di oggi lanciato solo a macchina quieta: nessun altro processo di vitest e nessuna copia di prova accesa.

## 5. Da dove ripartire

- **Prime correzioni consigliate** (piccole e utili):
  - voci 1 e 2 (il registro vede i guasti; i workspace non si perdono);
  - criteri (b1), (b2) e (c);
  - le parti di (a) che restano;
  - voci 9 e 10 (stato sbagliato a vista);
  - voci 3, 4 e 5 (il PC che lavora a vuoto ogni 2-10 s).
- **Foto «prima» della grafica:** fatte da c-12 il 19/10. Sono in `foto-0-80-0/prima/` (fuori da git, mostrano percorsi della macchina). Le differenze fra PC, pagina e app, schermata per schermata, sono in `grafica-prima-0-80-0.md`, che va unita a questo elenco.
- **Dopo le correzioni** rifare le stesse misure con `misura-080.mjs` e mettere i numeri «dopo» accanto a questi.

## Appendice: lo script delle misure (`misura-080.mjs`)

Copiarlo fuori dal progetto, poi `node misura-080.mjs <cartella del progetto> <cartella di prova> <giro>`, una volta per giro. Le porte stanno in `PORTA`/`DEBUG` in cima e devono coincidere con `impostazioni.json` della copia. Gli esiti si accodano in `<cartella di prova>/esiti.jsonl`. Alla fine, controllare che le porte della copia siano libere.

```js
// Misure della 0.80.0 su una copia di prova (SIERRADECK_PROVA). Uso:
//   node misura-080.mjs <cartella-progetto> <cartella-prova> <giro>
// La copia usa le porte 47670/47671 (impostazioni.json della copia) e il debug 9363.
import { spawn, execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

const [progetto, prova, giro] = process.argv.slice(2)
const PORTA = 47680, DEBUG = 9373, DEBUG_EDGE = 9374
const esito = { giro: Number(giro) }
const dorme = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(`[giro ${giro}]`, ...a)

// La chiave del «telefono» di prova: sul disco della copia solo il segno.
const chiave = randomBytes(24).toString('hex')
mkdirSync(join(prova, 'dati', 'SierraDeck'), { recursive: true })
writeFileSync(join(prova, 'dati', 'SierraDeck', 'dispositivi.json'), JSON.stringify({
  dispositivi: [{ id: 'telefono-prova', nome: 'telefono di prova', segno: createHash('sha256').update(chiave).digest('hex'), collegatoIl: new Date().toISOString() }]
}))

async function cdp(porta, filtro) {
  for (;;) {
    try {
      const t = await (await fetch(`http://127.0.0.1:${porta}/json`)).json()
      const p = t.find(filtro)
      if (p) {
        const ws = new WebSocket(p.webSocketDebuggerUrl)
        await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko })
        let id = 0; const attese = new Map()
        ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && attese.has(d.id)) { attese.get(d.id)(d); attese.delete(d.id) } }
        const manda = (method, params = {}) => new Promise((ok) => { const i = ++id; attese.set(i, ok); ws.send(JSON.stringify({ id: i, method, params })) })
        const valuta = async (expr) => (await manda('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value
        return { ws, manda, valuta }
      }
    } catch { /* non ancora */ }
    await dorme(100)
  }
}

// Aspetta che il DOM resti fermo `quieto` ms dopo che `pronto` diventa vero; torna il tempo al primo segno e all'ultimo cambiamento.
const ASPETTA = (pronto, quieto = 400, tetto = 30000) => `new Promise((ok) => {
  const t0 = performance.now(); let visto, ultimo = t0
  const mo = new MutationObserver(() => { ultimo = performance.now() })
  mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true })
  const giro = () => {
    const ora = performance.now()
    if (visto === undefined && (${pronto})) { visto = ora; ultimo = ora }
    if (visto !== undefined && ora - ultimo >= ${quieto}) { mo.disconnect(); ok({ appare: Math.round(visto - t0), pronto: Math.round(ultimo - t0) }); return }
    if (ora - t0 > ${tetto}) { mo.disconnect(); ok({ appare: visto === undefined ? null : Math.round(visto - t0), pronto: null }); return }
    setTimeout(giro, 16)
  }
  giro()
})`

function memoria(radice) {
  const ps = `Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize,PrivatePageCount,CommandLine | ConvertTo-Json -Compress`
  // Qualche riga di comando di Windows ha caratteri di controllo che il JSON di PowerShell non toglie.
  const tutti = JSON.parse(execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', maxBuffer: 64 << 20 }).replace(/[\u0000-\u001f]/g, ' '))
  const figli = new Map()
  for (const p of tutti) { if (!figli.has(p.ParentProcessId)) figli.set(p.ParentProcessId, []); figli.get(p.ParentProcessId).push(p) }
  const albero = []; const coda = [tutti.find((p) => p.ProcessId === radice)].filter(Boolean)
  while (coda.length) { const p = coda.shift(); albero.push(p); coda.push(...(figli.get(p.ProcessId) ?? [])) }
  // Il servizio degli autopiloti si stacca dal programma: lo si trova per la sua porta.
  const servizio = tutti.filter((p) => /autopilot-host\.js/.test(p.CommandLine ?? '') && (p.CommandLine ?? '').includes(progetto.replaceAll('/', '\\')))
  for (const s of servizio) if (!albero.includes(s)) albero.push(s)
  const tipo = (p) => {
    const c = p.CommandLine ?? ''
    if (p.ProcessId === radice) return 'main'
    if (/autopilot-host\.js/.test(c)) return 'servizio'
    if (/pty-host\.js/.test(c)) return 'pty host'
    if (/sync-worker/.test(c)) return 'sync worker'
    if (/--type=renderer/.test(c)) return 'finestra (renderer)'
    if (/--type=gpu-process/.test(c)) return 'gpu'
    if (/--type=utility/.test(c)) return 'utility'
    if (/conhost|OpenConsole/i.test(c)) return 'console'
    return 'altro'
  }
  const somma = {}
  for (const p of albero) { const k = tipo(p); somma[k] ??= { ws: 0, priv: 0, n: 0 }; somma[k].ws += p.WorkingSetSize; somma[k].priv += Number(p.PrivatePageCount); somma[k].n++ }
  const mb = (b) => Math.round(b / 1048576)
  return { pid: albero.map((p) => p.ProcessId), perTipo: Object.fromEntries(Object.entries(somma).map(([k, v]) => [k, { n: v.n, wsMB: mb(v.ws), privMB: mb(v.priv) }])) }
}

async function api(percorso, metodo = 'GET', corpo) {
  const t0 = performance.now()
  const r = await fetch(`http://127.0.0.1:${PORTA}${percorso}`, { method: metodo, headers: { 'x-sierradeck-chiave': chiave, 'content-type': 'application/json' }, ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}) })
  const testo = await r.text()
  return { ms: Math.round(performance.now() - t0), stato: r.status, byte: Buffer.byteLength(testo) }
}

const electron = join(progetto, 'node_modules', 'electron', 'dist', 'electron.exe')
const t0 = Date.now()
const figlio = spawn(electron, ['.', `--remote-debugging-port=${DEBUG}`], {
  cwd: progetto, stdio: 'ignore', detached: false,
  env: { ...process.env, SIERRADECK_PROVA: join(prova, 'dati'), CLAUDE_CONFIG_DIR: join(prova, 'claude') }
})
try {
  // 1) Avvio: finestra pronta (React ha disegnato) e porta della pagina in ascolto.
  const portaPronta = (async () => { for (;;) { try { const r = await fetch(`http://127.0.0.1:${PORTA}/api/ciao`); if (r.ok) return Date.now() - t0 } catch {} await dorme(50) } })()
  const fin = await cdp(DEBUG, (t) => t.type === 'page' && !t.url.startsWith('devtools'))
  const tCdp = Date.now() - t0
  // Il primo disegno di React e cosa mostra, poi l'interfaccia vera.
  const primo = await fin.valuta(`new Promise((ok) => { const g = () => { const r = document.getElementById('root'); if (r && r.children.length > 0) ok(r.innerText.slice(0, 80)); else setTimeout(g, 20) }; g() })`)
  esito.primoDisegnoMs = Date.now() - t0; esito.primoDisegnoTesto = primo
  const disegno = await fin.valuta(`new Promise((ok) => { const g = () => { const r = document.getElementById('root'); if (r && r.querySelector('.console, .riquadro, .pan-corpo, .progetti')) ok(true); else setTimeout(g, 20) }; g() })`)
  esito.avvio = { finestraAgganciabileMs: tCdp, interfacciaDisegnataMs: Date.now() - t0, pagina47670Ms: await portaPronta, ok: disegno }
  log('avvio', esito.avvio)
  // Stabilizzazione: l'indicizzazione delle chat parte all'avvio.
  await dorme(20000)
  esito.memoria20s = memoria(figlio.pid)
  log('memoria a 20 s', esito.memoria20s.perTipo)

  // 2) Schermate: due aperture (fredda e calda), chiusura con Esc nel mezzo.
  const schermate = [
    ['Progetti', `dispatchEvent(new CustomEvent('sierradeck:apri-pannello', { detail: 'progetti' }))`, `document.querySelector('[role=dialog][aria-label="Progetti"]')`],
    ['Impostazioni', `dispatchEvent(new CustomEvent('sierradeck:apri-pannello', { detail: 'impostazioni' }))`, `document.querySelector('[role=dialog][aria-label="Impostazioni"]')`],
    ['Negozio', `dispatchEvent(new CustomEvent('sierradeck:apri-pannello', { detail: 'negozio' }))`, `document.querySelector('[role=dialog][aria-label="Negozio"]')`],
    ['Autopiloti', `dispatchEvent(new CustomEvent('sierradeck:apri-pannello', { detail: 'autopiloti' }))`, `document.querySelector('[role=dialog][aria-label="Autopiloti"]')`],
    ['Salute', `dispatchEvent(new CustomEvent('sierradeck:apri-pannello', { detail: 'salute' }))`, `document.querySelector('[role=dialog][aria-label="Salute"]')`],
    ['Elenco chat (Riprendi)', `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Riprendi'))?.click()`, `document.querySelector('.dialogo--largo')`],
    ['Drive (Impostazioni › Account e Drive)', `dispatchEvent(new CustomEvent('sierradeck:apri-pannello', { detail: 'impostazioni' })); { const t = setInterval(() => { const b = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Account e Drive'); if (b) { clearInterval(t); b.click() } }, 5) }`, `[...document.querySelectorAll('.impostazioni-vista__voce--accesa')].some((b) => b.textContent.includes('Drive'))`],
    ['Panoramica', `[...document.querySelectorAll('.vista-interruttore__voce')].find((b) => /^\\s*Panoramica/.test(b.textContent))?.click()`, `document.querySelector('.pan-corpo')`,
      `[...document.querySelectorAll('.vista-interruttore__voce')].find((b) => /affiancate/.test(b.textContent))?.click()`]
  ]
  esito.schermate = {}
  for (const [nome, apri, pronto, prima] of schermate) {
    const misure = []
    for (let i = 0; i < 2; i++) {
      await fin.valuta(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
      await dorme(600)
      if (prima !== undefined) { await fin.valuta(prima); await dorme(800) }
      const m = await fin.valuta(`(() => { const p = ${ASPETTA(pronto)}; ${apri}; return p })()`)
      misure.push(m)
      await dorme(500)
    }
    esito.schermate[nome] = misure
    log('schermata', nome, JSON.stringify(misure))
  }
  await fin.valuta(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)

  // 3) Il ponte in locale: ogni rotta tre volte (la prima è quella fredda).
  const rotte = [
    ['/api/ciao'], ['/api/stato'], ['/api/domande'], ['/api/panoramica', 'POST', { workspace: 'Predefinito' }], ['/api/salute'],
    ['/api/negozio'], ['/api/autopiloti/altri'], ['/api/cartelle'], ['/api/drive/pannello', 'POST', {}],
    ['/api/chat/gestione/spazio', 'POST', {}], ['/api/file/progetti', 'POST', {}], ['/api/ponte', 'POST', { pc: 'nessuno', percorso: '/api/stato' }]
  ]
  esito.api = {}
  for (const [p, m, c] of rotte) {
    const v = []
    for (let i = 0; i < 3; i++) v.push(await api(p, m, c))
    esito.api[p] = v
    log('api', p, v.map((x) => `${x.ms}ms/${x.stato}/${x.byte}B`).join(' '))
  }

  // 4) La pagina servita in Edge senza finestra, a misura di telefono.
  const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  const cartellaEdge = join(prova, `edge-${giro}`)
  const e = spawn(edge, ['--headless=new', `--remote-debugging-port=${DEBUG_EDGE}`, `--user-data-dir=${cartellaEdge}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' })
  try {
    const tel = await cdp(DEBUG_EDGE, (t) => t.type === 'page')
    await tel.manda('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2.6, mobile: true })
    await tel.manda('Page.enable'); await tel.manda('Network.enable'); await tel.manda('Network.setCacheDisabled', { cacheDisabled: true })
    await tel.manda('Page.navigate', { url: `http://127.0.0.1:${PORTA}/` }); await dorme(1500)
    await tel.valuta(`localStorage.setItem('sierradeck.chiave', ${JSON.stringify(chiave)})`)
    esito.pagina = []
    for (let i = 0; i < 3; i++) {
      await tel.manda('Page.navigate', { url: 'about:blank' }); await dorme(300)
      const tn = Date.now()
      await tel.manda('Page.navigate', { url: `http://127.0.0.1:${PORTA}/` })
      // Pronto: la pagina mostra qualcosa di vero (non la schermata d'accoppiamento) e smette di cambiare.
      let m
      for (;;) { m = await tel.valuta(`document.readyState === 'complete' ? (${ASPETTA(`document.body.innerText.length > 50`)}) : null`); if (m) break; await dorme(20) }
      const nav = await tel.valuta(`(() => { const n = performance.getEntriesByType('navigation')[0]; const r = performance.getEntriesByType('resource'); return { html: n.transferSize, htmlDecodificato: n.decodedBodySize, domPronto: Math.round(n.domContentLoadedEventEnd), caricata: Math.round(n.loadEventEnd), risorse: r.length, byteRisorse: r.reduce((s, x) => s + x.transferSize, 0), api: r.filter((x) => x.name.includes('/api/')).length } })()`)
      esito.pagina.push({ ...nav, prontaMs: Date.now() - tn, quieta: m })
      log('pagina', JSON.stringify(esito.pagina.at(-1)))
    }
    tel.ws.close()
  } finally { try { execFileSync('taskkill', ['/PID', String(e.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {} }

  esito.memoriaFine = memoria(figlio.pid)
  log('memoria alla fine', esito.memoriaFine.perTipo)
  fin.ws.close()
} finally {
  const pids = (() => { try { return memoria(figlio.pid).pid } catch { return [figlio.pid] } })()
  for (const pid of pids.reverse()) { try { execFileSync('taskkill', ['/PID', String(pid), '/F'], { stdio: 'ignore' }) } catch {} }
  appendFileSync(join(prova, 'esiti.jsonl'), JSON.stringify(esito) + '\n')
}
```

## Da togliere con «Elimina workspace»: i due workspace sbagliati del 19/10
Su questo PC ci sono due workspace nati per sbaglio. Si tolgono con **«Elimina workspace»**, che li tiene nel recupero per 30 giorni. Nessuna chat li toglie con le rotte o a mano sui file: lo fa Nicholas dal programma.

- **«visitafacile»** (19/10, 11:18):
  - Perché è sbagliato: il progetto vero visitafacile vive su **DESKTOP**. Aprendolo da qui, il programma ha creato una cartella vuota nuova, `E:\Users\nikof\Documents\VisitaFacile`, invece di aprirlo da là.
  - Dentro c'è un riquadro con una chat vuota (`e6ecbaf0…`, nessun file).
  - È rimasta anche una cartella vuota, `C:\Users\nikof\Progetti SierraDeck\visitafacile`.
- **«dentro al mio server nexora c'è gia un»** (19/10, 11:20):
  - Perché è sbagliato: è il primo messaggio scritto all'autopilota, diventato il nome di un workspace con la sua cartella (`C:\Users\nikof\Progetti SierraDeck\dentro al mio server nexora c'è gia un`, vuota).
  - **Attenzione:** è la casa dell'autopilota `ap-79a4ce02…`, fermo all'intervista.
    - Il suo obiettivo è quello di Nicholas: «dentro al mio server nexora c'è gia un progetto che stiamo cominciando. riprendi in mano tutto e vediamo a che punto sia».
    - Lavora nella cartella `E:\Users\nikof\Documents\VisitaFacile`, e l'intervista è la chat `353b4549…` (674 KB).
  - **Da decidere con Nicholas** prima di eliminarlo: quell'autopilota va rifatto nel workspace NexoraOS, oppure si può togliere insieme al workspace?
- **Il visitafacile vero su DESKTOP non va toccato.**
- Le due cause sono i punti 2 e 3 del compito «Difetti di chat e workspace».

### Stato al 20/10, 10:00 (c-26): NON ancora tolti, e perché
- Sul PC è installata la **0.80.1**, che **non** ha «Elimina workspace» con il recupero di 30 giorni (`c7b4934` è solo in main, va nella 0.81.0). Con la 0.80.1 «Elimina» toglie il workspace senza recupero: non va usato.
- Far girare il codice di main sui file veri mentre il programma è acceso non vale: la finestra e il servizio tengono `workspaces.json` e gli autopiloti in memoria e li riscrivono. Le rotte `/api` del servizio vero sono vietate alle chat.
- Lo stato è cambiato dal 19/10:
  - l'autopilota `ap-79a4ce02` («Recupero VisitaFacile da nexora-nas») ha avuto il «Vai» di Nicholas il 20/10 alle 08:40, è **al lavoro** (messo da parte alle 09:49 per «nessun segnale da 60 minuti»). `motivoPerNonEliminare` rifiuta di eliminare la sua casa finché non è spostato o sospeso;
  - `E:\Users\nikof\Documents\VisitaFacile` **non è più vuota**: dentro ci sono `STATO_PROGETTO.md` e `.sierradeck/`, scritti dall'autopilota. Non va nel recupero. Vuota resta solo `C:\Users\nikof\Progetti SierraDeck\visitafacile`, che «Elimina» sposta da sola;
  - nel programma non c'è un comando per spostare un autopilota in un altro workspace.
- **Come si fa, dopo che Nicholas installa la 0.81.0:**
  1. l'autopilota `ap-79a4ce02` va nel workspace NexoraOS (serve un «Sposta in un altro workspace» per gli autopiloti, oppure Nicholas lo ferma e lo riavvia da NexoraOS con lo stesso obiettivo);
  2. «⋯» del workspace «dentro al mio server nexora c'è gia un» → Elimina; poi «visitafacile» → Elimina. La cartella vuota `Progetti SierraDeck\visitafacile` va da sola in `workspaces-recupero-cartelle\`.
- **Ramo c-26:** unito in main (`73a8644f`); contiene solo queste note, nessun codice e nessun dato vero toccato. La pulizia resta da fare con i passi sopra.
- **Come si rimettono (30 giorni):** pannello Workspace → «Eliminati» → «Ripristina» (anche dalla pagina e dall'app). Il workspace torna con le sue chat e i suoi riquadri; la cartella torna dov'era, se lì non è nata un'altra cartella.

## Test rossi su main il 19/10
- `rimozione-sicura.test.ts` («un altro PC firmato sì…») cadeva per tempo scaduto anche da solo: caricava `client-rotte` dentro il test, e trasformarlo a cache fredda costa più dei 20 s concessi. Ora lo carica in cima al file. Nessun difetto nel programma.

---

**Seconda passata:** `analisi-0-80-0-c10.md` (c-10). Aggiunge la CPU del programma vero (finestra all'84% di un core), il registro vero 13–19/10 (941 WebRTC falliti, 78 salute del servizio non risposta, git sincrono), le segnalazioni dei 5 agenti ECC e gli script `scripts/misure/`.
## Numeri dopo le correzioni di c-11 (19/10)
Misurati come prima, sulle stesse macchine e sugli stessi dati. Dettagli e test in `correzioni-velocita-e-codice-0-80-0.md`; prova con un autopilota vero in `workspace-che-cambia-da-solo-e-notifiche-0-80-0.md`.

| Voce | Prima | Dopo |
|---|---|---|
| 3 · `progetti-drive.json` / `pc.json` a lettura | 1,14 / 1,05 ms | 0,062 / 0,052 ms |
| 4 · download delle chiavi dal Drive | ~480 l'ora | ~6 l'ora |
| 5 · `/api/chat/gestione/spazio` (698 chat) | 3,5-6,4 s | 0,31 s (0,73 s la prima volta) |
| 6 · `GET /autopiloti` quando non cambia | 673 KB + 3,5 ms di parse nel main a ogni giro | 304, senza corpo |
| 13 · pagina del telefono | 417 KB a ogni apertura | 118 KB, 0 alla riapertura |
| `/api/stato` | 35 KB | 7,8 KB |
| `stat` per il salvataggio sul Drive (1.234 file) | 20-24 s | 0,4 s |
| Notifiche della pagina in 26 min con un autopilota al lavoro | 6 (8 riaprendo ogni 5 min) | 2 (1): solo le domande vere |
| Notifiche 0.81.0 in 81 min di autopilota (c-241: pagina, PC, Telegram; app con `AvvisiTest.kt`) | prima: consegne in sottofondo mai partite, 0 notifiche anche col lavoro fermo; pagina 7, PC 6 lampeggi con 3 righe | pagina 6, PC 3 lampeggi, Telegram 4: solo domande e «finito», ognuna con la sua riga; 0 per consegne, giri e cambi di stato (i due doppioni tolti sono provati dai test, non da una seconda prova lunga) |
| Cambi di workspace sullo schermo per 15 consegne di un autopilota | la finestra lo seguiva | 0 |

## Notifiche 0.81.0, la prova nella copia (20/10, c-17)
Copia di prova (`SIERRADECK_PROVA`), un autopilota al lavoro per 50 minuti (08:50–09:48): 2 compiti, poi la Revisione. Il servizio vero non è stato toccato. Dettagli in `notifiche-solo-utili-0-81-0.md`.

| Misura | 0.80.1 (main prima) | 0.81.0 (dopo c-17) |
|---|---|---|
| Stati letti dalla pagina (ogni 5 s) | 448 | gli stessi 448, rigiocati |
| Consegne fatte dall'autopilota | 77 | 77 |
| Notifiche della pagina | 2 | 2, tutte e due utili: una scelta vera e una domanda dell'autopilota |
| Righe `[avviso]` nel registro con la causa | 0 su 2 | 2 su 2 |
| Notifiche per consegne, giri o cambi di stato | 0 | 0 |
| «Versione pronta» e «in difficoltà, provo un'altra strada» | notificavano | non notificano più (resta la banda / la riga `[notifica]`) |

Il rumore l'aveva già tolto c-11 (da 6 a 2). La 0.81.0 mette la causa di ogni notifica nel registro, su PC, pagina e app, e lascia solo tre categorie: domanda che aspetta Nicholas, lavoro finito, errore che blocca.

---

## Numeri del 20/10 e correzioni di c-18 (0.81.0)

### Come
- **Stesso script** delle misure del 19/10 (`misura-080.mjs`, in appendice), sul ramo c-18 = main `6297a3f` più le correzioni qui sotto. Costruito con `npm run build` prima delle ultime due correzioni (ripristino in parallelo, store delle sessioni).
- **Copia di prova** `note/prova-080` (`scripts/misure/prepara.mjs --conversazioni`): **960 conversazioni vere, 1,6 GB** (il 19/10 erano 699). Porte 47670/47671, debug 9363/9364, mai le porte vere. Drive non collegato.
- **Tre giri:** 1 = primo avvio della copia nuova (indicizza tutto); 2 e 3 = avvii normali. Le altre chat lavoravano sulla macchina: i tempi si confrontano con quelli del 19/10 (anche allora carica), non con una macchina vuota.
- **Trappola dello script:** lanciato con `| grep` dentro un `for` e con `timeout`, il secondo giro è rimasto appeso 30 minuti senza scrivere niente. Lanciato da solo con l'uscita su file (`> giro2.txt`) va liscio. Fra un giro e l'altro controllare che non restino `electron.exe` della copia.

### Avvio, memoria, schermate (19/10 → 20/10)

| Misura | 19/10 (A · B · C) | 20/10 (1 · 2 · 3) | |
|---|---|---|---|
| Avvio: pagina in ascolto | 7709 · 4007 · 2804 ms | **2450 · 2647 · 2288 ms** | più presto |
| Avvio: primo disegno React | — · 6399 · 4558 ms | **4405 · 4522 · 3616 ms** | |
| **Avvio: interfaccia completa** | 28324 · 9241 · 7648 ms | **23824 · 7473 · 6912 ms** | −15-20%, con 260 chat in più |
| Memoria privata a 20 s, programma intero | 340 · 358 · 363 MB | 340 · 356 · 367 MB | uguale |
| … main / finestra (privata) | 130/51 · 112/52 · 113/58 | 127/52 · 114/52 · 111/57 | uguale |
| Dopo ~3 min di giro, main / finestra | — · 139/73 · 142/82 | 158/76 · 147/78 · 153/78 | main +10 MB: 260 chat in più nell'indice |
| Progetti (fredda / calda) | 646/234 · 519/254 · 332/242 | 701/188 · 625/244 · 249/229 | uguale; resta la più lenta |
| Impostazioni | 201/109 · 150/71 · 127/64 | 135/64 · 145/66 · 159/72 | uguale |
| Negozio | 70/18 · 75/286 · 72/17 | 93/17 · 97/17 · 89/16 | uguale |
| Autopiloti · Salute | ≤ 150 · ≤ 57 | ≤ 22 · ≤ 49 | |
| Elenco chat («Riprendi») | 187/217 · 195/110 · 266/147 | 217/319 · 193/253 · 315/183 | 960 chat invece di 699 |
| Drive (Account e Drive) | — · 76/76 · 83/74 | 82/68 · 74/66 · 224/71 | |
| Panoramica | 17-27 | 17 | workspace vuoto: poco indicativo |
| `/api/negozio` la prima volta | **12908 ms** | 23 · 32 · 29 ms | |
| `/api/chat/gestione/spazio` | 1785-2296 ms (699 chat) | **567-812 ms (960 chat)** | c-11 |
| `/api/drive/pannello` | 210-240 ms, 537 KB | 180-207 ms, 581 KB (compresso sul filo, c-11) | il peso cresce con le chat |
| `/api/stato`, `/api/domande`, `/api/panoramica` | 8-72 ms | 3-43 ms | |
| Pagina del telefono, peso sul filo | 417 KB | **121 KB** (423 KB decompressa) | c-11 |
| Pagina pronta (tre caricamenti) | 713-1519 ms | 633-1932 ms | dipende dal carico |

### Ponte
- **Non misurabile nella copia:** serve un secondo PC accoppiato sulla stessa cassaforte. In locale `/api/ponte` verso un PC che non c'è risponde 502 in 9-15 ms: è il costo del ponte di qui, non del viaggio.
- **Il ponte vero** (registro dei PC veri, c-10): 941 tentativi WebRTC falliti in 7 giorni verso il portatile, con ricaduta sul Drive. Resta in elenco (c-10 #32).

### Drive: chiamate e primo giro di un PC nuovo
**Come:** `scripts/misure/drive-finto.misura.ts`, lanciato con `npx vitest run --config scripts/misure/vitest.misure.config.ts` (variabili `MISURA_CHAT`, `MISURA_LATENZA_MS`).
- Usa **lo stesso adattatore del programma** (`creaArchivioDrive`) contro un Drive finto in memoria, che risponde come l'API v3 e conta le richieste per tipo.
- Le chat vere di `~/.claude/projects` si **leggono soltanto**: il setup dei test fa fallire ogni scrittura fuori dalla cartella finta.
- Niente account vero.
- Tempi senza latenza di rete: misurano il lavoro del PC (cifrare, comprimere, scrivere), non il viaggio.
- Esiti in `note/misure-drive/esiti.jsonl`.

| Giro | Prima (20/10 mattina) | Dopo | |
|---|---|---|---|
| Primo salvataggio (943-978 chat, ~580 MB) | 2831 richieste: 944 ricerche + 943 creazioni + 943 scritture; 190 s | 2939 (978 chat), 174 s | uguale: chi crea cerca sempre, per non fare doppioni |
| Salvataggio senza cambi | 9 richieste (le chat aperte in quel momento) | 24 | dipende da quante chat scrivono in quel minuto |
| **Primo giro di un PC nuovo** (tutto giù) | **1886 richieste: 943 ricerche + 943 scaricamenti**, 368 s | **982: 1 elenco + 1 ricerca + 980 scaricamenti**, 426 s | **−48% di richieste a Google** |
| **Ripristino senza niente di nuovo** | 2 richieste, **27-28 s** | 2 richieste, **0,6 s** | `stat` sedici alla volta invece di uno |

**Cosa dicono:**
- Il primo giro di un PC nuovo cercava ogni file per nome prima di scaricarlo. Con la quota «Queries per minute» di Google (il 403 durato ore il 12/10) erano 943 occasioni in più di essere fermati. Ora basta un elenco.
- I 370-430 s del primo giro, senza rete, sono lavoro del PC: decifrare, decomprimere (`gunzipSync`, sincrono nel main) e scrivere 580 MB. È la voce 13 di c-10 (compressione fuori dal main), e resta da fare.

### Correzioni fatte da c-18, ognuna con test e passata dalla Revisione

| Voce | Cosa | Test | Commit |
|---|---|---|---|
| c-10 A1 | Ripristino: se la copia di conflitto del file di qui non nasce (file aperto, disco pieno), si tiene il file di qui e la versione del Drive va **accanto**. Prima il fallimento si ingoiava e il Drive sovrascriveva le modifiche | `drive-correzioni-0-81-0.test.ts` | `0ac89910`, `69d1ee57` |
| c-10 31 | Il 403 «troppe richieste» e la quota al minuto di Google si ritentano come un 429; i 403 veri e «Drive pieno» no | idem | `0ac89910`, `69d1ee57` |
| nuova | Primo giro di un PC nuovo: un elenco invece di una ricerca per file (da 20 file in su) | idem | `0ac89910` |
| c-10 A2 | `pin-chat.json`: la lettura si riprova; un file illeggibile si mette da parte (`.illeggibile-<quando>`) prima di riscriverlo; scrittura atomica | `dati-non-persi-0-81-0.test.ts` | `79040275` |
| c-10 A3 | Elenco del recupero dei progetti illeggibile: copia accanto prima di riscriverlo, così le cartelle già nel recupero non perdono «Ripristina» | idem | `79040275` |
| c-10 A7 | `scriviAtomico`: una rinomina rifiutata per un attimo (EPERM/EBUSY/EACCES, antivirus) si riprova 4 volte, al massimo 0,6 s | idem | `79040275` |
| c-10 30 | Regex dei file del registro senza le barre: «scollegato dal…» non si ritrovava mai. Ora `FILE_DEL_REGISTRO` | idem | `79040275` |
| c-4 10 | Pagina e app: «Riavvia SierraDeck sul computer». Prima diceva «Riavvia il computer ora», ma si riavvia solo il programma | `pagina-testi-0-81-0.test.ts` | `79040275` |
| c-4 15 | Pagina: «40 byte», «12 KB» invece di «0,0 MB», con la stessa regola del PC e dell'app | idem | `79040275` |
| c-10 A5 | Fusione: se il manifesto, `workspaces.json` o `progetti-drive.json` del Drive non si leggono, si ferma e lo dice. Prima ricaricava la sola lista di qui, e i workspace degli altri PC sparivano | `cassaforte-fusione-interrotta.test.ts` | `8e3cb4ca` |
| nuova | Ripristino senza niente di nuovo: `stat` sedici alla volta (28 s → 0,6 s) | test esistenti del ripristino | `48f76a2d` |
| c-10 22 | App: le rotte lente comprendono quelle del ponte del PC (`workspace/crea`, `trasloco/*`, `file/*`). Con 15 s l'app diceva «scaduto» mentre il PC creava il workspace, e chi riprovava ne faceva due | `tests/android/rotte-lente-app.test.ts`, che le tiene allineate | `48f76a2d` |
| c-4 52, c-10 10 | Finestra: l'App non si abbona più a tutto lo store delle sessioni. Prima si ridisegnava intera a ogni avanzamento dell'indice | `app-store-sessioni.test.ts` | `46f2e657` |

**Revisione** (agente indipendente, due passate): **APPROVE** tutte e due le volte.
- La prima ha chiesto due cose: tenere accanto la versione del Drive nel caso «tengo il mio», e non ritentare «Drive pieno». Fatte in `69d1ee57`.
- La seconda ha chiesto che il test delle rotte non conti quelle scritte nei commenti. Fatto in `46f2e657`.

### Elenco aggiornato al 20/10: cosa resta, in ordine
Già fatte da c-11, c-12, c-15 e c-18 (vedi sopra e `correzioni-velocita-e-codice-0-80-0.md`):
- c-4: 1-5, 7, 9, 10, 13, 15;
- c-10: A1-A3, A5, A7, 22, 30, 31.

**Alta, da fare:**
1. **Finestra all'84% di un core con le chat al lavoro** (c-10 #10).
   - Lo schermo di ogni riquadro si legge ogni 400 ms, anche a finestra ridotta (`App.tsx:347-362`).
   - Il PIN si interroga per riquadro; `Mosaic` non è memorizzato.
   - Lo store delle sessioni è fatto. Il resto va misurato con chat che scrivono: sul PC vero dopo l'installazione, con `misura.mjs cpu`.
2. **Servizio degli autopiloti bloccato dal git sincrono** (c-10 #11, `autopilot-host/worktree.ts:24`, `spawnSync`): fino a 6,5 s senza rispondere, 78 volte «salute non risposta» in 7 giorni.
3. **Avvio a 7-9 s** (c-4 #8): 3,6-4,5 s prima del primo disegno, poi altri 3 s. Prima di toccare qualcosa serve una traccia delle fasi nel registro.
4. **Compressione e cifratura sincrone nel main** (c-10 #13): il primo giro di un PC nuovo è 370-430 s di lavoro del PC, con finestra e telefono fermi a tratti.
5. Tre guasti di c-10 su cui non si è ancora lavorato:
   - A4: «Annulla l'unione» non registrato;
   - A6: cancellazioni fallite tolte lo stesso dal manifesto;
   - A8: messaggi riscritti di continuo a una chat adottata.
6. c-4 #6: tetto alle `decisioni` degli autopiloti. **Serve il sì di Nicholas**, perché toglie storia visibile.
7. c-4 #14: APK ridotto con R8 (16 MB → 3-5 MB attesi). Va provato con un'installazione fatta da Nicholas.

**Media e bassa:** come nella sezione 3 (voci 16-57), tranne quelle segnate come fatte.

## Tempo vero della suite intera (20/10, ramo c-231)

| Quando | Carico | Comando | Durata | Esito |
|---|---|---|---|---|
| 20/10 11:45 | **carico**: 17 processi `claude`, 61 `node` (13-14 chat al lavoro) | `npx vitest run --maxWorkers=2` | **1128 s (18 min 48 s)**; import 267 s, test 857 s | 4384 verdi, 1 rosso per tempo (`worktree.test.ts`, «due chat che toccano la stessa riga», 70 s), 2 saltati |
| 19/10 12:56 (sez. 4) | carico | stesso | 926 s | 1 rosso per tempo |
| PC scarico | — | stesso | **da misurare**: oggi il PC non è mai stato senza chat al lavoro | — |

- Con le chat al lavoro la suite supera sempre i 10 minuti del tetto di prima: il criterio era rosso per tempo, non per i test.
- Correzione (c-231, 459d0bae + 3a865b07): la suite ha **20 minuti** (`TIMEOUT_SUITE_TEST_MS`), gli altri criteri il tempo di prima; tetto dell'hook Stop da 900 a **3600 s**, perché i criteri girano dentro quell'hook.
- 18 min 48 s sta sotto i 20, ma con poco margine: se il carico cresce ancora, la strada è la `--retry=1` della sezione 4 o misurare la suite solo a PC quieto.
