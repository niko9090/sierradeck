---
titolo: "App Android nativa (Compose): piano, contratto API, stadi"
quando: 2026-08-26T23:10:00+02:00
tag: ["android", "app-nativa", "compose", "mobile", "rebrand"]
---

## Decisione (26/08)
L'esperienza mobile passa da **guscio nativo + WebView** (la pagina del desktop
caricata in WebView) a **app Android NATIVA in Jetpack Compose**. Rilascio **a
parità raggiunta** (non incrementale nello store, ma incrementale nel codice).
Costo accettato: da qui in poi ogni modifica mobile richiede un nuovo APK (prima
migliorando la pagina desktop il telefono la riceveva gratis). Rebrand: **via
«glos»**, il prodotto è di **Ferrari Consulenze — Nicholas Ferrari**.

## Fatto (Stadio 1, commit 9240712, assembleDebug verde)
- Package `it.glos.sierradeck` → **`it.ferrariconsulenze.sierradeck`** (appId +
  namespace + tutti i .kt). ⚠️ Cambio di appId ⇒ chi ha la vecchia app dovrà
  DISINSTALLARE e reinstallare (l'update non la riconosce). Accettato.
- Stack aggiunto: plugin compose-compiler + kotlin-serialization (2.0.21),
  Compose BOM 2024.10.01 (material3, activity/lifecycle-compose, icons),
  kotlinx-coroutines, kotlinx-serialization-json, OkHttp. `buildFeatures.compose`.
- La vecchia `ClientActivity` (WebView, AppCompat) resta finché non è tutta
  Compose; `appcompat` resta per lei e si toglierà alla fine.

## Da riusare (guscio già buono, in android/app/.../sierradeck/)
- **Pairing**: `Indirizzi` (valida: solo rete locale, no cleartext), scansione QR
  via ML Kit (`play-services-code-scanner`, nessun permesso fotocamera).
- **Notifiche ad app chiusa**: `GuardiaService` (foreground-service, polling
  `/api/stato` ogni 5s con header `x-sierradeck-chiave`) + logica `Avvisi`
  (testabile, già con test). Modello da mantenere 1:1 (niente FCM/push: LAN-only).
- **Auto-update APK**: `Aggiornamenti` + `Scaricamento` (scarica APK, installa via
  FileProvider). `Identita` (userAgent). `Guasti` (note di crash).
- Da sostituire/rimuovere: `ClientActivity` (WebView host), `Ponte` (bridge JS),
  `Collegamento` (chiave per-indirizzo → diventa un KeyStore Compose/DataStore).

## Contratto API del desktop (stabile, riusabile 1:1)
Porta **47640**, JSON, header **`x-sierradeck-chiave`** (o `Authorization: Bearer`).
Due muri: solo rete locale + chiave dispositivo (SHA-256, timingSafeEqual). CORS
chiuso. Body max 256KB. **Niente streaming**: tutto polling.
- **Libere (pre-pairing)**: `GET /`, `/manifest.json`, `/favicon.ico`, `/api/app`
  (APK), `/api/ciao`, `POST /api/accoppia {codice,nome}`→`{id,chiave}` (codice 6
  cifre, 3 min, max 10 tentativi; QR = indirizzo con `#codice=` che non va al server).
- **Autenticate (31)**: `GET /api/stato` (chat[],autopiloti[],domande[],workspace —
  senza code terminale), `/api/stile` (tavolozza+Banco/Foglio), `POST /api/dentro
  {chat}`→ultime righe `{righe[],grezze[]}` (grezze=ANSI; la nativa usa solo grezze),
  `/api/scrivi {chat,testo}` (max 2000), `/api/rispondi {domanda,risposta}`,
  `/api/apri`,`/api/cartelle`, autopilota: `/api/autopilota`(dettaglio),`/ferma`,
  `/riprendi`,`/vai`,`/crea {obiettivo,cartella}`,`/elimina`,`/riavvio`,
  `/api/quaderno`+`/scheda`, `/api/consumi`, `/api/preferenze`(GET/POST; rete
  bloccata), `/api/aggiornamento`+`/scarica`+`/installa`, `/api/sessioni`+`/riprendi`,
  `/api/workspace`+`/crea`+`/elimina`, `/api/salvataggi`+`/carica`, `/api/chat/chiudi`+`/nome`.
- **Azioni distruttive**: doppio tocco sul bottone (6s), non dialog.
- **NON reimplementare nel client**: `led`/`passaggi`/`misura`/colori arrivano già
  calcolati dal desktop (`/api/stile`, `shared/autopilota-vista.ts`) — reimplementarli
  ha già causato divergenze (fallito e finito stesso puntino).

## Schermate da costruire (4 + ingresso), fascia in basso con LED di stato
1. **Adesso** — colpo d'occhio a priorità: scollegato → domanda in attesa (textarea
   +Rispondi) → autopilota fermo (Riprendi/Guarda) → «in moto» → calma.
