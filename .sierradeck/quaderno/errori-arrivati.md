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

# Errori arrivati (lotto 20261113091024)

## Gruppo 1: «[blocco] visitafacile — git locale non creato, gli specialisti lavorano uno alla volta: è la radice di un disco o la cartella dell’utente: non è un progetto»
Corretto nella versione 0.105.2. Causa: `cartellaVietata` (src/autopilot-host/git-locale.ts) usava `path.relative` fra la cartella utente e il progetto; su Windows, con dischi diversi, `path.relative` dà un percorso assoluto e non uno relativo, quindi il progetto veniva scambiato per «radice di un disco o cartella dell’utente» e il git locale non veniva creato. Correzione in main (887b0778), test in tests/autopilot-host/git-locale-12-11.test.ts.

# Errori arrivati (lotto 20261113131025)

## Gruppo 1: «Error occurred in handler for 'autopilota:dialoga': il servizio autopilota ha rifiutato la richiesta: autopilota inesistente» (Z2-TECNICO, 0.105.1)
Corretto nella versione 0.106.0. Causa: il 404 su un id di autopilota sconosciuto (workspace riunito o eliminato) veniva lanciato come errore e il messaggio andava perso; ora il client lo rimanda all'autopilota del workspace di prima (commit d526cd31, src/main/autopilot-client.ts, test in tests/main/autopilot-client.test.ts).

# Errori arrivati (lotto 20261113145748)

## Gruppo 1: «[renderer] errore di render — Error: Minified React error #310» (Z2-TECNICO, 0.106.0, 11 volte)
Corretto nella versione 0.106.1. Causa: `useMisuraTrascinabile` chiamato in App dopo un `if (!pronto) return`, quindi alla prima schermata vera React contava più hook di prima (commit 0501f339). Verificato in k-153: la prova tests/renderer/regole-hook.test.ts legge ogni file di src/renderer con Babel e non trova nessun hook dopo un return anticipato; è verde.

# Errori arrivati (controllo 20261113T150258)

## Z2-TECNICO, 0.106.0: «[renderer] errore di render — TypeError: Cannot read properties of undefined (reading 'filter')»
Corretto nella versione 0.106.3. Il rapporto non ha lo stack: causa più probabile, una vista dell'autopilota arrivata dal servizio o da un altro PC di versione diversa senza la lista `specialisti` (o `richieste` della coda), su cui il disegno chiamava `.filter`. Ora la vista si normalizza quando arriva (src/renderer/normalizza-vista.ts, usata da SORGENTE_LOCALE e sorgenteRemota) e `specialistiInVista` ha un valore predefinito. Test: tests/renderer/normalizza-vista.test.ts. Se l'errore torna con uno stack diverso, riaprire.

# Errori arrivati (lotto 20261113151348)

12 gruppi, tutti «[aiuto] lavoro <id> (<ruolo>) per PC-Fisso non riuscito: lo specialista ha chiuso con un errore» (Aiutante 1.0.1, un gruppo per ogni id di lavoro).
Corretto nella versione 0.106.3. Causa: l’accesso Claude dell’Aiutante era scaduto («Failed to authenticate: OAuth session expired…», non riconosciuto come accesso) e il programma riaffidava a quel PC lo stesso compito e altri. Ora: causa riconosciuta, motivo «accesso Claude scaduto su <PC>», PC fuori subito per un’ora o finché non riesce un lavoro (src/shared/aiuto-esito.ts), stesso compito non rilanciato sul PC dove è fallito, e la chiave di raggruppamento (normaMessaggio in src/main/errori-arrivati-lavoro.ts) non ha più l’id né il ruolo: un gruppo solo. Test: tests/main/aiuto-rete-fallimenti.test.ts.

# Errori arrivati (lotto 20261113152148)

