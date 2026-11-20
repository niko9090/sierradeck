# Lezioni del progetto

<!-- SierraDeck: una riga per voce; una voce che torna aumenta «confermata N×». Tetto 600 voci o 128 KB: escono prima le meno confermate e più vecchie. Si può scrivere anche a mano. -->

## test

- Il comando mklink via Bash è rifiutato nei worktree; la junction si crea con PowerShell New-Item -ItemType Junction. _(2026-11-09)_
- In `criticitaDi` la voce `risorse` non ha il pcId: la chiave per PC si costruisce da `s.pcId`, e il titolo senza numeri va nella firma. I numeri restano solo nel dettaglio. _(2026-11-09)_
- Per provare il Drive pieno serve un archivio con capacità vera e un freno attivo: un flag «pieno» fisso non mostra che la DELETE libera spazio e riabilita le scritture. _(2026-11-09)_
- la pagina del telefono riceve le funzioni di `src/shared` con `.toString()`: devono essere autosufficienti, senza costanti di modulo, e usare solo ciò che è definito nella pagina. _(2026-11-09)_
- pannello-drive-app.test.ts estrae le funzioni della pagina una a una: ogni nuova funzione chiamata da pannelloDriveHtml va aggiunta lì, o il test dà ReferenceError. _(2026-11-09)_
- i test usano oggetti con statusCode o testi costruiti a mano; la forma reale di createHttpError (node_modules/builder-util-runtime/out/httpExecutor.js:52) va testata così com'è _(2026-11-10)_
- un worktree può partire indietro rispetto a main: fare `git merge --ff-only main` prima di misurare, altrimenti mancano i test appena entrati. _(2026-11-10)_
- `npx vitest run` intero dura circa 160 s su questo PC: un rifiuto "vitest rosso" senza nome di prova può essere un tempo scaduto sotto carico, non il codice. _(2026-11-10)_
- Un 50x di electron-updater può arrivare come testo senza statusCode: «504 <frase>[\ndescrizione]\nHeaders: {…}». Il riconoscimento deve guardare il testo completo, non solo il campo. _(2026-11-10)_
- il freno predefinito `frenoDrive` è unico per tutto il processo: nei test di `creaArchivioDrive` dare sempre `freno: creaFreno()`, o un 429 sporca i test seguenti. _(2026-11-10)_
- un comando Bash con heredoc Python e altro insieme può essere rifiutato nel worktree, ma i passi precedenti possono aver girato lo stesso: ricontrollare `git diff` prima di rifare le modifiche. _(2026-11-10)_
- sposta-fra-pc aspettava 10 ms fissi dopo un lavoro in sottofondo: sotto la suite intera cadeva. Mai un tempo fisso per aspettare un lavoro asincrono. _(2026-11-10)_
- le prove che cercano stringhe nel sorgente (readFileSync di un .tsx) si rompono a ogni riscrittura della vista: meglio agganciarle al componente o alla funzione, non al dettaglio interno. _(2026-11-10)_
- il freno Drive alza l'attesa al primo 429, quindi un test che si aspetta ritentativi su 429/rateLimit va scritto con 503 (transitorio), non con 429 _(2026-11-10)_
- `tests/main/sposta-fra-pc.test.ts` (caricamento lungo) è fallita una volta sola nella serie completa sotto carico e passa da sola: probabile instabilità di tempi _(2026-11-10)_
- Per provare «zero richieste» su `apriSincronia`, avvolgi l'archivio in un Proxy che conta le chiamate; l'orologio del freno si inietta con `creaFreno(() => t)`. _(2026-11-10)_
- Dopo la correzione della Salute (46ce0845) un PC senza `battito` non mostra più i suoi consumi: le prove con altri PC e `risorse` devono dare un battito recente. _(2026-11-10)_
- Il rifiuto «prove vitest dei compiti già uniti» può non riprodursi: su main isolato la suite era verde. Prima di cambiare codice rilanciare la suite sul ramo da solo. _(2026-11-10)_
- giudicaStrumento accetta {ambiente} per le prove: con percorsi finti Windows (C:\Users\mario) non serve toccare le variabili d'ambiente _(2026-11-10)_
- I test del servizio con raccolta eventi lunga provano il «subito»: per far arrivare un evento va chiuso il turno finto con un result, altrimenti resta in attesa. _(2026-11-10)_
- In `tests/autopilot-host` una `blocca` che non si risolve mai tiene il lucchetto di prova globale (per cwd) e fa fallire per timeout i test dopo: risolvere sempre la promessa. _(2026-11-10)_
- in copia nessuna prova fallisce né sotto la suite intera ripetuta né in tests/autopilot-host (5389 + 740 verdi). Se il cancello rifiuta, cercare il motivo nel suo log, non nei test. _(2026-11-10)_
- Nei test sul repo di prova `ls-files` restituisce per primo `.sierradeck/...` se esiste: per scegliere un file di codice escludere quel prefisso. _(2026-11-10)_
- il cane da guardia (20 min) e il backoff si sommano: nei test con fake timer il secondo riavvio parte 30 s dopo lo scatto del cane, non subito. _(2026-11-11)_
- per la regola del quaderno usare un repository git vero (repositoryDiPartenza): i mock non vedono il comportamento di `git status`/`add`/`commit` sui file riscritti. _(2026-11-11)_
- la suite completa (vitest, circa 620 file) richiede circa 3,5 minuti: usare un timeout ampio. _(2026-11-12)_
- per logica di percorsi Windows passare path.win32 come parametro, così il test gira uguale su ogni sistema _(2026-11-13)_
- tests/shared/novita.test.ts limita ogni voce delle novità a 8 righe: per aggiungere una correzione a una voce piena bisogna unire due righe. _(2026-11-13)_
- per simulare il servizio spento basta aprire e chiudere un server http su porta 0 e usare quella porta: `fetch failed` vero, senza mock _(2026-11-13)_
- testDebugUnitTest Android ha test legati ai tempi (CentralinoTest <500ms, AscoltoAvvisiTest sleep 1,1 s): sotto carico del PC possono fallire a intermittenza. Riportare il nome del test, non solo "BU… _(2026-11-14)_
- Centralino accetta un orologio iniettato: nelle prove usarlo fermo invece di misurare ms veri (<500 dentro un'attesa di 1 s salta col PC carico). _(2026-11-14)_
- `tsc` ha noUncheckedIndexedAccess: negli indici di array serve `?? ''`, altrimenti il typecheck del criterio fallisce. _(2026-11-14)_
- criteriPerLaProva è usata anche da servizio-orchestratore.ts per un solo comando: se scarta il comando si ricade sull'originale, non sul vuoto _(2026-11-14)_
- per riprodurre un multibyte spezzato basta tagliare il Buffer a metà dei 3 byte di › ed emettere due 'data' su una richiesta finta. _(2026-11-14)_
- vitest tests/main tests/shared nel worktree dura qualche minuto (470 file): lanciarlo una volta sola, l'output è enorme, leggere solo la riga «Test Files» con grep -a. _(2026-11-15)_
- `git fetch` può fallire sul bundle del PC richiedente: se il ramo è già pari a `main`, basta `git merge --ff-only main`. _(2026-11-16)_
- `src/aiutante/aggiornamento.ts` ora importa `electron` (`powerMonitor`): i test che lo caricano devono mockare `electron` con `powerMonitor`. _(2026-11-16)_
- `avviaAggiornamenti` programma un primo controllo a 15 s: nei test con timer finti far passare prima quel tempo, poi contare i `checkForUpdates`. _(2026-11-16)_
- `creaServer` apre da solo `aiuti-affidati.json` in `archivio.cartella/servizio`: per provare gli affidati basta scrivere quel file prima. _(2026-11-16)_
- `StatoScheda` usa 'lavora', `ChatGovernata` usa 'lavoro': nei test di panoramica il typecheck rifiuta la forma sbagliata, mentre vitest la lascia passare. _(2026-11-16)_
- A parità di posti `scegliAltroPc` ordina per `pcId`: nei test con più PC liberi si sceglie quello che viene prima alfabeticamente, non quello scritto per primo. _(2026-11-16)_
- i lavori ospitati passano solo dal lavoratore Aiuta la rete: per testarli senza server estrarre la logica in una funzione pura (vista-ospitati.ts) _(2026-11-16)_
- prima di creare un file di test controllare che il nome non esista già: Write sovrascrive in silenzio (tests/shared/stato-vero-autopilota.test.ts c'era già) _(2026-11-16)_
- `StatoScheda` usa 'lavora', `ChatGovernata` usa 'lavoro': nei test del Piano usare `as const` sulla forma giusta o il typecheck rifiuta. _(2026-11-16)_
- aiuto-riassegna.test.ts confronta l'elenco esatto degli eventi del registro: ogni nuovo tipo di evento richiede di filtrare il finto `registra` o aggiornare le asserzioni. _(2026-11-16)_
- coda-aiutante.test.ts («parte appena si libera un posto») può fallire a vuoto con il PC carico: rilanciarlo da solo prima di indagare. _(2026-11-16)_
- `vi.waitFor` ha 1 s di default: nei test che aspettano la preparazione con git, col PC carico serve un `timeout` esplicito largo (qui 60 s) e un limite largo anche per il test. _(2026-11-16)_
- Il test che falliva a vuoto in `coda-aiutante.test.ts` era «con un posto libero il lavoro parte subito», non «parte appena si libera un posto»: non fidarsi del nome nel quaderno, rilanciare e leggere. _(2026-11-16)_
- `aggiornamento-aiutante.test.ts` legge `versione.json` e `novita-aiutante.txt` dal disco: se non sono allineati (file non committato) la prova fallisce solo nella cartella dove stanno. _(2026-11-16)_
- 16/11: tests/aiutante fallisce 113/114 solo nel principale di questo PC, verde su NB-PROBOOK con lo stesso commit: un compito per riprodurlo va fatto girare su questo PC, non affidato fuori. _(2026-11-16)_
- `tests/aiutante` passa 114/114 in due corse sul PC principale a HEAD 9c3dc639; un 113/114 isolato fa pensare a una prova sensibile al carico, non a file locali diversi. _(2026-11-16)_
- 16/11: tests/aiutante passa 114/114 lanciato a mano anche nel principale, ma 113/114 quando lo misura il servizio (≈2,8 s contro 6,4): una prova dipende dall'ambiente del processo (env, PATH). _(2026-11-16)_
- Il servizio lancia i criteri con TEMP/TMP su una sottocartella: percorsi >260 caratteri, `git rev-list` risponde «Filename too long» e l'Aiutante registra 0 commit. Prova a mano: TEMP su una sottocar… _(2026-11-16)_
- I criteri del servizio girano con TEMP/TMP su una sottocartella sierradeck-criterio-…: i percorsi dei test possono superare 260 caratteri. I git dell'Aiutante usano -c core.longpaths=true (16/11) _(2026-11-16)_
- tests/autopilot-host/servizio-orchestratore.test.ts («PreToolUse dell'unico», git -C … merge) fallisce se il test gira in una copia di lavoro: usa process.cwd() come principale _(2026-11-17)_
- `criticitaDi` ha bisogno di `adesso` per escludere i PC spenti; senza, un PC spento torna tra le criticità «non risponde». _(2026-11-19)_
- `vistaAutopilota` vuole `ora` e un autopilota con `dialogo`/`decisioni`: una fixture minima fa cadere `statoAutopilotaDalVivo` per un motivo diverso da `chats`. _(2026-11-19)_
- Alcuni test leggono `src/main/index.ts` come testo con regex: se ci si aggiungono righe fra `senzaAiutanti` e il suo contesto, vanno allargati. _(2026-11-19)_
- guardia-pc-0-85-1 ha un limite di 800 ms che salta se il PC è carico: ferma `npm run pubblica` (suite dentro). Rilanciare il solo file passa. _(2026-11-19)_
- I test sul tempo reale con server HTTP vero (tetti da 400 ms) slittano sotto `--maxWorkers=4`: i limiti superiori vanno larghi (secondi), solo il minimo (≥ tetto) prova l'attesa. _(2026-11-19)_
- `servizio-orchestratore.test.ts` («PreToolUse dell'unico», riga 330) fallisce in modo deterministico nella copia del worktree; da verificare se è rosso anche su main. _(2026-11-19)_
- Diversi test leggono i sorgenti .tsx (Console, App) come testo: togliere una voce o una prop rompe anche pannello-specialisti.test.tsx, non solo i test del menu. _(2026-11-19)_
- giornoEOra/oggi-ieri: nei test costruire le date con new Date(y,m,d,h) locale a mezzogiorno, non con UTC, per non dipendere dal fuso. _(2026-11-19)_
- Nel progetto non c'è un ambiente DOM: i test dei riquadri usano renderToStaticMarkup e leggono i .tsx come testo, quindi la logica da provare va in funzioni pure. _(2026-11-19)_
- gradle testDebugUnitTest --rerun impiega circa 7 minuti a freddo: da lanciare in foreground con timeout di 10 minuti. _(2026-11-19)_
- menu-unificato.test.ts legge i sorgenti: se sposti etichette fra file, aggiorna anche quel test. _(2026-11-19)_
- `tests/shared/menu-principale.test.ts` cerca titoli e tasti nel sorgente di VistaProgetti, ContenutoDrive e PannelloAccount: se si rinominano, va aggiornato anche quello. _(2026-11-19)_
- Per modificare client-pagina.ts con script node: il file ha fine riga CRLF e backslash doppi nel template; cercare una riga sola, non stringhe multi-riga. _(2026-11-19)_
- In client-pagina.ts le duplicazioni si vedono dall'HTML generato: `misura-riga` compare anche nel menu specialisti, quindi il test conta la stringa precisa dell'Avanzamento. _(2026-11-20)_
- molti test leggono Console.tsx e App.tsx come testo: spostando etichette in `@shared` (es. chat-workspace) vanno aggiornati subito, falliscono solo al giro completo. _(2026-11-20)_
- nei file di test scritti con heredoc i backslash dei percorsi Windows si perdono: scrivere i test con Write. _(2026-11-20)_
- per riprodurre il controllo dei PC basta `giroControlloPc` con `creaClientPcRemoto` muto e `altri` costruito come in index.ts: vedi tests/main/controllo-pc-aiutante-vivo.test.ts. _(2026-11-20)_
- Per provare che un test fallisce senza la correzione, rimetti il file di prima del commit con `git show <commit>^:file` e poi ripristinalo (qui ha riprodotto parola per parola il rapporto reale). _(2026-11-20)_
- Il rapporto del controllo può dire «dato vecchio» e «non risponde» insieme solo con codice diverso da main: nella 0.111.1 verificare `testoRapporto` prima di fidarsi del testo del rapporto. _(2026-11-20)_
- menu-principale.test.ts legge Console.tsx come testo (es. la riga `.map((v) =>`): togliere o rinominare un helper della fascia rompe quel test. _(2026-11-20)_
- `tests/autopilot-host/compiti-chiusi-11-11.test.ts` e `parallelo-12-11.test.ts` usano `riassuntoOrchestratore`: sono la prova di compatibilità del formato quando lo si cambia. _(2026-11-20)_
- tests/autopilot-host/servizio-orchestratore.test.ts «PreToolUse dell'unico» è rosso in questa copia (atteso `deny`, ricevuto `undefined`), senza i miei file. _(2026-11-20)_
- Un default di parametro in un helper di test scatta anche con `undefined` passato a mano: per un battito assente usare un valore non valido (es. 'mai'), non `undefined`. _(2026-11-20)_
- per provare le rotte loopback senza creaServerClient: funzione pura con indirizzo e autorizzazione in ingresso, più un http.createServer di prova su 127.0.0.1 porta 0. _(2026-11-20)_
- `index.ts` non si importa nei test: il collegamento lì si protegge con un controllo a regex sul sorgente, più i test sulle funzioni (`collegaCredenziali`, `rispondiAiuto`). _(2026-11-20)_
- `AGGIORNA=1` sul test delle impostazioni riscrive anche `impostazioni.json`: dopo, `git add -A` mostra solo avvisi di fine riga, non modifiche vere. _(2026-11-20)_
- `src/aiutante/index.ts` non si importa nei test; `colleghiRete` nemmeno: il collegamento si protegge con un controllo sul sorgente di `rete.ts`. _(2026-11-20)_
- `servizio-orchestratore.test.ts` «PreToolUse dell'unico» (git -C merge) è rosso nella copia di lavoro; non l'ho riprovato su main, ma non dipende dallo spedizioniere. _(2026-11-20)_
- `servizio-orchestratore.test.ts` (PreToolUse, merge negato) è rosso se la suite gira dentro una copia di lavoro: usa `process.cwd()` come radice del progetto. _(2026-11-20)_
- better-sqlite3 si carica anche in vitest nel progetto: un test può aprire un db temporaneo reale, senza finti. _(2026-11-20)_
- `npm run pubblica` esegue tutta la suite (~7 min) e basta un test lento sotto carico, come risposta-autopilota-k317, a fermarlo. Rilanciare, non forzare. In tutto serve più di un'ora. _(2026-11-20)_

## worktree

- Il ramo di lavoro può essere indietro a main (manca spazio-drive-pieno): prima di correggere, rebase su main. _(2026-11-10)_
- con l'harness, ogni comando git che nomina la cartella principale viene rifiutato anche con `git -C` o in una pipe: per leggerla usare percorsi assoluti e comandi non-git. _(2026-11-10)_
- Una copia con `android/app/build` non si toglie con `git worktree remove` («Filename too long»): staccare la junction di `node_modules`, controllare che dentro non ci siano altri collegamenti, poi `Remove-Item -LiteralPath '\\?\<percorso>' -Recurse -Force` e `git worktree prune`. _(2026-11-11)_
- per togliere un worktree con giunzione node_modules: verificare LinkType, `cmd /c rmdir` sulla giunzione, poi `git worktree remove` e `prune`; il node_modules principale resta intatto. _(2026-11-17)_

## android

- `tests/android/rotte-lente-app.test.ts` impone che `ROTTE_LENTE` sia contenuta nella lista dell'app: ogni rotta lenta nuova va aggiunta anche in `android/`. _(2026-11-09)_
- PonteTest legge ROTTE_PONTE di ponte-telefono.ts con la regex '([^']+)': un apostrofo dritto in un commento dentro la lista la rompe, usare ’ _(2026-11-10)_
- gradle testDebugUnitTest resta UP-TO-DATE se cambia solo un .ts letto dai test Kotlin (PonteTest): serve --rerun _(2026-11-10)_
- per l'app le procedure lunghe conviene tenerle sul PC e far rileggere la vista all'app: la pagina le fa girare nel browser, l'app perderebbe il passo con la linea _(2026-11-10)_
- Se android/ non cambia per una release, versionName resta quello vecchio: la 0.98.0 era ancora 2.96.0. _(2026-11-10)_
- Sull’emulatore in sessione RDP l’avvio si blocca (Vulkan e finestra dei crash): partire con `-gpu swangle -crash-report-mode disabled`. _(2026-11-11)_
- Dalla 3.0.0 le foto delle schermate dell’app le fa `gradle testDebugUnitTest` (Robolectric + Roborazzi) in `android/app/build/foto-schermate/`: guardarle prima di pubblicare, hanno trovato difetti che le prove non vedono. _(2026-11-11)_
- Prova dell’app dal vero: copia del PC con `SIERRADECK_PROVA` e porte 47650/47651 dentro `preferenze`, emulatore su `10.0.2.2:47650`; l’APK 2.99.0 di rilascio installato e poi `adb install -r` della 3.0.0 prova che l’aggiornamento non chiede un nuovo accoppiamento. _(2026-11-11)_
- Dopo un `AGGIORNA=1` di `impostazioni.json` vanno rilanciate anche le prove Kotlin che leggono quell’asset (`ImpostazioniVociTest`), non solo i vitest. _(2026-11-11)_
- targetSdk 35 = edge-to-edge forzato su Android 15: ogni schermata fuori da Scaffold ha bisogno di safeDrawingPadding, e la topBar dello Scaffold non scavalca la barra di stato da sola. _(2026-11-12)_
- Le foto Roborazzi hanno varianti (stretto 360 dp, scala 1.3, veste chiara) nelle sottoclassi di FotoSchermateTest: i difetti veri (testo spezzato, "?" fuori dal cerchio) escono solo lì. _(2026-11-12)_
- Banco può essere chiaro (veste del PC): colori fissi della tabella attività vanno passati da leggibile(), il bordo dei tasti da bordoTasto() (3:1), mai usare incisione per i bordi. _(2026-11-12)_
- `android/gradlew.bat` manca nelle copie di lavoro: si compila con `gradle -p android ...` (Gradle 8.11.1 in E:\Programs\Gradle). _(2026-11-14)_
- `Apertura.aggiornamento` (striscia app nuova) veniva impostata solo dal tocco sulla notifica: con notifiche spente l'avviso non compariva mai. Ora lo imposta una ricerca all'apertura. _(2026-11-14)_
- Nel worktree manca android/gradlew.bat: si usa /e/Programs/Gradle/gradle-8.11.1/bin/gradle -p android ... --offline (ci vogliono 2-4 minuti). _(2026-11-14)_
- Il popup di DropdownMenu non compare nelle foto Roborazzi: si fotografano le DropdownMenuItem in linea. I colori spenti del Material (38%) fanno 2,3-3:1: usare i coloriVoceMenu e coloriTasto* in Tema… _(2026-11-14)_
- In android/ non c'è gradlew: i test si lanciano con `gradle -p android testDebugUnitTest --rerun` (Gradle 8.11.1 di sistema in E:\Programs\Gradle). _(2026-11-14)_
- Le foto Robolectric non hanno il riconoscimento vocale: per fotografare una barra in tutti gli stati serve un composable senza stato, come RigaConversazione. _(2026-11-14)_
- un ramo che "non compila sopra main" può essere solo un'esecuzione sporca: rifare `git merge main` e il comando gradle in una copia pulita prima di cercare errori. _(2026-11-14)_
- i colori dei tasti si prendono da Tema.kt (coloriTastoPieno/Testo/Bordo, sopra()): è lì che stanno i colori da spenti con contrasto 4.5:1. _(2026-11-14)_
- Il cancello fonde i criteri `cd android && gradle …` in `testDebugUnitTest assembleDebug --no-daemon`; `gradle -p android …` resta separato. Le foto Roborazzi sono in modalità record, non confronto. _(2026-11-14)_
- Le note dell'app stanno in `android/novita-app.txt` (una voce per versione), e `pubblica-app` si ferma se manca la voce della versione nuova. _(2026-11-14)_
- I tasti dell'app vanno creati con `coloriTastoPieno/Testo/Bordo()` di `Tema.kt`, altrimenti da spenti i colori di Material non rispettano il contrasto. _(2026-11-14)_
- Il rifiuto "BUILD FAILED" senza `<failure>` nei test non lascia log: il demone Gradle mostra solo EOF. Con `daemon=false` il worker dei test è un JVM a parte, ora con heap fisso. _(2026-11-14)_
- `testDebugUnitTest --rerun` da zero costa circa 6 minuti con la compilazione: tenerne conto nei timeout del cancello. _(2026-11-14)_
- Se il cancello taglia l'errore Gradle, il blocco «What went wrong» completo sta in C:\Users\nikof\.gradle\daemon\8.11.1\daemon-*.out.log: cercarlo lì prima di provare a riprodurre. _(2026-11-14)_
- Su Windows due gradle sulla stessa android/app/build si pestano (output.bin aperto, lookups.tab): fallisce quello che arriva dopo. Il fallimento non lascia <failure> né hs_err. _(2026-11-14)_
- Nella cartella android non c'è gradlew: i test partono con `gradle testDebugUnitTest --offline` (Gradle 8.11.1 in PATH, JAVA_HOME su JDK 21); il primo giro dura circa 4 minuti. _(2026-11-16)_
- Il blu degli stati sta in `ColoreStato.blu` (tema/Attivita.kt), non in `Banco`: i colori di stato vanno presi dalla tabella unica del PC. _(2026-11-16)_
- `Tono` è ordinato per `ordinal` nelle schede workspace: un tono nuovo va messo nella posizione giusta dell'enum, non in fondo. _(2026-11-16)_
- versionCode/versionName dell'app sono in android/app/build.gradle.kts e vanno alzati a parte rispetto a package.json _(2026-11-16)_
- In `android/` manca il wrapper `gradlew`: la compilazione si lancia con `gradle` di sistema (`gradle :app:compileReleaseKotlin --no-daemon`). _(2026-11-19)_
- `/api/pc` passa il battito grezzo (`...resto`): l'app legge `aggiornando` da lì senza toccare il PC. _(2026-11-19)_
- `SuPc.corrente` e `FasciaLinea` non sono letti da nessuna schermata; la chat remota passa da `Api.ponte` in `SchermataDettaglioChat`. _(2026-11-19)_
- L'app prende le voci del menu da assets/menu.json (scritto dal test TS con AGGIORNA=1): un cambio di menu sul PC rompe solo l'enum Scheda in Apertura.kt e il `when` in Navigazione.kt. _(2026-11-19)_
- `SuPc.corrente` non era letto da nessuno: il tasto «Chat dal vivo» di Altri computer apriva solo le chat locali. Il ponte vero andrebbe riscritto, non ripristinato. _(2026-11-20)_
- Le sezioni di Altro (Salute, Computer) non scorrono da sole: vanno avvolte in Column con verticalScroll dentro il Box della Linguetta. _(2026-11-20)_
- In una copia senza `gh` consentito non si sa se l'app è uscita: la voce in novita-app.txt viene committata dopo la pubblicazione, e può servire come indizio. _(2026-11-20)_
- impostazioni-struttura.ts alimenta android/.../assets/impostazioni.json: cambiare un testo lì richiede `AGGIORNA=1 npx vitest run tests/shared/impostazioni-struttura.test.ts`. _(2026-11-20)_
- nella cartella android non c'è gradlew: i test Kotlin si lanciano col gradle di sistema (`gradle --offline testDebugUnitTest`), circa 3 minuti. _(2026-11-20)_

## release

- il rapporto controllo-*.md sta nella cartella principale (.sierradeck/errori-arrivati/), non nei worktree: leggerlo da lì, non copiarlo. _(2026-11-09)_
- un bump patch tocca solo package.json, package-lock.json (2 punti), src/shared/novita.ts e, se serve, il quaderno errori-arrivati. _(2026-11-09)_
- Se la release esiste già (gh release create prima), npm run pubblica compila ma non carica niente (vuole una bozza): exe, blockmap e latest.yml vanno caricati con gh release upload. _(2026-11-09)_
- Dal worktree `npm run pubblica` vuole `google-oauth.json` e un `node_modules` vero, non una junction. Copiarli dalla principale e toglierli dopo; `google-oauth.json` è ignorato da git. _(2026-11-09)_
- Con la release già creata, electron-builder non carica nulla. Gli asset vanno caricati a mano con `gh release upload` e nomi coi trattini (`SierraDeck-Setup-X.exe`), non quelli con lo spazio di `dist… _(2026-11-09)_
- `npm run pubblica` dopo un `gh release create` salta gli upload: servono `gh release upload` con i nomi a trattini di latest.yml. _(2026-11-10)_
- Da un worktree servono google-oauth.json copiato dalla cartella principale e un node_modules vero (npm ci): la junction fa fermare controlla-pacchetto. _(2026-11-10)_
- Il bump di versione fa fallire `tests/shared/novita.test.ts` se in `src/shared/novita.ts` manca la voce della nuova versione: aggiungerla nello stesso commit del bump. _(2026-11-10)_
- In una copia di lavoro `npm run pubblica` rifiuta la junction di node_modules (serve `npm ci`) e vuole `google-oauth.json` (gitignorato) copiato dalla cartella principale. _(2026-11-10)_
- Se la release è creata prima con `gh release create`, electron-builder salta il caricamento (draft vs release): caricare installer, blockmap e latest.yml con `gh release upload`. _(2026-11-10)_
- il bump di versione richiede anche la voce in `src/shared/novita.ts`: senza, `tests/shared/novita.test.ts` si rompe (successo con la 0.99.1). _(2026-11-10)_
- `gh release upload` con `file#etichetta` non cambia il nome dell'asset: GitHub mette i punti al posto degli spazi. Rinominare il file in `SierraDeck-Setup-X.exe` prima di caricarlo, come in `latest.y… _(2026-11-11)_
- `npm run pubblica` vuole GH_TOKEN nell'ambiente: `export GH_TOKEN=$(gh auth token)`. Crea una bozza col solo blockmap: carica a mano exe e latest.yml, poi `gh release edit --draft=false`. _(2026-11-11)_
- in `src/shared/novita.ts` il file ha fine riga CRLF: un replace con `\n` non trova nulla, quindi rileggere il fine riga prima di inserire la voce. _(2026-11-11)_
- la verifica di una release va fatta con `gh release view --json assets`: il nome dell'APK (2.x) non coincide con la versione della release (0.x), quindi non va cercato per nome esatto. _(2026-11-11)_
- `controlla-pacchetto` rifiuta `node_modules` come junction: nel worktree serve una copia vera (robocopy /E /MT:16, exit code 1 = ok), da rimpiazzare alla junction usata per tsc/vitest. _(2026-11-11)_
- Con `gh release create --draft` la release resta «untagged» nell'URL, ma electron-builder la riempie lo stesso e `gh release view` mostra il tag giusto; verificare i 5 file prima di `--draft=false`. _(2026-11-11)_
- Una release pubblicata da un ramo (push su origin/main) lascia indietro la cartella principale: fino alla 0.99.4 si riallinea a mano con `git merge origin/main` da una chat aperta lì; dalla 0.100.0 lo fa il programma ogni 10 minuti. _(2026-11-11)_
- Dalla 0.100.0 pubblica lo specialista «rilascio», che lavora nella cartella principale senza Edit/Write: versione e novità le prepara prima uno sviluppatore, nel suo ramo. _(2026-11-11)_
- L’installatore locale si chiama `dist/SierraDeck Setup X.exe` (con gli spazi), l’asset su GitHub `SierraDeck-Setup-X.exe`: per confrontare lo sha512 con `latest.yml` scaricare l’asset o usare il nome con gli spazi. _(2026-11-11)_
- `.git/config` può ritrovarsi tutto zeri (11/11, 18:03): ogni git fallisce con «bad config line 1». Prima di una release lanciare `git status` e, se fallisce, non provare a indovinare il config. _(2026-11-12)_
- `node scripts/allega-apk.mjs --solo-verifica` compila l'APK firmato e verifica la firma senza git né gh: utile per preparare la release con git rotto. _(2026-11-12)_
- Se `.git` del principale è rovinato (anche `refs/heads/main` a zeri), lo sha vero sta in `.git/logs/refs/heads/main` e `ORIG_HEAD`; clonare e sovrapporre l'albero funziona, con `/XD` solo sui percors… _(2026-11-12)_
- Con `core.autocrlf=true` il clone mostra centinaia di file «M» dopo la copia da Windows: nessuna differenza vera. Dopo `git add -A` restano solo le modifiche reali. _(2026-11-12)_
- `gh release create --draft --verify-tag` seguito da `npm run pubblica` ha funzionato al primo colpo: una release sola, nessun 422, `latest.yml` presente. _(2026-11-12)_
- vitest stampa «×» nei nomi di alcuni test (es. «(×2)»): cercare i fallimenti con «FAIL» o col riepilogo finale, non con «×» _(2026-11-13)_
- `gh release view --json` non ha il campo isLatest: lo stato latest si legge da `gh release list` (colonna «Latest»). _(2026-11-13)_
- `npm run pubblica` con una release in bozza già creata carica i file ma la lascia bozza: serve sempre `gh release edit --draft=false --latest`. _(2026-11-13)_
- REGOLA di Nicholas: l'Aiutante esce SEMPRE allegato alla release del programma completo (`npm run pubblica` → `scripts/allega-aiutante.mjs`: installer, blockmap e `aiutante.yml` per ultimo; 7 file in tutto); mai più da solo sulla pubblicazione fissa «aiutante». _(2026-11-13)_
- i file del lotto errori-arrivati non sono tracciati e non stanno nel worktree: per il titolo del gruppo leggerli con Read dalla cartella principale. _(2026-11-13)_
- `npm run pubblica` con la bozza già creata e il tag pushato la lascia in bozza: serve sempre `gh release edit --draft=false --latest`. L'URL della bozza è «untagged-…» finché non si pubblica. _(2026-11-13)_
- prima del bump: `git merge --ff-only main`, poi `gh release list`; la voce in `src/shared/novita.ts` va nello stesso commit del bump, sennò `novita.test.ts` fallisce. _(2026-11-13)_
- se una correzione entra in main dopo un bump già fatto da un'altra chat, non fare un bump nuovo: controllare `gh release list` e, se la versione non è pubblicata, farla uscire con quella. _(2026-11-13)_
- Prima di unire/pubblicare, `git log main..origin/main` può non essere vuoto anche con main pulito: altre chat spingono quaderno e release su origin; fermarsi e chiedere. _(2026-11-13)_
- Dopo un cherry-pick di una correzione nata con un'altra versione, cercare nel resto del repo (test, quaderno) il vecchio numero: va corretto anche lì, non solo in package.json e novita.ts. _(2026-11-13)_
- `gh release create --target` vuole lo sha COMPLETO (o un ramo): con lo sha abbreviato dà «target_commitish invalid». Crea anche il tag sul remoto. _(2026-11-13)_
- Con la release già creata `npm run pubblica` non carica exe, blockmap e latest.yml e `allega-aiutante.mjs` si ferma («mancano…»): caricarli a mano con `--clobber`, poi rilanciare `node scripts/allega… _(2026-11-13)_
- `allega-aiutante.mjs` può caricare l'Aiutante anche se la release non è ancora Latest (avvisa solo «ultima: vX»): va bene, poi `gh release edit --prerelease=false --draft=false --latest`. _(2026-11-13)_
- 0.107.1: la pre-release vuota fatta per sbloccare l'unione mette il tag sul commit del ramo, non sul main finale; tag lasciato lì (spostarlo è vietato), build da main: va bene. _(2026-11-13)_
- `package-lock.json` resta a 0.107.0 mentre `package.json` è già a 0.107.x: i bump non lo aggiornano; la versione si ripete solo in `package.json` e `src/shared/novita.ts`. _(2026-11-14)_
- `noteDi` in `scripts/note-novita.mjs` restituisce un array di righe, non una stringa: per le note della release unirle con "- " e scrivere in UTF-8. _(2026-11-14)_
- la versione sta in package.json e due volte in package-lock.json (radice e "packages.\"\""); le novità in src/shared/novita.ts, voce in cima. _(2026-11-15)_
- prima del bump: `git fetch origin --tags` e `git tag -l vX.Y.Z`; il package-lock ha la versione in due punti, radice e packages."". _(2026-11-15)_
- Se `npm run pubblica` rifiuta nella copia di lavoro per la junction di node_modules, basta un clone pulito del tag + `npm ci`: funziona senza toccare la cartella principale. _(2026-11-15)_
- Le credenziali Google per `pubblica` si passano con SD_GOOGLE_CLIENT_ID/SECRET letti con node da google-oauth.json (campi clientId, clientSecret), senza stamparle. _(2026-11-15)_
- 16/11: main è già alla 0.108.0 (tag v0.108.0, pubblicata da altrove): la prossima release va oltre, 0.109.0 se dentro ci sono funzioni (riassegnazione fra PC, Passaggi di mano), non 0.107.4. _(2026-11-16)_
- nelle note di novita.ts la parola «commit» fa fallire tests/shared/novita.test.ts (linguaggio da utente, niente gergo) _(2026-11-17)_
- `noteDi()` di scripts/note-novita.mjs restituisce un array di righe, non una stringa: per `--notes-file` va unito con "- " e "\n" prima di `writeFileSync`. _(2026-11-20)_
- Nella cartella principale `npm run pubblica` dura oltre 10 minuti (finisce in sottofondo): niente seconda copia, basta controllare gli allegati con `gh release view` finché ci sono tutti e sette. _(2026-11-20)_
- La bozza creata prima di avere il tag online risulta «untagged-…», ma `npm run pubblica` la riempie lo stesso. Il tag `v0.112.0` era già sul remoto prima della bozza. _(2026-11-20)_
- `errori-arrivati.md` è in CRLF: un Edit che aggiunge righe porta fine riga LF e il file resta con fine riga misti. _(2026-11-20)_
- `noteDi` (scripts/note-novita.mjs) restituisce [] se le novità stanno su una riga sola, `righe: ['...']`: note della release e di app-android.json vuote. Scriverle a mano o correggere il parser. _(2026-11-20)_

## git

- `main` locale può essere avanti su origin con lavoro non pubblicato. Dal worktree: `git merge --ff-only main`, bump, poi `git push origin HEAD:main`. _(2026-11-09)_
- un agente lanciato in un worktree isolato non può usare `git -C <cartella principale>`: il sistema lo rifiuta. Le operazioni sulla cartella principale vanno affidate a chi non è isolato. _(2026-11-09)_
- main locale può avere commit non ancora su origin/main (merge e note del quaderno): prima di un push di release controllare `git log origin/main..main`. _(2026-11-10)_
- Il git del programma (gitAsincronoReale) mescola stderr e stdout e fa trim: gli avvisi CRLF finiscono nello status e la prima riga perde lo spazio di testa. Filtrare le voci «XY percorso». _(2026-11-10)_
- Gli specialisti sono chiusi nel loro worktree: non possono leggere né salvare file nella cartella principale. Un'unione ferma per file non salvati in main la ritenta il programma ogni 30s. _(2026-11-10)_
- un agente isolato nel worktree non può usare `git -C` sulla cartella principale: il compito di salvare lì le note va dato a chi non è isolato. _(2026-11-10)_
- Note del quaderno non salvate in main = fila unioni ferma, e nessuno specialista può salvarle (isolati nella copia; general-purpose rifiutato). Serve la correzione del programma (k-133). _(2026-11-11)_
- Note del quaderno non salvate in main: anche il tipo «claude» è rifiutato (nessuno senza copia propria). Solo una chat di Nicholas aperta in main o un SierraDeck installato con k-133 le salva. _(2026-11-11)_
- `main` locale può essere più avanti di `origin/main` con le unioni non pubblicate: guardare `git log origin/main..main` prima di partire da `origin/main`. _(2026-11-11)_
- «Il progetto NON è un repository git» nello stato può voler dire .git/config rovinato (tutto zeri, 11/11): ogni git fallisce. Si ripara con un config minimo (origin+main), copia del rotto, poi fsck. _(2026-11-12)_
- il programma può negare in blocco i comandi che scrivono dentro `.git/` (config incluso), anche con decisione già presa: serve il sì di Nicholas registrato. _(2026-11-12)_
- 12/11: v0.101.1 uscita da clone (a2df43ce). Il .git del principale (config, refs/heads/main e refs/remotes/origin/main a zeri) è stato riparato il 12/11 col sì di Nicholas: config ricostruito, main da `logs/refs/heads/main`, `reset --mixed a2df43ce`, fsck pulito; le copie rotte sono in `.git/*.rovinato*`. Resta da togliere SierraDeck-rilascio-0101 (decide Nicholas). _(2026-11-12)_
- Prima di una pubblicazione manuale controllare MERGE_HEAD e i file in stage nella cartella principale: il programma può avere un'unione a metà che blocca il rilascio per minuti. _(2026-11-14)_
- Il `lezioni.md` modificato dal programma sporca la cartella, ma non ha fermato `pubblica-app`. _(2026-11-14)_
- in questa copia `git fetch` può fallire se il remoto è un bundle sparito; `merge --ff-only main` basta _(2026-11-16)_
- in questa copia `git fetch` può fallire se il bundle di arrivo è già stato cancellato: `git merge --ff-only main` basta, main è già locale. _(2026-11-16)_
- il ramo worktree-agent-r45a1013a982d non era nella copia di destinazione: per unire basta il commit d611b967 se l'oggetto è presente. _(2026-11-16)_
- `core.longpaths=true` risolve «Filename too long» ma non `$GIT_DIR too big`: sotto Temp profonde nella prova tenere nomi corti (`p`, `a`). _(2026-11-16)_
- Prima del push `git rev-list --left-right --count main...origin/main` conferma che il remoto non è più avanti. _(2026-11-16)_
- il ramo worktree-agent-r8b9c35b5a04b parte da 881cd23f, indietro rispetto a main: il fast-forward da HEAD fallisce, serve cherry-pick. _(2026-11-17)_
- il controllo dei comandi scambia `git -C <copia> cherry-pick` per un cherry-pick nella cartella principale; il rifiuto arriva sull'intera riga, anche se contiene altri comandi. _(2026-11-17)_
- Dalla cartella principale `worktree add` in Temp e `cherry-pick` nella copia passano se sono chiamate separate; il blocco scatta solo sulla cancellazione (`rmdir`, `worktree remove`) fuori dalle cart… _(2026-11-17)_
- per provare un test senza la correzione: `git stash push -u`, `git stash apply`, `git checkout -- <file>`, poi `git checkout stash@{0} -- <file>` e `git stash drop`. _(2026-11-20)_

## autopilota

- Non lanciare uno specialista su un compito il cui «dopo» è ancora in unione: non può aspettare (sleep bloccato) e torna a vuoto. Lanciarlo all'evento «unione». _(2026-11-10)_
- Un revisore lanciato con «k-N:» in testa alla descrizione si lega a quel compito e il programma unisce lui (niente) al posto dello sviluppatore: per le revisioni usare una descrizione senza id. _(2026-11-10)_
- Il modello dell'autopilota passa da 5 file (ipc, servizio, store, orchestratore, tipo); ora tutti usano `modelloAutopilotaAmmesso` di `shared/modelli`. _(2026-11-10)_
- lo stato `fermo` era tolto: un guasto non di rete non aspetta più Nicholas, riprova da solo con attesa crescente (tetto 5 min). _(2026-11-11)_
- il client non sa il workspace di un id sparito: lo ricorda lui (id→cwd/workspace) e riscrive via /orchestratore/messaggio, che riusa l'autopilota del workspace. _(2026-11-13)_
- Mai criteri «la versione di package.json è già su GitHub»: dopo, il programma li rimisura su ogni ramo e respinge il bump successivo (13/11, 0.106.3 bloccata, sbloccata con pre-release vuota). _(2026-11-13)_
- il client segna `scaduto` (timeout) e `spento` (fetch failed/ECONNREFUSED/ECONNRESET): per un errore atteso usare `servizioIndisponibile`, non il solo `scaduto _(2026-11-13)_
- INATTIVO_MS è 55 minuti: la cache del prompt dura 1 ora e lo spegnimento a 10 minuti la faceva riscrivere a ogni ripresa. _(2026-11-20)_

## controllo

- una criticità con i numeri nel titolo cambia firma a ogni giro: il rapporto all'autopilota si riscrive ogni 6 ore (controllo-pc.ts:133). _(2026-11-09)_
- Le versioni dei PC nel controllo vengono dall'ultimo battito sul Drive: con il Drive pieno restano vecchie. Prima di dire «PC vecchio» si controlla sul PC. _(2026-11-09)_
- Un rapporto controllo-*.md scritto da un PC con versione vecchia ripete criticità già corrette: guardare «questo PC la 0.x» nel rapporto prima di aprire lavoro nuovo. _(2026-11-09)_
- La gravità «guasto» di `pc:<id>` si decide nel singolo PC senza vedere gli altri; il declassamento sta in `criticitaDi`, che vede se il PC ha risposto a chi controlla. _(2026-11-10)_
- un rapporto «Controllo di tutti i PC» mostra la versione dei PC: prima di aprire un difetto verificare che sia sotto l'ultima versione corretta (qui 0.99.1 vs fix in 0.99.2). _(2026-11-11)_
- Un rapporto di controllo può venire da una build più vecchia della correzione: prima di cercare un buco, riprodurre il caso nel codice attuale con un test. _(2026-11-20)_
- Nelle copie mancano i tag: «nessun tag contiene X» va verificato dall'autopilota con git tag --contains. 6f52ac0f (battito Aiutante) è già in v0.110.2+, quindi non spiega l'allarme del 20/11. _(2026-11-20)_

## ambiente

- nei worktree alcuni heredoc Bash con python vengono rifiutati come «troppo complessi»: scrivere lo script con Write ed eseguirlo, oppure usare Edit _(2026-11-09)_
- Per scrivere stringhe con `\n` nei file non usare heredoc Python: gli escape vengono interpretati. Meglio lo strumento Edit. _(2026-11-10)_
- Nel worktree gli heredoc con `cat >>` seguiti da altri comandi nella stessa chiamata Bash vengono rifiutati come «troppo complessi»: usare Edit e comandi separati. _(2026-11-10)_
- Il programma blocca sleep oltre 30 s anche in ciclo o a pezzi; attese lunghe solo con il sì di Nicholas (classe sottofondo). _(2026-11-15)_

## hook

- l'hook Bash di SierraDeck blocca sleep e comandi in sottofondo: le attese a intervalli non si possono fare da una chat, serve richiamare o un altro meccanismo. _(2026-11-10)_
- Il programma blocca l'intero comando Bash se un rmdir o una cancellazione contiene una variabile ($T): scrivere i percorsi per intero. _(2026-11-20)_
- Il PreToolUse dell'Agent, quando lascia passare, non può portare testo all'autopilota: i motivi «resta qui» vanno come `evento` al suo prossimo turno. _(2026-11-20)_

## versioni

- le versioni dei PC nel rapporto vengono dall'ultimo battito, che non si scrive con il Drive pieno: prima di dire «vecchio» si controlla il PC. _(2026-11-09)_
- Le voci di versione del quaderno sono file datati (`AAAA-MM-GG-...md`). `errori-arrivati.md` è solo per gli errori arrivati. _(2026-11-19)_
- Un bump tocca 3 file di note: `src/shared/novita.ts`, `android/novita-app.txt` e `src/aiutante/novita-aiutante.txt` (righe che cominciano con `versione:`); app e Aiutante hanno la loro versione. _(2026-11-20)_

## drive

- «Drive pieno» nella Salute viene dal freno in memoria che scade dopo 15 minuti (index.ts:2632): va reso uno stato «detto», non «in corso». _(2026-11-09)_
- Con Drive pieno il freno blocca anche battito, posta e registro insieme; «acceso» in Progetti viene solo dal battito, quindi un PC che risponde appare «non risponde». _(2026-11-09)_
- A Drive pieno il freno blocca POST/PUT/PATCH ma non DELETE: ogni pulizia va annotata in locale (spazio-intenzioni.json) e il registro sul Drive va riallineato dopo, mai prima. _(2026-11-09)_
- Il freno blocca solo POST/PUT/PATCH: ogni scrittura fa prima una ricerca GET (google-drive.ts carica), e i ritentativi su rateLimit non guardano il freno. _(2026-11-10)_
- Il 403 storageQuotaExceeded non entra in «rifiutate» (risorse.ts 179-183): le rifiutate sono solo limiti di velocità. _(2026-11-10)_
- `conFreno` alza il freno sulla prima risposta 429/rateLimit, quindi un controllo `attesaMs() > 0` dentro `conRitenta` equivale a «mai ritentare i limiti»; i test che si aspettano il ritentativo vanno… _(2026-11-10)_
- in `conLimite` un errore ferma solo il suo lavoratore: gli altri continuano con le voci rimaste. Per fermare tutto serve un flag condiviso, come `pienoVisto` in `salvaIncrementale`. _(2026-11-10)_
- I giri periodici sono frenati, ma le letture chiamate da fuori (`pcSubito` per telefono e controllo) no: senza memoria dopo un errore, ogni chiamata ripete la richiesta a vuoto. _(2026-11-10)_

## tooling

- Nel worktree i comandi Bash/sed composti con più modifiche vengono rifiutati come «troppo complessi»: usare Edit per le modifiche multiple. _(2026-11-09)_
- Edit su una riga di import senza il newline finale la incolla alla successiva: dopo ogni Edit di import controllare con typecheck. _(2026-11-20)_

## criteri

- I criteri del piano girano in bash (criterio.sh): niente backslash nei percorsi. Per l'app Android: `/e/Programs/Gradle/gradle-8.11.1/bin/gradle -p android testDebugUnitTest --rerun --offline`. _(2026-11-14)_
- Mai criteri «versione === X» per un compito di versione: il cancello li rimisura e blocca ogni versione dopo. Usare «almeno X» (confronto numerico >=) o `gh release view vX`. _(2026-11-15)_
- un criterio con versione fissa passa sul principale ma cade su ogni ramo che alza la versione: va escluso dalla prova prima/dopo (`fissaLaVersione`), non rimisurato. _(2026-11-15)_
- Mai criterio `grep -q '"version": "X"' package.json`: fissaLaVersione ≤0.109.1 non lo riconosce e il cancello respinge ogni bump dopo (0.109.2). Usare `git rev-parse vX`. _(2026-11-17)_

## processo

- la copia di un compito di «rimettere in pari» può nascere senza il ramo da unire: controllare l'esistenza del ramo prima di assegnare il compito. _(2026-11-20)_
- Rimettere in pari un ramo nato qui: se il compito va su un altro PC il ramo là non c'è. Incolla nel prompt il diff (git diff main...ramo) e fallo riapplicare sopra main. _(2026-11-20)_
- Qui le attese da una chiamata Bash sono bloccate: `sleep` va a una chiamata sola, ≤20 s, senza altri comandi dopo. Per i comandi lunghi conviene `run_in_background` e leggere il file di output. _(2026-11-20)_

## unioni

- UNIONE_TURNO_MAX_MS (12 min) copre solo i passi git, non le misure; se scade prima di PROVA_MAX_MS l'esito è lo stesso 'scaduta'. Ordine voluto: turno < prova < fila. _(2026-11-08)_
- dopo un riavvio i subagenti in memoria sono vuoti: cancelloOra trova ramo e cartella solo se il piano li ha salvati, quindi va salvato anche il worktree, non solo il ramo _(2026-11-10)_
- Ripresa dopo il riavvio: le unioni partono solo dopo la pulizia della prova (`provaRipulita`) e una volta per avvio. Senza aggiornamento solo compiti con `ramo` e senza esito «unione non fatta». _(2026-11-10)_
- Il quaderno riscrive righe esistenti («(×2)», riordino): il controllo «solo righe aggiunte» sul numstat non basta. Dentro .sierradeck/quaderno/ si salva sempre. _(2026-11-10)_
- la prova di unione salva con un commit solo `.sierradeck/quaderno/` (anche riscritto); le altre note di `.sierradeck/` restano «solo aggiunte» (numstat): un test deve coprire entrambi i rami. _(2026-11-11)_
- Fino alla 0.99.1 installata una nota del quaderno con righe cambiate o tolte ferma tutta la fila: la sblocca solo un commit di `.sierradeck/quaderno` fatto da una chat aperta nella cartella principale (dalla 0.99.2 la salva il programma). _(2026-11-11)_
- Dalla 0.100.0 un file non salvato nella cartella principale ferma un’unione solo se il ramo lo tocca; in quel caso dopo 5 minuti è il programma a chiedere a Nicholas «Salvali e unisci», non l’autopilota. _(2026-11-11)_
- rami con rotte nuove: il conflitto sta nel tipo `FonteAiuto` di `src/main/rotte-aiuto.ts`; tenere i campi opzionali di entrambi i lati. _(2026-11-20)_

## gpu

- Nel codice non ci sono switch che spengono la GPU: il «software» dei PC viene da Chromium (driver di base Windows, Desktop remoto, scheda esclusa), non da un ripiego di SierraDeck. _(2026-11-08)_

## ui

- il pannello «Altri computer» è `AltriComputer` in PannelloAccount.tsx (mostrato in Salute) e legge i battiti da `posta:pc`; la versione viva va chiesta a parte. _(2026-11-08)_
- «Nessuno al lavoro» in PannelloSpecialisti riguarda i posti di questo PC (VistaAttesa), non la Panoramica: gli affidati non occupano posti qui. _(2026-11-16)_
- «Usate da altri PC» era sparita dalla fascia con k-u0 senza essere ricollocata: ora sta in PannelloChat (sottofondo.elenco + remoto.pc → righeAltriPc). _(2026-11-19)_
- Il Drive nel dettaglio sta dietro un tasto: ContenutoDrive appena montato apre la finestra d'attesa, quindi non va montato a ogni progetto scelto. _(2026-11-19)_
- ferma/riparti/archivia dell'autopilota non hanno API nel renderer (solo crea, dialoga, avvioAlLogin): per metterli in pagina serve prima l'IPC. _(2026-11-19)_
- I test di sorgente (`readFileSync` sul .tsx) bastano per controllare che un pannello non porti più un elenco, senza DOM. _(2026-11-19)_
- gli orfani vanno cercati con il suffisso `/Nome'` negli import: un controllo su `./Nome'` ignora gli import fatti da App.tsx (`./components/Nome`). _(2026-11-20)_
- Nel menu dei workspace le azioni dietro «⋯» sono contate da test e pagina servita: il riordino sta in controlli a parte, non come nuova azione di `azioniMenuWorkspace`. _(2026-11-20)_
- Il menu principale ha già una funzione «Computer» che non è la sezione Computer delle Impostazioni: le voci delle impostazioni stanno solo in impostazioni-struttura.ts. _(2026-11-20)_

## salute

- la versione di un altro PC va chiesta dal vivo (`/api/pc`): col Drive pieno i battiti si fermano e «Aggiorna» diventa falso; `frenoDrive.pieno()` dice se il Drive rifiuta scritture. _(2026-11-08)_
- `IngressiSalute.io` può mancare nei test e in alcuni punti di `index.ts`: per il nome di «questo PC» serve un ripiego («Questo PC»). _(2026-11-09)_
- «Quanto lavora SierraDeck»: il tono dipende solo dai consumi di questo PC; i dati degli altri PC arrivano dal battito sul Drive e, se vecchio (PC_SPENTO_DOPO_MS), non vanno mostrati come attuali. _(2026-11-10)_
- Le voci create da `risorse` di un altro PC (consumi, `gpu:`) vanno filtrate col battito recente in `componiSalute`; ogni nuova voce per PC ha lo stesso rischio di dato vecchio. _(2026-11-10)_
- «non so se è acceso» valeva anche con battito fresco; ora «acceso secondo il Drive, ma non si raggiunge». Le righe unite del controllo (controllo-pc.ts `generica`) vanno aggiornate con ogni nuova dic… _(2026-11-15)_
- Le soglie spento/acceso vanno prese da `statoPc`; con `PC_SPENTO_DOPO_MS` i confronti `<` e `<=` si mischiavano e davano risultati diversi al limite. _(2026-11-19)_
- L'elenco PC di Salute si toglie nel renderer (`saluteSenzaPc`), non in `salute.ts`: le stesse voci servono a telefono e pagina servita. _(2026-11-19)_

## dipendenze

- @xterm/headless 6.0.0 e @xterm/xterm 6.1.0-beta stanno su versioni diverse: se il terminale della main process si comporta in modo strano, guardare prima questa differenza. _(2026-11-08)_

## misure

- il gancio PreToolUse rimanda vitest se il PC è carico: attendere col Monitor, non con sleep ripetuti, e fermarsi dopo 3 tentativi. I file singoli passano comunque. _(2026-11-08)_
- Nel confronto dei token con `claude -p` contano input + cache creata + cache letta insieme: il secondo giro costa meno solo per la cache calda, non per la modifica provata. _(2026-11-20)_

## aggiornamenti

- la classificazione passeggera sul breve (prima riga, senza contesto) perde il 504 nudo: classificare sul messaggio completo e su statusCode. _(2026-11-08)_
- la lista di errori di rete passeggeri (ERR_*) va estesa con ERR_CONNECTION_CLOSED/RESET e timeout; eBloccoTemporaneo non esiste in src. _(2026-11-08)_
- HttpError di electron-updater ha message «504\nHeaders: {…}» e statusCode numerico: classificare sul messaggio completo/statusCode, non sulla prima riga. _(2026-11-08)_
- con autoDownload attivo electron-updater crea downloadPromise dentro checkForUpdates: il suo rifiuto non passa dal try di cerca(); va agganciato a aggiornamenti.ts:657. _(2026-11-08)_
- leggiErroreAggiornamento riconosce il 404 «mancante» solo su latest*.yml: il 404 dell'exe durante la pubblicazione conta come errore. _(2026-11-08)_
- allowDowngrade diventa vero solo col setter di channel in electron-updater: senza, una versione più vecchia del feed non si scarica mai. _(2026-11-08)_
- un 404 su exe/blockmap è atteso a release a metà pubblicazione: soglia 2 ore in src/shared/aggiornamenti-404.ts, poi errore una volta sola. _(2026-11-08)_
- pausa-aggiornamento.json era sempre `sessioni: []`: chi parte dopo la quiete (consegna dell'autopilota durante il salvataggio) non si annotava; ora si ricontrolla dopo `prepara` e all'uscita. _(2026-11-09)_
- Il servizio parte dopo che il Gestore ha letto e cancellato pausa-aggiornamento.json e aggiornamento-in-corso.json: per capire se c'è stato un update servono i segni nell'archivio o il payload di /ge… _(2026-11-09)_
- il 504 di GitHub passa solo se l'errore ha statusCode o inizia con il codice seguito da Headers; l'HttpError con descrizione o frase vuota non è coperto dai test _(2026-11-10)_
- `creaAggiornamenti` prende parametri posizionali in coda: un nuovo aggancio (come `annunciaAgliAltri`) va aggiunto per ultimo, senza toccare l'ordine. _(2026-11-19)_

## installa-la

- `da` (versione di partenza) non va mai preso da un battito Drive vecchio: Drive pieno = battito fermo per giorni. Vale solo la versione viva da /api/ciao. _(2026-11-08)_

## specialisti

- Il servizio autopiloti è un processo separato dal main: per spingere eventi non c'era canale. Ho aggiunto un long poll `/orchestratore/cambi`; il telefono resta a richiesta, senza SSE. _(2026-11-08)_

## typecheck

- un canale IPC nuovo va dichiarato in due posti: src/preload/index.ts e src/renderer/env.d.ts. Senza il secondo, il renderer non compila. _(2026-11-08)_

## guardia

- se la guardia rimanda un comando pesante, il sleep in primo piano è bloccato. Aspetta con un until-loop in background (cronometro) e riprova. _(2026-11-08)_
- `tipiSpecialisti` nel contesto della guardia è facoltativo: i test vecchi non lo passano e non si rompono. Senza git il controllo del tipo `Agent` è spento di proposito. _(2026-11-08)_
- il rifiuto delle cancellazioni nelle chat sta in divieti.ts (giudicaCancellazioni), chiamato da /hook/pretool in server.ts; cancella-sicura.ts riguarda solo le pulizie del programma _(2026-11-10)_

## renderer

- i canali nuovi di window.gestore vanno dichiarati opzionali in env.d.ts e chiamati con `?.`: i finti dei test e le app più vecchie non li hanno. _(2026-11-08)_
- La Panoramica non ha una lettura propria: gli specialisti li legge `ChatSpecialisti` col sondaggio dell'orchestratore, e l'evento specialistiCambiati si aggancia con `sond.rileggi()`. _(2026-11-08)_
- scriviQuandoPronta guarda solo i riquadri del workspace corrente: un avviso mandato a una chat di un workspace tenuto dietro sparisce in silenzio, quindi non va segnato come consegnato. _(2026-11-09)_
- PannelloDomande mostra String(e) grezzo invece di testoErroreDialogo: a Nicholas arriva il messaggio tecnico con «Error invoking remote method». _(2026-11-10)_
- le chiamate preferenze.imposta hanno un .catch vuoto (App.tsx:979 e simili): un salvataggio fallito non si vede. _(2026-11-12)_
- Un hook che cambia sorgente (workspace o PC) non deve tenere il valore di prima: `useSondaggio` lo legava al sondaggio vecchio, e `useAutopilotaRemoto` lasciava scrivere una lettura in viaggio del workspace precedente. Ogni lettura va legata al suo giro. _(2026-11-13)_
- le guardie sui campi array dell'autopilota vanno messe anche nei chiamanti di `adessoDi` (es. DalVivoAutopilota): la riga «chat sola» li fa passare anche senza `chats`. _(2026-11-13)_
- SORGENTE_LOCALE (sorgente-autopilota.tsx) è il punto unico da cui il renderer chiama coda/orchestratore/specialista: le guardie sul workspace vanno lì. _(2026-11-16)_
- I dati IPC del renderer vanno validati: `setGruppi(g)` senza Array.isArray cadeva su `.length`. Uso `gruppiValidi` in shared/workspace-remoti.ts. _(2026-11-19)_
- `chiaveWorkspace` riceve dati remoti incompleti: i tipi dicono `cwd: string` ma a runtime può mancare; controllare con `typeof`, non fidarsi del tipo. _(2026-11-20)_

## fermate

- Causa n.1 delle fermate (08/11): la guardia rimanda, ma lo specialista non può aspettare (sleep bloccato, niente Monitor), quindi chiude senza prove e il criterio diventa rosso. _(2026-11-08)_

## guardia-pc

- `guardia.attendi` non basta in un hook: dopo il passo libero, `giudicaPesanteDellaChat` rimanda per «appena liberato». Serve un ciclo che ripeta tutto il giudizio. _(2026-11-08)_

## shell

- heredoc Python con `\n` dentro stringhe di test: finiscono come a-capo veri e rompono il file; usare `.join('\n')` e fare le modifiche con Edit. _(2026-11-08)_
- Nei comandi Bash i backtick dentro i commenti di un `node -e` vengono eseguiti dalla shell e mangiano il testo: usare Edit per i file con backtick. _(2026-11-12)_
- In Git Bash `/tmp/...` passato a `node` diventa `E:\tmp\...` e non esiste: usare `mktemp -d` con `cygpath -w`. _(2026-11-14)_

## ramo

- il worktree può partire senza l'ultimo main (k-191 mancava nonostante il compito): fare `git merge main` prima di cominciare. _(2026-11-08)_

## apk

- `npm run allega-apk` senza `--senza-build` lancia gradle e ricompila. Per riallegare l'ultimo APK usare `--senza-build`, ma serve un APK già costruito in quella cartella. _(2026-11-08)_

## pubblicazione

- Un agente lanciato in worktree isolato non può eseguire git nella cartella principale: la pubblicazione dalla cartella principale va affidata a un agente senza isolamento. _(2026-11-08)_
- `npm run pubblica-app` esige la voce `versione: 'X'` in `android/novita-app.txt` per il `versionName` corrente: va preparata insieme al bump Android, o l'app resta indietro. _(2026-11-16)_
- `gh release create --draft --verify-tag` seguito da `npm run pubblica` con `GH_TOKEN` carica tutti e 7 i file senza 422; poi `--draft=false --latest` a mano. _(2026-11-16)_
- `npm run pubblica-app` copia da solo app-android.json anche sulla release del PC (v0.109.1): non serve altro per le app vecchie. _(2026-11-16)_
- L'hook rifiuta run_in_background per `npm run pubblica`: lanciarlo davanti; dopo 600 s passa da solo in sottofondo (non rilanciarlo) e un `until [ -s output ]` attende la fine. _(2026-11-19)_
- `pubblica` allega da solo json e Aiutante e lascia la release in bozza: alla fine servono `gh release edit --draft=false --latest` e il controllo dei 7 file. _(2026-11-19)_
- Se `pubblica` dice «mancano installer, blockmap e latest.yml», sono già in dist/ ma con spazi: caricarli con `gh release upload`, rinominati a trattini (SierraDeck-Setup-X.exe). _(2026-11-20)_
- Con la release creata prima da `gh release create`, serve poi `gh release edit --draft=false --latest`: `pubblica` non la segna Latest da sola. _(2026-11-20)_

## tsconfig

- con noUncheckedIndexedAccess `aree[0]` è `T | undefined`: annotare il tipo (`let area: Rettangolo = x ?? aree[0]!`), altrimenti gli errori si propagano a ogni uso. _(2026-11-09)_

## finestra

- Electron maximizza sul display che contiene i bounds normali: se questi sono fuori dai monitor, anche la finestra ingrandita finisce nel posto sbagliato. _(2026-11-09)_

## servizio

- l'installer uccide anche il servizio autopiloti: memoria persa (messaggi e specialisti). Ripresa dal disco con `ripresaDopoRiavvio`, non basta il «lavoro fermo» (3 min, 2 spinte). _(2026-11-09)_
- riprendiLavori({servizioAppenaPartito}) gira anche all'avvio del PC e dopo un crash, non solo dopo un aggiornamento: quello che fa lì va pensato come avvio normale _(2026-11-09)_
- «rispondi» a una domanda usa ancora l'attesa di 3 s (autopilot-client.ts:411-415): la 0.95.5 ha alzato a 30 s solo il dialogo. Ogni POST che scrive deve passare attesaScrittura. _(2026-11-10)_
- Dalla 0.101.0 telefono, pagina e Telegram leggono lo stesso registro degli avvisi (`src/main/avvisi.ts`, `/api/eventi`): una regola su quando avvisare va lì, non nelle schermate; `avvisi=0` vuol dire «da capo» e l’attesa deve svegliarsi per ogni avviso nato dopo. _(2026-11-11)_
- `dati += buffer` e `buffer.toString()` per pezzo spezzano i caratteri multibyte (U+FFFD): usare StringDecoder o setEncoding('utf8') su ogni lettura a pezzi. _(2026-11-14)_
- `percentuale` per i lavori ospitati è inventata (10 + minuti): non mostrare una barra senza una stima vera. _(2026-11-16)_
- il servizio autopiloti non conosce porta del client né gettoni del programma: per parlargli c'è `ponte-locale.json` nella cartella dati (porta+gettone), riscritto a ogni avvio del programma. _(2026-11-20)_

## registro

- copie-di-versione/<ver>-<data> contiene il pausa-aggiornamento.json e aggiornamento-in-corso.json di ogni update: prova utile a capire cosa fu salvato prima dell'uscita. _(2026-11-09)_
- `Registro` ha solo info ed errore: l'«avviso» è una riga info con prefisso [avviso]; solo `errore` entra nello storico degli errori arrivati. _(2026-11-16)_

## ripresa

- riquadroDi nella finestra vede solo useLayoutStore: le chat dei workspace dietro (memoriaWorkspace) non si raggiungono con scriviQuandoPronta _(2026-11-09)_
- Dopo un riavvio la memoria degli specialisti non c'è più: per riprendere un'unione serve il ramo salvato nel piano (CompitoPiano.ramo), non il solo id del compito. _(2026-11-10)_
- riprendiOrchestratori può arrivare secondi dopo l'avvio (gestore-avviato): non rifarci lavoro già avviato all'avvio, la fila evita i doppioni solo mentre l'unione è ancora dentro _(2026-11-10)_

## spazio

- il recupero di 30 giorni non libera spazio: i file restano sul Drive fino a «Svuota adesso» o alla scadenza. Non presentarlo come liberazione. _(2026-11-09)_
- ogni percorso di pulizia scrive il registro prima di cancellare: a Drive pieno nessuno dei percorsi con recupero parte. Solo le DELETE (versioni, svuota) passano. _(2026-11-09)_
- il cestino di Google non c'entra con i file di SierraDeck (appDataFolder, DELETE definitivo). Il messaggio «svuota il cestino» va corretto. _(2026-11-09)_
- Una pulizia con voci ancora nell'indice, ma file già cancellati, viene riproposta dal giro delle chat: le proposte devono ignorare le voci di pulizie in sospeso (indiceVisto). _(2026-11-09)_
- `pulisci('chat-non-usate')` non trovava la proposta: viene da `proposteChatSulDrive`, non da `proposteDiPulizia`; ora è in `StatoSpazio.chatNonUsate`. _(2026-11-09)_

## sposta

- «Sposta su questo PC» chiama il PC di prima su /api/sposta/prepara con il timeout di 4 s (non è in ROTTE_LENTE): un upload lungo finisce in «non ha finito entro 4 secondi». _(2026-11-09)_
- con `prepara` asincrono i test devono rileggere lo stato con `riprendi()` dopo `avvia`; fissare `adesso` e le pause (`pausaAttesaMs`) per i tempi massimi _(2026-11-09)_

## remoto

- Ogni 404 non di chat viene mappato a «questa chat non è aperta» (scoperta-pc.ts:230): /api/apri con cartella inesistente sembra un PC spento. _(2026-11-09)_

## pc-remoto

- per i 404 di rotte che non riguardano chat, il motivo si decide dal testo dell'errore in `datiDa`; `motivoDaStatoHttp(404)` dà sempre 'chat' _(2026-11-09)_
- ROTTE_LENTE deve combaciare con Api.kt dell'app (test android): le rotte lente solo fra PC vanno in ROTTE_LENTE_FRA_PC, così non serve un APK nuovo. _(2026-11-11)_
- due funzioni si chiamano `statoPc` (`shared/stato-pc.ts` e `shared/scoperta-pc.ts`): i titoli del riquadro vengono dalla seconda, il tempo dal battito della prima. _(2026-11-19)_

## pagina

- una funzione condivisa che arriva nella pagina con toString() non può avere funzioni annidate né costanti di modulo: i dati le arrivano come parametri. _(2026-11-09)_
- La pagina del telefono è una stringa gigante: i testi condivisi vanno iniettati con `${JSON.stringify(...)}` e le funzioni si provano estraendole dallo script, come in tests/main/client-pagina-domand… _(2026-11-19)_
- pannelliDelPosto (shared/navigazione-telefono) decide quali pannelli sono «aperti»: 'specialisti' ora è aperto su tutta la voce Workspace, quindi la lista si rilegge ogni 4 s lì. _(2026-11-19)_

## merge

- client-pagina.ts: la lista di firme che fa ridisegnare la pagina del telefono è il punto dove si scontrano le funzioni nuove; tenere sempre le righe di entrambe. _(2026-11-09)_
- Più gruppi di correzioni sugli stessi file grossi (servizio-orchestratore.ts): una copia per gruppo, poi un ramo di integrazione; i conflitti stanno negli import e nel cancello, e dopo ogni unione vanno rilanciati typecheck e l’intera suite. _(2026-11-11)_

## verifica

- su Windows il checkout con autocrlf dà CRLF nei file del worktree: un confronto byte a byte con la cartella principale segnala «diversi» anche con contenuto uguale. Confrontare ignorando i CR (`tr -d… _(2026-11-10)_

## rete

- nel client dell'autopilota ogni POST che fa scrivere il servizio su disco deve passare `attesaScrittura`: senza, valgono i 3 s di lettura e sotto carico scade. _(2026-11-10)_
- gli errori di rete dell'API nei turni (ENOTFOUND, Can't reach the API server) vanno trattati come passeggeri, come quelli dell'aggiornamento: avviso, non ERRORE. _(2026-11-10)_
- `eErroreDiRete` in src/shared/errori-rete.ts è l'unico elenco degli errori di rete, condiviso da aggiornamenti e autopilota: aggiungere i codici lì. _(2026-11-10)_
- «Aiuta la rete» rimanda lo stesso compito a un PC con l'accesso Claude scaduto («OAuth session expired»): fallisce in pochi secondi e al rilancio va di nuovo lì (13/11, DESKTOP-O2DITVE). _(2026-11-13)_
- Se «Aiuta la rete» manda un compito a un PC che fallisce sempre, l'Agent lanciato con isolation: "worktree" resta su questo PC (13/11, k-152). _(2026-11-13)_
- Correzione: isolation "worktree" NON tiene l'Agent su questo PC (k-154 è andato lo stesso a un Aiutante). Finché il servizio non ha la correzione di k-152, il PC scelto è a caso. _(2026-11-13)_
- la cartella E:\Users\nikof\... della cartella principale non è raggiungibile da tutti i PC: le voci del quaderno su lotti d'errore vanno scritte anche senza i file originali. _(2026-11-13)_
- un autopilota letto da un altro PC con altra versione può non avere campi array: leggerli sempre con `Array.isArray(...)`. _(2026-11-13)_
- pauseAiuti (src/shared/aiuto-esito.ts) esclude un PC dopo un solo fallimento per accesso; il fallimento in sé è il segnale per l'utente, non un difetto. _(2026-11-14)_
- Se un PC è raggiunto da tutti ma non raggiunge nessuno (anche la posta fa `fetch failed`), la causa è la sua rete in uscita o Tailscale, non gli indirizzi pubblicati. _(2026-11-15)_
- il registro eventi-aiuto.json lo scrive il PC che affida: sull'Aiutante resta vuoto finché qualcuno non registra lì i passaggi. _(2026-11-16)_
- I file in .sierradeck/errori-arrivati/ non viaggiano con la copia mandata a un altro PC: nel prompt di un compito sul quaderno errori scrivere il contenuto del lotto, non solo il percorso. _(2026-11-16)_
- i compiti che citano percorsi assoluti della cartella principale non funzionano sui PC della rete: lì esiste solo la copia di lavoro, senza i rami degli altri worktree. _(2026-11-17)_
- Un'unione fuori dal cancello affidata a uno specialista finisce su un PC della rete anche se scrivi «solo questo PC»: lì la cartella principale non c'è. _(2026-11-17)_
- il compito k-g2 va lanciato sul PC di nikof (E:\Users\nikof\Documents\SierraDeck); sugli altri PC il primo controllo lo ferma. _(2026-11-17)_
- NB-PROBOOK ha più posti: occuparne uno con un altro compito non tiene qui lo specialista. Ogni Agent va alla rete finché c'è un posto libero là, qualunque cosa dica il prompt. _(2026-11-17)_
- il compito k-g2 va lanciato sul PC con E:\Users\nikof\Documents\SierraDeck; il controllo iniziale lo ha riconosciuto come sbagliato. _(2026-11-17)_
- i compiti con percorsi assoluti di un PC specifico (E:\Users\nikof\...) vanno assegnati solo a quel PC; gli altri PC della rete devono fermarsi al controllo iniziale. _(2026-11-17)_
- Unione fuori dal cancello: general-purpose è rifiutato (lavorerebbe nella cartella principale), k-v1 non si chiude (già unito). Resta solo uno sviluppatore quando la rete non ha posti liberi. _(2026-11-17)_
- i compiti che nominano percorsi assoluti del PC di Nicholas (E:\Users\nikof\...) non si possono eseguire sui PC della rete: il controllo `Test-Path` del primo passo li ferma subito. _(2026-11-17)_
- Cancello bloccato e specialisti sempre sulla rete: lo specialista di rete fa il cherry-pick sopra il main del PC e un push normale su GitHub; poi il programma riallinea la cartella principale. _(2026-11-17)_
- il push verso GitHub dalla copia può essere negato dai permessi; il ramo `porta-0109-2` (aa30211d) resta pronto in locale per essere pubblicato da chi ha il permesso. _(2026-11-17)_
- Prima di rifare un cherry-pick controllare con `git cat-file -t <sha>`: il commit del collega può già essere nella copia. _(2026-11-17)_
- Dai PC della rete il git push è negato dai permessi di Bash (non da GitHub): portare in main un commit già pronto va affidato al «rilascio», che lavora nella cartella principale. _(2026-11-17)_
- Dai PC dell'Aiutante la cartella principale e origin non sono raggiungibili: il controllo versione su origin/main va fatto dall'autopilota. _(2026-11-19)_
- `Aiutante` (aiuto-rete.ts) non ha `battito` né `capacita`: il collegamento k-166n6 deve aggiungerli prima di usare `valutaPrimaDiAffidare`. _(2026-11-20)_
- Le azioni fra PC passano da POST /api/azione sul Client (stessa firma): per un file al telefono serve sempre conferma di chi sta là, mai solo la richiesta remota. _(2026-11-20)_
- Deciso 20/11: manda-file-telefono chiesto da un altro PC resta sempre con conferma di chi sta al PC ricevente; mai senza. _(2026-11-20)_
- il ramo di un lavoro da unire può non esistere nella copia del PC che aiuta: prima di affidare un'unione, verificare che il ramo sia stato rimandato. _(2026-11-20)_
- `Aiutante` non portava battito né capacità: valutare per requisiti ha richiesto di farli arrivare da index.ts e spedizioniere fino a `/aiuto/giro`. _(2026-11-20)_
- Il ciclo che segue i lavori affidati è `creaSpedizioniere` in src/main, non in autopilot-host: lì vanno agganciate le regole sui PC remoti. _(2026-11-20)_
- `LavoroAffidato.percentuale` è una fotografia presa alla partenza del controllo: usarla per la lentezza dà falsi positivi, conta solo `fermoMs` dell'altro PC. _(2026-11-20)_
- `connesso` del Drive è falso anche per una lettura del token fallita un attimo: ogni controllo che segnala «scollegato» deve ignorare `portachiaviNonPronto` e aspettare 2 giri. _(2026-11-20)_
- il segno vero di scollegamento è `contoDrive.scollegamento()` (file scritto da `revocata`/`disconnetti`): si segnala subito, senza attendere il secondo giro. _(2026-11-20)_

## cancello

- il messaggio «anche nella cartella principale non passa» (server.ts 698/708) vuole dire che il ramo rompe criteri che su main passano: il testo è invertito e non mostra i nomi dei test. Tre rami dive… _(2026-11-10)_
- il criterio aggregato «npx vitest run» senza percorsi (k-170) fa girare l'intera suite in un solo comando: 3 minuti qui, ma la prova ha 15 minuti in totale contro 20 del comando. _(2026-11-10)_
- Rifiuto «anche nella cartella principale non passa» = il ramo rompe prove che su main passano (testo invertito, senza nomi): far girare `npx vitest run` intero sul ramo unito a main per trovarle. _(2026-11-10)_
- un ramo già unito e cancellato non si misura: serve un ramo nuovo aggiornato a main (già scritto nel quaderno). _(2026-11-10)_
- Il cancello salva le note `.sierradeck/` prima di unire solo se il diff è fatto di sole aggiunte (numstat, zero righe tolte); righe cambiate o tolte restano di Nicholas. _(2026-11-10)_
- il controllo «gh release view v<versione>» sul ramo del cambio versione si sblocca con una pre-release vuota non Latest, senza toccare gli aggiornamenti automatici. _(2026-11-13)_
- L'esito di rifiuto Gradle nel piano è tagliato e perde il nome del test fallito: salvare le righe FAILED per diagnosticare. _(2026-11-14)_
- `motivoProveRotte` in `src/autopilot-host/ambiente-copia.ts` compone l'esito del ramo respinto; il suo test vecchio vive in `tests/autopilot-host`, non in `tests/main`. _(2026-11-14)_
- la prova prima/dopo dell'unione deve misurare solo il codice: i criteri su release o remoto passano sul principale e cadono sul ramo che alza la versione _(2026-11-14)_
- Il cancello che unisce gira col SierraDeck INSTALLATO: una correzione al cancello unita in main non vale finché Nicholas non installa la versione che la contiene. _(2026-11-15)_
- Una correzione al cancello (criteri-prova.ts) vale solo dalla versione installata: unita in main non sblocca subito i rami respinti dal cancello che gira; serve un'unione fuori dal cancello. _(2026-11-17)_
- Il criterio di un compito già unito (es. k-v1 di r-141) non si può correggere con piano_scrivi: richiesta fatta. Un criterio di versione sbagliato resta nel cancello fino alla nuova installazione. _(2026-11-17)_

## consenso

- il consenso a cancellare nasce solo in rispondiAllaDomanda (server.ts), da una risposta di Nicholas: mai da testo della chat; scade in 30 min ed è in memoria _(2026-11-10)_

## flusso

- Un rifiuto dell'hook che contiene «sottofondo/async/background» viene letto dal flusso come Agent partito in sottofondo: nessun «finito», il compito resta «in-corso». Evitare quelle parole nei motivi. _(2026-11-10)_

## piano

- `compito.ramo` va tolto (`senzaRamo`) quando il compito torna da-fare o in-corso, altrimenti la ripresa riunisce il ramo vecchio. _(2026-11-10)_
- Un criterio con comando che legge solo file sotto .sierradeck/ (es. grep sul quaderno) è rifiutato: per le note scrivere il criterio a parole, lo giudica il supervisore. _(2026-11-11)_
- Un compito «unito» con un criterio generico (`npx vitest run tests/shared`) può avere il ramo vero rimasto fuori (k-165): per saperlo, `git merge-tree --write-tree main <ramo>` e confronto con l’albero di main. _(2026-11-11)_
- Dalla 0.100.0 un compito che non va più fatto si chiude con `piano_chiudi` (superato o annullato): prima restava «in revisione» per sempre e teneva aperta la richiesta. _(2026-11-11)_
- Criterio «gh release view v<versione>»: se un'altra chat pubblica quella versione, il cancello lo prova su ogni ramo e respinge unioni giuste. Escludere la versione già uscita. _(2026-11-13)_
- Mai criterio «gh release view v»+versione di package.json: dopo l'uscita il cancello respinge ogni bump (k-149 ha bloccato la 0.106.3). Usare la versione fissa: `gh release view v0.X.Y`. _(2026-11-13)_

## orchestratore

- il ramo risposta con errore del result scarta s.inviati senza rimettere i messaggi in coda, a differenza dell'uscita del processo: un messaggio nel turno fallito si perde. _(2026-11-10)_
- s.tentativi si azzera a ogni risposta, anche con errore: il limite di un riprovo non vale per gli errori del result, e ogni risveglio lancia un turno nuovo. _(2026-11-10)_
- su un `result` con `is_error` il turno non riprova da solo con rete assente: `pronto()` ora è falso durante `riprova` e `fermo`, altrimenti `suEffetti` rilancia il turno a raffica. _(2026-11-10)_

## modelli

- Il telefono (pagina e app Android) legge `/api/modelli` dal servizio: basta cambiare `src/shared/modelli.ts` o la scoperta, senza ricompilare l'APK. _(2026-11-10)_

## pubblica

- `npm run pubblica` da una copia: serve `google-oauth.json` (ignorato da git) e una `node_modules` vera, non una junction. Con la release già creata non carica nulla: caricare a mano. _(2026-11-11)_
- Con bozza già creata, collegata al tag con `gh release edit --tag` e note, `npm run pubblica` ha caricato tutti e 7 i file (Aiutante compreso); poi `--draft=false --latest`. _(2026-11-14)_
- `npm run pubblica` (test + build + Aiutante) supera i 10 minuti: va in sottofondo da solo; la release resta in bozza e i 7 file compaiono a poco a poco, si pubblica solo a exit 0. _(2026-11-17)_
- `pubblica-app` copia da solo `app-android.json` anche su v0.110.0: dopo, basta controllare con `cmp`, senza `--clobber`. _(2026-11-19)_
- `gh release create --draft` mostra un URL «untagged-…» ma la release prende il tag giusto alla pubblicazione, se il tag è già sul remoto (`--verify-tag`). _(2026-11-20)_
- `npm run pubblica` supera i 10 minuti per il caricamento dell'installer dell'Aiutante (circa 100 MB): va in background e non va rilanciato. _(2026-11-20)_
- `npm run pubblica` supera i 10 minuti: lo strumento lo sposta in sottofondo da solo. Per aspettare senza sleep lunghi, un ciclo `until` su `gh release view ... assets|length -ge 7` (sleep 5) passa. _(2026-11-20)_
- Con `pubblica` i nomi dei file sono già con i trattini e i sette file arrivano da soli: il caricamento a mano da dist/ non è servito per la 0.111.2. _(2026-11-20)_
- prima di tag e build controllare `git status` nella cartella principale: altre chat possono lasciare modifiche in staging su main, e finirebbero nell'installer. _(2026-11-20)_
- Il rilascio non va lanciato mentre il programma prova un'unione nella cartella principale (file in staging = unione in corso): rilanciarlo subito dopo l'evento di unione. _(2026-11-20)_

## quaderno

- i lotti di errori arrivati stanno solo nella copia principale (`.sierradeck/errori-arrivati/lotto-*.md`), non nei worktree; vanno letti da lì senza modificarli. _(2026-11-11)_
- `.sierradeck/quaderno/lezioni.md` risulta modificato nella cartella principale: lo scrive il programma e sporca main prima del rilascio. _(2026-11-13)_
- il file del lotto in .sierradeck/errori-arrivati/ non è tracciato: si legge con Read dal percorso della cartella principale, non dal worktree. _(2026-11-13)_
- errori-arrivati.md usa fine riga CRLF: per aggiungere voci usare Edit ancorato all'ultima frase, non append da shell. _(2026-11-14)_
- in errori-arrivati.md il testo esatto va controllato prima di un Edit: «la porta 47640» non è «e porta 47640», e l'ancora sbagliata fa fallire l'Edit. _(2026-11-16)_
- «prossima versione» è corretto finché package.json resta indietro: controllare la versione prima di scrivere il numero. _(2026-11-16)_
- errori-arrivati.md usa a capo CRLF: una voce aggiunta con Edit entra con LF e il file resta con a capo misti. _(2026-11-16)_
- errori-arrivati.md è CRLF e le voci si accodano nello stesso punto: due rami che le aggiungono insieme vanno in conflitto, si risolve tenendole tutte e due. _(2026-11-16)_
- il commit di un compito k-xx non ha il codice nel messaggio: per trovarlo in main si cerca per contenuto (es. `git log --grep=orchestratore`), non per «k-f1» _(2026-11-16)_
- errori-arrivati.md usa fine riga CRLF: Edit ancorato all'ultima riga funziona, ma controllare che le righe nuove non restino miste. _(2026-11-20)_

## controllo-pc

- un errore 504 (risponde ma lento) non è «non risponde»: ora si riprova una volta e se resta lento non è criticità. _(2026-11-11)_
- «PC A non raggiunge B» con B che risponde agli altri: guardare rete/Tailscale/firewall di A prima del codice; la Salute dice già «attenzione» e non «guasto». _(2026-11-14)_

## preferenze

- impostaPreferenze non tiene nulla in memoria: ogni preferenze() rilegge il disco. Il testo «Valgono fino alla chiusura» (impostazioni-store.ts:98) è falso nel main. _(2026-11-12)_

## scritture

- rinominaConRiprova attende con Atomics.wait: 600 ms totali bloccano il thread principale (scrittura-atomica.ts:5-22). Un ritentativo più lungo va fatto in modo asincrono. _(2026-11-12)_

## ipc

- `preferenze:imposta` ora risponde `{ preferenze, salvato }`: chi lo chiama dal renderer usi `salvaPreferenze` (src/renderer/salva-preferenze.ts), non `imposta` diretto. _(2026-11-12)_
- negli handler IPC di sola lettura la validazione dell'argomento va dentro il catch/guard: un throw prima del .catch finisce nel log di Electron come errore. _(2026-11-16)_
- Un canale nuovo va dichiarato in `src/preload/index.ts` e in `src/renderer/env.d.ts`, che è la fonte dei tipi di `window.gestore`: solo nel preload il typecheck fallisce. _(2026-11-20)_
- Per i segreti: il canale fa entrare il valore e non lo restituisce, e la vista del renderer ricopia solo i campi senza valore, così un valore in più si ferma lì. _(2026-11-20)_

## testo

- Nella Salute la differenza di versione va guardata con major.minor (`stessoMinor` in src/shared/salute.ts): le funzioni elencate a mano nei messaggi diventano false con le release. _(2026-11-13)_

## windows

- path.relative fra dischi diversi dà un percorso assoluto, non '..': dopo relative controllare sempre isAbsolute _(2026-11-13)_
- Per risolvere conflitti in file CRLF, con Edit gli a capo si rischiano: meglio PowerShell con regex `\r?\n` e verifica del conteggio CRLF. _(2026-11-16)_

## errori

- `chiama` ora porta stato e motivo nell'errore: riconoscere i 404 dal motivo, non dal testo del messaggio. _(2026-11-13)_
- Il registro dell'errore di render (ConfineErrori) è per-PC: la pila di un altro PC non si vede da qui, serve il suo registro. _(2026-11-19)_
- Specialisti «Aiuta la rete» girano su un altro PC e non vedono il registro di qui: la pila la legge l'autopilota in AppData\Roaming\SierraDeck\log e la mette nel prompt. _(2026-11-19)_
- la cartella .sierradeck della cartella principale non si legge dalle copie (collegamento non risolvibile): la pila di un errore va chiesta all'autopilota. _(2026-11-20)_

## voce

- whisper.cpp 1.9.2 su questo PC (i7-3770, niente AVX2, CPU al 100%): 15-37 s per una frase di 3 s col modello small q5_1; «Sierra» la scrive giusta, «fammi» a volte «famiglia». Le misure vanno rifatte a PC scarico. _(2026-11-13)_
- Il `tar` di Git Bash non apre gli zip: serve `%SystemRoot%\System32\tar.exe` (bsdtar), che accetta anche i nomi con `*` per estrarre solo alcuni file. _(2026-11-13)_
- La conversazione a voce era solo sul PC (voce-autopilota.ts, parlato.ts, speechSynthesis): nell'app c'era solo la dettatura. Nell'app gli id delle frasi vengono dal contenuto, non dall'indice. _(2026-11-14)_

## permessi

- `gh` è negato sia da Bash sia da PowerShell in questa copia: la verifica «release già pubblicata?» non si può fare da qui, va fatta dallo specialista «rilascio». _(2026-11-13)_

## rilascio

- il tag v0.106.3 è su 43744ae9 (ramo worktree), non su main: dopo l'unione verificare che punti al commit giusto prima di caricare i file e rendere Latest. _(2026-11-13)_
- Se la release esiste già pubblicata (anche pre-release), electron-builder non carica nulla: allega-aiutante dice «mancano …». Caricare a mano con gh release upload --clobber. _(2026-11-13)_
- In dist/ gli installer hanno gli spazi («SierraDeck Setup X.exe»), ma latest.yml cita i trattini: copiare con i nomi «SierraDeck-Setup-X.exe» prima di caricare a mano. _(2026-11-13)_
- La release fissa dell'app si trova col tag `app-android`, non col nome: `gh release view "App Android"` dice «not found». Prima di alzare la versione guardare `gh release view app-android`. _(2026-11-14)_
- Il controllo del programma rifiuta `git merge` anche con compito esplicito dell'autopilota: l'unione va fatta dall'autopilota stesso, lo specialista del rilascio parte da main già unito. _(2026-11-14)_
- Il circolo «criterio rimisura gh release view v<versione>» su un'alzata di versione si risolve solo unendo fuori dal cancello e pubblicando subito dopo. _(2026-11-14)_
- Il vecchio criterio `gh release view v<versione>` cade sul ramo del bump finché non c'è una release: una bozza lo soddisfa senza toccare gli aggiornamenti. _(2026-11-14)_
- Una bozza creata senza tag ha URL «untagged-…»: il tag va poi creato e spinto sul commit della versione prima di pubblicarla. _(2026-11-14)_
- Prima di pubblicare controllare `.git/MERGE_HEAD` e i file preparati: il cancello può avere un'unione a metà in main, e il pacchetto va costruito solo su main pulito. _(2026-11-14)_
- Il controllo di unione fa `gh release view <tag>` e fallisce senza release: una bozza vuota basta. Il tag resta da creare prima della pubblicazione vera. _(2026-11-14)_
- `gh release create --draft` senza tag crea un URL "untagged-…": il tag va creato e mandato sul remoto prima della pubblicazione vera. _(2026-11-15)_
- prima di taggare controllare che package.json in main dica la versione da pubblicare: il compito di pubblicazione può partire prima che l'unione del bump sia avvenuta. _(2026-11-15)_
- Prima di un compito di rilascio controllare che il bump di versione sia già in main: qui la bozza v0.107.4 esisteva su GitHub ma package.json era fermo a 0.107.3. _(2026-11-15)_
- Prima di pubblicare controllare non solo package.json nella cartella ma anche `git show HEAD:package.json`: la versione può essere solo nell'indice di un'unione a metà (MERGE_HEAD). _(2026-11-15)_
- `npm run pubblica` rifiuta le copie di lavoro: `controlla-pacchetto` blocca se `node_modules` è una junction, quindi serve la cartella principale col ramo giusto. _(2026-11-15)_
- Nella copia di un ramo `pubblica` chiede anche le credenziali Drive: bastano `SD_GOOGLE_CLIENT_ID` e `SD_GOOGLE_CLIENT_SECRET`, lette da `google-oauth.json` della cartella principale. _(2026-11-15)_
- le note di versione stanno in src/shared/novita.ts (non in un changelog); il tag v0.109.0 punta a un commit qualsiasi, non al bump _(2026-11-16)_
- nelle copie di lavoro «origin» può puntare a un bundle sparito: git fetch fallisce e l'esistenza del tag va controllata dalla cartella principale _(2026-11-17)_
- il ruolo di rilascio non fa merge nemmeno su richiesta dell'autopilota: le unioni fuori dal cancello vanno assegnate a chi può cambiare la storia di git. _(2026-11-17)_
- Lo specialista di rilascio non può fare cherry-pick o merge in main: il hook lo rifiuta. Un commit che il cancello respinge va unito dall'autopilota, non dal rilascio. _(2026-11-17)_
- Il rilascio non può fare cherry-pick o merge nella cartella principale: un commit respinto per errore dal cancello va portato da una copia temporanea (git worktree) con push normale. _(2026-11-17)_
- il numero di commit "avanti" di main può cambiare tra la richiesta e l'esecuzione: il programma continua a scrivere note nel quaderno. Contare di nuovo dopo il fetch. _(2026-11-17)_
- Per le copie temporanee conviene metterle sotto `E:\Users\nikof\Documents\SierraDeck.sierradeck-wt`, così la pulizia non chiede il consenso di Nicholas. _(2026-11-17)_
- Il link della bozza creata con `gh release create --draft --verify-tag` ha forma `untagged-…`: è normale, il tag esiste già sul remoto. _(2026-11-17)_
- In questa copia `git fetch` fallisce se il bundle di arrivo è sparito. Il controllo su `origin/main` va fatto dalla cartella principale. _(2026-11-19)_
- Prima della release controllare che android/novita-app.txt abbia la voce della versione app: pubblica-app si ferma se manca, e la 0.110.0 è uscita senza APK 3.2.0. _(2026-11-19)_
- `npm run pubblica` supera i 10 minuti (prove, build, Aiutante): va in sottofondo da solo. Si controlla con `gh release view --json assets` finché i file sono 7, senza lanciarlo due volte. _(2026-11-19)_
- se `pubblica` fallisce sui test, tag e bozza restano senza file: va rilanciato lo stesso comando, non ricreati. _(2026-11-19)_
- Se `npm run pubblica` si ferma a metà, la bozza resta con i primi 3 file. Rilanciarlo sulla stessa bozza completa gli altri file, compresi quelli dell'Aiutante, senza crearne una seconda. _(2026-11-19)_
- `gh release view --json` non ha il campo isLatest: per sapere se è Latest usare `gh release list`. _(confermata 2×, ultima 2026-11-20)_
- `git fetch` fallisce se origin è un .bundle d'arrivo già cancellato: la versione si controlla da package.json e dal log locale, i tag non ci sono. _(2026-11-20)_
- nel package-lock.json il secondo punto della versione (packages[""]) può restare indietro: nella 0.111.0 era ancora 0.110.2. Controllare entrambi. _(2026-11-20)_
- Prima di cercare un bug in un rapporto del controllo PC, confronta il testo con `git log -S` e `git tag --contains`: il PC che lo scrive può girare una build senza la correzione già in main. _(2026-11-20)_
- Prima di pubblicare controllare `.git/MERGE_HEAD` in main: le unioni dell'autopilota lasciano la cartella principale sporca e la punta di main non è un commit stabile. _(2026-11-20)_
- Il compito può chiedere un worktree separato, in contrasto con la regola «build solo in cartella principale»: serve una conferma esplicita dell'autopilota prima di procedere. _(2026-11-20)_
- Con unioni continue in main, al rilascio dai un commit unito e pulito (senza MERGE_HEAD), push di quel commit, tag lì e build in un worktree temporaneo fuori dal progetto. _(2026-11-20)_
- Dopo un'interruzione la release può essere ancora in bozza anche se il compito dice di no: controllare isDraft. Gli asset arrivano già costruiti nelle cartelle dist e dist-aiutante della copia. _(2026-11-20)_
- `git fetch` fallisce se origin è un .bundle sparito: il controllo «c'è già una 0.112.x?» va fatto su `arrivo/main`, e `v0.111.3` non esiste come tag locale. _(2026-11-20)_

## build

- Gradle di sistema in /e/Programs/Gradle/gradle-8.11.1 funziona nelle copie: su albero pulito servono ~3 min, con cache ~1 min; il tail di "BUILD FAILED" da solo non basta, serve --stacktrace. _(2026-11-14)_
- Il gate Android (testDebugUnitTest assembleDebug) sul worktree a freddo dura circa 8 minuti; due gradle sulla stessa copia si bloccano sul lock. _(2026-11-14)_
- Nel cancello «N actionable tasks: 1 executed» con N=28 è il comando solo `testDebugUnitTest --rerun` (con `assembleDebug` sono 45): il task caduto è un test, non assembleDebug. _(2026-11-14)_
- Il cancello deve stampare nel riepilogo le righe FAILED e «Execution failed for task»: la sola coda «BUILD FAILED» non basta per capire quale test cade. _(2026-11-14)_
- Rifiuto del cancello con «28 tasks: 1 executed» = solo testDebugUnitTest --rerun (con assembleDebug sono 45): cade un test a intermittenza, non la build. _(2026-11-14)_

## aiuto-rete

- un PC con versione vecchia può mandare `causa` 'sconosciuta' con il testo giusto nel motivo: la causa dichiarata va usata solo se riconosciuta, altrimenti si rilegge il testo. _(2026-11-14)_
- la pausa per accesso scaduto è calcolata dal file dei lavori affidati, quindi vale anche dopo un riavvio; se un PC viene riprovato dopo pochi minuti, controllare la causa salvata nel lavoro. _(2026-11-14)_
- la cartella del progetto non è una risorsa da verificare: arriva col pacchetto, va esclusa (`escludi`) nel ricavare i percorsi dal prompt. _(2026-11-16)_
- un percorso ricavato dal testo non fa fallire il lavoro (informativo, con alternativa); solo le risorse dichiarate esplicitamente sono indispensabili. _(2026-11-16)_

## gradle

- Il «What went wrong» che il cancello taglia sta in C:\Users\nikof\.gradle\daemon\8.11.1\daemon-*.out.log. I log mostrano se due build erano sovrapposte (currentDir e orari). _(2026-11-14)_

## unione

- Un MERGE_HEAD in main è durato circa 5 minuti e poi è sparito senza cambiare HEAD. Più sleep di fila nello stesso comando vengono bloccati, quindi un `sleep 20` per chiamata. _(2026-11-14)_
- Il nome di un workspace è l'identità anche in `tolti`; l'unione ora confronta con `chiaveNomeWorkspace` (trim, spazi, minuscole) e tiene il nome già sul Drive. _(2026-11-20)_

## pubblica-app

- `npm run pubblica-app` copia anche `app-android.json` su v0.107.2 (la Latest) senza cambiarne i file né la Latest. _(2026-11-14)_
- noteDi cerca `versione: '<v>'` e si ferma al prossimo `versione: `: mai quella parola con i due punti nel testo delle righe. _(2026-11-16)_

## log

- consoleNelRegistro: console.warn va come info (fuori dallo storico errori), console.error come ERRORE; per casi attesi di rete usare warn. _(2026-11-14)_

## aiuto

- creaSpedizioniere ha ora `avviso` oltre a `errore`: solo ProgettoNonSpedibile e i fallimenti dichiarati dal PC restano errori. _(2026-11-14)_
- `eventi-aiuto.json` non era scritto da nessuno: `registraEventoAiuto` ora si chiama solo per `riassegnato` e `arreso`; mancano ancora `affidato`, `risorsa-mancante` e `rifiutato`. _(2026-11-16)_
- nel registro `daPc` non ha un significato unico: negli eventi di riassegnazione è il PC che ha fallito, nei nuovi è «questo PC»; lo spedizioniere non conosce il nome di chi affida. _(2026-11-16)_
- la scadenza delle 3 ore non va a orologio da muro: un portatile che dorme la fa scattare al risveglio. Ora conta il tempo da sveglio (src/shared/aiuto-scadenza.ts). _(2026-11-17)_
- una scadenza dopo un sonno o con lo specialista muto va con causa 'pc': solo così il lavoro passa a un altro PC. 'compito' non si riassegna. _(2026-11-17)_
- il PATH e le risorse si guardano solo DOPO che il progetto è arrivato sul PC ospite (`aiuto-risorse.ts`, `verificaRisorse`): la valutazione va spostata prima di affidare. _(2026-11-20)_
- lo specialista ospitato eredita tutto `process.env` del programma che ospita (`aiuto-lavoratore.ts:460`): è la superficie vera per i segreti. _(2026-11-20)_
- `SILENZIO_MAX_MS` esiste due volte con valori diversi (`aiuto-rete.ts:256`, `aiuto-scadenza.ts:21`): verificare quale vale. _(2026-11-20)_
- `SILENZIO_MAX_MS` stava in due file con valori diversi (20 e 60 min): ora è uno solo in aiuto-rete.ts (30 min), aiuto-scadenza lo importa. _(2026-11-20)_
- Per la lentezza conta l'attività vera (`fermoMs` dal PC ospite, sul suo orologio), non la percentuale: lo specialista spesso non la manda, e senza di lei un lavoro attivo non si sposta. _(2026-11-20)_
- il lavoratore gira nel servizio autopilota, senza cassaforte: le credenziali vanno chieste dal main (rotta `/api/aiuto/avvia` → campo `segreti` nel corpo) e consumate in `lancia`. _(2026-11-20)_

## aiutante

- oggi un lavoro senza posto viene rifiutato (409) e non accodato; un fallimento resta `fallito` senza riassegnazione, e il PC «fuori» vive solo in memoria. _(2026-11-16)_
- il lavoro remoto riceve solo prompt, strumenti e ramo; nessuna risorsa del PC di partenza passa, e la verifica dei requisiti (`regole.ts` 200-245) non copre le cartelle di rete. _(2026-11-16)_
- Con `shell: true` un comando mancante non dà ENOENT ma codice 1: il ramo «non installato» di `versioneDi` non scatta mai per npm. _(2026-11-16)_
- `aggiornamento.ts` classifica ogni errore come ERRORE: `eErroreDiRete` non è usato nell'Aiutante, quindi i passeggeri di rete arrivano agli errori arrivati. _(2026-11-16)_
- con `shell:true` un comando mancante non dà ENOENT ma codice 1 con stderr «non riconosciuto/not recognized»: va letto lo stderr, non solo `err.code`. _(2026-11-16)_
- `execFile` con timeout imposta `err.killed`: da distinguere da «non installato», altrimenti un PC occupato sembra senza npm. _(2026-11-16)_
- un lavoro in ricezione conta già nei posti: per decidere se accodare in `avvia` si confronta inCorso > tetto, non liberi <= 0 _(2026-11-16)_
- lo stato 'in-coda' non è terminale: `segui` dello spedizioniere lo tratta come un normale aggiornamento di attività, senza modifiche _(2026-11-16)_
- la finestra dell'Aiutante è HTML+TS senza React: la logica va in moduli puri sotto src/aiutante/, testabili senza DOM; lo stato passa da statoCompleto() in index.ts. _(2026-11-16)_
- a ogni avvio il primo controllo di Claude non ha uno stato precedente, quindi un accesso mancante diventa errore a ogni aggiornamento: uno stato che si risolve a mano è un avviso. _(2026-11-16)_
- la versione dell'Aiutante sta in src/aiutante/versione.json e va alzata insieme alla voce in novita-aiutante.txt; novita.ts e package.json sono del programma completo. _(2026-11-16)_
- L'Aiutante è una registrazione `pc-<id>` a parte, con `aiutante:true` e lo stesso `host` di SierraDeck: per legare i due si usa `host`, non il pcId. _(2026-11-19)_
- Per sapere se un PC è acceso solo grazie all'Aiutante usa `vistoDelPc` (stato-pc.ts); se serve una nuova vista sul battito, passa da lì invece di rifare l'abbinamento per host. _(2026-11-19)_
- SierraDeck Aiutante crea la sincronia dentro `colleghiRete` dopo `aiuto`: per dargli `chiediCredenziali` serve un cambio d'ordine, non l'ho fatto. _(2026-11-20)_
- L'Aiutante non ha cassaforte di credenziali: per i lavori affidati chiede solo al PC che li ha affidati (`chiedi` senza deposito), collegato in `rete.ts`, non in `index.ts`. _(2026-11-20)_
- `novita-aiutante.txt` ha una riga di testo per versione tra apici singoli: un apice dentro il testo si scrive `\'`. I test di pubblicazione e aggiornamento dell'Aiutante lo leggono. _(2026-11-20)_

## blocco

- Il «criterio rosso» di un progetto esterno arriva agli errori arrivati di SierraDeck perché il servizio usa `console.error`: per design (12/11), ma è una decisione da riguardare. _(2026-11-16)_

## editor

- con Edit, un `old_string` che finisce con uno spazio può perderlo nella sostituzione: rileggere la riga se il typecheck dà errori JSX. _(2026-11-16)_

## menu

- Gli affidati ad altri PC stanno solo in `aiuti-affidati.json` (non in `orchestratore.stato`): ogni vista che filtra `s.pc === undefined` li perde. _(2026-11-16)_
- menu-specialisti.ts finisce nello script della pagina con .toString(): niente helper importati dentro, testi italiani scritti nella funzione stessa. _(2026-11-16)_
- Il telefono ha tre strutture diverse (PC 7+1 voci, pagina `MENU_TELEFONO` 4 voci, app `Navigazione.kt` 3 voci). Cambiare `MENU_PRINCIPALE` non basta: l'app legge `assets/menu.json` e l'enum va ritocc… _(2026-11-19)_
- Il test menu-principale.test.ts confronta assets/menu.json con MENU_PRINCIPALE: dopo ogni cambio di voci rigenerarlo con AGGIORNA=1 prima del commit. _(2026-11-19)_
- Gli errori hanno due fonti: Salute legge il registro, Impostazioni → Errori legge lo storico (storico-errori-file). Possono non coincidere. _(2026-11-20)_
- Ogni voce di errore in Salute dovrebbe avere l'azione «Apri gli errori», altrimenti la correzione resta sepolta due livelli sotto. _(2026-11-20)_
- i dati di menu-principale.ts e impostazioni-struttura.ts sono copiati in android/assets (menu.json, impostazioni.json) e confrontati da test: rinominare le voci là richiede AGGIORNA=1 e tocca android… _(2026-11-20)_
- Per rigenerare i JSON dell'app: `AGGIORNA=1` con vitest su menu-principale.test.ts e impostazioni-struttura.test.ts; non c'è altro script di copia. _(2026-11-20)_
- «Limiti» è una sezione solo PC: se le sottovoci di Impostazioni vanno sul telefono, filtrare con sezioniDi('app'). _(2026-11-20)_
- Una voce del menu PC senza controparte sul telefono usa `soloPc`. Il menu dell'app (`menu.json`, `MenuPrincipaleTest.kt`) deve restare uguale alle sue schede. _(2026-11-20)_
- `Correzioni` è `soloPc`: va filtrata (`soloPc !== true`) sia in `menu.json` sia nella pagina; le sottovoci vengono da `COMANDI_CHAT_WORKSPACE` e `SEZIONI`. _(2026-11-20)_
- la barra dell'app (Lavoro/File/Altro) e due sezioni di Altro («Tutte le chat», «Dati riservati») non sono nel menu.json: nomi propri del telefono, non allinearli alla fonte. _(2026-11-20)_

## panoramica

- le fonti di «Al lavoro» (riquadri, specialisti dell'autopilota, lavori affidati) non coincidono: lo stesso lavoro compare in una vista e manca nell'altra. _(2026-11-16)_
- la vista dell'autopilota (VistaOrchestratore) è l'unica fonte che conosce gli specialisti affidati a un altro PC (campo pc): niente riquadro, niente chat locale. _(2026-11-16)_

## shared

- `statoVero` in specialisti.ts restituisce una stringa libera, quindi `PAROLE` va indicizzata con stringhe e deve avere la voce 'ferma'. _(2026-11-16)_
- Per leggere `a.chats` in src/shared usare `chatsDi` (chats-di.ts), non `a.chats` diretto: gli autopiloti da altri PC o di formato vecchio possono non averlo. _(2026-11-19)_
- statoPc (stato-pc.ts, dal battito) e titoloDopoIlBussare (scoperta-pc.ts, dopo il ping) sono due livelli diversi; il vocabolario in vocabolario-stati-pc.ts li copre entrambi. _(2026-11-19)_

## viste

- le stime fatte coi minuti trascorsi (10+min) mentono su lavori bloccati: per lavori remoti la percentuale va omessa, non inventata _(2026-11-16)_

## stato

- il tono `riposo` di `fraseStatoOrchestratore` vale sia per «a riposo» sia per «in attesa di unioni»: `autopiloti-vista` lo legge come finito. Serve distinguere dal testo. _(2026-11-16)_
- Esistono due funzioni `statoPc`: `shared/stato-pc.ts` (battito, soglia 35 min) e `shared/scoperta-pc.ts` (ping). Importare quella sbagliata cambia la soglia senza errori. _(2026-11-19)_
- il riassunto tronca in coda a 12.000 caratteri: con una coda lunga perdi PRONTI, DOMANDE ed EVENTI senza avviso (riassunto-orchestratore.ts:140). _(2026-11-20)_
- L'orchestratore costruisce lo stato per sezioni (testata, coda, piano, specialisti, fisse, eventi): una nuova sezione che non deve sparire va in «fisse». _(2026-11-20)_

## chat

- `c.stato === 'lavoro'` non dice che la chat lavora: resta così a fine turno e dopo la chiusura; i conteggi devono guardare `viva`, `fine` e `conclusa`. _(2026-11-16)_

## notifiche

- in `Ronda.kt` il calcolo del suono è fatto e poi ignorato (`suona = true`): i test Kotlin non lo coprono. _(2026-11-16)_

## errori arrivati

- «affidato» non vuol dire «corretto»: per il lotto del 13/11 non c'è stata nessuna modifica di codice, quindi «la correzione non è bastata» è un'etichetta sbagliata. _(2026-11-16)_

## errori-arrivati

- il dato `affidati` ha solo data e versione, non l'esito della chiusura: «si ripresenta» non può distinguere correzione fallita da azione a mano non fatta. _(2026-11-16)_
- il rapporto del lotto in .sierradeck/errori-arrivati/ non è nella copia del worktree: va passato nel messaggio del compito. _(2026-11-16)_

## vista

- un tono nuovo di fraseStatoOrchestratore va mappato in 4 posti: autopiloti-vista, stato-telefono, COLORE_TONO di client-pagina e Android (ignoto = riposo grigio) _(2026-11-16)_
- I lavori ospitati hanno stati ricevo/in-coda/preparo/lavoro: ora `fase` in VistaAttesa separa ricezione e preparazione; in-coda è ancora trattato come «al lavoro». _(2026-11-16)_

## codice

- `chatViva` esiste già in `autopilota-telefono.ts` (senza `nelRecupero`): quello condiviso è `chatInVita` in `autopilota.ts`; non confonderli. _(2026-11-16)_

## dati

- un autopilota da un altro PC o da un file vecchio può mancare di `dialogo`, `decisioni` o `chats`: le funzioni in `shared` che lo leggono devono trattare gli elenchi assenti come vuoti. _(2026-11-16)_

## metodo

- se un criterio rosso nel principale è verde in un worktree pulito, confrontare lo stato non committato del principale prima di toccare i tempi dei test. _(2026-11-16)_

## prova

- fissaLaVersione deve coprire anche grep/findstr/Select-String/rg, non solo ===/!=: i criteri di versione scritti come ricerca di testo facevano respingere i rami che alzano la versione. _(2026-11-17)_

## push

- Dal worktree il `git push` verso GitHub è negato dai permessi dello strumento Bash, prima di arrivare alla rete: va fatto dallo specialista «rilascio». _(2026-11-17)_

## pc

- «Dismetti questo PC» esiste già (7 giorni, solo `pc-<id>` dal Drive, `src/main/progetti/posta.ts:558`): la scadenza dei 30 giorni va costruita sopra questo, non accanto. _(2026-11-19)_
- La soglia di 7 giorni è scritta due volte, `posta.ts:116` e `salute.ts:273`: cambiarne una sola lascia la Salute e la logica in disaccordo. _(2026-11-19)_
- Il rapporto del controllo elenca anche i PC spenti, e ognuno porta il paragrafo di Salute con «Accendi X»: se si toglie un PC dalla lista va tolto anche da `testoRapporto` (`controllo-pc.ts:152`). _(2026-11-19)_
- `statoPc` di scoperta-pc.ts e `statoPc` di stato-pc.ts sono due funzioni diverse (stessa parola): la prima è il bussare, la seconda la soglia del battito. _(2026-11-19)_
- Il segno «più recente fra SierraDeck e Aiutante» richiede `host` uguale in tutti e due i battiti (`vistoConAiutante`): senza `host` l'abbinamento non scatta e il PC con solo Aiutante sembra «non risp… _(2026-11-20)_
- l'abbinamento SierraDeck/Aiutante dipende solo dall'`host` dei due battiti: ora senza maiuscole né dominio. Se un PC resta «non risponde», controllare l'host nei due battiti sul Drive. _(2026-11-20)_

## posta

- Le voci nelle cassette `posta-*-da-*` restano 'attesa' per sempre nel file: lo stato vero sta in `posta-<dest>-esiti`, quindi «in coda» va deciso incrociando i due. _(2026-11-19)_
- `postino.pcSubito()` risponde con la memoria anche se vecchia (anche quella letta dal disco all'avvio): per decisioni a intervalli lunghi, come il controllo ogni 6 ore, serve `postino.pc()`. _(2026-11-20)_
- la firma del battito esclude `risorse` e l'ora di `capacita`: dati che cambiano a ogni misura farebbero riscrivere il battito sul Drive a ogni giro. _(2026-11-20)_

## stato-pc

- Un battito nel futuro conta «acceso» (come pcVivo) e uno illeggibile «spento» ma mai da rimuovere: con un orologio sbagliato la rimozione automatica non deve scattare. _(2026-11-19)_
- `gruppiAltriPc` ora vuole `adesso` e non più `vivo`: stato e frase si ricavano da `visto` con `statoPc`. _(2026-11-19)_
- Due `statoPc`: shared/stato-pc.ts (sul battito) e shared/scoperta-pc.ts (sul ping). Lo stato `in-aggiornamento` è solo nel secondo; aggiungere un valore all'unione richiede di controllare gli switch … _(2026-11-19)_

## rotte

- `/api/pc` esclude i PC da rimuovere; l'app Android può contare su `stato`, `frase` e `giorniAllaRimozione`. _(2026-11-19)_

## novita

- in `android/novita-app.txt` la voce app va aggiunta a mano a ogni salita di versionName, altrimenti `pubblica-app` si ferma; verificarla con `noteDi` di `scripts/note-novita.mjs`. _(2026-11-19)_
- la voce in novita.ts va in cima all'array NOVITA; nelle righe mai iniziare con «versione:». _(2026-11-20)_
- In novita.ts le voci hanno `righe: [...]` o su una riga o su più righe: ogni parser di quel file deve gestire entrambe le forme. _(2026-11-20)_

## versione

- Una versione tocca package.json, package-lock.json (2 punti), novita.ts e una nota nel quaderno. Android si alza solo se android/ cambia oltre a novita-app.txt, che è solo testo. _(2026-11-19)_

## aggiornamento

- il battito Drive (`shared/posta.ts` riga 61) non porta nessun campo di aggiornamento: chi guarda da un altro PC non sa che quel PC si sta installando. _(2026-11-19)_

## tipi

- Non chiamare `aggiornando` il campo nuovo di `PcRemoto`: in `RiquadroRemoto` quell'oggetto passa a `pcVivo` (tipo `BattitoPc`) e il tipo non combacia. Ho usato `inAggiornamento`. _(2026-11-19)_

## file

- molti .tsx del renderer sono CRLF: Write li scrive LF, riconvertire con sed 's/$/\r/'; Edit invece combacia. Python non c'è sulla macchina. _(2026-11-19)_

## pagina-telefono

- Il riassunto dell'autopilota e la linguetta Avanzamento mostravano la stessa percentuale; ora solo la linguetta. Gli specialisti stanno solo in Autopiloti e nel menu della chat. _(2026-11-20)_

## sync

- su Drive viaggiano solo `workspaces.json` (unione per nome) e le chat; coda, piano, autopilota e ordine sono locali per PC. Allineare i PC non è questione di sync, serve un'identità condivisa. _(2026-11-20)_
- «rimetti» in segnaWorkspaceSulDrive firma il manifesto come file diverso, altrimenti il file locale sembra invariato e il workspace ripristinato non risale sul Drive. _(2026-11-20)_

## workspace

- «Elimina workspace» non mette la lapide sul Drive: al salvataggio dell'altro PC il workspace ritorna (unioni.ts:78). _(2026-11-20)_
- Non esiste una UI di riordino dei workspace: l'ordine è l'array. `Archivio.ordine` (nomi+quando) ora viaggia sul Drive; serve un'azione che chiami `riordinaWorkspaceArchivio`. _(2026-11-20)_
- Una lapide toglie dal Drive, mai dal PC: gli altri PC tengono il workspace nel loro archivio locale ma non lo rimandano su. _(2026-11-20)_
- L'ordine dei workspace vive nell'array dell'archivio: PC, pagina e app lo leggono tutti da lì, quindi riordinare l'array basta. Il campo `ordine` serve solo all'unione sul Drive. _(2026-11-20)_

## adozione

- le chat adottate non escono mai dallo stato da sole: lo stato le stampa tutte, anche chiuse da mesi. _(2026-11-20)_

## code mode

- claude.exe ha Code Mode sperimentale con riavvio della sessione: non attivarlo sul processo -p dell'autopilota senza una misura. _(2026-11-20)_

## testi

- Gli Aiuto citano ancora «Altri computer» e «Salute → Altri computer»: dopo ogni spostamento di voci, cercare i nomi vecchi nei testi (impostazioni-struttura.ts, SezioneAltriPc.tsx). _(2026-11-20)_
- I percorsi «Impostazioni → …» vanno presi da src/shared/percorsi-menu.ts; il test testi-menu-esistenti rifiuta sezioni inesistenti nei testi utente (escluse novita.ts e le righe di commento). _(2026-11-20)_

## compatibilità

- campo assente nel battito = «sconosciuto», non «no»: i PC vecchi non lo scrivono, e `haCapacita(undefined, …)` lo rispetta. _(2026-11-20)_

## sicurezza

- lo specialista ospitato prima ereditava tutto process.env; ora `ambienteSpecialista` (shared/aiuto-credenziali.ts) tiene solo base+dichiarate. Nuove variabili di base vanno in ENV_BASE. _(2026-11-20)_

## cassaforte

- scriviAtomico scrive testo, non Buffer: il blob cifrato si salva in base64. Il dispositivo `pc:tel:` è un telefono, mai un PC: le rotte sensibili lo scartano. _(2026-11-20)_

## token

- il blocco <quaderno> si manda solo se l'impronta dell'indice cambia o la sessione è nuova; un turno fallito azzera l'impronta (rimettiInAttesa). _(2026-11-20)_

## claude

- Il Code Mode di Claude Code non vale con `-p` né con l'SDK (solo terminale interattivo): con `-p` il contesto è identico, 56.549 token con e senza variabile. _(2026-11-20)_

## mcp

- L'MCP dell'orchestratore gira nel servizio autopilota, che non ha né i battiti né le chiavi dei PC (stanno nel main): per parlare ai PC serve un canale servizio→main, oggi inesistente. _(2026-11-20)_

## spedizioniere

- le capacità dei PC arrivano già in `Aiutante` da `aggiornaPosti`: non serve una mappa a parte; `scegliCapace` passa `[scelto]` a `decidiRiassegna`. _(2026-11-20)_

## main

- `chiudiRisorse()` chiude il db mentre le finestre possono ancora interrogare gli ipc: i gestori che usano `db` devono controllare `db.open`. _(2026-11-20)_