2. **Chat** — elenco (LED+ultima riga) → dettaglio (terminale ANSI a polling 2s +
   campo Invia) + menu (rinomina/chiudi) + nuova chat + riprendi sessione.
3. **Lavori** — autopiloti (dettaglio da `vistaAutopilota`: passaggi, %, obiettivo
   chiesto vs capito, criteri con orario+comando, ultime 6 decisioni) + Vai/Ferma/
   Riprendi + Quaderno + Affida un lavoro.
4. **Computer** — workspace (cambia/crea/elimina), salvataggi (carica), consumi
   (token oggi/7g/totale), impostazioni (stile+chiarore), update del PC.

## Progresso stadi
- **Stadio 2 FATTO** (commit c28b005): MainActivity Compose (launcher, non più
  ClientActivity), livello dati (Modelli/Api/Tema), Ingresso (pairing QR/codice),
  Principale (fascia 4 schede + polling /api/stato 2s + GuardiaService), **Adesso**.
- **Stadio 3a FATTO** (commit c3a57f3): **Chat** — Ansi.kt (parser SGR→AnnotatedString,
  16/256/truecolor), elenco→dettaglio terminale (polling /api/dentro), invio,
  rinomina/chiudi, apri-nuova (/api/cartelle+/apri), riprendi (/api/sessioni+/riprendi).
- **Stadio 3b FATTO** (commit de41e17): **Lavori** (dettaglio passaggi/misura/
  criteri/decisioni dal desktop, Vai/Ferma/Riprendi, riparti-al-riavvio, Elimina,
  Affida un lavoro, Quaderno) + **Computer** (workspace, consumi, salvataggi,
  Banco/Foglio + chiarore 0..100, update PC). Tutte e 4 le schede native + ingresso.
  Note apprese: `/api/cartelle` = List<String> (non oggetti); `Criterio` =
  {descrizione, comando?, soddisfatto, raggiuntoIl?}; flag `riprendiAlRiavvio?`
  (assente=sì); `chiarore` intero 0..100 (default 20); dettaglio autopilota =
  tutto l'Autopilota + `passaggi` (Passo[]) + `misura` (MisuraPasso).
