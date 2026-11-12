# Errori arrivati (lotto 20261030221404, richiesta r-5)

## Gruppo 1: «[pty-host] spegnimento (richiesta del Core): chiudo i terminali aperti»
Non corretto, non c'era nulla da correggere. Non è un difetto: è la riga di log dello spegnimento voluto (src/pty-host/host.ts). Già corretto in 0.88.2: il client la racconta invece di metterla fra gli errori. Visto solo su 0.88.1. Aggiunto solo un test che prova che quella riga non finisce fra gli errori.

## Gruppo 2: «Error: AttachConsole failed» (node-pty, conpty_console_list_agent.js:13)
Corretto nella versione 0.88.5. È l'agente figlio di node-pty usato da kill() su Windows: fallisce se la shell è già morta, ed è atteso e innocuo (pty-manager ignora già le eccezioni di proc.kill()). Il suo stderr arrivava al client e finiva in console.error, quindi fra gli errori. Ora `leggiStderrAtteso` (src/main/pty-host-client.ts) lo riconosce e lo racconta in una riga («console già chiusa (node-pty): ignorato»); ogni altro stderr resta errore. Test in tests/main/pty-host-client.test.ts, gruppo «stderr dell host». Il bump di versione lo fa la chat della release. NB (31/10): la correzione toglieva la riga dalla console, ma il sink `log` del client era `registro.errore`, quindi la riga raccontata restava un ERRORE nel registro; chiuso nella 0.88.10 (vedi i lotti del 31/10).

# Errori arrivati (lotto 20261030222734, richiesta r-6)

## Gruppi 1 e 5: «[pty-host] spegnimento (richiesta del Core): chiudo i terminali aperti»
Corretto nella versione 0.88.5. La correzione 0.88.2 usava `^` sul pezzo intero di stderr: se la riga dello spegnimento arrivava unita ad altre righe, dopo un a-capo o con spazi davanti, non era riconosciuta e finiva in `console.error('[pty-host]', chunk)`, da cui il titolo col prefisso doppio. Ora `leggiStderrAtteso` (src/main/pty-host-client.ts) lavora riga per riga: le righe di spegnimento sono raccontate, il resto resta errore. Test in tests/main/pty-host-client.test.ts («stderr dell host»). NB (31/10): il sink `log` del client restava `registro.errore`, quindi le righe raccontate finivano comunque come ERRORE nel registro; corretto davvero nella 0.88.10 (livello info/errore per riga).

## Gruppi 2, 3, 4: «non si apre — cartella-sparita» / «Error occurred in handler for 'pty:spawn'… ENOENT»
Corretto nella versione 0.88.5. La correzione 0.88.2 lasciava andare le consegne vecchie solo alla lettura della coda dopo il riavvio; una consegna già in coda (c-6483, c-6495) per una chat con la copia di lavoro tolta veniva riproposta a ogni `ritira` (fino a TENTATIVI_MAX), e ogni volta apriva un riquadro e `pty:spawn` falliva. Ora `ritira` (src/autopilot-host/consegne.ts) lascia andare la consegna una volta, come persa, se la cartella non c'è più (tranne «chiudi», che non apre niente). La validazione del cwd non è toccata. Test in tests/autopilot-host/consegne.test.ts.

## Gruppi 6 e 7: «salvataggio sul Drive alla chiusura interrotta dopo 45 s» / «il lavoro con il Drive non si e' fermato in dieci secondi»
Non corretto qui: già corretto nella 0.88.3 (commit 7e53b0e4), visti solo su 0.88.1 e 0.88.2. Sono avvisi attesi del timeout di chiusura (il lavoro riprende al prossimo avvio, nessun dato perso): `avvisoChiusura` li scrive come informazione, non come errore.

# Errori arrivati (lotto 20261030231034, richiesta r-7)

## Gruppo 1: «[pty-host] spegnimento (richiesta del Core): chiudo i terminali aperti» (0.88.4)
Corretto nella versione 0.88.5 (lettura riga per riga in `leggiStderrAtteso`, src/main/pty-host-client.ts, già in main da k-2): la riga è lo spegnimento voluto, non un guasto. La nota «SierraDeck Update è vivo… mi tolgo di mezzo» (src/main/aggiornamenti.ts) è solo il contesto: viene scritta come informazione, poi `preparaUscita` chiude il PTY host, che scrive quella riga. Verificato che il caso è gestito; aggiunto il test «updater vivo: prima chiude i terminali, poi esce» in tests/main/aggiorna-adesso.test.ts. NB (31/10): il sink `log` del client era `registro.errore`, quindi la riga raccontata restava un ERRORE nel registro; corretto davvero nella 0.88.10.

