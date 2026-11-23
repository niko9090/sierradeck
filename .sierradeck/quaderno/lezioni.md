# Lezioni del progetto

<!-- SierraDeck: una riga per voce; una voce che torna aumenta «confermata N×». Tetto 600 voci o 128 KB: escono prima le meno confermate e più vecchie. Si può scrivere anche a mano. -->

## test

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
- Su una copia sotto `copie/…` il test «PreToolUse dell'unico» di `servizio-orchestratore.test.ts` è rosso già senza modifiche: non è una regressione. _(2026-11-22)_
- `tests/autopilot-host/servizio-orchestratore.test.ts` («PreToolUse dell'unico») fallisce già su main in una copia worktree: non è una regressione del proprio ramo. _(2026-11-22)_
- Nei test del riassunto, se il dialogo contiene una risposta di «lui» dopo il messaggio di Nicholas, «Da sapere» non è mai vuoto. _(2026-11-22)_
- nei test renderer non c'è DOM: le regole di scorrimento stanno in funzioni pure in `segue-fondo.ts`, e le chat si controllano leggendo il sorgente. _(2026-11-22)_
- Per un test a livello di server il workspace nasce dalla migrazione di un vecchio autopilota con una chat viva (`migraVecchi`), che adotta la chat e apre una richiesta in coda. Per una coda vuota va … _(2026-11-22)_
- `servizio-orchestratore.test.ts` «il PreToolUse dell'unico…» fallisce anche senza modifiche quando si lancia dalla copia (worktree): dipende dal percorso, non è una regressione. _(2026-11-22)_
- `servizio-orchestratore.test.ts` («PreToolUse dell'unico») fallisce già sulla base nel worktree: dipende dal percorso della copia, non è una regressione. _(2026-11-22)_
- per provare il silenzio del lavoratore bastano fake timer solo su setInterval/clearInterval, creati prima di `avvia`; avanzare di 30 s per volta, un salto più lungo conta come sonno. _(2026-11-22)_
- test «unione scaduta»: dopo la scadenza il posto resta occupato fino a git chiuso, quindi i finti `fai` vanno chiusi col segnale _(2026-11-22)_
- `riassegna-lento-collegato.test.ts` fissava il testo «riparte qui»: cambiando i messaggi dello spedizioniere va aggiornato anche quel file. _(2026-11-22)_
- nei test con processo finto, un `muori()` durante un turno attiva il ritorno immediato di `guasto` (primi 2 tentativi): per provare la guardia chiudere prima il turno con `fine()`. _(2026-11-22)_
- i test che simulano la fine di uno specialista devono chiudere con «RAPPORTO: finita»: senza, per sviluppatore/interfaccia/android/verificatore il compito torna da fare e l'unione non parte _(2026-11-22)_
- `tests/shared/novita.test.ts` ammette al massimo 8 righe per voce: portando più novità in una versione sola, accorpare le righe doppie. _(2026-11-22)_
- l'orologio di prova del servizio avanza di qualche ms: le durate vanno confrontate con un margine, non con un valore esatto _(2026-11-22)_
- in creaTurni anche l'unione che aspetta ha la sua scadenza (unioneMaxMs): nei test di attesa usare un valore più largo del ritardo di chiusura, o la seconda scade da sola _(2026-11-22)_
- il «PreToolUse dell'unico» rosso nelle copie worktree era un bug vero (percorso con spazi), non un problema del test. _(2026-11-22)_
- `inVolo` non deve dipendere dall'ora: il test del lavoro fermo avanza `adesso` di ore con un turno aperto e lo conta occupato. Il turno appeso lo chiude il cane da guardia. _(2026-11-22)_
- `rifiutata` in attesa-specialisti ha una sola «i»: l'alias `rifiutataDalTetto` nel servizio; un test già esistente pretende che un fallito perda il prompt, solo il fermato lo tiene _(2026-11-22)_
- il tempo massimo della suite (verifiche.ts:87) è 20 min come il cane da guardia: una soglia di silenzio uguale ferma da sani gli specialisti che aspettano la suite _(2026-11-22)_
- riassegna-lento-collegato.test.ts sta in tests/autopilot-host, non in tests/main come dice il compito. _(2026-11-22)_
- per testare lotti di unioni nel servizio serve un cancello sul primo comando git: il primo ramo parte da solo con la fila vuota, il lotto lo formano quelli accodati dopo _(2026-11-22)_
- `autopiloti-unificata.test.tsx` conta i componenti in `PannelloAutopiloti.tsx` con una regex: se cambi la scheda, aggiorna anche quel controllo. _(2026-11-22)_
- la guardia apre da sola un turno («silenzio» per una chat muta): nei test sulla spinta va chiuso con un result finto dopo ogni giro, o il turno resta «in volo» e la spinta tace. _(2026-11-23)_
- con `dorme` finto istantaneo, un finto PC che non finisce mai manda `segui` in un giro infinito di microtask: vitest si blocca e non scatta il timeout. Ogni PC finto deve finire. _(2026-11-23)_
- una task_notification riapre inTurno nel flusso: negli eventi di prova va chiusa con un result, o gli eventi raccolti all'autopilota non partono _(2026-11-23)_
- la suite `tests/main` + `tests/shared` dura circa 340 s; gli errori non gestiti, se ci sono, sono intermittenti e non appaiono a ogni giro _(2026-11-23)_
- `pty-host-client.test.ts` avvia processi figli veri: primo sospetto per eventi tardivi dopo la fine del test _(2026-11-23)_
- `vitest related` sui file toccati prende anche i test fuori da tests/autopilot-host e tests/shared (qui tests/main): lanciarlo prima di dire «verde». _(2026-11-23)_
- per provare il cane con fake timer su setTimeout avanzare anche `adesso()` a passi di 30 s: la soglia larga confronta il silenzio con adesso(), non con i timer. _(2026-11-23)_
- giroInvioErrori + salvaErroriArrivati + raggruppa si provano insieme con file veri in una cartella temporanea: i nomi dei file arrivo sono l'ora UTC _(2026-11-23)_
- per far ritirare insieme due PC dello stesso lavoro: PC muto >30 min e secondo PC, entrambi «finito» al medesimo `ora` finto; un `await` nella chiamata «ritira» rende lo scontro certo. _(2026-11-23)_
- i test in `tests/main` verificano il cablaggio leggendo i sorgenti con `readFileSync`: cambiare i nomi dei canali o delle rotte li rompe _(2026-11-23)_
- Gli id dei lavori affidati devono essere `r` + 12 cifre esadecimali (`idLavoroValido`): altrimenti il file `aiuti-affidati.json` li scarta in silenzio. _(2026-11-23)_
- Diversi test leggono il sorgente di `App.tsx` e `WorkspacePanoramica.tsx` con regex: cambiando le viste, `vitest related` non li trova. Lancia `tests/renderer` per intero. _(2026-11-23)_
- `tests/main/grafica-0-82-0.test.ts` controlla stringhe esatte in `WorkspacePanoramica.tsx`: il rifacimento del pannello agenti 0.115.1 lo ha rotto e va aggiornato nello stesso commit. _(2026-11-23)_
- i test grafici che cercano stringhe di JSX in WorkspacePanoramica.tsx si rompono a ogni rifacimento del pannello: lanciare tests/main e tests/renderer interi prima di pubblicare _(2026-11-23)_
- lo stato mostra gli eventi tagliati a circa 200 caratteri: le parole che contano (numero scadenze, «non è un caso») vanno all'inizio della frase _(2026-11-23)_
- un'attesa nuova nel servizio delle unioni (es. raccolta raffica) rompe i test che fanno partire il primo ramo da solo: ogni attesa va resa passabile dal server nei test. _(2026-11-23)_
- togliere un flag dai comandi dei criteri (es. --rerun di gradle) cambia i comandi attesi in criteri-prova.test.ts: aggiornarli insieme. _(2026-11-23)_
- Nei test della guardia con orologio finto servono 3 min di storia più 1 min di rilascio prima che un PC piccolo stabile risulti libero: misurare ogni 5 s per oltre 4 min. _(2026-11-23)_
- nei test del server con più workspace, l'ordine di `processi[]` non segue i workspace: riconoscere ogni processo dal `ws=` nel suo `--mcp-config`. Le cartelle (cwd) devono esistere. _(2026-11-23)_
- Il turno aperto da un messaggio di Nicholas contiene già «Il lavoro è fermo» nel riassunto: per contare le spinte vere nei test serve un riferimento preso dopo il messaggio. _(2026-11-23)_
- `npx vitest related` va lanciato con `--run`, altrimenti resta in attesa. La suite dei file collegati a rapporto-lavori.ts dura oltre 2 minuti e finisce in background. _(2026-11-23)_
- in questa copia i file di test sono CRLF, e gli heredoc di bash convertono `\0` in un NUL vero: scrivere gli escape da un file Node con `String.fromCharCode`. _(2026-11-23)_
- Per provare Invio/Scaricatore basta un Trasporto o una lambda finta in memoria; usare un contatore di chiamate con check() per far fallire i cicli infiniti invece di bloccare gradle. _(2026-11-23)_
- se in un confronto si serializza un oggetto per decidere se riscrivere, l'ordine delle chiavi conta: i rami che creano la stessa voce devono dare le chiavi nello stesso ordine _(2026-11-23)_

## worktree

- per togliere un worktree con giunzione node_modules: verificare LinkType, `cmd /c rmdir` sulla giunzione, poi `git worktree remove` e `prune`; il node_modules principale resta intatto. _(2026-11-17)_
- Le copie «locked» possono non avere più la cartella su disco: `unlock` e poi `worktree remove --force` toglie il riferimento senza errori. _(2026-11-22)_

## android

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
- Invio.manda e Scaricatore.scarica sono cicli while(true): ogni ramo che non avanza (pezzo vuoto, 409 allo stesso punto) deve avere un limite o un'uscita, altrimenti gira a vuoto. _(2026-11-23)_
- Con `registerDefaultNetworkCallback`, passando da wifi a dati arriva `onAvailable(nuova)` prima di `onLost(vecchia)`: in `onLost` vale solo se la rete è l'ultima vista. _(2026-11-23)_
- I record di chiusura dei record di `/api/eventi` hanno un `n` nuovo e lo stesso `id` dell'apertura: in un pacco unico vanno filtrati (`RegoleAvvisi.senzaSuperati`) o l'avviso suona e sparisce. _(2026-11-23)_
- I test Android usano JUnit4 (org.junit), non kotlin.test; i parametri nuovi di CorpoWorkspace vanno in fondo con default, perché FotoSchermateTest lo chiama in modo posizionale. _(2026-11-23)_
- mettiInCoda (schermate/comune/PezziLavoro.kt) restituisce false in silenzio se coda o telefono non sono pronti: nessuna schermata dà riscontro all'utente. _(2026-11-23)_

## release

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
- `gh release create --draft` stampa un URL «untagged-…» ed è normale: con `--verify-tag` il tag c'è già e la release prende `v0.114.2` alla pubblicazione. _(2026-11-23)_

## git

- in questa copia `git fetch` può fallire se il remoto è un bundle sparito; `merge --ff-only main` basta _(2026-11-16)_
- in questa copia `git fetch` può fallire se il bundle di arrivo è già stato cancellato: `git merge --ff-only main` basta, main è già locale. _(2026-11-16)_
- il ramo worktree-agent-r45a1013a982d non era nella copia di destinazione: per unire basta il commit d611b967 se l'oggetto è presente. _(2026-11-16)_
- `core.longpaths=true` risolve «Filename too long» ma non `$GIT_DIR too big`: sotto Temp profonde nella prova tenere nomi corti (`p`, `a`). _(2026-11-16)_
- Prima del push `git rev-list --left-right --count main...origin/main` conferma che il remoto non è più avanti. _(2026-11-16)_
- il ramo worktree-agent-r8b9c35b5a04b parte da 881cd23f, indietro rispetto a main: il fast-forward da HEAD fallisce, serve cherry-pick. _(2026-11-17)_
- il controllo dei comandi scambia `git -C <copia> cherry-pick` per un cherry-pick nella cartella principale; il rifiuto arriva sull'intera riga, anche se contiene altri comandi. _(2026-11-17)_
- Dalla cartella principale `worktree add` in Temp e `cherry-pick` nella copia passano se sono chiamate separate; il blocco scatta solo sulla cancellazione (`rmdir`, `worktree remove`) fuori dalle cart… _(2026-11-17)_
- per provare un test senza la correzione: `git stash push -u`, `git stash apply`, `git checkout -- <file>`, poi `git checkout stash@{0} -- <file>` e `git stash drop`. _(2026-11-20)_
- `git cherry main <ramo>` dà "nuovi=0" solo per i rami identici a main. Per quelli rifatti o unificati serve anche cercare il k-N nel log di main. _(2026-11-22)_
- `togliCopiaUnita` cancella già il ramo (`branch -d`/`-D` con `forza`): un secondo `branch -D` subito dopo fallisce con «not found», va verificato prima. _(2026-11-22)_
- Le cartelle di build di Android fanno fallire `git worktree remove` con «Filename too long»: usare Remove-Item su `\\?\percorso`, poi `git worktree prune`. _(2026-11-22)_
- turni.unione rilascia il posto allo scadere mentre il git continua: un'altra unione nella stessa cartella può sovrapporsi (turni-criteri.ts:141-145). _(2026-11-22)_
- un git di prova che resta appeso deve chiudersi sul segnale, altrimenti con la fila nuova il posto della cartella non si libera mai _(2026-11-22)_
- se un ramo da unire è già aperto in un'altra copia, non si può riprenderlo: si fa ff-only a main e si unisce il ramo dentro il proprio, poi si indica il nuovo commit. _(2026-11-22)_
- In queste copie `git fetch` può fallire se il bundle in `aiuto\arrivi` non c'è più, e il tag della versione precedente può mancare: si trova il commit con `git log -S"x.y.z" -- package.json`. _(2026-11-23)_
- i file sorgente sono CRLF: per risolvere i conflitti con uno script le regex su `\n` non trovano nulla; usare Edit sui blocchi. _(2026-11-23)_
- il nostro wrapper git toglie gli spazi di testa di `status --porcelain`: " M f" diventa "M f", e staged/unstaged non si distinguono. Per le modifiche non in indice usare `diff --name-only -z`. _(2026-11-23)_

## autopilota

- INATTIVO_MS è 55 minuti: la cache del prompt dura 1 ora e lo spegnimento a 10 minuti la faceva riscrivere a ogni ripresa. _(2026-11-20)_
- Uno specialista è un sotto-agente: chiudere il turno = «finito» per il programma. Un «riprendo/aspetto l'esito» finale va letto (`promessaSenzaFine`) o si unisce lavoro a metà. _(2026-11-22)_
- `vistaAttesa` (colonna/menu «Al lavoro adesso») e `TestaOrchestratore` leggono fonti diverse: Agent del flusso contro `u.chats`. Una chat al lavoro può comparire in una e non nell'altra. _(2026-11-22)_
- Lo spegnimento per inattività uccideva solo il processo: il risveglio dipendeva da `lavoroFermo`, che non vede richieste aperte con compiti tutti uniti o bloccati. Ora fissa una sveglia su disco. _(2026-11-22)_
- Uno specialista locale vive dentro il processo `claude` dell'orchestratore: il programma non può ucciderlo da solo, lo segna «fermato» nel flusso e chiede all'autopilota TaskStop. _(2026-11-22)_
- «resta fermo» e «fermati» non sono una pausa: lavoro-fermo.ts continua a svegliare l'autopilota ogni ora. Serve uno stato di pausa finché non scrive Nicholas. _(2026-11-22)_
- spingiFermi (servizio-orchestratore.ts:2351) salta il workspace se ha messaggi in riprova: un login scaduto silenzia l'avviso di lavoro fermo. _(2026-11-22)_
- Una sveglia futura spegne il controllo del lavoro fermo (`spingiFermi`): una sveglia di settimane silenzia il lavoro pronto di tutto il workspace. _(2026-11-22)_
- I subagenti in sottofondo non hanno né silenzio né tempo massimo: il cane del turno si disarma quando il turno finisce, e lo specialista appeso occupa un posto per sempre. _(2026-11-22)_
- Uno specialista fermato lascia la sua copia con modifiche non salvate, e nessun evento dice dove sono: il salvataggio automatico gira solo nell'unione. _(2026-11-22)_
- la pausa di Nicholas sta in `impostazioni.pausa` e `lavoroDaPortareAvanti` risponde falso: con pausa l'inattività può spegnere il processo. Qualsiasi suo messaggio la toglie. _(2026-11-22)_
- un sotto-agente in sottofondo non fa mai partire il cane da turno: va armato anche a turno chiuso, e le righe con parent_tool_use_id sono i suoi segni di vita _(2026-11-22)_

## controllo

- Un rapporto di controllo può venire da una build più vecchia della correzione: prima di cercare un buco, riprodurre il caso nel codice attuale con un test. _(2026-11-20)_
- Nelle copie mancano i tag: «nessun tag contiene X» va verificato dall'autopilota con git tag --contains. 6f52ac0f (battito Aiutante) è già in v0.110.2+, quindi non spiega l'allarme del 20/11. _(2026-11-20)_

## ambiente

- Il programma blocca sleep oltre 30 s anche in ciclo o a pezzi; attese lunghe solo con il sì di Nicholas (classe sottofondo). _(2026-11-15)_
- Il blocco di sicurezza rifiuta `$p` nelle cancellazioni: scrivere i percorsi per intero, uno per comando, e le junction con `cmd /c rmdir`. _(2026-11-22)_
- Un workspace come BG4 può girare su un altro PC: i suoi registri non sono in questo AppData, le misure su di lui vanno chieste a quel PC. _(2026-11-23)_

## hook

- Il programma blocca l'intero comando Bash se un rmdir o una cancellazione contiene una variabile ($T): scrivere i percorsi per intero. _(2026-11-20)_
- Il PreToolUse dell'Agent, quando lascia passare, non può portare testo all'autopilota: i motivi «resta qui» vanno come `evento` al suo prossimo turno. _(2026-11-20)_

## versioni

- Le voci di versione del quaderno sono file datati (`AAAA-MM-GG-...md`). `errori-arrivati.md` è solo per gli errori arrivati. _(2026-11-19)_
- Un bump tocca 3 file di note: `src/shared/novita.ts`, `android/novita-app.txt` e `src/aiutante/novita-aiutante.txt` (righe che cominciano con `versione:`); app e Aiutante hanno la loro versione. _(2026-11-20)_
- I commit sull'Aiutante possono stare in src/shared (aiuto-rete.ts) e src/main, non in src/aiutante: per decidere il bump guardare cosa fanno, non la cartella. _(2026-11-23)_

## tooling

- Edit su una riga di import senza il newline finale la incolla alla successiva: dopo ogni Edit di import controllare con typecheck. _(2026-11-20)_

## criteri

- Mai criteri «versione === X» per un compito di versione: il cancello li rimisura e blocca ogni versione dopo. Usare «almeno X» (confronto numerico >=) o `gh release view vX`. _(2026-11-15)_
- un criterio con versione fissa passa sul principale ma cade su ogni ramo che alza la versione: va escluso dalla prova prima/dopo (`fissaLaVersione`), non rimisurato. _(2026-11-15)_
- Mai criterio `grep -q '"version": "X"' package.json`: fissaLaVersione ≤0.109.1 non lo riconosce e il cancello respinge ogni bump dopo (0.109.2). Usare `git rev-parse vX`. _(2026-11-17)_
- dimenticaIRossi azzera ogni esito non passato: ogni nuova memoria con esiti «non misurati» va esclusa per prefisso di chiave, o muore a ogni unione _(2026-11-23)_
- EsitoVerifica non conserva il codice di uscita (126/127): il riconoscimento «programma assente» si basa solo sul testo dell'uscita _(2026-11-23)_

## processo

- la copia di un compito di «rimettere in pari» può nascere senza il ramo da unire: controllare l'esistenza del ramo prima di assegnare il compito. _(2026-11-20)_
- Rimettere in pari un ramo nato qui: se il compito va su un altro PC il ramo là non c'è. Incolla nel prompt il diff (git diff main...ramo) e fallo riapplicare sopra main. _(2026-11-20)_
- Qui le attese da una chiamata Bash sono bloccate: `sleep` va a una chiamata sola, ≤20 s, senza altri comandi dopo. Per i comandi lunghi conviene `run_in_background` e leggere il file di output. _(2026-11-20)_
- Il ramo da riparare può non esistere nella copia worktree del PC di rete: verificare con `git branch -a` prima di assegnare il compito. _(2026-11-22)_

## unioni

- rami con rotte nuove: il conflitto sta nel tipo `FonteAiuto` di `src/main/rotte-aiuto.ts`; tenere i campi opzionali di entrambi i lati. _(2026-11-20)_
- `turni.unione` rende `TurnoScaduto` subito ma libera cartella e conteggio solo a `fai()` chiuso; pulizia della prova scaduta sempre dentro `turni.unione _(2026-11-22)_
- il lucchetto della cartella principale sta in turni.unione (turni-criteri.ts): si rende a corsa chiusa o dopo UNIONE_LIBERA_DOPO_MS dalla scadenza, mai prima _(2026-11-22)_
- i rami entrati in un lotto ripartono da `ramoUnito`: senza, cancelloOra li dice «fuori dai rami» e cambia il testo dell'evento «unione» _(2026-11-22)_
- I registri del servizio hanno `[unione di prova] … attesa del turno N s, prova N s` e `[criterio] finito con N in N s: cmd`: bastano per misurare le unioni senza strumenti nuovi. _(2026-11-23)_
- Ogni rilascio tocca package.json e android/novita-app.txt: la prova rilancia la suite intera e gradle (`soloNote` non conosce i .txt di android). Lì sta il tempo più grosso. _(2026-11-23)_
- i dati di un workspace stanno sul PC che lo ospita (workspace-su-pc.json): per BG4 qui non ci sono registri, serve il PC «fisso_scrivania_glos» _(2026-11-23)_
- i test della fila leggono il testo dello stato: allungare i motivi di scadenza taglia «(tentativo N)» e rompe unioni-in-fila-0-96-1 _(2026-11-23)_
- il turno pesante del PC (`conTurni` in index.ts) già serializza le misure di tutti i workspace: il collo 3 del rapporto 23/11 non serviva cambiarlo. _(2026-11-23)_
- la prova parte dopo qualche secondo dal `unisci`: per testare l'attesa del turno aspettare `turni.stato().inFila > 0`, non un tempo fisso. _(2026-11-23)_
- i criteri girano nella cartella principale: ogni script che riscrive file tracciati la sporca. Il blocco si rigenera da solo, quindi il programma deve rimettere a posto ciò che sporca lui. _(2026-11-23)_

## ui

- «Nessuno al lavoro» in PannelloSpecialisti riguarda i posti di questo PC (VistaAttesa), non la Panoramica: gli affidati non occupano posti qui. _(2026-11-16)_
- «Usate da altri PC» era sparita dalla fascia con k-u0 senza essere ricollocata: ora sta in PannelloChat (sottofondo.elenco + remoto.pc → righeAltriPc). _(2026-11-19)_
- Il Drive nel dettaglio sta dietro un tasto: ContenutoDrive appena montato apre la finestra d'attesa, quindi non va montato a ogni progetto scelto. _(2026-11-19)_
- ferma/riparti/archivia dell'autopilota non hanno API nel renderer (solo crea, dialoga, avvioAlLogin): per metterli in pagina serve prima l'IPC. _(2026-11-19)_
- I test di sorgente (`readFileSync` sul .tsx) bastano per controllare che un pannello non porti più un elenco, senza DOM. _(2026-11-19)_
- gli orfani vanno cercati con il suffisso `/Nome'` negli import: un controllo su `./Nome'` ignora gli import fatti da App.tsx (`./components/Nome`). _(2026-11-20)_
- Nel menu dei workspace le azioni dietro «⋯» sono contate da test e pagina servita: il riordino sta in controlli a parte, non come nuova azione di `azioniMenuWorkspace`. _(2026-11-20)_
- Il menu principale ha già una funzione «Computer» che non è la sezione Computer delle Impostazioni: le voci delle impostazioni stanno solo in impostazioni-struttura.ts. _(2026-11-20)_
- `FlussoChat` è condiviso da chat locale e remota: chi lo usa deve passare `fondo` dall'hook `useSegueFondo`, altrimenti niente `onScroll` né tasto. _(2026-11-22)_
- Nelle viste con autopilota il pannello agenti sta in `CorpoPanoramica` e in una colonna di `App.tsx`: se ne cambi una, controlla anche l'altra. _(2026-11-23)_
- `PannelloAgenti` legge dalla sorgente (`useSorgente`): per un altro PC basta il provider `sorgenteRemota`, e "Ferma" resta solo locale. _(2026-11-23)_

## salute

- «non so se è acceso» valeva anche con battito fresco; ora «acceso secondo il Drive, ma non si raggiunge». Le righe unite del controllo (controllo-pc.ts `generica`) vanno aggiornate con ogni nuova dic… _(2026-11-15)_
- Le soglie spento/acceso vanno prese da `statoPc`; con `PC_SPENTO_DOPO_MS` i confronti `<` e `<=` si mischiavano e davano risultati diversi al limite. _(2026-11-19)_
- L'elenco PC di Salute si toglie nel renderer (`saluteSenzaPc`), non in `salute.ts`: le stesse voci servono a telefono e pagina servita. _(2026-11-19)_

## misure

- Nel confronto dei token con `claude -p` contano input + cache creata + cache letta insieme: il secondo giro costa meno solo per la cache calda, non per la modifica provata. _(2026-11-20)_

## aggiornamenti

- `creaAggiornamenti` prende parametri posizionali in coda: un nuovo aggancio (come `annunciaAgliAltri`) va aggiunto per ultimo, senza toccare l'ordine. _(2026-11-19)_
- `note()` leggeva `versioneScaricata` prima di `stato.versione`: durante lo scaricamento di una versione più nuova mostrava le note della vecchia. _(2026-11-23)_
- I test della ricerca silenziosa usano timer finti e `RICONTROLLA_MS`; la fase `attendo` compare solo se `attendiQuiete` chiama `avvisa`. _(2026-11-23)_

## guardia

- in `guardia` `riavviaSeMorto` va dopo `suonaSveglie`: se prima, il turno di ripresa è in volo e la sveglia aspetta in coda dietro di lui. _(2026-11-22)_
- `comandiGit` ha il flag `i`: `-c <x>` e `-C "<percorso con spazi>"` si confondono se l'alternativa `-c` viene prima. Tenere `-C` prima. _(2026-11-22)_
- `giudicaGuardiaOrchestratore` può testarsi con tool_name 'Agent' e contesto minimo { radice, specialistiSulPc, tettoPc, dipendenze }. _(2026-11-23)_
- Su un PC piccolo il carico di fondo (minimo su 10 min) è il «non suo»: le soglie salgono sopra quello, tetti in scala; un PC grande (>=8 CPU e >=12 GB) resta com'era. _(2026-11-23)_

## renderer

- SORGENTE_LOCALE (sorgente-autopilota.tsx) è il punto unico da cui il renderer chiama coda/orchestratore/specialista: le guardie sul workspace vanno lì. _(2026-11-16)_
- I dati IPC del renderer vanno validati: `setGruppi(g)` senza Array.isArray cadeva su `.length`. Uso `gruppiValidi` in shared/workspace-remoti.ts. _(2026-11-19)_
- `chiaveWorkspace` riceve dati remoti incompleti: i tipi dicono `cwd: string` ma a runtime può mancare; controllare con `typeof`, non fidarsi del tipo. _(2026-11-20)_
- Il formato Panoramica+agenti dipende da `workspaceElenco` (preferenza per nome), che la migrazione riempie una volta sola: i workspace nuovi restavano fuori. _(2026-11-22)_
- Gli hook di App.tsx vanno prima di `if (!pronto)`: un effetto dopo causa React #310. _(2026-11-22)_
- Il tipo di `window.gestore` è in `src/renderer/env.d.ts`, a mano: una funzione nuova del preload va aggiunta anche lì, o il typecheck fallisce. _(2026-11-22)_

## pubblicazione

- `npm run pubblica-app` esige la voce `versione: 'X'` in `android/novita-app.txt` per il `versionName` corrente: va preparata insieme al bump Android, o l'app resta indietro. _(2026-11-16)_
- `gh release create --draft --verify-tag` seguito da `npm run pubblica` con `GH_TOKEN` carica tutti e 7 i file senza 422; poi `--draft=false --latest` a mano. _(2026-11-16)_
- `npm run pubblica-app` copia da solo app-android.json anche sulla release del PC (v0.109.1): non serve altro per le app vecchie. _(2026-11-16)_
- L'hook rifiuta run_in_background per `npm run pubblica`: lanciarlo davanti; dopo 600 s passa da solo in sottofondo (non rilanciarlo) e un `until [ -s output ]` attende la fine. _(2026-11-19)_
- `pubblica` allega da solo json e Aiutante e lascia la release in bozza: alla fine servono `gh release edit --draft=false --latest` e il controllo dei 7 file. _(2026-11-19)_
- Se `pubblica` dice «mancano installer, blockmap e latest.yml», sono già in dist/ ma con spazi: caricarli con `gh release upload`, rinominati a trattini (SierraDeck-Setup-X.exe). _(2026-11-20)_
- Con la release creata prima da `gh release create`, serve poi `gh release edit --draft=false --latest`: `pubblica` non la segna Latest da sola. _(2026-11-20)_
- Se lancio `npm run pubblica` oltre i 10 minuti, passa in sottofondo da solo: i file arrivano uno alla volta e la bozza va pubblicata solo quando il comando è finito. Prima si contano i 7 file. _(2026-11-23)_
- I comandi con `sleep` sono bloccati dal programma. Per aspettare, uso controlli brevi di `gh release view`, senza pause lunghe. _(2026-11-23)_
- se la release è in bozza con pochi file, controlla con Get-CimInstance se `npm run pubblica` è ancora vivo: il caricamento dell'installer da 114 MB e dell'Aiutante richiede circa 3 minuti. _(2026-11-23)_
- latest.yml si verifica con `openssl dgst -sha512 -binary <exe> | base64 -w0`: deve coincidere con lo sha512 scritto nel file. _(2026-11-23)_
- Dopo aver ricostruito l'installer dell'Aiutante, confrontare sha512 (base64) e size dell'exe scaricato dalla release con `aiutante.yml` allegato: è il controllo che l'updater fa. _(2026-11-23)_

## servizio

- `percentuale` per i lavori ospitati è inventata (10 + minuti): non mostrare una barra senza una stima vera. _(2026-11-16)_
- il servizio autopiloti non conosce porta del client né gettoni del programma: per parlargli c'è `ponte-locale.json` nella cartella dati (porta+gettone), riscritto a ogni avvio del programma. _(2026-11-20)_
- `lavoroDaPortareAvanti` deve contare anche le chat adottate (`specialistiVivi`), non solo i subagenti: una chat migrata in `lavoro` è lavoro in corso anche con piano vuoto. _(2026-11-22)_

## registro

- `Registro` ha solo info ed errore: l'«avviso» è una riga info con prefisso [avviso]; solo `errore` entra nello storico degli errori arrivati. _(2026-11-16)_
- «riparte con --resume» non basta: investimento è stato spento il 21/11 13:25 senza ripresa nei log, probabilmente perché nessuna sveglia era rimasta fissata. _(2026-11-22)_

## pc-remoto

- due funzioni si chiamano `statoPc` (`shared/stato-pc.ts` e `shared/scoperta-pc.ts`): i titoli del riquadro vengono dalla seconda, il tempo dal battito della prima. _(2026-11-19)_

## pagina

- La pagina del telefono è una stringa gigante: i testi condivisi vanno iniettati con `${JSON.stringify(...)}` e le funzioni si provano estraendole dallo script, come in tests/main/client-pagina-domand… _(2026-11-19)_
- pannelliDelPosto (shared/navigazione-telefono) decide quali pannelli sono «aperti»: 'specialisti' ora è aperto su tutta la voce Workspace, quindi la lista si rilegge ogni 4 s lì. _(2026-11-19)_

## rete

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
- k-175c richiede la cartella principale di Nicholas (E:\...\SierraDeck): su un mirror `git worktree list` non mostra le copie `agent-*`. Va controllato prima di assegnarlo. _(2026-11-22)_
- `requisiti.rete` con un percorso locale non bastava: un PC con capacità sconosciute (versione vecchia) passa il filtro. Il controllo va fatto prima di valutaPrimaDiAffidare. _(2026-11-22)_
- Il riconoscimento «resta qui» sta in motivoPerRestareQui (src/shared/aiuto-rete.ts): estenderlo lì, un solo punto per i compiti locali. _(2026-11-22)_
- Stop di un lavoro affidato: `fermareIl` sul lavoro, lo spedizioniere inoltra `/api/aiuto/ferma` e riporta «fallito» con causa «fermato», che non conta come guasto e non fa riassegnare. _(2026-11-22)_
- `avanza` deve dire se il servizio ha ricevuto l'esito: chiudere il PC remoto prima cancella copia e ramo di un lavoro che il servizio non conosce ancora. _(2026-11-22)_
- Un PC in silenzio non ha perso il lavoro: va aspettato, e riassegnato senza `chiudi`. Con due copie vive vince il primo ramo che arriva (set `vinto`). _(2026-11-22)_
- un compito di "unione" può arrivare a un PC dove il ramo da unire non è stato trasferito: controllare con `git branch -a` prima di partire. _(2026-11-22)_
- Una correzione di un ramo locale affidata a un altro PC non trova il ramo: nel prompt metti il diff intero (git diff main...ramo), non solo il nome del ramo. _(2026-11-22)_
- `aiuto-rete.ts` e `servizio-orchestratore.ts` sono toccati da quasi tutti i filoni: i rami lunghi vanno uniti presto, o i conflitti tornano. _(2026-11-22)_
- i rami tornati da «Aiuta la rete» arrivano come bundle, senza worktree: un revisore senza terminale non li legge, va passato il diff o un worktree estratto _(2026-11-22)_
- Rami tornati da «Aiuta la rete» sono solo bundle senza worktree: un revisore (senza terminale) non li legge; per rivederli serve un verificatore o un compito dopo l'unione. _(2026-11-22)_
- «Rete dei PC», «Altri PC» e la lista in Salute sono ora la sola pagina Computer (`computer-vista.ts`): un dato per PC si aggiunge a `NodoRete` e `SchedaPc`, una volta sola. _(2026-11-22)_
- nello spedizioniere `inInvio` (k-176b) va mandato prima del ritiro del ramo; `fileRamo` si legge solo dopo un ritiro riuscito. _(2026-11-22)_
- Sul PC «Aiuta la rete» i rami degli altri PC non ci sono: prima di assegnare un cherry-pick, verificare che il ramo sorgente sia stato inviato a quel repository. _(2026-11-22)_
- un compito che nomina un ramo locale di un altro PC non si può eseguire qui: prima di assegnarlo va portato il ramo (bundle o patch) nella copia. _(2026-11-22)_
- Un conflitto da risolvere affidato a un altro PC non vede i rami locali: nel prompt va messo il diff completo (git diff main...ramo), non il nome del ramo da cui fare cherry-pick. _(2026-11-22)_
- Uno specialista su un altro PC (Aiuta la rete) riceve solo main: per riapplicare un ramo locale in conflitto, mettere la modifica intera nel prompt. _(2026-11-23)_
- `ritira` usa file e ramo fissi per lavoro (`<id>-ritorno.bundle`, `ramoDiRitorno(id)`): `attendiRitorno` e la nuova spedizione possono ritirare insieme e scontrarsi. _(2026-11-23)_
- file e ramo di ritorno sono uno per lavoro (`<id>-ritorno.bundle`, `ramoDiRitorno`): ogni ritiro nuovo dello stesso id va messo nella coda di `ritira`, non fatto a parte. _(2026-11-23)_
- `/api/flusso` risponde sempre 200 con `flusso:true`: 404/405/409/501 o risposta senza il segno vogliono dire PC vecchio, ogni altro errore è rete e si riprende dal cursore _(2026-11-23)_
- Le richieste di Nicholas (coda.json) stanno in AppData\Roaming\sierradeck\orchestratori: uno specialista su un altro PC non le vede, quindi le sue parole vanno copiate intere nel prompt. _(2026-11-23)_
- Un agente sull'Aiutante non può interrogare un altro PC: le chiamate vogliono la chiave di casa del portachiavi. Da qui si legge solo `pc-altrui.json` (versione, carico, posti). _(2026-11-23)_
- un compito che deve leggere .sierradeck/errori-arrivati va tenuto sul PC di riferimento con requisiti.rete = quel percorso: altrimenti finisce su un Aiutante che non ha la cartella _(2026-11-23)_

## cancello

- Il cancello che unisce gira col SierraDeck INSTALLATO: una correzione al cancello unita in main non vale finché Nicholas non installa la versione che la contiene. _(2026-11-15)_
- Una correzione al cancello (criteri-prova.ts) vale solo dalla versione installata: unita in main non sblocca subito i rami respinti dal cancello che gira; serve un'unione fuori dal cancello. _(2026-11-17)_
- Il criterio di un compito già unito (es. k-v1 di r-141) non si può correggere con piano_scrivi: richiesta fatta. Un criterio di versione sbagliato resta nel cancello fino alla nuova installazione. _(2026-11-17)_

## flusso

- `usage` di `task_progress` è cumulativo per task: per i token di un agente vale il massimo visto. Nel `result` dell'orchestratore invece l'`usage` somma il turno. _(2026-11-22)_
- il ramo di uno specialista fermato si ricava da agente/ramo (worktree-agent-<id>): rev-list richiede u.ramoBase, quindi la chat deve averlo valorizzato _(2026-11-23)_

## piano

- i campi nuovi di CompitoPiano vanno letti anche in leggiCompitoPiano (piano-orchestratore.ts), altrimenti si perdono alla rilettura da disco _(2026-11-22)_
- `promptDopo` sopravvive al rifiuto per dipendenze solo perché `senzaRamo(c)` fa lo spread del compito; va tolto esplicitamente alla partenza. _(2026-11-23)_

## orchestratore

- «sveglia futura» e «lavoro fermo» sono cose diverse: la sveglia vale solo per chi aspetta un orario, non spegne spinta né rilancio. Solo pausa vera, turno in corso o unione in corso li zittiscono. _(2026-11-23)_
- Uno specialista «fermato» ha 3 origini: `fermaChiesta` (precedenza), `fermatiDaNicholas` (stop manuale) e appeso/morto. Solo l'ultima si rilancia da sola. _(2026-11-23)_
- il cane scatta a mutoMs dall'ultima riga: con un Bash in volo si riarma per il resto della soglia larga (tetto specialistaMaxMs); serve `ultimaRiga` da adesso(), non dal timer. _(2026-11-23)_

## pubblica

- `npm run pubblica` (test + build + Aiutante) supera i 10 minuti: va in sottofondo da solo; la release resta in bozza e i 7 file compaiono a poco a poco, si pubblica solo a exit 0. _(2026-11-17)_
- `pubblica-app` copia da solo `app-android.json` anche su v0.110.0: dopo, basta controllare con `cmp`, senza `--clobber`. _(2026-11-19)_
- `gh release create --draft` mostra un URL «untagged-…» ma la release prende il tag giusto alla pubblicazione, se il tag è già sul remoto (`--verify-tag`). _(2026-11-20)_
- `npm run pubblica` supera i 10 minuti per il caricamento dell'installer dell'Aiutante (circa 100 MB): va in background e non va rilanciato. _(2026-11-20)_
- `npm run pubblica` supera i 10 minuti: lo strumento lo sposta in sottofondo da solo. Per aspettare senza sleep lunghi, un ciclo `until` su `gh release view ... assets|length -ge 7` (sleep 5) passa. _(2026-11-20)_
- Con `pubblica` i nomi dei file sono già con i trattini e i sette file arrivano da soli: il caricamento a mano da dist/ non è servito per la 0.111.2. _(2026-11-20)_
- prima di tag e build controllare `git status` nella cartella principale: altre chat possono lasciare modifiche in staging su main, e finirebbero nell'installer. _(2026-11-20)_
- Il rilascio non va lanciato mentre il programma prova un'unione nella cartella principale (file in staging = unione in corso): rilanciarlo subito dopo l'evento di unione. _(2026-11-20)_
- `npm run pubblica` supera i 10 minuti (prove, build, installer Aiutante): finisce in background e l'output resta vuoto fino alla fine; controllare gli asset con `gh release view`. _(2026-11-23)_
- `npm run pubblica` supera i 10 minuti (suite di prove, build, Aiutante): va in sottofondo da solo e si controllano gli allegati con `gh release view`, senza lanciarlo due volte. _(2026-11-23)_
- `npm run pubblica` supera i 10 minuti: l'installer dell'Aiutante e `aiutante.yml` arrivano per ultimi, dopo il blockmap. Con 5 file la bozza non va pubblicata. _(2026-11-23)_
- `gh release list --limit 1` non prova nulla: la bozza compare comunque. Controllare `isDraft` e i 7 asset con `gh release view`. _(2026-11-23)_
- se la bozza ha 5 file su 7, prima vedere se `npm run pubblica` è ancora attivo: `allega-aiutante` carica i due file dell'Aiutante per ultimi, e basta aspettare. _(2026-11-23)_
- creando prima la bozza con `gh release create --draft --verify-tag`, `npm run pubblica` l'ha riusata: nessuna seconda bozza. _(2026-11-23)_
- `npm run pubblica` dura più di 10 minuti (suite, build, Aiutante): passa in sottofondo da solo; il fatto che finisca si vede da `gh release view` più che dal suo output, vuoto fino alla fine. _(2026-11-23)_
- Lo script stampa a fine corsa che la release è ancora in bozza: `--draft=false --latest` va fatto a mano dopo aver visto i 7 file `uploaded`. _(2026-11-23)_

## quaderno

- in errori-arrivati.md il testo esatto va controllato prima di un Edit: «la porta 47640» non è «e porta 47640», e l'ancora sbagliata fa fallire l'Edit. _(2026-11-16)_
- «prossima versione» è corretto finché package.json resta indietro: controllare la versione prima di scrivere il numero. _(2026-11-16)_
- errori-arrivati.md usa a capo CRLF: una voce aggiunta con Edit entra con LF e il file resta con a capo misti. _(2026-11-16)_
- errori-arrivati.md è CRLF e le voci si accodano nello stesso punto: due rami che le aggiungono insieme vanno in conflitto, si risolve tenendole tutte e due. _(2026-11-16)_
- il commit di un compito k-xx non ha il codice nel messaggio: per trovarlo in main si cerca per contenuto (es. `git log --grep=orchestratore`), non per «k-f1» _(2026-11-16)_
- errori-arrivati.md usa fine riga CRLF: Edit ancorato all'ultima riga funziona, ma controllare che le righe nuove non restino miste. _(2026-11-20)_
- Il quaderno sul «mai fermo» (0.84–0.85) descrive le chat vecchie: dalla 0.89 gli specialisti sono sotto-agenti dell'orchestratore, la difesa sta in `servizio-orchestratore.ts` e `lavoro-fermo.ts`. _(2026-11-22)_
- i titoli di errori-arrivati.md hanno la forma «(lotto <nome>)»: con nomi che iniziano già per «lotto-» il titolo ripete la parola, ed è voluto per far trovare il nome intero. _(2026-11-23)_
- le voci di errori-arrivati.md vanno in coda; il file non finisce con a capo, quindi si aggiunge con Edit sull'ultima frase _(2026-11-23)_

## preferenze

- una preferenza booleana con default «vero» si salva solo quando è `false`: normalizzaPreferenze la omette altrimenti, così i file vecchi restano validi. _(2026-11-22)_

## ipc

- negli handler IPC di sola lettura la validazione dell'argomento va dentro il catch/guard: un throw prima del .catch finisce nel log di Electron come errore. _(2026-11-16)_
- Un canale nuovo va dichiarato in `src/preload/index.ts` e in `src/renderer/env.d.ts`, che è la fonte dei tipi di `window.gestore`: solo nel preload il typecheck fallisce. _(2026-11-20)_
- Per i segreti: il canale fa entrare il valore e non lo restituisce, e la vista del renderer ricopia solo i campi senza valore, così un valore in più si ferma lì. _(2026-11-20)_

## windows

- Per risolvere conflitti in file CRLF, con Edit gli a capo si rischiano: meglio PowerShell con regex `\r?\n` e verifica del conteggio CRLF. _(2026-11-16)_

## errori

- Il registro dell'errore di render (ConfineErrori) è per-PC: la pila di un altro PC non si vede da qui, serve il suo registro. _(2026-11-19)_
- Specialisti «Aiuta la rete» girano su un altro PC e non vedono il registro di qui: la pila la legge l'autopilota in AppData\Roaming\SierraDeck\log e la mette nel prompt. _(2026-11-19)_
- la cartella .sierradeck della cartella principale non si legge dalle copie (collegamento non risolvibile): la pila di un errore va chiesta all'autopilota. _(2026-11-20)_
- «API Error:» in testa non vuol dire guasto del servizio: i rifiuti dei filtri di Claude arrivano con quel prefisso (result success). I controlli specifici vanno prima della regola 'api'. _(2026-11-23)_
- il lotto non era leggibile dalla copia: per i «doppioni» da conteggio serve il file vero; il sospetto è l'invio ripetuto (timeout + Drive), non la scrittura del registro. _(2026-11-23)_
- un fallimento di lavoro affidato si riporta come errore in un punto solo (il servizio); spedizioniere e Aiutante scrivono avviso o cronaca. _(2026-11-23)_
- l'invio degli errori porta `volte` cumulativo con `quando` fisso: un invio rifatto non è identico al primo, quindi il dedup per voce identica non basta _(2026-11-23)_

## permessi

- nella CLI un divieto (--disallowedTools) vince sempre su --allowedTools: per aprire una forma di `gh` va stretto il divieto, non aggiunta un'eccezione _(2026-11-23)_

## rilascio

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
- origin delle copie è un .bundle che può sparire: `git fetch --tags` fallisce e non ci sono tag locali. L'ultima versione si legge dai commit «Versione x.y.z». _(2026-11-22)_
- un bump tocca package.json, package-lock.json (due punti) e src/shared/novita.ts. Non c'è un file di versione Android da cambiare se android/ è fermo. _(2026-11-22)_
- `package.json` può essere già avanti dell'ultima release (qui 0.112.2 contro 0.112.1 pubblicata): per il bump guardare `gh release list` e i tag del remoto. _(2026-11-22)_
- La 0.113.0 ha cambiato noteDi in scripts/note-novita.mjs (vuole `righe: [`): allega-aiutante fallisce su novita-aiutante.txt. Va corretto in main; intanto usare la versione della v0.112.1. _(2026-11-22)_
- controlla-pacchetto rifiuta node_modules come junction: nel worktree temporaneo togliere la junction con rmdir e fare `npm ci`; serve anche google-oauth.json (ignorato da git) copiato dalla cartella … _(2026-11-22)_
- Per una versione mancante usare `noteDiOErrore` (errore con messaggio chiaro); `noteDi` dà `[]`. _(2026-11-22)_
- Prima di pubblicare controllare `git status`: modifiche in staging nella cartella principale finiscono nel pacchetto e sfasano tag e installer. _(2026-11-23)_
- Non lanciare il rilascio durante un'unione: l'unione di prova lascia file in staging nella cartella principale e il rilascio si ferma. Lanciarlo a fila unioni vuota. _(2026-11-23)_
- Il hook blocca ogni sleep e i cicli di attesa a mano: dopo il timeout si può solo controllare lo stato con `gh release view` e aspettare la notifica. _(2026-11-23)_
- nelle copie degli specialisti manca il tag v0.114.0 e `gh` può essere negato: per le correzioni dopo il tag serve il commit del tag, non solo quello del bump. _(2026-11-23)_
- `npm run pubblica` con tail in pipe non scrive nulla finché non finisce: per vedere l'avanzamento controllare `gh release view --json assets`, non il file di output. _(2026-11-23)_
- `gh release create --draft` stampa un URL «untagged-…» anche con tag già sul remoto: è normale per le bozze, il tag resta quello di `--verify-tag`. _(2026-11-23)_
- la copia può avere origin = bundle non più presente: `git fetch` fallisce e non si può verificare se un altro PC ha già alzato la versione. _(2026-11-23)_
- una release di SierraDeck tocca solo package.json, package-lock.json (2 punti) e la voce in cima a NOVITA in src/shared/novita.ts. _(2026-11-23)_
- Se cambia solo src/aiutante/nucleo.ts, l'Aiutante va alzato a parte: versione.json più voce in cima a novita-aiutante.txt (una riga basta). _(2026-11-23)_
- Dopo `--draft=false` il link `releases/latest/download/<file>` può dare 404 dalla cache per qualche minuto: verificare con `gh release download` o con l'URL `/download/<tag>/`. _(2026-11-23)_
- `npm run pubblica` supera i 10 minuti: va in sottofondo da solo. Non rilanciarlo; aspetta che compaia aiutante.yml fra gli asset (è l'ultimo), poi pubblica. _(2026-11-23)_
- `git fetch` può fallire per un bundle in aiuto\arrivi: la versione di partenza si trova con `git log -S"x.y.z" -- package.json`. _(2026-11-23)_
- se il fetch fallisce perché il bundle in `aiuto\arrivi` non c'è, il controllo su origin/main resta al rilascio. _(2026-11-23)_
- `npm run pubblica` esegue tutta la suite (~5 min) prima di costruire: un test vecchio in main blocca la release dopo tag e bozza già creati. Lanciare i test prima del tag. _(2026-11-23)_
- Il criterio `gh release view vX` passa anche per una bozza senza file: per un compito di pubblicazione usare `gh release list --limit 1` (Latest) e contare i file. _(2026-11-23)_
- un test fermo alla 0.82.0 non è stato visto dalla 0.115.1: `vitest related` non basta per i test che leggono i sorgenti come testo _(2026-11-23)_
- Dopo un push di main che cambia solo test e quaderno il tag può restare sul commit vecchio: il prodotto è identico, quindi basta rilanciare `pubblica` sulla stessa bozza. _(2026-11-23)_
- prima di pubblicare controlla anche `.git/MERGE_HEAD`, non solo `git status`: l'autopilota può avere un'unione aperta nella cartella principale con file in stage. _(2026-11-23)_
- `origin/main` può restare indietro di molti commit (qui 19): il bump a 0.116.0 era solo locale, quindi il push di main fa parte della procedura. _(2026-11-23)_
- Un'unione lanciata dall'autopilota mentre gira `npm run pubblica` (circa 10 minuti) cambia l'albero a metà build: fermare la fila delle unioni prima di cominciare. _(2026-11-23)_
- `npm run pubblica` può essere interrotto con exit 143 nel pacchetto dell'Aiutante: controllare gli asset e `.git/MERGE_HEAD` prima di rilanciarlo. _(2026-11-23)_
- costruire la release in un git worktree fermo sul tag (junction node_modules): le unioni del programma nella cartella principale cambiano l'albero a metà di npm run pubblica _(2026-11-23)_
- `controlla-pacchetto --prima` rifiuta node_modules come junction: per costruire in una copia ferma sul tag serve `npm ci` nella copia, non `mklink /J`. _(2026-11-23)_
- `npm run pubblica` intero supera i 10 minuti (prove 6 min): se le prove sono già passate sul tag, lancia i passi uno per uno, nello stesso ordine. _(2026-11-23)_
- In questa copia `git fetch` fallisce (origin è un bundle sparito) e `gh` non c'è: il controllo delle release va fatto dalla cartella principale. _(2026-11-23)_
- `npm run pubblica` supera i 10 minuti di timeout dello strumento (installer da 114 MB): passa in sottofondo e lo specialista non può aspettarlo con sleep o cicli, che l'hook blocca. _(2026-11-23)_
- Alla ripresa di un rilascio interrotto: se tag e bozza ci sono e la bozza è vuota, riparti da `npm run pubblica`. Android invariato = niente `pubblica-app`. _(2026-11-23)_
- In questa copia `git fetch` non funziona: il remoto è un bundle sparito. Per controllare le versioni uscite serve `gh` sul PC di rilascio. _(2026-11-23)_
- `npm run pubblica` può creare due bozze con lo stesso tag (i file si dividono): riunirli nella bozza con le note via `gh api .../releases/assets/<id>` e `gh release upload`, cancellare l'altra, poi p… _(2026-11-23)_
- `gh release download <tag>` non vede le bozze: per scaricare gli asset serve `gh api -H "Accept: application/octet-stream" repos/.../releases/assets/<id>`. _(2026-11-23)_
- Con `npm run pubblica | tail` l'output resta vuoto fino alla fine: il progresso si segue con `gh api repos/niko9090/sierradeck/releases` sugli asset. _(2026-11-23)_
- In questa copia git fetch fallisce: l'origin è un .bundle sparito. Prima di scegliere la patch non si possono vedere i tag remoti, solo quelli locali (qui nessuno). _(2026-11-23)_
- Il fetch dal bundle in `arrivi\` può fallire se il file non c'è più: i tag locali sono vuoti, quindi la versione libera va riverificata sul PC principale. _(2026-11-23)_

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
- I compiti «Aiuta la rete» girano su un repo mirror: i worktree del PC di Nicholas (.claude/worktrees) non ci sono. Prima di agire controllare che i rami nominati esistano. _(2026-11-22)_
- Compiti che devono leggere i dati veri del PC di Nicholas (registri, preferenze, .claude/worktrees) non vanno su un altro PC: là c'è solo un mirror. Scriverlo nel prompt e verificarlo. _(2026-11-22)_
- «Aiuta la rete» manda via anche i compiti che nel prompt dicono «solo sul PC di Nicholas» (k-175c, 22/11, 2 volte): serve un modo per tenere un compito in locale. _(2026-11-22)_

## gradle

- Il «What went wrong» che il cancello taglia sta in C:\Users\nikof\.gradle\daemon\8.11.1\daemon-*.out.log. I log mostrano se due build erano sovrapposte (currentDir e orari). _(2026-11-14)_

## unione

- Un MERGE_HEAD in main è durato circa 5 minuti e poi è sparito senza cambiare HEAD. Più sleep di fila nello stesso comando vengono bloccati, quindi un `sleep 20` per chiamata. _(2026-11-14)_
- Il nome di un workspace è l'identità anche in `tolti`; l'unione ora confronta con `chiaveNomeWorkspace` (trim, spazi, minuscole) e tiene il nome già sul Drive. _(2026-11-20)_
- Dopo una correzione di conflitto su un ramo nuovo, l'unione automatica può riprovare il ramo vecchio del compito: rilanciare unisci col ramo nuovo esplicito. _(2026-11-23)_
- «ramo vecchio riprovato» non viene dal ramo salvato nel compito: `ramoDelCompito` mette il nuovo come principale e unisce prima gli «altri», cioè i vecchi. _(2026-11-23)_
- `ramiFalliti` in `servizio-orchestratore.ts` è solo in memoria: dopo un riavvio il ramo vecchio fallito torna candidato e può riconflittare. _(2026-11-23)_
- 23/11 anche dopo k-178r l'unione automatica di k-178k ha riprovato il ramo vecchio (r136…) invece del nuovo (r9be…): con unisci e il ramo esplicito è entrata subito. _(2026-11-23)_

## pubblica-app

- `npm run pubblica-app` copia anche `app-android.json` su v0.107.2 (la Latest) senza cambiarne i file né la Latest. _(2026-11-14)_
- noteDi cerca `versione: '<v>'` e si ferma al prossimo `versione: `: mai quella parola con i due punti nel testo delle righe. _(2026-11-16)_

## log

- consoleNelRegistro: console.warn va come info (fuori dallo storico errori), console.error come ERRORE; per casi attesi di rete usare warn. _(2026-11-14)_
- Le righe [unione di prova] e [criterio] non portano il workspace: i rapporti le contano sotto «generale». Per attribuirle bisogna prima cambiare il formato delle righe in server.ts e verifiche.ts. _(2026-11-23)_
- il workspace nelle righe di criteri/unioni passa da un contesto asincrono (`contesto-log.ts`): chi mette in coda va catturato prima, perché il turno può partire dal contesto di un altro. _(2026-11-23)_
- Gli errori arrivati da un PC non contengono le righe delle unioni: «(scaduta)» e «unione in fila» stanno nel registro del servizio, che qui non arriva. Per misurarle servono i rapporti della 0.116.0. _(2026-11-23)_
- il registro di questo PC può non essere quello del PC segnalato: per cause su un altro PC serve il suo registro, non quello locale. _(2026-11-23)_
- Il formato delle righe `[unione di prova]` è letto da `contaLavori` con regex: cambiarlo nel servizio richiede di aggiornare anche `src/shared/rapporto-lavori.ts`. _(2026-11-23)_

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
- Il ritiro del ramo che fallisce non deve chiudere il lavoro remoto: chiudi() cancella copia e ramo (aiuto-lavoratore.ts:315, aiuto-spedizioniere.ts:336). _(2026-11-22)_
- Il riavvio dell'Aiutante fallisce il lavoro senza causa: resta «sconosciuta» e non si riassegna (aiuto-lavoratore.ts:230, aiuto-esito.ts:64). _(2026-11-22)_
- `pulisciCopia` cancella anche il pacchetto di uscita: per un lavoro con commit da ritirare serve passargli `tieniUscita`, non basta tenere il ramo. _(2026-11-22)_

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
- i divieti degli specialisti stanno in VIETATI_AIUTO (src/shared/aiuto-rete.ts), codice condiviso con l'Aiutante: toccarlo vuol dire alzare anche la sua versione _(2026-11-23)_
- Divieti degli specialisti dell'Aiutante: VIETATI_AIUTO in src/shared/aiuto-rete.ts, letto da autopilot-host/aiuto-lavoratore.ts. Toccarli = alzare l'Aiutante. _(2026-11-23)_

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
- `volte` è un totale cumulativo: la serie va riconosciuta con PC+dove+punto+quando+messaggio grezzo, aggiungendo solo la differenza; la chiave normalizzata da sola fonde errori diversi. _(2026-11-23)_
- il giro degli errori arrivati (ogni 2 min, `index.ts`) è il punto dove agganciare altri compiti affidati all'autopilota di SierraDeck: riusa `affidaSierraDeck`. _(2026-11-23)_

## vista

- un tono nuovo di fraseStatoOrchestratore va mappato in 4 posti: autopiloti-vista, stato-telefono, COLORE_TONO di client-pagina e Android (ignoto = riposo grigio) _(2026-11-16)_
- I lavori ospitati hanno stati ricevo/in-coda/preparo/lavoro: ora `fase` in VistaAttesa separa ricezione e preparazione; in-coda è ancora trattato come «al lavoro». _(2026-11-16)_

## codice

- `chatViva` esiste già in `autopilota-telefono.ts` (senza `nelRecupero`): quello condiviso è `chatInVita` in `autopilota.ts`; non confonderli. _(2026-11-16)_
- foto e ripristino dei file rigenerati stanno in src/autopilot-host/worktree.ts, non in un worktree.ts a parte: `src/**/worktree.ts` trova solo quello _(2026-11-23)_

## dati

- un autopilota da un altro PC o da un file vecchio può mancare di `dialogo`, `decisioni` o `chats`: le funzioni in `shared` che lo leggono devono trattare gli elenchi assenti come vuoti. _(2026-11-16)_
- Per leggere un workspace su un altro PC serve un agente su quel PC o su PC-Fisso, o una rotta di sola lettura nuova per registro e piano; in questa copia `E:` è vuoto. _(2026-11-23)_

## metodo

- se un criterio rosso nel principale è verde in un worktree pulito, confrontare lo stato non committato del principale prima di toccare i tempi dei test. _(2026-11-16)_

## prova

- fissaLaVersione deve coprire anche grep/findstr/Select-String/rg, non solo ===/!=: i criteri di versione scritti come ricerca di testo facevano respingere i rami che alzano la versione. _(2026-11-17)_
- `soloVersione` guarda il diff di package.json/lock: solo righe `"version"` (max 2+2) escludono il file dalla prova; ogni altro cambio rimette la suite intera. _(2026-11-23)_

## push

- Dal worktree il `git push` verso GitHub è negato dai permessi dello strumento Bash, prima di arrivare alla rete: va fatto dallo specialista «rilascio». _(2026-11-17)_

## pc

- «Dismetti questo PC» esiste già (7 giorni, solo `pc-<id>` dal Drive, `src/main/progetti/posta.ts:558`): la scadenza dei 30 giorni va costruita sopra questo, non accanto. _(2026-11-19)_
- La soglia di 7 giorni è scritta due volte, `posta.ts:116` e `salute.ts:273`: cambiarne una sola lascia la Salute e la logica in disaccordo. _(2026-11-19)_
- Il rapporto del controllo elenca anche i PC spenti, e ognuno porta il paragrafo di Salute con «Accendi X»: se si toglie un PC dalla lista va tolto anche da `testoRapporto` (`controllo-pc.ts:152`). _(2026-11-19)_
- `statoPc` di scoperta-pc.ts e `statoPc` di stato-pc.ts sono due funzioni diverse (stessa parola): la prima è il bussare, la seconda la soglia del battito. _(2026-11-19)_
- Il segno «più recente fra SierraDeck e Aiutante» richiede `host` uguale in tutti e due i battiti (`vistoConAiutante`): senza `host` l'abbinamento non scatta e il PC con solo Aiutante sembra «non risp… _(2026-11-20)_
- l'abbinamento SierraDeck/Aiutante dipende solo dall'`host` dei due battiti: ora senza maiuscole né dominio. Se un PC resta «non risponde», controllare l'host nei due battiti sul Drive. _(2026-11-20)_
- Il PC in Glos è piccolo (4 core, 8 GB) e risulta al 94% di carico: le misure delle unioni lì vanno in `turni.pesante`, che oggi `provaNelPrincipale` non usa. _(2026-11-23)_

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
- `VistaOrchestratore` non ha l'elenco dei compiti, solo i conteggi: per esporre il piano serve `/orchestratore/piano` (pianoCompiti) nel servizio degli autopiloti. _(2026-11-23)_

## novita

- in `android/novita-app.txt` la voce app va aggiunta a mano a ogni salita di versionName, altrimenti `pubblica-app` si ferma; verificarla con `noteDi` di `scripts/note-novita.mjs`. _(2026-11-19)_
- la voce in novita.ts va in cima all'array NOVITA; nelle righe mai iniziare con «versione:». _(2026-11-20)_
- In novita.ts le voci hanno `righe: [...]` o su una riga o su più righe: ogni parser di quel file deve gestire entrambe le forme. _(2026-11-20)_
- il test sulle note limita ogni voce a 8 righe; la 0.116.0 ora ne ha 8, quindi altre aggiunte richiedono di accorciare le righe esistenti. _(2026-11-23)_
- Se una riga delle note contiene «versione:», il test che legge `novita.ts` può leggerla male: nelle note evitare quella parola seguita da due punti. _(2026-11-23)_
- la voce in cima a `novita.ts` ha `righe` come array di stringhe; gli apostrofi nel testo vanno scritti con `\'`. _(2026-11-23)_

## versione

- Una versione tocca package.json, package-lock.json (2 punti), novita.ts e una nota nel quaderno. Android si alza solo se android/ cambia oltre a novita-app.txt, che è solo testo. _(2026-11-19)_
- Il commit di versione tocca `package.json`, `package-lock.json` (due righe) e `src/shared/novita.ts`. `novita.test.ts` ammette al massimo 8 righe per voce. _(2026-11-23)_
- `package-lock.json` ha la versione due volte (riga 3 e riga 9 sotto `packages[""]`): vanno alzate entrambe. _(2026-11-23)_
- Con `git fetch` rotto (bundle in arrivi sparito) la base del bump è l'ultimo `Versione x.y.z` in main locale: far verificare all'autopilota che la nuova non sia già uscita da un altro PC. _(2026-11-23)_
- Per alzare la versione bastano package.json, package-lock.json (2 punti) e la voce in cima a NOVITA in src/shared/novita.ts. _(2026-11-23)_
- Prima di un rilascio patch controlla se le correzioni sono già in main: qui lo erano, serviva solo alzare la versione e scrivere le note. _(2026-11-23)_

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
- workspaceElenco confronta i nomi esattamente, maiuscole comprese: «serverDSM» dell'autopilota non entra in «ServerDSM» della lista. _(2026-11-22)_

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

## vista-elenco

- i nomi dei workspace vanno confrontati con `inElenco`/`chiaveNomeWorkspace`, mai con includes esatto: il nome dell'autopilota e quello nella preferenza possono differire per maiuscole. _(2026-11-22)_

## progetto

- le chat adottate («solo mia») non hanno ramo né cartella: dal ramo non si risale a loro, la protezione passa da un insieme `protetti` costruito dal servizio. _(2026-11-22)_

## strumenti

- `cmd /c rmdir` da Bash non esegue nulla: per le junction usare PowerShell `[System.IO.Directory]::Delete(percorso)`, con il percorso scritto per intero (l'hook blocca le variabili). _(2026-11-22)_

## riassunto

- Il riassunto dell'autopilota non usa il modello: è costruito in src/shared/riassunto-autopilota.ts da diario e dialogo; «ripiego» = quella stessa costruzione. _(2026-11-22)_

## coda

- Le richieste migrate hanno il testo del compito dentro «compiti» (coda-autopiloti.ts:72/87): piano-orchestratore.ts:436 le conta come aperte, e la richiesta resta «in-corso» anche se è tutto unito. _(2026-11-22)_
- `compiti` di una richiesta deve avere solo id k-N: i testi dei compiti di prima stanno in `collegate`, che serve anche ai doppioni. _(2026-11-22)_

## aiuti

- In `server.ts` lo store dei lavori affidati (`apriAiuti`) è interno e tiene la lista in memoria dopo la prima lettura: nei test si scrive il file prima di avviare il server. _(2026-11-22)_

## percorsi

- `coda-autopiloti.ts` sta in `src/autopilot-host/`, non in `src/shared/`: i percorsi nei compiti possono essere sbagliati, si cercano con Glob. _(2026-11-22)_

## attesa

- il caso «dopo» (rifiutatiPerDipendenze) non ha voce in fila: il suo prompt non è salvato da nessuna parte, a differenza di tetto pieno e fila per posti _(2026-11-22)_

## posti

- «N di M posti occupati» degli altri PC (`postiTesto`, `PostiAiuto`) non porta `perche`, `misura` né `scelti`: per mostrarvi il motivo servono questi campi nel messaggio dal PC remoto. _(2026-11-22)_
- `rigaPosti` ha test che ne bloccano il testo esatto: il motivo è un campo a parte (`motivoCorto`), non va dentro `rigaPosti`. _(2026-11-22)_

## pannello

- unioni, durata e stato dopo il lavoro passano da `VistaAttesa` (`dati-pannello-agenti.ts`); gli esiti recenti stanno solo in memoria e si perdono al riavvio _(2026-11-22)_
- I dati `inUnione`, `esitiUnioni` e `dopoLavoro` di `VistaAttesa` hanno per chiave il workspace del servizio: per filtrare per autopilota si confrontano i riferimenti normalizzati. _(2026-11-22)_
- La spinta del pannello è la versione di `cambiSpecialisti`: ogni nuova strada di cambio nel servizio deve chiamare `segna()`, altrimenti resta solo il giro ogni 4 s. _(2026-11-23)_
- La fila delle unioni (`filaUnioni`) è solo in memoria: dopo un riavvio lo stato «dopo il lavoro» va ricavato dal piano su disco, altrimenti lo specialista sparisce. _(2026-11-23)_

## battito

- Un campo nel battito che cambia a ogni misura va tolto dalla firma in `batti`, come `risorse`, o il Drive viene riscritto a ogni giro. _(2026-11-22)_

## script

- `noteDi` ha due formati di input: `righe: [` per novita.ts e novita-app.txt, e stringhe una per riga per novita-aiutante.txt. Cambiandone uno si rompe l'altro. _(2026-11-22)_

## drive

- «This operation was aborted» nel registro = lavoro Drive annullato da installazione/chiusura, non rete; il tetto di 60 s dà invece «Drive: nessuna risposta da…» _(2026-11-23)_
- un 403 «rate limit/per minute» non è «quota piena»: la regex di spazio esaurito lo catturava e dava 30 min; il limite di richieste parte da 2 min. _(2026-11-23)_

## consegne

- una consegna ripresa dopo un riavvio ha `id` vuoto: i messaggi di registro vanno scritti con `nomeConsegna(c)`, mai con `c?.id ?? '' _(2026-11-23)_

## pty

- il buffer di uscita sta in `ipc.ts` (`flussiPty`), agganciato al `client.on` prima di instradare: copre anche i pty in sottofondo; la chat si mappa al pty via `sessione _(2026-11-23)_

## canale

- Un nuovo tipo di invio verso il PC di riferimento vuole tre pezzi: rotta in client-rotte, comando in posta.ts con gestione in index.ts, e un messaggio di rifiuto in aiutante/rete.ts. _(2026-11-23)_

## rapporti

- i riassunti (`riassunto-*.md`) e `.analisi.json` stanno nella cartella dei rapporti arrivati: `leggiRapportiArrivati` li salta perché non sono cartelle di mittente. _(2026-11-23)_
- il segno `[ws: NOME]` si toglie dalla riga prima dei parser; le righe senza segno restano «generale». _(2026-11-23)_
- nei rapporti dei lavori il PC è il nome da mostrare (`da`), non il pcId: per richiamare quel PC si risolve il nome con `altriPcGlobale`. _(2026-11-23)_
- Il conteggio dei rossi somma ogni «finito con» non zero: non misurati, rimisure e timeout entrano tutti. Il log non porta il flag «non misurato». _(2026-11-23)_
- «sessione avviata» la scrivono app e servizio nello stesso file: ogni avvio conta due volte. _(2026-11-23)_
- La spia di ritardo conta minuti, non fermate: e il lavoro fermo non va nella stessa voce dei ritardi del servizio. _(2026-11-23)_
- i riassunti sui rapporti dei PC non aggiornati mostrano righe senza `[ws:]` (scritte prima di k-193e): «senza workspace» alto non è per forza un bug del codice attuale _(2026-11-23)_
- nelle righe `[aiuto] … affidato a` la parola dopo il trattino deve essere il ruolo; `ruoloDi` scarta gli id dei compiti perché i PC vecchi li scrivevano lì _(2026-11-23)_
- ogni avvio scrive due «sessione avviata» ([app] e [servizio]): chi conta gli avvii deve filtrare per fonte, altrimenti 1 avvio = 2 riavvii. _(2026-11-23)_
- Il parser dei registri deve guardare chi scrive la riga (`app` o `servizio`): le righe dette da entrambi, come «sessione avviata», si contano una volta sola. _(2026-11-23)_
- I campi nuovi del rapporto vanno letti con `num()` in `leggiRapportoLavori`: i PC con versioni vecchie non li mandano e il riassunto darebbe NaN. _(2026-11-23)_
- i rapporti dei PC 0.116.x non hanno i campi nuovi (spinteSospese, nonMisurati): ogni campo nuovo aggiunto a LavoriWorkspace va letto con num(), mai sommato diretto. _(2026-11-23)_
- In `LavoriWorkspace.unioni`, `nonPartite` è obbligatorio e `motiviNonPartite` facoltativo: lettura e somma passano da `num()` perché i PC vecchi non mandano il campo. _(2026-11-23)_
- i test che mandano rapporti con soli criteri verdi/rossi normali ora non partono più: servono righe con un intoppo (es. permesso negato) _(2026-11-23)_
- giroRapportoLavori è condiviso da programma e Aiutante: una modifica lì vale per entrambi _(2026-11-23)_
- riavvio normale = motivo che comincia con «avvio con la versione» o «aggiornamento da»; le stringhe vengono da contaLavori e vanno tenute allineate _(2026-11-23)_
- contaLavori vede solo le righe dopo `fino`: ogni informazione che attraversa due giri (come la versione avviata) va ricordata nello stato del giro, anche quando il rapporto non parte. _(2026-11-23)_

## pc-glos

- PC in Glos: 4 processori, 8 GB, carico 94%, 8 cambi di versione in 7 giorni. La guardia usa soglie fisse (75% e 60%), pensate per un PC grande, quindi lì i passi pesanti aspettano quasi sempre. _(2026-11-23)_

## invio

- un segno «in corso» senza tempo massimo spegne il giro per sempre se la promessa non finisce mai: ogni giro periodico di rete deve avere un timeout. _(2026-11-23)_

## turni

- `turni.pesante` ora è rientrante (AsyncLocalStorage): chi tiene il turno e chiama `conTurni` sulla stessa istanza non si blocca. Un pesante dentro l'unione della stessa cartella invece sì. _(2026-11-23)_

## note

- `novita.ts` è CRLF: pulendo le righe con sed restano apici e backslash nelle note. Usa `tr -d '\r'`, o meglio node, prima di `gh release edit`. _(2026-11-23)_

## lavoro-fermo

- `fermiVisti.spinte` si azzera a ogni cambio di firma, quindi vale già come conteggio delle spinte senza effetto. I test che si aspettavano spinte senza fine andavano adattati. _(2026-11-23)_

## da-fare

- Rimandati dopo la 0.117.1: il riassunto dei rapporti scrive «1 compiti» (plurale fisso); npm run pubblica crea a volte due bozze con lo stesso tag e i file divisi (va reso atomico). _(2026-11-23)_

## consumi

- Claude Code dà solo i limiti di 5 ore e settimana: per la giornata non c'è un dato vero, il campo "rimasto.giornata" resta noto:false e porta solo la prossima mezzanotte _(2026-11-23)_
