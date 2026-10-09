---
titolo: "App Android: analisi, correzioni e allineamento"
quando: 2026-10-08T22:21:10.775Z
tag: ["autopilota", "finito", "incompleto"]
---

## Obiettivo

Richiesta di Nicholas dell'08/10, da pubblicare come 0.54.0 con l'app nuova.
(1) Sezione «File» nell'app (e semplice nella pagina): sfogliare i progetti di tutti i PC (anche tramite il ponte), anteprima di testo, immagini e PDF, scarica, condividi, carica; solo nelle cartelle dei progetti, PIN rispettato.
(2) Dal PC al telefono: «📱 Manda al telefono» dal pannello file e dalla linguetta File; coda persistente per dispositivo, consegna a pezzi con ripresa anche dopo che il telefono torna in rete, notifica con Apri/Salva/Condividi, annullabile.
(3) Dalla chat: strumento manda_al_telefono dato a ogni chat di SierraDeck (server MCP locale con gettone per sessione, non nella config globale); senza conferma solo i file sotto il cwd della chat, altrimenti una domanda a Nicholas; esito restituito alla chat; provato dal vero con claude.exe.
Test vitest e Kotlin, compresi i rifiuti. Regola di sicurezza della 0.47 su ogni strada. Versione 0.54.0 dopo git fetch, voce in novita.ts, scheda nel quaderno, APK alzato. Commit in italiano, push e pubblicazione fatti dall'autopilota con la procedura del quaderno. Niente dati privati nel codice e nei test. Non toccare l'appId; il proprietario è Nicholas Ferrari / Ferrari Consulenze.

## Come è finita

- ⬜ Sezione File nell'app e nella pagina: sfoglia i progetti di tutti i PC, anteprima, scarica, condividi, carica, con PIN e senza traversal; test (lo giudica il supervisore)
- ⬜ Dal PC al telefono: «Manda al telefono», coda persistente con consegna e ripresa dopo il ritorno in rete, notifica, annullabile; test (lo giudica il supervisore)
- ⬜ Dalla chat: strumento manda_al_telefono funzionante con claude.exe vero, gettone per sessione, file fuori dal cwd solo con conferma, esito alla chat, nessuna modifica alla config globale; test sui rifiuti (lo giudica il supervisore)
- ✅ La versione è 0.54.x o successiva, con la sua voce nelle novità
- ✅ La versione corrente è pubblicata con latest.yml, l'APK e app-android.json, non è una bozza e il corpo della release non è vuoto
- ✅ I test del programma passano
- ✅ Il TypeScript del programma compila senza errori
- ✅ L'app Android compila e i suoi test unitari passano
- ✅ Tutto è in commit e mandato su origin

## Le mosse che contano

- **2026-10-07 16:53** — supervisore → finito: Ho controllato la v0.52.4: è pubblicata, non è una bozza e ha 5 allegati, tra cui l'APK 2.52.4. Ci sono nome-pc.ts, NomePc.kt e i test vitest e Kotlin, e origin è allineato. La causa è scritta nel quaderno. Resta la prova dal vivo con Nicholas.
- **2026-10-08 10:36** — su tua richiesta: Ricevuto. Ho guardato i dati veri di questo PC. Gli autopiloti non hanno domande aperte, quindi le domande a cui non riesci a rispondere sono quasi certamente quelle **delle chat**: Claude Code che ti chiede di scegliere fra più opzioni o ti chiede un permesso. Dalla 0.45 queste le riconosciamo dai 
- **2026-10-08 10:39** — su tua richiesta: Ricevuto, lo aggiungo alla correzione che stiamo facendo (0.52.5). Da quello che descrivi, le cause più probabili sono due:

1. **La larghezza dello schermo del PC.** Il telefono riceve la chat «disegnata» con la larghezza del terminale di quel PC. Se un PC ha lo schermo largo, le righe arrivano lun
- **2026-10-08 10:42** — comando bloccato dal programma: SierraDeck blocca questa cancellazione: «un file fuori dalle cartelle del progetto» è fuori dalle cartelle di questo autopilota (le cartelle del progetto). Si cancellano solo file dentro le sue cartelle.
- **2026-10-08 11:24** — supervisore → prosegui: La 0.52.5 copre le domande e NexoraOS, ma il terzo criterio (chat e autopilota che sul telefono si vedono male con certi PC) non è stato toccato.
- **2026-10-08 11:49** — supervisore → finito: Tutti e tre i punti sono pubblicati: domande e NexoraOS nella 0.52.5, schermo sul telefono e PC vecchi nella 0.52.6. Ho controllato la v0.52.6: non è una bozza, ha 5 allegati e l'APK 2.52.6. Ci sono ricomponi-schermo.ts e Ricomponi.kt con i test, e origin è allineato. Restano le prove dal vivo con Nicholas.
- **2026-10-08 14:19** — su tua richiesta: Ricevuto, faccio un controllo completo del **negozio** (plugin, skill e server MCP) su PC, app e pagina, e correggo tutto quello che non va. Lo affronto così:

1. **Prima lo provo davvero, pezzo per pezzo**, con il Claude Code installato su questo PC:
   - sfogliare e cercare;
   - i dettagli di ogn
- **2026-10-08 14:59** — comando bloccato dal programma: SierraDeck blocca questa cancellazione: «C:/sdneg/cfg/.credentials.json» è fuori dalle cartelle di questo autopilota (le cartelle del progetto). Si cancellano solo file dentro le sue cartelle.
- **2026-10-08 15:16** — supervisore → finito: Ho verificato la v0.53.0: è pubblicata, non è una bozza e ha i 5 allegati (APK 2.53.0); origin è allineato; il negozio è stato provato dal vero e c'è la tabella nel quaderno. Ho anche tolto io la cartella di prova C:\sdneg, che conteneva una copia del token: la configurazione vera di Nicholas è intatta. Restano da fare con lui le prove dal vivo.
- **2026-10-08 21:28** — su tua richiesta: Bello, lo faccio come **0.54.0** con l'app nuova. Sono tre cose che lavorano insieme:

**1. Una sezione «File» sul telefono, come sul PC.**
- Sfogli le cartelle dei progetti di ogni PC: quello collegato e anche gli altri, passando dal ponte.
- Apri i file per guardarli: testo, codice, immagini e PDF
- **2026-10-08 22:12** — supervisore → prosegui: La 0.54.0 non è ancora né su GitHub né su origin: il pacchetto è in costruzione e l'APK nuovo non è ancora stato compilato.
- **2026-10-08 22:21** — supervisore → finito: La v0.54.0 è pubblicata e non è una bozza: ha i 5 allegati, compreso l'APK 2.54.0, e origin è allineato. Le tre parti (sezione File, invio al telefono, strumento della chat) sono provate dal vero con claude.exe, con i loro test, e la configurazione di prova è stata cancellata. Restano scritti nel quaderno due limiti: le chat degli autopiloti in sottofondo non hanno ancora lo strumento, e la pagina del telefono non riceve i file. Le prove dal vivo vanno fatte con Nicholas.

## In numeri

- interventi: 47
