---
titolo: "App Android: analisi, correzioni e allineamento"
quando: 2026-10-08T11:49:21.455Z
tag: ["autopilota", "finito", "incompleto"]
---

## Obiettivo

Difetti segnalati da Nicholas l'08/10, da pubblicare come 0.52.5.
(1) «Non riesco a rispondere alle domande»: provare dal vero ogni strada di risposta (colonna PC, app, pagina, linguetta autopilota) sui casi di scelta multipla, testo libero e permesso; la risposta arriva alla chat giusta con i tasti giusti, la domanda sparisce e la chat riparte, anche per chat remote, PIN e ospite. Correggere con i test.
(2) Autopilota NexoraOS con «terminale della chat non nato»: causa (cancello dell'ospite?) trovata e corretta, con un test.
(3) Sul telefono, con certi PC, chat e autopilota si vedono male: testo ricomposto per la larghezza del telefono (righe del wrap del PC riunite, blocchi da terminale allineati e scorrevoli); scheda dell'autopilota con PC vecchi mostrata bene, con l'avviso per le parti mancanti; test a 80, 120 e 200 colonne e con risposte di PC vecchi.
Scheda nel quaderno con le cause e le prove dal vero. Patch 0.52.5 dopo git fetch, voce in novita.ts, APK alzato se cambia android. Commit in italiano, push e pubblicazione fatti dall'autopilota con la procedura del quaderno. Niente dati privati nel codice e nei test. Non toccare l'appId; il proprietario è Nicholas Ferrari / Ferrari Consulenze.

## Come è finita

- ⬜ Risposte alle domande provate dal vero su ogni strada (PC, app, pagina, autopilota) e su ogni tipo (scelta multipla, testo libero, permesso): arrivano alla chat giusta, la domanda sparisce, la chat riparte; difetti corretti con i test; esiti scritti nel quaderno (lo giudica il supervisore)
- ⬜ La chat dell'autopilota non resta bloccata dal cancello dell'ospite: causa del caso NexoraOS trovata e corretta, con un test (lo giudica il supervisore)
- ⬜ Sul telefono (app e pagina) le chat di PC con larghezze diverse si leggono bene, senza a capo rotti e con i blocchi da terminale allineati e scorrevoli; la scheda dell'autopilota con PC vecchi non si scompone; test a 80, 120 e 200 colonne (lo giudica il supervisore)
- ✅ La versione è 0.52.5 o successiva, con la sua voce nelle novità
- ✅ La versione corrente è pubblicata con latest.yml, l'APK e app-android.json, non è una bozza e il corpo della release non è vuoto
- ✅ I test del programma passano
- ✅ Il TypeScript del programma compila senza errori
- ✅ L'app Android compila e i suoi test unitari passano
- ✅ Tutto è in commit e mandato su origin

## Le mosse che contano

- **2026-10-07 14:17** — supervisore → finito: Ho controllato la v0.52.1: è pubblicata, non è una bozza, ha 5 allegati e l'APK 2.52.1. «Mi collego a…» c'è nell'app (Tentativi.kt, App.kt), sul PC e nella pagina; l'ospite delle chat è uscito nella 0.52.0; origin è allineato. Resta da fare la prova dal vivo con Nicholas.
- **2026-10-07 14:29** — su tua richiesta: Ricevuto, è un difetto della 0.52.1 sul telefono e lo correggo subito, come **0.52.2**.

Da quello che descrivi, quando scegli un altro PC l'app parte con il nome nuovo ma poi continua a usare i dati del PC di prima. Le due cause più probabili sono queste:
- l'animazione prende il PC che era selezio
- **2026-10-07 14:33** — su tua richiesta: Va bene, la metto nella stessa correzione, la **0.52.2**. Quando cambi PC dal telefono, l'animazione occupa **tutto lo schermo** e ti racconta passo per passo cosa succede:

- **In alto**, grande: «Mi collego a NOME-PC», con l'ora dell'ultimo segno di vita di quel PC e la sua versione.
- **Al centro
- **2026-10-07 14:45** — supervisore → prosegui: Nella 0.52.2 manca la schermata intera e dettagliata che Nicholas ha chiesto: non ci sono «Copia i dettagli» né «Torna al PC di prima», quindi il secondo criterio non è soddisfatto.
- **2026-10-07 15:01** — supervisore → finito: Ho verificato: la v0.52.3 è pubblicata e non in bozza, con 5 allegati e l'APK 2.52.3. Nell'app ci sono la schermata intera (SchermataViaggio.kt, Viaggio.kt) e «Copia i dettagli», con i test SelezioneTest e ViaggioTest. Origin è allineato e la causa è scritta nel quaderno. Restano solo le prove dal vivo con Nicholas.
- **2026-10-07 16:25** — su tua richiesta: **Il nome in alto.** Hai ragione, è un difetto. Nell'app, sia in alto sia nella schermata del cambio PC, compare il nome tecnico di Windows (tipo «DESKTOP-…») invece del nome che gli hai dato tu. Lo correggo subito come **0.52.4**: dappertutto (in alto, nella schermata «Mi collego a…», nelle chat re
- **2026-10-07 16:53** — supervisore → finito: Ho controllato la v0.52.4: è pubblicata, non è una bozza e ha 5 allegati, tra cui l'APK 2.52.4. Ci sono nome-pc.ts, NomePc.kt e i test vitest e Kotlin, e origin è allineato. La causa è scritta nel quaderno. Resta la prova dal vivo con Nicholas.
- **2026-10-08 10:36** — su tua richiesta: Ricevuto. Ho guardato i dati veri di questo PC. Gli autopiloti non hanno domande aperte, quindi le domande a cui non riesci a rispondere sono quasi certamente quelle **delle chat**: Claude Code che ti chiede di scegliere fra più opzioni o ti chiede un permesso. Dalla 0.45 queste le riconosciamo dai 
- **2026-10-08 10:39** — su tua richiesta: Ricevuto, lo aggiungo alla correzione che stiamo facendo (0.52.5). Da quello che descrivi, le cause più probabili sono due:

1. **La larghezza dello schermo del PC.** Il telefono riceve la chat «disegnata» con la larghezza del terminale di quel PC. Se un PC ha lo schermo largo, le righe arrivano lun
- **2026-10-08 10:42** — comando bloccato dal programma: SierraDeck blocca questa cancellazione: «un file dello scratchpad della sessione» è fuori dalle cartelle di questo autopilota (le cartelle del progetto). Si cancellano solo file dentro le sue cartelle.
- **2026-10-08 11:24** — supervisore → prosegui: La 0.52.5 copre le domande e NexoraOS, ma il terzo criterio (chat e autopilota che sul telefono si vedono male con certi PC) non è stato toccato.
- **2026-10-08 11:49** — supervisore → finito: Tutti e tre i punti sono pubblicati: domande e NexoraOS nella 0.52.5, schermo sul telefono e PC vecchi nella 0.52.6. Ho controllato la v0.52.6: non è una bozza, ha 5 allegati e l'APK 2.52.6. Ci sono ricomponi-schermo.ts e Ricomponi.kt con i test, e origin è allineato. Restano le prove dal vivo con Nicholas.

## In numeri

- interventi: 44