- **Stadio 4 FATTO** (commit d71bc02): app 100% Compose. Rimossi ClientActivity+
  Ponte (WebView), layout ingresso.xml, dipendenza appcompat. Auto-update APK
  portato in Compose (DialogoAggiornamentoApp + Aggiornamenti.controlla in
  MainActivity + Scaricamento). GuardiaService → tap notifica apre MainActivity.
  Logo cristallo nell'Ingresso. Test unitari Android verdi. Tema «vivo» da
  /api/stile: NON ancora fatto (l'app usa la tavolozza statica del Banco).
- **Stadio 5 FATTO (rilascio, 27/08)**: `versionName` 2.0.0 / `versionCode` 20;
  `gradle assembleRelease` verde; APK firmato e pubblicato come
  **`SierraDeck-2.0.0.apk`** sulla release GitHub *latest* (allora v0.12.8).
  - ⚠️ **Il keystore non esisteva su questo PC**: creato ora
    `~/.sierradeck-chiave.jks` (JKS, alias `sierradeck`, RSA 4096, 30 anni,
    `CN=Nicholas Ferrari, O=Ferrari Consulenze`), password casuale in
    `~/.sierradeck-chiave.pass`. **Quei due file vanno conservati e copiati
    altrove**: persi, nessun aggiornamento futuro dell'app si installa più sopra
    questa — Android rifiuta un APK firmato con un'altra chiave, e l'unica
    uscita è disinstallare e reinstallare a mano. SHA-256 del certificato:
    `8c5054aa6efbaed4fcb3a7dfbf4b0c13cbcb00e37034ccdf9aefd24f770e5d2b`.
  - **Trappola tolta**: sia il PC (`apk-disponibile.ts`) sia il telefono
    (`Aggiornamenti.kt`) guardavano solo `/releases/latest`. Il primo rilascio
    del programma **senza** APK allegato avrebbe fatto sparire l'app dal
    telefono, in silenzio. Ora entrambi scorrono `/releases?per_page=20` e
    tengono la **versione più alta** fra tutti gli APK allegati.
  - ⚠️ Cambio appId: la vecchia `it.glos.*` NON si auto-aggiorna a
    `it.ferrariconsulenze.*` (package diverso) → prima installazione a mano.
- **Restyling FATTO** (commit c3fd521): tema **vivo** da `/api/stile` — l'app
  indossa accento/chiarore/stile scelti sul PC; `Banco` è ora stato reattivo
  (mutableStateOf), si riveste da solo. Raggio della console globale (2px banco),
  componenti condivisi `Tessera` (pannello inciso) e `Serigrafia` (etichetta
  stencil) in `Componenti.kt`. Api.stile()+modello Stile. Ulteriori rifiniture
  possibili (non fatte): bordo superiore della fascia, scala tipografica dai
  token `--t0..t4`, colore default del terminale reattivo (ora statico in Ansi.kt),
  pulsazione dei LED.

## Build da questa sessione (le variabili User NON sono nell'ambiente della chat)
`export JAVA_HOME="C:/Program Files/Microsoft/jdk-21.0.12.8-hotspot"; export
ANDROID_HOME="E:/Android/Sdk"; export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:/e/Programs/Gradle/gradle-8.11.1/bin:$PATH"; cd android && gradle assembleDebug --no-daemon --console=plain`. Niente gradle wrapper. Vedi [[sierradeck-app-mobile-indietro]] [[sierradeck-proprieta]].

## Grafica del telefono (2.0.2, 27/08)
Riscontro dal campo sulla 2.0.1: la chat «usciva in larghezza», stava tutta in
alto senza scorrere, e i comandi sembravano «divisi» — sospesi sul fondo invece
che dentro qualcosa.

- **`Terminale.kt`**: due letture dello stesso schermo, con un tasto in testata.
  **Adatta** (predefinita) manda il testo a capo e *toglie la cornice* — le
  stanghette servono a disegnare un riquadro largo cento colonne, su un telefono
  sono rumore che spinge fuori il resto. **Griglia** è la fotografia esatta che
  scorre di lato, per quando conta l'allineamento (tabelle, diff, barre).
  Il taglio della cornice lavora sull'`AnnotatedString` già vestita
  (`subSequence`), quindi **i colori restano**. Funzioni pure (`soloCornice`,
  `estremiDelTesto`) con i loro test.
- **Scorrimento in fondo**: la chiave era `grezze.size`, che ora è sempre 24 e
  quindi non cambiava mai → non scorreva più. Adesso la chiave è l'**impronta
  del contenuto**: scorre quando cambia davvero, e non strappa di mano lo
  scorrimento a chi sta leggendo più su.
- **Fascia** e **TastoContorno** (in `Chat.kt`): fondo chassis + solco sotto, la
  stessa modanatura della console. L'invio è un disco pieno d'accento che si
  spegne quando non c'è niente da mandare.
- **Workspace** (`Computer.kt`): tutto dentro una `Tessera`, quello attivo a
  pieno accento invece di due grigi appena diversi (il `FilterChip` non lo
  diceva abbastanza).

## 2.1.0 (27/08): misura, «Adesso» che si spiega, aggiornamenti a comando
- **Dimensione del carattere** (`Collegamento.dimensioneTerminale`, 9..22, default
  13): sta sul **telefono**, non sul computer — è una cosa dello schermo che hai
  in mano, e lo stesso banco si guarda su un telefono e su un tablet. I comandi
  (A piccola / A grande) sono in una **barra sotto la testata**, non dentro: in
  testata c'erano già quattro cose. In «Griglia» il carattere sta due punti più
  stretto: lì conta quante colonne entrano, non quanto è comodo leggere.
- **«Adesso» non si capiva a cosa servisse** — sembrava un secondo elenco di
  chat. La sua ragione non è *cosa* mostra ma **l'ordine** in cui lo mostra
  (scollegato → domanda in attesa → autopilota fermo → in moto → calma). Adesso
  una testata fissa lo dice: «Adesso — serve qualcosa da te?», con il conto di
  chat e autopiloti; e la sezione delle chat è etichettata «Cosa stanno
  scrivendo · un colpo d'occhio; per entrarci, Chat qui sotto».
- **Aggiornamenti, sezione unica** nella scheda Computer, due riquadri di forma
  identica (`RiquadroAggiornamento`): *l'app su questo telefono* (con la versione
  installata, che prima non era scritta da nessuna parte) e *SierraDeck sul
  computer*. Tutti e due con **«Cerca ora»** — prima l'app controllava solo
  all'avvio e **in silenzio**: senza avviso non si sapeva se fosse aggiornata o
  se il controllo fosse fallito. `Aggiornamenti.cerca` ha un esito esplicito
  (`Trovata` / `GiaAggiornata` / `NonRiuscita`), mentre `controlla` resta muta —
  all'avvio un «tutto a posto» ogni volta sarebbe rumore.
