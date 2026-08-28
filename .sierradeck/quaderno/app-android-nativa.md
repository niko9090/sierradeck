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