5 gruppi, gli stessi «[aiuto] lavoro <id> per LAPTOP… non riuscito» (Aiutante 1.0.1).
Corretto nella versione 0.106.3, con la stessa correzione del lotto 20261113151348 (PC non adatto dopo un accesso scaduto o un PC che non risponde, motivo vero, un gruppo solo). Test: tests/main/aiuto-rete-fallimenti.test.ts.

# Errori arrivati (lotto 20261113154752)

4 gruppi, tutti «[aiuto] lavoro <id> (<ruolo>) per PC-Fisso non riuscito: lo specialista ha chiuso con un errore» (DESKTOP-O2DITVE Aiutante 1.0.1, una volta ciascuno, 15:29-15:40Z).
Corretto nella versione 0.106.3, con la stessa correzione dei lotti 20261113151348 e 20261113152148: l’Aiutante aveva l’accesso Claude scaduto, quindi nessun codice nuovo (PC fuori dopo un accesso scaduto, motivo vero, un gruppo solo). Test: tests/main/aiuto-rete-fallimenti.test.ts.

# Errori arrivati (lotto 20261113160752)

1 gruppo: lavoro della rete fallito su DESKTOP-O2DITVE (Aiutante 1.0.2) per accesso Claude scaduto («OAuth session expired»).
Non è un difetto nuovo: è il difetto della rete già corretto da k-152. Corretto nella versione 0.106.3 (PC fuori subito, motivo vero col nome del PC, un gruppo solo). Test: tests/main/aiuto-rete-fallimenti.test.ts.

# Errori arrivati (lotto 20261113161352)

1 gruppo: lavoro della rete fallito su DESKTOP-O2DITVE (Aiutante 1.0.2) per accesso Claude scaduto («OAuth session expired»).
Non è un difetto nuovo: stesso difetto della rete corretto da k-152, come il lotto 20261113160752. Corretto nella versione 0.106.3.

# Errori arrivati (lotto 20261113220708)

1 gruppo: Z2-TECNICO, 0.106.2, «[renderer] errore di render — TypeError: Cannot read properties of undefined (reading 'length') at adessoDi» (CorpoPanoramica).
Corretto nella versione 0.107.1: un autopilota arrivato da un altro PC senza `chats` faceva cadere `adessoDi` (e il Punto dal vivo), ora vale come lista vuota. Test: tests/shared/adesso-senza-chats.test.ts.

# Errori arrivati (lotto 20261113221708)

1 gruppo: «[aiuto] lavoro r89860033c354 (sviluppatore) per PC-Fisso non riuscito» (DESKTOP-O2DITVE, Aiutante 1.0.2, 1 volta).
Non è un difetto nuovo: il lavoro di k-158 era finito su DESKTOP-O2DITVE con l'accesso Claude scaduto («OAuth session expired»), difetto della rete già corretto nella 0.106.3 (il PC che l'aveva scelto aveva ancora la 0.106.1).

# Errori arrivati (lotto 20261113223446)