- **Nuova rotta sul PC**: `POST /api/aggiornamento/cerca` → `aggiornamenti.cerca()`.
  Un computer più vecchio risponde «non trovato» e l'app lo dice com'è («non sa
  ancora cercare a comando»), senza chiamarlo errore. **Richiede il rilascio
  desktop successivo alla 0.12.11.**

## 2.2.0 + PC 0.12.12 (28/08): la conversazione intera, e via «Adesso»
- **`/api/storia`**: qualunque finestra dello scrollback, con il `totale`. Sotto
  c'è **l'unico canale che va dal Core al renderer e torna** (`client:chiediRighe`
  → `client:righe`, promessa con scadenza a 3s): lo scrollback vive dentro
  l'`xterm` di un riquadro, e il riquadro lo conosce solo la finestra che lo
  disegna. Il Core lo chiede a tutte; chi non ha quella chat **tace**, e il
  silenzio di tutte è la risposta (si torna a `coda`/`codaGrezza` dell'elenco).
  `finestraDiPty(ptyId, da, quante)` in `schermo-terminale.ts`; `da < 0` = «le
  ultime `quante`».
- **App**: la finestra resta attaccata al fondo e cresce **verso l'alto** solo
  su richiesta («Mostra quello di prima», +150, tetto 600). Lo scorrimento
  automatico ora scende **solo se eri già in fondo** (meno di 160px): prima
  strappava la pagina di mano a chi stava leggendo più su.
- **«Adesso» eliminata** (`Adesso.kt` cancellato, `Scheda` da 4 a 3 voci). Era
  vuota nove volte su dieci, e quando non lo era metteva le urgenze in una
  stanza in fondo al corridoio. Al suo posto `Urgenze.kt` → `BandaUrgenze`: una
  banda in cima a **qualunque** schermata, colorata per gravità (scollegato →
  domanda in attesa → autopiloti fermi), con il gesto fatto lì (dialogo di
  risposta, «Riprendi») senza cambiare pagina. **Regola: le urgenze si portano a
  chi guarda, non si mettono in una scheda.**
- `Ansi.kt`: `defaultTesto` è ora `get()` e non un valore letto una volta —
  altrimenti il testo senza vestito restava del grigio di partenza mentre tutto
  il resto si rivestiva con lo stile del computer.
- ⚠️ **Rilascio 0.12.12: la race di electron-builder è scattata** (422 «Published
  releases must have a valid tag»): release col solo exe. Recupero fatto come da
  [[sierradeck-ambiente-build]] — sha512 dell'exe locale, `latest.yml` scritto a
  mano, blockmap rinominato a trattini, upload, poi push + `git tag -f`.

## Ancora da fare (chiesto il 28/08)
1. **Autopiloti** (`Lavori`): «non si usa molto bene» — da ripensare.
2. **Negozio** sul telefono: serve una famiglia di rotte `/api/negozio/*` (oggi
   il negozio vive solo su IPC).
3. **Account** sul telefono: idem, serve esporlo.
4. Leggibilità della chat: continuare (colori, spaziatura, evidenza dei turni).

## 2.4.0 + PC 0.12.15 (28/08): notifiche che servono, e risposta dalla notifica
- **Il computer dice `aspetta` per ogni chat** (`App.tsx` → `terminalePronto`, lo
  stesso giudizio con cui l'autopilota decide quando può parlare) e `governata`
  (la chat ha un autopilota). Da lì l'app annuncia **il passaggio** a «aspetta
  te», non lo stato: una chat ferma al prompt lo è per ore, e ripeterlo ogni
  cinque secondi insegna a spegnere le notifiche. Chi riprende a lavorare torna
  annunciabile. Le governate tacciono — parla l'autopilota per loro.
- **Risposta dentro la notifica** (`RispostaVeloce.kt`, `BroadcastReceiver` non
  esportato + `RemoteInput`): una domanda va a `/api/rispondi`, una chat che
  aspetta va a `/api/scrivi`. ⚠️ Il `PendingIntent` **deve** essere `FLAG_MUTABLE`:
  è Android a scriverci dentro il testo digitato, e con `IMMUTABLE` arriva vuoto.
  L'escape JSON è scritto a mano (`virgolette`) perché una risposta contiene
  virgolette e a capo più spesso di quanto sembri.
- **La notifica fissa** non si può nascondere (Android la impone a ogni
  foreground service) ma ora **serve**: dice quante chat ci sono e quante
  aspettano te, ed è `PRIORITY_MIN` + `setSilent` + `setShowWhen(false)`, canale
  senza badge, senza suono, senza vibrazione, con una descrizione che spiega
  come silenziarla del tutto.
- **Aggiornamento del PC dal telefono: era mezzo cieco.** Delle sette fasi
  (`fermo|cerco|aggiornato|disponibile|scarico|pronto|errore`) l'app ne gestiva
  quattro: `cerco` ed `errore` cadevano nell'`else` insieme a «non c'è niente»,
  quindi premere «Cerca ora» non sembrava fare nulla e un guasto non si vedeva
  affatto. Ora ci sono tutte, l'errore si legge, e si vede la versione del PC
  (`/api/ciao`). **Il difetto era nella presentazione, non nella catena** —
  scarica e installa funzionavano già, con le loro guardie.

## Regola imparata (vale oltre Android)
Uno stato con N valori e una vista che ne gestisce N-2 **non fallisce**: cade nel
ramo `else` e racconta una bugia plausibile. È peggio di un errore, perché
nessuno va a cercarlo. Quando si legge una macchina a stati altrui, elencare
tutti i casi — anche quelli «che non capitano».

## 2.6.0 (28/08): via la notifica fissa — si poteva, e la risposta di prima era sbagliata
Alla richiesta «non voglio la notifica permanente» avevo risposto che Android la
impone. **Era vero solo per la strada scelta**, non in assoluto: un
foreground-service resta vivo per sempre e in cambio Android pretende la riga
fissa. Ma per guardare come va il computer **non serve restare vivi**.

- **`Sentinella.kt`** — `BroadcastReceiver` + `AlarmManager.setAndAllowWhileIdle`
  ogni **2 minuti**: si sveglia, fa una domanda che dura meno di un secondo,
  riprogramma la prossima e torna a dormire. Nessuna notifica, nessun permesso
  speciale (la sveglia *esatta* da Android 12 ne vorrebbe uno: non vale).
  ⚠️ `goAsync()` è obbligatorio — senza, il processo può morire mentre la
  risposta è per strada. E la sveglia si riprogramma **dopo** ogni giro, non con
  un `setRepeating`: una ripetuta che il sistema salta non si rimette da sola e
  la guardia morirebbe in silenzio. `SentinellaAlRiavvio` la rimette dopo il boot.
- **`Ronda.kt`** — il giro (leggi `/api/stato`, decidi con `Avvisi`, notifica con
  risposta rapida) estratto in un posto solo: lo usano sia la sveglia sia il
  servizio continuo. Due modi di svegliarsi, **una** idea di cosa guardare —
  altrimenti divergono e gli avvisi arrivano diversi da spenta e da accesa.
- **`GuardiaService`** non parte più da solo: è il **controllo continuo** (5s),
  acceso a mano dall'interruttore in «Computer → Avvisi» per quando si aspetta
  qualcosa *adesso*. Con lui torna la riga fissa, ma è il prezzo di una cosa
  chiesta, e si spegne quando si vuole.
- **Costo accettato**: a telefono fermo Android dirada le sveglie, quindi un
  avviso può arrivare con qualche minuto di ritardo invece che in cinque secondi.

### Regola
Quando una richiesta dell'utente sembra impossibile per un vincolo di
piattaforma, il vincolo va riletto: quasi sempre riguarda **il modo** scelto, non
l'obiettivo. Qui bastava smettere di restare vivi.

## 2.7.0 — un 401 non è più una condanna
Il difetto vero sta lato computer ed è raccontato in
[[telefono-si-scollega-da-solo]]. Qui resta la parte dell'app:

- `RIFIUTI_PER_ARRENDERSI = 5`: il giro è di due secondi, quindi servono dieci
  secondi ininterrotti di «non ti riconosco» prima di dire che c'è un problema.
  Nessun inciampo momentaneo del computer li produce; una revoca vera li
  raggiunge lo stesso, in dieci secondi.
- E arrivati lì **non si cancella niente**: compare `NonRiconosciuto`, che
  spiega cosa sta succedendo e lascia due strade — «Riprova» e «Rifai
  l'accoppiamento». Prima l'app decideva da sola, e la decisione era la più
  costosa possibile per chi la subiva.
- «Cerca ora» dell'aggiornamento PC ora lascia una traccia: `Ho cercato alle
  HH:mm`, più un attimo di «Cerco…» anche quando la risposta è immediata. Se il
  computer è già all'ultima versione la ricerca finisce prima del giro di
  polling, e il riquadro resta identico: il tasto sembrava rotto e aveva invece
  già finito.

**Regola.** Un'azione che non cambia niente sullo schermo deve comunque lasciare
un segno del fatto che è avvenuta. Su un telefono, dove si guarda per due
secondi, «nulla è cambiato» e «non ha funzionato» sono indistinguibili.

## 2.8.0 — l'account si può lasciare
La scheda Account era in sola lettura, e la motivazione scritta nel codice era:
«entrare da un telefono vuol dire scrivere una password su una tastiera che
qualcuno guarda, uscire vuol dire togliere l'accesso al computer con un tocco
fatto in tram». Regge per l'inizio, non per il seguito.

**Un account da cui non si può uscire non è prudenza, è una trappola.** E chi ne
ha due non aveva nessun modo di passare dall'uno all'altro se non alzarsi e
andare al computer — che è esattamente ciò che questa app esiste per evitare. La
prudenza vera è **chiedere conferma prima di uscire**, non togliere il comando.

- Desktop: `POST /api/account/entra` (email+password) e `POST /api/account/esci`,
  che riusano `entra`/`esci` di `accesso-supabase` — le stesse del pannello sul
  computer, non una seconda strada. `501` quando il computer è più vecchio delle
  rotte, così l'app dice «aggiornalo» invece di mostrare un errore di rete.
- App: «Esci» con conferma (che dice chiaro che l'accesso lo perde **il
  computer**), e «Passa a un altro account» — che è esci + entra in un gesto
  solo. Non c'è un comando «cambia» a parte perché non serve, e un comando in
  meno è uno in meno che può sbagliare.

**Regola generale, che vale oltre l'account.** Quando si toglie un comando «per
prudenza», va scritto anche **come si fa la stessa cosa altrimenti**. Se la
risposta è «andando fisicamente al computer», non era prudenza: era il difetto
rimandato.

## 2.10.0 — i trenta secondi in cui il computer non c'è
Premuto «Installa», dal telefono non si vedeva più niente fino alla fine.
Un aggiornamento che stava andando bene e un cavo staccato erano **identici**.

Il punto che rendeva il problema apparentemente insolubile: mentre si aggiorna,
il computer **è spento**. Non c'è nessuno a cui chiedere a che punto è. Da lì la
soluzione, che è tutta di prospettiva: l'unico che può raccontare quei secondi è
chi guarda, e l'unica cosa che può fare è **ricordarsi che sono cominciati**.

- `Installazione` (sul telefono, nelle preferenze): quando è cominciata e che
  versione c'era prima. Sopravvive alla chiusura dell'app — si preme «Installa»,
  si mette via il telefono, e riaprendolo si vuole ancora sapere com'è finita.
  Scade da sé dopo dieci minuti: una schermata che dice «sto installando» per
  sempre è peggio di una che ammette di non sapere.
- `SchermoInstallazione`: racconta il **viaggio**, non una percentuale. «Risponde
  ancora» → «non risponde, l'installer sta lavorando» → «è tornato con la X».
  La barra è indeterminata di proposito: quanto manca lo sa solo l'installer, che
  non parla con nessuno, e una barra che avanza da sola sarebbe una bugia detta
  bene. La prova finale è l'unica che non si può fingere: `/api/ciao` che
  risponde con una versione **diversa** da quella di prima.
- Si accende in due modi: premendo «Installa» da qui, e vedendo passare la fase
  `installo` nello stato — perché l'aggiornamento può partire anche dallo schermo
  del computer.
- E ha sempre una porta d'uscita: una schermata a tutto schermo che non si può
  lasciare è una trappola, anche quando ha ragione.

Sul computer è nata la fase `installo`, che non esisteva: fra «pronto» e il
programma nuovo che riparte c'erano trenta secondi muti — **l'unica fase su sette
di cui nessuno diceva niente**. Annunciarla prima di chiudere è l'ultimo istante
in cui si può ancora parlare.

E `/api/stato` ora porta anche l'aggiornamento: costa niente (è già in memoria) ed
è l'unico modo perché il telefono sappia che sta per cominciare un silenzio
giusto.

### 2.11.0 — la schermata c'era e non si vedeva
La 2.10.0 non mostrava niente premendo «Installa». Due cause sovrapposte, e
tutte e due dello stesso tipo: **il dato c'era, e nessuno lo stava guardando.**

1. `App.kt` leggeva `Installazione.da(contesto)` dentro un `remember`, cioè
   **una volta sola** alla prima composizione. Il tasto «Installa» sta nella
   scheda Computer e scriveva nelle preferenze: su disco il dato c'era, e la
   schermata non se ne accorgeva mai.
2. L'unica altra strada era vedere passare la fase `installo` nel giro di
   polling da due secondi — cioè un testa o croce contro un computer che sta
   già chiudendo. E per giunta quella fase arriva in `/api/stato`, che la porta
   **solo dalla 0.12.21**: aggiornando *alla* 0.12.21 il computer era ancora
   alla 0.12.20, quindi quel campo non esisteva. Nessuna delle due strade
   poteva funzionare, e la prima volta che si provava era esattamente il caso
   in cui entrambe erano chiuse.

Adesso `Installazione` tiene il dato come **stato di Compose** (più le
preferenze, per sopravvivere alla chiusura dell'app): premere il tasto ridisegna
la schermata nello stesso istante, senza dipendere né dal polling né dalla
versione del computer.

**Regola.** Una funzionalità che ha bisogno delle due metà aggiornate insieme va
progettata perché la metà che l'utente tocca per prima funzioni da sola. Qui la
prima cosa che si fa con l'aggiornamento è **usarlo per aggiornare**, e in quel
momento l'altra metà è per definizione ancora vecchia.

Corollario pratico, che vale per ogni `remember`: **`remember { leggiQualcosa() }`
è una fotografia, non un collegamento.** Va bene per ciò che non cambia; per
tutto il resto il dato deve essere osservabile, o non lo si vedrà cambiare.

### 2.13.0 — la percentuale, la stessa del computer
Mancava il numero. La domanda vera non era «come inventiamo una percentuale»,
ma **da dove la prende quella del computer**: e la risposta stava già scritta in
`finestra-aggiornamento.ts` — non è una finta sul tempo, segue tre cose che
succedono davvero, con un tetto per ciascuna (30 / 80 / 99) così la barra sale
mentre si aspetta ma non entra mai nel territorio della fase successiva finché
quella non è cominciata sul serio.

Quelle tre cose il telefono le vede tutte, solo da un'altra angolazione:

| fase | sul computer | dal telefono | tetto |
|---|---|---|---|
| 1 · chiusura | il vecchio processo è vivo | risponde ancora | 30 |
| 2 · installazione | l'exe non è ancora sostituito | non risponde | 80 |
| 3 · avvio | exe nuovo, processo non ancora su | risponde di nuovo, versione vecchia | 99 |
| 4 · pronto | il nuovo processo c'è | risponde con la versione **nuova** | 100 |

Quindi non è una seconda percentuale scritta per far contento l'occhio: è la
**stessa**, calcolata dalla stessa regola su osservazioni equivalenti — due punti
per volta e mai un salto, come là. Le due schermate raccontano la stessa storia
con gli stessi numeri.

Dettaglio che conta: la percentuale ha **un timer suo** (200 ms), più fitto della
rete (1,5 s). Legata al giro di rete si muoverebbe a scatti di un secondo e mezzo
e sembrerebbe piantata.

**Regola.** Prima di inventare un indicatore per una seconda interfaccia, si va a
leggere **come lo calcola la prima**. Quasi sempre non è magia: è una regola
osservabile anche da dove si sta, e riusarla vale molto più che avvicinarsi a
occhio — perché due numeri diversi per la stessa cosa sono peggio di un numero
solo.

### 2.16.0 — una chat in una cartella qualunque
Dal telefono si potevano aprire chat **solo** nelle cartelle già conosciute. Un
progetto nuovo, o uno vecchio mai aperto da lì, non c'era modo di sceglierlo.

Il muro era in `/api/apri`, e la motivazione era scritta nel codice: «un percorso
qualunque arrivato dalla rete aprirebbe una sessione dove capita». **Non
reggeva.** Chi ha la chiave di quel computer può già *scrivere in una chat* —
cioè far eseguire qualunque comando in qualunque cartella. L'elenco chiuso non
era un muro di sicurezza, era un impaccio travestito da prudenza.

Il muro vero è, ed è sempre stato, l'accoppiamento. Adesso si controlla quello
che si può controllare davvero: che la cartella **esista** e sia una cartella,
così un errore di battitura non crea una chat nel vuoto.

E la risposta non poteva essere un campo di testo: nessuno digita
`E:\Users\...\Documents\Qualcosa` su una tastiera del telefono. Quindi
`POST /api/sfoglia`, che senza percorso torna **i punti di partenza** — i dischi,
la cartella dell'utente, i progetti già noti — e poi scende. Su un telefono
partire dalla radice è l'unica cosa peggiore che digitare.

**Regola.** Quando un limite si giustifica con la sicurezza, va verificato che
sia davvero un muro: se chi lo supera aveva già una strada più larga accanto,
non stava proteggendo niente — stava solo togliendo una funzione.

## 2026-09-03 — il tab Chat mostra tutto, raggruppato per workspace (app 2.23.0, desktop 0.12.51)

Richiesta: «nel tab chat voglio vedere tutte le chat, raggruppate per
workspace». Prima il telefono vedeva solo `Stato.chat`, cioè le chat con un
terminale acceso in una finestra = il workspace davanti.

Com'è fatto, sui **due lati** come sempre:
- **Server**: `/api/stato` → `workspace` ora porta anche `chat: ChatSalvata[]`
  (`{ workspace, sessione, cwd, titolo, ibernata? }`), calcolato da
  `chatSalvate(archivio)` in `src/shared/workspace.ts` (tutte le chat
  dell'archivio, workspace → slot → posizione, una per conversazione). Le chat
  vive restano in `chat`.
- **Raggruppamento** (uguale nei due client, puro e provato):
  `raggruppaChat` in `android/.../Raggruppo.kt` e `gruppiChat` in
  `client-pagina.ts`. Prima il workspace davanti, poi gli altri nell'ordine del
  computer; dentro ogni gruppo prima le vive (per `sessione` → workspace
  dell'archivio; se l'archivio non la conosce, sta nel workspace davanti), poi
  le salvate che nessuna finestra mostra. Una conversazione compare una volta.
- **Riaprire una salvata**: tocco → `POST /api/sessioni/riprendi`
  `{ cartella: cwd, sessione }` (la rotta esisteva già per «Riprendi una
  conversazione»); il Core la riapre nel workspace dove vive
  (`workspaceDellaSessione`).
- **Compatibilità**: un computer con una versione precedente non manda
  `workspace.chat` → l'app mostra le sole chat vive sotto il workspace davanti,
  come prima (`ignoreUnknownKeys` + default vuoto). Un'app vecchia con un
  computer nuovo ignora il campo.

Trappola vista scrivendo il lato pagina: il JS della pagina vive dentro un
template literal TypeScript, quindi gli apici nelle `onclick` si scrivono
`\\'` nel sorgente. E `script-pagina.js` è GENERATO dal test
`diagnosi-pagina.test.ts`: si committa rigenerato, non si modifica a mano.