## Gruppo 2: «[electron-updater] Cannot download differentially, fallback to full download: 501»
Corretto nella versione 0.88.5. Non è un difetto: il server non serve i pezzi parziali (501) e il file si scarica intero. electron-updater lo scrive con `logger.error`; ora `creaLoggerUpdater` (src/main/aggiornamenti.ts) lo manda al registro come avviso («[electron-updater] avviso: …»), gli altri errori restano errori. Test in tests/main/logger-updater-differenziale.test.ts.

# Errori arrivati (lotto 20261031072436, richiesta k-5)

## Gruppo 1: «OutOfMemoryError» nell app Android 2.88.0 (Api.corpoTestoDiretto → okhttp RealResponseBody.string, worker LavoroConsegne)
Non corretto qui: già corretto in main da k-4 (commit d69005ea). `leggiConTetto` (android/.../Api.kt) legge la risposta con un tetto di 16 MB e dà errore 413 invece dell OOM. Uscirà nella prossima release con APK nuovo (android/ è cambiato); l app 2.88.0 installata ha ancora il difetto. Nessun codice cambiato qui.

# Errori arrivati (lotti lotto-20261031101436 e lotto-20261031221146, app 0.88.9)

## Gruppi 1 e 2: «[pty-host] spegnimento…» / «Error: AttachConsole failed» / altre righe raccontate dal client del PTY host
Corretto nella versione 0.88.10. Le correzioni 0.88.2 e 0.88.5 riconoscevano le righe e le toglievano dalla console, ma il sink `log` di `PtyHostClient` (src/main/index.ts) era `registro.errore`: ogni riga «raccontata» finiva comunque come ERRORE nel registro. Ora `log` riceve anche il livello: cronaca (spegnimento, console già chiusa, riavvio programmato, terminali chiusi a forza) = `registro.info`; solo i guasti veri (avvio fallito, morte inattesa dell'host, riavvio abbandonato, chiusura a forza fallita) restano `registro.errore`. Il resto dello stderr è ancora un errore. Test in tests/main/pty-host-client.test.ts («livello delle righe raccontate»).

## Gruppo 3: «Cannot download differentially, fallback to full download: Error: sha512 checksum mismatch…»
Corretto nella versione 0.88.10, come avviso e non come errore: `creaLoggerUpdater` copriva già il prefisso (era la correzione del 501), qui si aggiunge il test del caso con il checksum diverso (il file si scarica intero). In più il diario di SierraDeck Update, scritto accanto a «INSTALLAZIONE NON RIUSCITA», va in informazione: resta errore solo l'installazione non riuscita. Test in tests/main/logger-updater-differenziale.test.ts.

## Gruppo con «501» (differenziale)
Nessuna correzione: è l'avviso «Cannot download differentially… 501» già filtrato dalla 0.88.6 (`creaLoggerUpdater`), visto su versioni precedenti.

## Gruppi 4 e 7: autopilota:dettaglio, servizio occupato (timeout di 3 s)
Corretto nella versione 0.88.10. Il timeout del servizio occupato saliva come errore dell'handler IPC, e il renderer riprovava subito dal `finally` dopo 3 s, all'infinito. Ora: il client dà al dettaglio 5 volte l'attesa normale (15 s) e segna il timeout come `scaduto`; l'handler (`rispondiDettaglio`, src/main/dettaglio-autopilota.ts) lo trasforma nell'esito `{ occupato: true }` con una riga di cronaca (info); il renderer (src/renderer/state/autopilota-intero.ts) aspetta 3, 6, 12, 24, poi 30 s prima di riprovare, anche dopo un errore dell'IPC. Test in tests/main/dettaglio-autopilota-0-88-10.test.ts e tests/renderer/autopilota-intero-riprova-0-88-10.test.ts.

## Gruppo 5: parte del gruppo 6
Nessuna correzione a sé: è lo stesso episodio del gruppo 6 (vedi sotto).

## Gruppo 6: INSTALLAZIONE NON RIUSCITA 0.88.5 → 0.88.6
Causa non dimostrata: il diario di SierraDeck Update era troncato e non dice perché l'installer si è fermato. Corretta la falla dello script di pubblicazione che l'ha resa possibile: `npm run pubblica` non lanciava i controlli `controlla-pacchetto.mjs --prima` e `--dopo` che ha `npm run pacchetto` (nella 0.88.6 mancava dijkstrajs nell'app). Ora li lancia; test in tests/main/script-pubblica-controlli.test.ts. Nota: `--dopo` gira dopo il caricamento (`--publish always`), quindi avvisa ma non impedisce l'upload: se fallisce, la release va ritirata o rifatta.

# Errori arrivati (lotto 20261101084702, app 0.89.1)

## Gruppo 1: ERR_NO_BUFFER_SPACE dell aggiornamento, scritto due volte in 3 ms
Corretto nella prossima release. Gli errori di rete passeggeri (ERR_NO_BUFFER_SPACE, ERR_INTERNET_DISCONNECTED, ECONNRESET, ETIMEDOUT) sono avvisi: l updater ritenta da solo al controllo dopo (RICONTROLLA_MS), quindi niente fase errore, niente riga ERRORE, nel registro una riga info. Il doppione evento error + rigetto di downloadUpdate si scrive una volta (stesso messaggio entro 5 s). Test in tests/main/aggiornamenti-rete-transitoria.test.ts; il test del logger usa ora un guasto vero (checksum) al posto di ERR_INTERNET_DISCONNECTED.

## Gruppo 2: eco di Electron "Error occurred in handler for pty:spawn ... cwd non accessibile"
Corretto nella prossima release: l eco va nel registro come informazione (src/main/console-nel-registro.ts), perche il renderer scrive gia la sua riga con la diagnosi cartella sparita. Un errore diverso dello stesso handler resta ERRORE. Test in tests/main/console-nel-registro.test.ts.

## Gruppo 3: progetto di un altro PC con cartella assente: "cwd non accessibile" invece di "vive su <PC>"
Corretto nella prossima release: il controllo del proprietario (src/main/casa-altrove.ts, rifiutoCasaAltrove) ora viene prima della convalida e della verifica chiusa-senza-cartella dentro pty:spawn. Test in tests/main/casa-altrove.test.ts.


# Controllo di tutti i PC del 05/11 (app 0.93.0)

## Corretto nella versione 0.93.1

- Un altro SierraDeck o un dispositivo estraneo che risponde 401 non dà più «risponde ma non riconosce la chiave»: la «chiave» vale solo per il PC atteso (stessa impronta) o con la cassaforte chiusa là.
- Se a un indirizzo risponde un altro PC già noto (impronta dai battiti), il bussare lo dice col nome: «ora risponde <nome>, un tuo altro PC: l'indirizzo è cambiato». «Chiudi l'altra copia» resta solo per impronta sconosciuta, senza dire che il SierraDeck vero è spento.
- Un indirizzo ricordato che risponde con un'identità diversa viene tolto da pc-indirizzi.json.
- Controllo di tutti i PC: una riga per PC (chiave pc:<id>); due PC che non rispondono restano due righe, ognuna col suo motivo; la diagnosi del bussare vince su «non so se è acceso».
- Salute: un PC che risponde (chiave / rifiutato / altro) non è più «non risponde a nessuna strada».

## A mano

- Verificare che NB-PROBOOK-TEC sia acceso, sulla stessa rete o con Tailscale (da qui non si può sapere).

# Errori arrivati (lotto 20261105113725, app 0.93.0)

## Gruppo 1: "[autopilota] porta 47630 gia occupata: un altro servizio e vivo, esco" (servizio, versione "?")
Corretto nella versione 0.93.1. Il caso e atteso (istanza unica: il doppione esce, quello di prima continua) ma la console.error del gestore di EADDRINUSE veniva catturata dal servizio come ERRORE e finiva negli errori arrivati. Ora il gestore e in src/autopilot-host/errore-server.ts (gestisciErroreServer): la porta occupata e un solo avviso (console.warn, riga info nel registro, uscita 0); ogni altro errore del server resta ERRORE con uscita 1. La versione "?" era un difetto vero ma a parte: un servizio avviato al login dallo script Esecuzione automatica non riceve SIERRADECK_VERSIONE (solo il Gestore la passa). Ora versioneDelServizio la legge dal package.json dell app se manca; "?" solo se non c e. Il campo versione dato al server (che decide se il Gestore sostituisce un servizio vecchio) NON e cambiato. Test in tests/main/errore-server-porta-occupata.test.ts.

# Errori arrivati (lotto 20261105145439, app 0.93.1)

## Gruppo 1: "[aggiornamenti] fase: errore · Cannot parse releases feed: Error: Unable to find latest version on GitHub ... please ensure a production release exists: 504" (DESKTOP-G24D499, 2 volte)
Corretto nella versione 0.93.3. Era un 504 Gateway Timeout di GitHub preso mentre si pubblicava la 0.93.2: passeggero, l updater ritenta al giro dopo. Non era un difetto del programma, ma veniva registrato come ERRORE, annunciato come fase errore e mandato negli errori arrivati. Ora eErroreDiReteTransitorio (src/main/aggiornamenti.ts) riconosce 502, 503 e 504 solo se legati al feed o al download (Cannot parse releases feed, HttpError, ...): avviso nel registro, niente fase errore. Restano come prima: il 501 "Cannot download differentially" (avviso), il 404 su latest.yml ("manca"), il checksum sbagliato (errore vero). Test in tests/main/aggiornamenti-rete-transitoria.test.ts.

# Errori arrivati (lotto 20261105162710, app 0.94.0)

## Gruppo 1: "Error occurred in handler for 'autopilota:elenca': Error: il servizio autopilota non risponde sulla porta 47630: TimeoutError: The operation was aborted due to timeout" (altro PC, 2 volte)
Corretto nella versione 0.94.2. Un servizio momentaneamente occupato che non risponde in tempo e un caso atteso, non un guasto. Per autopilota:dettaglio la 0.88.10 trasformava il timeout in un esito occupato, ma autopilota:elenca lasciava uscire l eccezione (scaduto: true) dall handler IPC: errore non gestito nel registro e negli errori arrivati. Ora rispondiElenco (src/main/dettaglio-autopilota.ts) su timeout restituisce l ultimo elenco noto (client.elencoNoto) o un elenco vuoto se non ne e mai arrivato uno, con una riga di cronaca (avviso, non errore); ogni altro errore resta un errore. Test in tests/main/elenco-autopilota-0-94-2.test.ts.

# Errori arrivati (lotto 20261105175911, app 0.94.1)

## Gruppo 1: "[chat] «…» (id, C:\Users\…\Progetti SierraDeck\video installazione) non si apre — cartella-sparita: La cartella di questa chat qui non c e piu. Error invoking remote method 'pty:spawn': … cwd non accessibile … ENOENT" (DESKTOP-G24D499, 2 volte)
Corretto nella versione 0.94.3. Chi la apriva: il riquadro stesso (Terminal.tsx), da solo a ogni montaggio, cioe al ripristino delle chat all avvio e a ogni cambio di workspace o di vista; non l autopilota ne le consegne. La cartella sparita e un caso atteso (spostata o cancellata dall utente), ma il renderer scriveva la diagnosi come ERRORE a ogni apertura. Le correzioni di prima (0.88.5 consegne, eco di Electron come info, rifiutoCasaAltrove) coprivano altre righe, non questa: restava la riga scritta dal renderer con log.errore. Ora src/renderer/cartelle-sparite.ts: rigaDelGuasto manda cartella-sparita come info (avviso), gli altri casi restano errori; la chat si segna una volta per chat e cartella, e i montaggi dopo mostrano subito il riquadro con le azioni (Scegli la cartella) senza rifare lo spawn e senza riscrivere la riga. Il segno cade quando la chat riparte o l utente sceglie un altra cartella. Test in tests/renderer/cartelle-sparite.test.ts.
# Errori arrivati (lotto 20261105223912, app 0.94.1)

## Gruppo 1: "(node:27872) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated." (PC-Fisso, 1 volta)
Corretto nella versione 0.94.4. Era un avviso di Node scritto su stderr (non un guasto): il servizio e i processi figli lo raccoglievano come errore. Ora src/shared/avvisi-node.ts riconosce gli avvisi (e la riga "Use --trace-deprecation") e li manda nel registro come info: nel servizio (consoleNelRegistro, process warning, motivo di uscita dell orchestratore), nel main e nello stderr del PTY host; gli errori veri restano errori. Il costruttore fs.Stats non e nel nostro codice (nessun new Stats in src): viene da una dipendenza, non toccata. Test in tests/main/avvisi-node.test.ts.

# Errori arrivati (controllo PC)

## controllo PC: s.salute.voci is not iterable (PC-Fisso)
Corretto nella 0.95.4. Un PC con una salute senza voci (versione vecchia o risposta malformata) non fa piu cadere il giro: la risposta non valida diventa "risposta non leggibile, versione vecchia?" e criticitaDi/testoRapporto tollerano voci mancanti.

# Errori arrivati (lotto 20261106104229, app 0.95.3)

## Gruppo 1: "Error invoking remote method 'autopilota:dialoga': Error: il servizio autopilota non risponde sulla porta 47630: TimeoutError: The operation was aborted due to timeout" (DESKTOP-G24D499, 0.95.3)
Corretto nella versione 0.95.5. Causa non provata al millisecondo, ma il punto debole era certo: il dialogo aspettava il servizio solo 3 s (l'attesa di una lettura d'elenco; il dettaglio aveva gia 5 volte tanto), mentre il gestore del servizio scrive in modo sincrono coda, archivio dell'autopilota e dialogo prima di rispondere, e nello stesso momento girava la sincronizzazione Drive su 25520 file: con un servizio (o un programma) occupato 3 s non bastano, e il messaggio poteva essere arrivato lo stesso. Ora le POST che scrivono (dialogo, crea, adozione, nota, annuncio) aspettano 30 s; il dialogo porta un id del messaggio e, se scade, ritenta una volta con lo stesso id (il servizio scarta il doppione); se nemmeno cosi arriva la conferma, guarda se il messaggio e gia nella conversazione, e solo allora dice in italiano che il servizio e occupato. Test in tests/main/dialogo-autopilota-k42.test.ts, tests/autopilot-host/server.test.ts, tests/renderer/errore-dialogo.test.ts.
# Errori arrivati (lotto 20261108151740, app 0.96.2)

## Gruppo 1: "[aggiornamenti] fase: errore · 504" (LAPTOP-E60QM2D1, DESKTOP-G24D499, 48 volte)
Corretto nella versione 0.97.0. Causa: l HttpError di electron-updater ha messaggio "504 + a capo + Headers: {...}", la prima riga ("504") non e riconosciuta come passeggera; ora leggiErroreAggiornamento restituisce messaggio completo e statusCode e ogni 502/503/504 e passeggero (il 501 differenziale resta com e). Test in tests/main/aggiornamenti-rete-transitoria.test.ts.

## Gruppo 2: "[aggiornamenti] fase: errore · net::ERR_CONNECTION_CLOSED" (6 volte)
Corretto nella versione 0.97.0. Causa: la lista degli errori di rete passeggeri non includeva ERR_CONNECTION_CLOSED/RESET/TIMED_OUT, ERR_TIMED_OUT, ERR_EMPTY_RESPONSE; aggiunti. In piu «cosa si stava facendo» ora si attacca solo se la riga info ha lo stesso tag dell errore (prima prendeva righe di altri sottosistemi, es. [errori] o [spazio]): storico-errori-file.ts.

## Controllo PC 08/11: "[errori] invio automatico non riuscito, riprovo al prossimo giro" (683 volte su DESKTOP e LAPTOP) e "[aggiornamenti] fase: errore · 503" (10 volte)
Corretto nella 0.97.0. Causa: giroInvioErrori scriveva la riga a ogni giro (ogni 30 s) finche il PC di sviluppo non rispondeva; ora, come la posta, la scrive una volta per motivo e poi "invio errori ripreso" quando torna a riuscire (test in tests/main/errori-invio-automatico.test.ts). Pausa crescente non aggiunta: l'intervallo del giro resta com'e. Il 503 era gia passeggero con la classificazione di k-178 (502/503/504 su messaggio completo e statusCode, test gia in aggiornamenti-rete-transitoria.test.ts): le 10 righe erano di prima di quella correzione.

# Errori arrivati (lotto 20261108222742, app 0.96.2)

## Gruppo 1: "[aggiornamenti] fase: errore · Cannot download «…/v0.90.1/SierraDeck-Setup-0.90.1.exe», status 404" (LAPTOP-E60QM2D1, DESKTOP-G24D499, 12 volte)
Corretto nella versione 0.97.2. Difetto vero, ma solo nel trattamento: un 404 sull installer o sul blockmap mentre una release e a meta pubblicazione (latest.yml c e gia, i file grandi no) e un caso atteso, il programma riprova da solo al giro dopo; invece veniva scritto come errore. Ora src/shared/aggiornamenti-404.ts lo riconosce (404 su *-Setup-*.exe o *.blockmap): una nota nel registro la prima volta, niente riquadro rosso, la fase torna a «disponibile». Se dura oltre 2 ore diventa un errore vero, una volta sola, cosi un file davvero cancellato non passa in silenzio. L episodio si azzera con update-not-available e update-downloaded. Test in tests/shared/aggiornamenti-404.test.ts e tests/main/aggiornamenti-404.test.ts. Sul «PC alla 0.97.0 che cerca la 0.90.1»: la versione nel gruppo e quella del PC che ha mandato il lotto, non di chi ha avuto l errore. Il primo errore e del 04/11 10:28, giorno della 0.90.1, la cui release fu pubblicata a meta (latest.yml su GitHub prima dell exe); il raggruppamento unisce poi le righe uguali nel tempo. Le ultime righe (08/11, nello stack v0.97.1) sono lo stesso fenomeno sulla 0.97.1 appena uscita. Oggi le release v0.90.1 e v0.97.1 hanno exe e blockmap. Non provato dal codice perche un PC aggiornato cercasse proprio la 0.90.1 il 08/11: le 12 righe sono nel conteggio del raggruppamento, ma i dati del lotto non dicono quante siano del 04/11 e quante dell 08/11.

## Gruppo 2: "[main] promise rifiutata senza catch — Error: Cannot download «…/SierraDeck-Setup-….exe», status 404" (6 volte)
Corretto nella versione 0.97.2. Stesso 404 del gruppo 1, visto da un altra parte: con autoDownload electron-updater crea downloadPromise dentro checkForUpdates e nessuno la attendeva; se il download falliva il rifiuto finiva in unhandledRejection e veniva registrato come errore del main, in piu della riga gia scritta dall evento error. Ora in aggiornamenti.ts il giro aggancia downloadPromise.catch(() => {}): l errore arriva comunque dall evento error (gestito da erroreUpdater, con la soglia di 2 ore), e il rifiuto doppio non si scrive piu.

# Errori arrivati (rapporto controllo-20261109T031545, app 0.96.2 / 0.97.0, 8 criticita)

## Criticita 1-3 e 5: DESKTOP-G24D499 (0.95.3), LAPTOP-E60QM2D1 (0.95.4), Z2-TECNICO (0.95.5), PC-Fisso (0.95.3), "Ultimo battito sul Drive: 2 giorni fa", versione vecchia
Spiegata nella 0.97.3, resta da fare a mano di Nicholas. Il battito vecchio e la versione vecchia hanno la stessa causa: il Drive e pieno (403 quota superata), quindi i PC non riescono a riscrivere il battito e la versione che si legge dal Drive e quella di due giorni fa, non quella vera. Dalla 0.97.1 la versione si chiede al PC stesso quando risponde. Dalla 0.97.3 la Salute e il controllo dei PC dicono che il battito e vecchio perche il Drive e pieno (un account per tutti i PC), e la versione compare insieme al nome del PC. A mano: liberare spazio sul Drive o svuotare il cestino; poi aggiornare i PC che hanno davvero la versione vecchia con «Installa la» o dal loro schermo (Nicholas decide, il programma non installa da solo).

## Criticita 4 e 8: PC-Fisso e Z2-TECNICO, "Quanto lavora SierraDeck: CPU … RAM … Drive … richieste/min" come criticita
Corretto nella versione 0.97.3. Dalla 0.97.0 «Quanto lavora» non era piu una criticita con consumi buoni, ma la firma della criticita conteneva i numeri (CPU, RAM, richieste), che cambiano a ogni controllo: la riga si riscriveva e tornava a comparire ogni 6 ore. Ora la firma e senza numeri, quindi lo stesso stato si segnala una volta sola. Il vero fondo della cosa (Google rifiuta richieste, 403 quota Drive su Z2-TECNICO) e il Drive pieno: a mano, liberare spazio (vedi sopra).

## Criticita 6-7: DESKTOP-G24D499 e LAPTOP-E60QM2D1, "Scheda video: solo processore (grafica in software)"
Corretto nel codice dalla 0.97.0 (terminali con WebGL e stato della scheda video nella Salute) e 0.97.1 (stato di adesso, non quello dell avvio); la riga e quindi una misura vera, non un errore del programma. A mano di Nicholas se si vuole la grafica accelerata: controllare i driver della scheda video e che Windows non la tenga spenta, poi riavviare SierraDeck. Funziona comunque, con piu CPU.

## NB-PROBOOK-TEC "non risponde" (compare nei PC, non fra le 8 criticita)
Da fare a mano: accenderlo e metterlo sulla stessa rete o su Tailscale. L indirizzo che il programma ricordava ora e di LAPTOP-E60QM2D1 (indirizzo cambiato): il programma lo dice gia, non e un difetto.

## Drive pieno (la causa comune, nelle righe dei PC)
Corretto nella versione 0.97.3 per quanto riguarda il programma: «Drive pieno» resta detto finche il Drive non si libera o una scrittura riesce (pienoDetto() nel freno, freno-drive.ts) e i testi «30 minuti» seguono la costante (15 minuti). Gia ridotto in 0.96.0 (freno del Drive quando e pieno) e 0.97.1 (niente tentativi a raffica). Lo spazio sul Drive lo libera Nicholas.


# Errori arrivati (lotto 20261110084717)

## «Error occurred in handler for 'domande:chiama': il servizio autopilota non risponde sulla porta 47630: TimeoutError»
Corretto nella prossima versione (dopo la 0.98.0). Causa: `rispondi` (src/main/autopilot-client.ts) usava i 3 s di lettura invece dei 30 s di scrittura, ma il servizio scrive su disco prima di rispondere; ora usa l'attesa di scrittura e, se scade, controlla se la domanda è ancora aperta. Il pannello mostra «servizio occupato» (testoErroreDialogo). Test in tests/main/risposta-autopilota-k317.test.ts.


# Errori arrivati (lotto 20261110165020)

## 1. «[orchestratore] serverDSM — turno non riuscito: API Error: Can't reach the API server (ENOTFOUND)» (11 volte, versione 0.99.0)
Corretto nella 0.99.2 (rete) e 0.99.3 (autopilota mai fermo anche sugli errori non di rete). Causa: il PC non raggiungeva il server delle API (DNS/rete assente per più di un'ora) e il turno dell'orchestratore falliva senza un nuovo tentativo adatto; non è un difetto dei dati del workspace.

## 2. «[orchestratore] Desk_remoto #2 — turno non riuscito: API Error: Can't reach the API server (ENOTFOUND)» (10 volte, versione 0.99.0)
Stessa causa e stessa correzione del gruppo 1 (0.99.2 e 0.99.3): era il risveglio «lavoro fermo da 4 minuti» di un altro orchestratore, fallito sulla stessa mancanza di rete. Nessun gruppo aperto in questo lotto.

# Errori arrivati (lotto 20261110081517)

## «[aggiornamenti] fase: errore · 504» (2 volte, versione 0.98.0, segnato «si ripresenta»)
Corretto nella 0.99.0 (commit 976913be: un 502, 503 o 504 senza statusCode è un avviso e si riprova al controllo dopo) e completato nella 0.100.0 per la forma che restava fuori, «Cannot download "<url>", status 504:», quella del download dell’installer (src/main/aggiornamenti.ts). Causa: il server delle release rispondeva 504 mentre il programma cercava o scaricava l’aggiornamento; è un guasto passeggero del server, non del programma. Test in tests/main/aggiornamenti-rete-transitoria.test.ts.


# Errori arrivati (lotto 20261112124007)

## Gruppi 1-2: LAPTOP-E60QM2D1, 0.101.0, rename di impostazioni.json con EPERM e «Error occurred in handler for 'preferenze:imposta'»
Corretto nella versione 0.101.1. I due gruppi sono lo stesso evento: l'EPERM della rinomina (file tenuto da un antivirus o da un sync) e il lancio non catturato del gestore IPC per lo stesso salvataggio fallito. Cause: lo store diceva «valgono fino alla chiusura» ma non teneva niente in memoria e `preferenze()` rileggeva il disco, quindi la scelta spariva; dopo il fallimento non c'era nessun ritentativo; il renderer ignorava l'errore con `.catch` vuoti. Ora: il valore resta in memoria e si riscrive da solo (1 s, 5 s, 30 s, poi ogni 2 minuti, o finché arriva una scrittura nuova); il gestore non lancia e restituisce `{ preferenze, salvato }`; il renderer mostra «Preferenze non salvate sul disco: riprovo da solo». Test: tests/main/impostazioni-store.test.ts, preferenze-imposta.test.ts, tests/renderer/preferenze-non-salvate.test.tsx.
