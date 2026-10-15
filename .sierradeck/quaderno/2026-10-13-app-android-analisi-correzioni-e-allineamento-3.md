---
titolo: "App Android: analisi, correzioni e allineamento"
quando: 2026-10-13T17:56:50.651Z
tag: ["autopilota", "finito", "incompleto"]
sessione: 1ff78f5e-523c-43b4-b74f-044d9691131d
---

## Obiettivo

0.71.1: correzioni dopo l'installazione della 0.71.0. Le domande delle chat sempre visibili in Domande, sul PC, sulla pagina e nell'app finché hanno risposta; lo spostamento con un PC spento dice il motivo in chiaro e lascia scegliere fra «Aspetta» e «Vai avanti senza», senza perdere niente; la pagina Progetti provata tasto per tasto con una copia staccata dei dati veri e ogni errore corretto. Una sola release 0.71.1, mai installata da noi; rapporto in italiano. Niente dati privati nel codice; solo i PC della stessa chiave di casa; sulle chat vere solo lettura; il trasloco vero di Nicholas non si tocca. Proprietario: Nicholas Ferrari / Ferrari Consulenze.

## Come è finita

- ⬜ Domande: causa trovata nel registro vero; una domanda di una chat (AskUserQuestion o testo) resta visibile in Domande, sul PC, sulla pagina e nell'app finché ha risposta, anche se l'autopilota risponde da solo (in quel caso con «risposta dall'autopilota»); test e prova dal vero su una chat di prova
- ⬜ Spostamento con PC spento: motivo in chiaro con il nome del PC, scelte «Aspetta quel PC» e «Vai avanti senza» senza perdere niente, su PC, pagina e app; test; il trasloco vero di Nicholas non toccato
- ⬜ Pagina Progetti provata con clic veri su una copia staccata dei dati veri (Drive e ponte spenti): ogni tasto, menu e «?» del PC e della pagina; errori elencati nel quaderno e corretti con test; copia cancellata alla fine
- ⬜ Rapporto in italiano nel quaderno con le cause, cosa è cambiato e i punti aperti
- ✅ Nessun indirizzo, nome o id vero dei PC di Nicholas nel codice, nei test, nell'app e nelle pagine
- ✅ La versione è 0.71.1 o successiva, con la sua voce nelle novità
- ✅ La versione corrente è pubblicata con latest.yml, l'APK e app-android.json, non è una bozza e il corpo della release non è vuoto
- ✅ L'APK dell'ultima release è firmato con il certificato di rilascio di Ferrari Consulenze
- ✅ I test del programma passano
- ✅ Il TypeScript del programma compila senza errori
- ✅ L'app Android compila e i suoi test unitari passano
- ✅ Tutto è in commit e mandato su origin

## Le mosse che contano

- **2026-10-13 09:35** — su tua richiesta: Hai ragione, scusa. Ho controllato: su questo PC c'è la **0.70.0**, installata da te alle 11:27, e il menu «Strumenti ▾» dei Progetti è proprio quello nuovo di stanotte. Leggendo il codice non vedo il motivo per cui non si apre, quindi la chat lo **riproduce sul programma di prova** e lo corregge, c
- **2026-10-13 09:35** — la chat lavora e 2 messaggi aspettavano da 3 min: glieli scrivo adesso, durante il turno
- **2026-10-13 10:23** — su tua richiesta: No, e hai fatto bene a chiedere: **la chat è ferma dalle 11:36**. Ho guardato il registro. Alle 11:35 le ho mandato le istruzioni sul tasto Strumenti e su «Sposta su». In quel momento la chat lavorava in sottofondo, e un minuto dopo è passata nella sua finestra del workspace «SierraDeck». Proprio in
- **2026-10-13 10:25** — la chat lavora e un messaggio aspettava da 2 min: glieli scrivo adesso, durante il turno
- **2026-10-13 12:38** — supervisore → finito: Ho verificato: la 0.71.0 è pubblicata (non bozza, con installer, latest.yml, APK 2.71.0 firmato e app-android.json) e non è installata. I commit coprono tutto il lavoro: c-14, Strumenti e giro dei menu, Sposta su, ruoli, domande, velocità. Nel quaderno ci sono il piano, le schede e il rapporto. Il commit b13a377 contiene lavoro vero, solo con un messaggio sbagliato, e la causa è corretta in b72155f. Resta solo la prova di «Sposta su» fra due PC veri, che si può fare soltanto dopo che Nicholas installa: è un punto aperto con un motivo.
- **2026-10-13 12:38** — scheda nel quaderno: 0.71.0: da verificare dopo l'installazione di Nicholas
- **2026-10-13 15:04** — il servizio è ripartito con 2 messaggi ancora in viaggio verso la chat: li rimetto in coda
- **2026-10-13 15:10** — su tua richiesta: Hai ragione, ci sono ancora problemi. Ho guardato il registro di questo PC: hai installato la 0.71.0 alle 17:04, desk-nik-glos ce l'ha anche lui, il portatile è alla 0.69.0 ed è spento.

**Lo spostamento fermo.** Alle 17:07 hai chiesto di rendere **SierraDeck** residente su questo PC. Lo spostamento
- **2026-10-13 15:10** — ripreso su tua richiesta («Riprendi»)
- **2026-10-13 15:51** — comando bloccato dal programma: SierraDeck blocca questa cancellazione: «~\AppData\Local\Temp\claude\<progetto>\1ff78f5e-523c-43b4-b74f-044d9691131d\scratchpad\vero-copia» è fuori dalle cartelle di questo autopilota (~\Documents\SierraDeck, ~\Documents\SierraDeck.sierradeck-wt). Si cancellano solo file dentro le sue cartelle.
- **2026-10-13 17:56** — supervisore → finito: Tutti i criteri con un comando passano, verificati dal programma alle 17:56. La 0.71.1 è pubblicata e non installata. I commit coprono le tre correzioni e i difetti trovati provando. La copia staccata dei dati veri è stata cancellata. Lo spostamento vero di SierraDeck è ancora fermo e non toccato. Il rapporto è nel quaderno, con i punti aperti motivati.
- **2026-10-13 17:56** — scheda nel quaderno: 0.71.1: cosa resta dopo l'installazione di Nicholas

## In numeri

- interventi: 114
- cartella: `~\Documents\SierraDeck`