1 gruppo: «Error occurred in handler for 'autopilota:elenca': Error: il servizio autopilota non risponde sulla porta 47630: TypeError: fetch failed» (Leonardo, 0.107.0, 2 volte in 3 secondi, durante il riavvio del servizio dopo l'aggiornamento; stesso per il dettaglio).
Corretto nella versione 0.107.1: servizio spento o in riavvio (fetch failed, ECONNREFUSED, ECONNRESET) trattato come il timeout: elenco e dettaglio restano l'ultimo noto, un avviso nel registro e si riprova al giro dopo. Test: tests/main/elenco-autopilota-0-94-2.test.ts.

# Errori arrivati (lotto 20261113230646)

1 gruppo: «[claude] Claude non collegato o accesso scaduto su questo Aiutante…» (DESKTOP-O2DITVE, Aiutante 1.0.3, 1 volta, 2026-11-13T22:58Z).
Non è un difetto: è il controllo preventivo dell'Aiutante 1.0.3 che segnala l'accesso a Claude mancante prima di prendere lavori (proprio quello che mancava nel lotto 20261113221708). Si risolve a mano: «Collega Claude» dalla finestra dell'Aiutante su DESKTOP-O2DITVE. Nessuna correzione, nessuna versione.

## Controllo di tutti i PC 20261114T043052 (k-c1114)
1. Z2-TECNICO con la 0.106.2 (le altre 0.107.0, ultima pubblicata 0.107.1): non è codice, non corretto in nessuna versione. A mano: «Installa là» da PC-Fisso (o «Installa» dallo schermo di Z2-TECNICO).
2. DESKTOP-G24D499 non raggiunge PC-Fisso («non so se è acceso», battito di 18 minuti fa): nessuna causa nel codice, nessuna versione. Riletti statoDi/bussa (src/main/pc-remoto.ts), statoPc (src/shared/scoperta-pc.ts), la voce di Salute (src/shared/salute.ts) e unisci() del controllo (src/main/controllo-pc.ts): gli indirizzi si ricavano dal battito e da Tailscale a ogni bussare, la diagnosi del bussare vince su «non so se è acceso», e la riga è già declassata ad «attenzione» perché PC-Fisso risponde a chi controlla. Con un battito di 18 minuti (sotto i 35 di PC_SPENTO_DOPO_MS) e nessuna risposta il testo «non so se è acceso» è coerente. Resta un problema di strada fra quei due PC (firewall, rete, Tailscale). A mano su DESKTOP-G24D499: riaprire Salute e premere «Riprova adesso» su PC-Fisso; se resta, controllare che Tailscale sia acceso e connesso su DESKTOP-G24D499 e che il firewall non blocchi la porta 47640 verso PC-Fisso (PC-Fisso la raggiunge dagli altri PC, quindi è la parte di DESKTOP-G24D499).

# Errori arrivati (lotto 20261114141007)

2 gruppi dallo stesso evento (DESKTOP-G24D499, 0.107.0, 14:01Z): k-136 mandato a Z2-TECNICO con «Aiuta la rete», lo specialista è fallito con «Failed to authenticate: OAuth session expired and could not be refreshed» (un gruppo lato pc, uno lato servizio).
Non è un difetto nuovo: è l'accesso a Claude scaduto su Z2-TECNICO. La rete è già corretta nella 0.106.3 (test tests/main/aiuto-rete-fallimenti.test.ts): riletto che con la 0.107.x un fallimento per accesso mette il PC in pausa (pauseAiuti in src/shared/aiuto-esito.ts, filtro pcInPausa in servizio-orchestratore.ts), fuori per tutti i compiti e i progetti finché non riesce un lavoro. Un fallimento è atteso: è quello che fa scoprire l'accesso scaduto.
A mano su Z2-TECNICO (ha ancora la 0.106.2): rifare l'accesso a Claude e installare la 0.107.1. Nessuna correzione, nessuna versione.

# Errori arrivati (lotto 20261114143007)

1 gruppo: DESKTOP-G24D499 (0.107.0), 14:23Z, k-138 mandato a Z2-TECNICO con «Aiuta la rete» (45 MB spediti), fallito con «Failed to authenticate: OAuth session expired and could not be refreshed». Era già successo alle 14:01Z con k-136: 22 minuti dopo il PC era stato riprovato.
È un difetto, nostro: Z2-TECNICO ha ancora l'Aiutante/programma 0.106.2, che non riconosceva quel testo come «accesso» e mandava `causa: 'sconosciuta'` insieme al motivo col testo vero. In `aiutoAvanza` (servizio-orchestratore.ts) e in `causaDi` (aiuto-esito.ts) una causa dichiarata, anche «sconosciuta», vinceva sul testo: il fallimento non era «accesso», quindi nessuna pausa del PC (solo quella dello stesso compito, 10 min). La prova: il registro di DESKTOP scrive «lo specialista ha chiuso con un errore (tipo success; …)» e non «accesso Claude scaduto su Z2-TECNICO».
Corretto nella versione 0.107.2: una causa «sconosciuta» dichiarata dal PC non vale più del testo (nuova `causaDelFallimento`: motivo, poi riepilogo; anche per i lavori già nel file); in più la pausa per accesso scaduto cresce a ogni fallimento di fila (1 h, 2 h, 6 h) e un lavoro riuscito la azzera. Test in tests/main/aiuto-rete-fallimenti.test.ts. Versione NON alzata in package.json, niente pubblicazione.
A mano su Z2-TECNICO va rifatto l'accesso a Claude (e aggiornato alla 0.107.x).

# Errori arrivati (lotto 20261114213810)

3 gruppi dallo stesso evento (DESKTOP-G24D499, 0.107.0, 21:30:30Z): «Aiuta la rete» non riesce a spedire k-17 a LAPTOP-E60QM2D1, che il Drive dice acceso ma che non risponde sulla porta 47640.
Il PC irraggiungibile non è un difetto del programma: è rete, Tailscale o firewall del portatile. La pausa e il lavoro rifatto altrove sono il comportamento giusto.
Difetti veri, corretti nella versione 0.107.3: le tre righe erano errori invece di avvisi (gruppi 1, 2 e 3: livelloRigaAiuto e `avviso` nello spedizioniere, test in tests/main/aiuto-rete-fallimenti.test.ts) e il carattere › era rovinato nel gruppo 2 (lettura a pezzi senza decoder: StringDecoder in src/shared/corpo-richiesta.ts e verifiche.ts, test in tests/shared/corpo-richiesta.test.ts).
A mano: controllare Tailscale e il firewall su LAPTOP-E60QM2D1 (porta 47640).

## Controllo di tutti i PC 20261115T020813 (k-c1, r-135)
1. Z2-TECNICO con la 0.106.2 (gli altri 0.107.0): non è codice, non corretto in nessuna versione. A mano: «Installa là» da PC-Fisso, oppure «Installa» dallo schermo di Z2-TECNICO.
2. Z2-TECNICO vede PC-Fisso «non so se è acceso» con battito di 10 minuti fa, mentre PC-Fisso, LAPTOP e DESKTOP-G24D499 raggiungono Z2-TECNICO via Tailscale; su Z2-TECNICO anche «[posta] giro fallito: TypeError: fetch failed».
Causa della mancata strada: NON nel codice. Dopo la 0.106.2 nessuna correzione sul bussare (pc-remoto.ts, scoperta-pc.ts, tailscale.ts: git log v0.106.2..main non ha niente), e gli indirizzi si ricavano a ogni bussare dal battito e da Tailscale. Il collegamento è solo in uscita da Z2-TECNICO (le altre direzioni funzionano, e anche la posta di Z2-TECNICO verso fuori fallisce con «fetch failed»): è la rete o Tailscale di Z2-TECNICO, non PC-Fisso.
Difetto vero nel testo, corretto (versione NON alzata): con un battito fresco (sotto i 35 minuti) e nessuna risposta la voce di Salute diceva «non so se è acceso» accanto a «Ultimo battito 10 minuti fa», e «Accendi PC-Fisso». Ora dice «acceso secondo il Drive, ma non si raggiunge» e come cosa fare di controllare Tailscale su tutti e due e premere «Riprova adesso» (salute.ts; il controllo unisce la riga come diagnosi generica in controllo-pc.ts). Test in tests/shared/salute.test.ts.
A mano su Z2-TECNICO: aprire Tailscale e controllare che sia connesso (non solo «in ascolto»), premere «Riprova adesso» su PC-Fisso in Salute; se resta, controllare il firewall in uscita e proxy/VPN che bloccano le connessioni verso gli indirizzi 100.x e la porta 47640. Poi installare la 0.107.x (punto 1).

# Errori arrivati (lotto 20261116081221)

2 gruppi.
1. npm mancante all'Aiutante su un portatile: corretto nella prossima versione (la versione in package.json è ancora la 0.107.3). Il motivo ora è distinto (tempo scaduto / non installato / errore con testo) e dopo un minuto c'è un nuovo tentativo. A mano: se su quel PC npm manca davvero, si risolve installando Node.js.
2. Aggiornamento dell'Aiutante con net::ERR_NETWORK_IO_SUSPENDED: corretto nella prossima versione. Gli errori di rete passeggeri diventano un avviso (non un errore) con nuovo tentativo ogni 2 minuti, fino a 5 volte, e ripresa al risveglio del PC.

# Errori arrivati (lotto 20261116112622)

1 gruppo: «blocco fionda apl», criterio rosso dopo l'unione in un altro progetto. Non è un difetto di SierraDeck: è il criterio di un altro progetto, che arriva qui perché il servizio lo registra con console.error (scelta del 12/11, da riguardare). Nessuna correzione, nessuna versione.

# Errori arrivati (lotto 20261116131822)

1 gruppo: LAPTOP alla 0.107.0, TypeError «Cannot read properties of undefined (reading 'length')» in adessoDi dentro CorpoPanoramica (un autopilota senza chats).
Già corretto nel commit c536fd60 (adessoDi regge un autopilota senza chats), presente dalla 0.107.1; riletto src/shared/adesso.ts: il controllo Array.isArray(a.chats) c'è (righe 84 e 149). LAPTOP era alla 0.107.0, che non lo conteneva: non serve altro codice, si risolve aggiornando quel PC. Corretto nella prossima versione pubblicata (già in main).

# Errori arrivati (lotto 20261116150451)

1 gruppo: «Claude non collegato» (accesso), registrato dall Aiutante come errore a ogni avvio.
Non è un difetto: è un caso atteso (su quel PC Claude non è collegato). Il difetto era nel trattamento: veniva scritto come errore a ogni avvio, e l etichetta «la correzione non è bastata» compariva a torto. Corretto nella prossima versione (la 0.109.0, probabilmente; package.json è ancora alla 0.108.0): ora è un avviso. Già in main (compito k-l2), test in tests/aiutante/controllo-claude-avviso.test.ts.
A mano: collegare Claude su quel PC («Collega Claude» dalla finestra dell Aiutante).
Nota: il rapporto del lotto (.sierradeck/errori-arrivati/lotto-20261116150451.md) non era leggibile dalla mia copia, quindi la voce descrive solo questo gruppo; se il lotto ne ha altri vanno aggiunti.

# Errori arrivati (lotto 20261116155433)

1 gruppo (renderer): «errore di render — TypeError: Cannot read properties of undefined (reading 'filter')», da `conversazione` chiamata da `ChatAutopilota` dentro `CorpoPanoramica` (0.108.0, 2 volte su un PC). Altri 3 errori visti solo su versioni più vecchie sono stati lasciati fuori dal rapporto.
È un difetto vero. Causa: `conversazione(a)` chiamava `a.dialogo.filter(...)` senza controllare che l'elenco ci fosse; un autopilota arrivato con dati parziali, senza dialogo, decisioni o chat (da un altro PC o salvato da una versione vecchia), faceva rompere tutta la Panoramica.
Corretto nella prossima versione (la versione in package.json è la 0.108.0, quindi probabilmente la 0.109.0): la correzione è già in main (k-m1), i campi che mancano si trattano come vuoti. Test: tests/shared/chat-autopilota-dati-parziali.test.ts. Nessuna azione a mano.

# Errori arrivati (lotto 20261116170625)

## Gruppo 1: «Error occurred in handler for 'autopilota:orchestratore': Error: richiesta IPC non valida» (LAPTOP-E60QM2D1 e Z2-TECNICO, 0.109.0, 3 volte, a wsCoda)
Difetto vero, corretto nella versione 0.109.1. Causa: la finestra chiedeva la coda (e l'orchestratore e lo specialista) prima che il workspace fosse scelto, e l'handler IPC lanciava «richiesta IPC non valida». Correzione in main da k-f1 (commit 95be34cf: con il workspace vuoto la lettura risponde `undefined` invece di lanciare; src/main/ipc.ts, src/main/ws-coda.ts, src/renderer/sorgente-autopilota.tsx). Verificato: aprendo la finestra senza workspace non compare più nessun errore. Test: tests/main/ipc-ws-vuoto.test.ts.

## Gruppo 2: «[claude] Claude non collegato o accesso scaduto su questo Aiutante… (loggedIn: false)» (DESKTOP-O2DITVE, Aiutante 1.2.0, 1 volta, segnato «si ripresenta»)
Non è un difetto vero: è un caso atteso. Senza accesso a Claude l'Aiutante deve dare solo un avviso nella sua finestra. La correzione 0cc5bac4 è arrivata dopo la 1.2.0, ed è per questo che l'errore si è ripresentato. Corretto nella versione 0.109.1: con l'Aiutante 1.2.1 (k-f2) è solo un avviso e non arriva più fra gli errori; se Claude non è installato resta invece un errore, come deve essere.
Sempre con k-f2 è stato corretto un difetto vero, a parte: i git dell'Aiutante non reggevano i percorsi oltre i 260 caratteri. Ora usano `-c core.longpaths=true` e non perdono più il lavoro consegnato. Tutto questo entra nella 0.109.1 con l'Aiutante 1.2.1.
A mano: se su quel PC Claude non è collegato, «Collega Claude» dalla finestra dell'Aiutante.

# Errori arrivati (lotto 20261117074117)

## Gruppo 1: «[aiuto] lavoro r1d069f21bebc (sviluppatore) per DESKTOP-G24D499 non riuscito: ha superato le 3 ore» (NB-PROBOOK-TEC, Aiutante 1.2.1)
Difetto vero, corretto nella versione 0.109.2 (con l'Aiutante 1.2.2). Causa: la scadenza delle 3 ore era a orologio da muro, quindi il sonno notturno del portatile contava e al risveglio il lavoro veniva ucciso. In più la colpa andava sempre al «compito», così il lavoro non passava a un altro PC. I commit già fatti non si perdevano. Ora la scadenza conta solo il tempo a PC sveglio; dopo un sonno o col silenzio la colpa è del PC e il lavoro può passare a un altro (src/shared/aiuto-scadenza.ts, src/autopilot-host/aiuto-lavoratore.ts, test tests/autopilot-host/aiuto-scadenza.test.ts). Il lavoro r1d069f21bebc va riproposto.

# Errori arrivati (lotto 20261120123843)

## Gruppo 1: «[renderer] errore di render — Cannot read properties of undefined (reading 'replace') in chiaveWorkspace» (Portatile Asus)
Difetto vero, corretto nella versione 0.111.3. Causa: un autopilota arrivato senza cartella di lavoro (cwd) faceva cadere chiaveWorkspace, e con lei la Panoramica. Correzione k-165a (commit 9a27373f: chiaveWorkspace regge l'assenza di cwd; src/shared/coda-richieste.ts e i tre componenti dell'autopilota). Test: tests/shared/chiave-workspace-senza-cwd.test.ts.

# Errori arrivati (lotto 20261120145943)

## Gruppo 1: «[rete] il Drive è scollegato…» (1 volta, Aiutante 1.2.2 di un altro PC, 20/11 alle 14:51Z)
Corretto nella versione 0.112.0 (Aiutante 1.3.0). Causa: l Aiutante prendeva per Drive scollegato un solo giro in cui il token non si vedeva (portachiavi non ancora pronto o file in riscrittura) e lo mandava agli altri PC come errore di rete. Ora `stabilizzaRete` (src/aiutante/regole.ts): portachiavi non pronto = non scollegato; il segno scritto da conto-drive alla revoca vale subito; altrimenti servono due giri di fila. Correzione k-170a (commit 58ffcba5b9b). Test: tests/aiutante/blocchi-rete-transitori.test.ts.

# Errori arrivati (lotto 20261120155343)

## Gruppo 1: «The database connection is not open» (Portatile Asus, 0.111.2)
Difetto vero, corretto nella versione 0.112.1. Causa: in chiusura del programma chiudiRisorse() chiudeva il db mentre la finestra chiedeva ancora i consumi (e lista/elimina delle sessioni), e i gestori ipc lanciavano un errore finto nel registro. Correzione k-171a: i gestori 'sessioni:lista', 'sessioni:consumi' e 'sessioni:elimina' usano `leggiDbOVuoto` (src/main/db-chiuso.ts). Test: tests/main/db-chiuso-in-uscita.test.ts.

# Errori arrivati (lotto 20261123094011)

Il fatto di fondo, per tutti e 3 i gruppi: i filtri di sicurezza di Claude («API Error: Sonnet 5's safeguards flagged this message…») hanno bloccato il compito k-55 del progetto Money (lavoro rba4ca9869603, sviluppatore, sul DESKTOP-O2DITVE). È un fatto esterno, non un difetto del programma. Il difetto era il modo di dirlo. Corretto nella versione 0.114.3 (Aiutante 1.3.1).

## Gruppo 1: «[aiuto] rba4ca9869603 (k-55) da DESKTOP-O2DITVE Aiutante: non riuscito: il servizio di Claude non ha risposto (…) «API Error: Sonnet 5's safeguards flagged this message…»» (dove pc, Portatile Asus 0.112.0, 2 volte)
Corretto nella versione 0.114.3. Era un doppione della riga del gruppo 3 e una causa sbagliata («il servizio non ha risposto»). Ora: k-183b, un lavoro affidato fallito lascia un solo errore e i doppioni passano ad avviso; k-183a, causa nuova «rifiuto» (src/shared/aiuto-esito.ts) con il motivo giusto e senza mettere in pausa il PC. Il conteggio «2 volte» sono voci identiche contate due volte: ora non più (src/main/errori-arrivati-lavoro.ts). Ipotesi, non riprodotta sul caso vero.

## Gruppo 2: «[aiuto] Money — k-55 da DESKTOP-O2DITVE Aiutante: fallito — …» (dove servizio, Portatile Asus 0.112.0, 2 volte)
Corretto nella versione 0.114.3. Questa è la riga giusta, e resta (un solo errore per il lavoro fallito, k-183b), ora col motivo giusto (k-183a). Il conteggio «2 volte» come sopra: voci identiche non più contate due volte (ipotesi, non riprodotta sul caso vero).

## Gruppo 3: «[aiuto] lavoro rba4ca9869603 (sviluppatore) per Portatile Asus non riuscito: …» (dove pc, Aiutante DESKTOP-O2DITVE 1.3.0, 1 volta)
Corretto nella versione 0.114.3 (Aiutante 1.3.1). Doppione della riga del gruppo 2: ora è un avviso e non un errore (k-183b, src/aiutante/nucleo.ts), col motivo giusto (k-183a).

# Errori arrivati (lotto lotto-20261123213402)

## Gruppo 1: «[blocco] BG4 — unione di k-156 ferma da 8 minuti: l’unione di prova non si è potuta fare (la cartella di lavoro ha modifiche non salvate)» (servizio di fisso_scrivania_glos, versione 0.117.2, 1 volta)
Non corretto, perché non è un difetto: è un caso atteso. Nella cartella principale di BG4 su quel PC ci sono modifiche non salvate fuori da `.sierradeck/`. Il programma non le tocca: aspetta, rifà il tentativo e avvisa Nicholas da solo. Le note del programma dentro `.sierradeck/` invece le salva da solo prima di unire (src/autopilot-host/worktree.ts, intorno alla riga 682), quindi non sono la causa. Da 0.117.3 questi tentativi si contano a parte nel rapporto, come «unioni non partite».

# Errori arrivati (lotto lotto-20261123225201)

## Gruppo 1: «[blocco] BG4 — unione di k-196 ferma da 8 minuti: criterio rosso con file non salvati nella cartella principale (138 file)» (servizio di fisso_scrivania_glos, versione 0.117.2, 1 volta)
Corretto nella versione 0.117.3. Il motivo: i criteri misurati nella cartella principale (l'unione di prova e la misura dopo l'unione) lasciavano modificati i file tracciati che rigenerano; è il caso di BG4, con lo schema e la distinta. Le unioni dopo si fermavano su quei file. Dalla 0.117.3 il programma fa una foto dei file già modificati prima della misura e dopo rimette com'erano solo quelli cambiati dalla misura (`git diff --name-only -z` + `git checkout --`, `fotoModificheAsincrono` e `ripristinaGeneratiAsincrono` in src/autopilot-host/worktree.ts, usate da servizio-orchestratore.ts e server.ts). In più la domanda «li salvo?» arriva dopo 5 minuti di blocco. I file già sporchi oggi su BG4 si sistemano una volta sola con quella domanda, dopo l'installazione.

# Errori arrivati (lotto lotto-20261123232105)

## Gruppo 1: «[blocco] BG4 — unione di k-156 ferma da 8 minuti: l’unione di prova non si è potuta fare (la cartella di lavoro ha modifiche non salvate)» (servizio di fisso_scrivania_glos, versione 0.117.3, 1 volta)
Corretto nella versione 0.118.0. Difetto vero, solo in parte: la riga non dice «(N file)», quindi git non aveva indicato nessun file (unione lasciata a metà nella cartella principale, o stato git che non si legge: `iniziaProvaPassi` in src/autopilot-host/worktree.ts, righe con `MOTIVO_CARTELLA_SPORCA` senza `file`). La domanda «li salvo?» parte solo con almeno un file da elencare (servizio-orchestratore.ts), quindi in questo caso non partiva mai e Nicholas restava senza avviso. Ora, dopo gli stessi 5 minuti, il programma manda un avviso una volta sola con il motivo e cosa guardare (`git status`), e l’unione riparte da sola quando la cartella è a posto. Con file elencati (il caso dei 138 file della 0.117.3) la domanda c’era già e non è cambiata. Test: tests/autopilot-host/unioni-file-non-salvati-11-11.test.ts. Ipotesi sulla causa precisa sul PC di Glos, non riprodotta sul caso vero.

# Errori arrivati (rapporto lavori fionda apl, 23/11 sera, versione 0.117.3)

## «unione di prova scaduta mentre stava per misurare i criteri» (2 su 4, prova 330 s, secondo tentativo 16 s)
Corretto nella 0.118.0. Il motivo: la scadenza adattiva ha un minimo fisso di 5 minuti (le prove veloci di prima abbassano la mediana) e non guardava quanti criteri c’erano; in più dentro la misura contava anche l’attesa della guardia del PC (fino a 2 minuti per ogni comando pesante). La riga «aspetta il suo turno dietro 1 comandi lunghi» era falsa: la misura ha già il turno e il pesante non aspetta nessuno. Il secondo tentativo è breve perché i criteri già verdi sullo stesso codice sono in memoria e gradle ha la sua cache. Ora il minimo cresce di 10 s per criterio (sempre sotto il tetto), l’attesa della guardia ferma la scadenza, la riga falsa non si scrive più. I criteri si misurano comunque tutti (src/autopilot-host/tempi-unione.ts, turni-criteri.ts, server.ts).
