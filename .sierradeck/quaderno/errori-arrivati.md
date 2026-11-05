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

## Corretto nella prossima release

- Un altro SierraDeck o un dispositivo estraneo che risponde 401 non dà più «risponde ma non riconosce la chiave»: la «chiave» vale solo per il PC atteso (stessa impronta) o con la cassaforte chiusa là.
- Se a un indirizzo risponde un altro PC già noto (impronta dai battiti), il bussare lo dice col nome: «ora risponde <nome>, un tuo altro PC: l'indirizzo è cambiato». «Chiudi l'altra copia» resta solo per impronta sconosciuta, senza dire che il SierraDeck vero è spento.
- Un indirizzo ricordato che risponde con un'identità diversa viene tolto da pc-indirizzi.json.
- Controllo di tutti i PC: una riga per PC (chiave pc:<id>); due PC che non rispondono restano due righe, ognuna col suo motivo; la diagnosi del bussare vince su «non so se è acceso».
- Salute: un PC che risponde (chiave / rifiutato / altro) non è più «non risponde a nessuna strada».

## A mano

- Verificare che NB-PROBOOK-TEC sia acceso, sulla stessa rete o con Tailscale (da qui non si può sapere).

# Errori arrivati (lotto 20261105113725, app 0.93.0)

## Gruppo 1: "[autopilota] porta 47630 gia occupata: un altro servizio e vivo, esco" (servizio, versione "?")
Corretto nella prossima release. Il caso e atteso (istanza unica: il doppione esce, quello di prima continua) ma la console.error del gestore di EADDRINUSE veniva catturata dal servizio come ERRORE e finiva negli errori arrivati. Ora il gestore e in src/autopilot-host/errore-server.ts (gestisciErroreServer): la porta occupata e un solo avviso (console.warn, riga info nel registro, uscita 0); ogni altro errore del server resta ERRORE con uscita 1. La versione "?" era un difetto vero ma a parte: un servizio avviato al login dallo script Esecuzione automatica non riceve SIERRADECK_VERSIONE (solo il Gestore la passa). Ora versioneDelServizio la legge dal package.json dell app se manca; "?" solo se non c e. Il campo versione dato al server (che decide se il Gestore sostituisce un servizio vecchio) NON e cambiato. Test in tests/main/errore-server-porta-occupata.test.ts.
