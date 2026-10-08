---
titolo: "App Android: analisi, correzioni e allineamento"
quando: 2026-10-08T15:16:23.272Z
tag: ["autopilota", "finito", "incompleto"]
---

## Obiettivo

Richiesta di Nicholas dell'08/10: correggere e migliorare tutto il negozio (plugin, skill, MCP, marketplace) su PC, app e pagina.
(1) Inventario e prova dal vero di ogni funzione con il claude.exe installato, con una tabella degli esiti nel quaderno; verificare i cambi recenti di comandi e formati di Claude Code sulla documentazione ufficiale.
(2) Correzione alla radice di ogni difetto, con un test per ognuno; prove su config temporanee, mai sporcare quella reale (o copia e ripristino).
(3) Miglioramenti: stato chiaro di ogni voce, testi completi, avanzamento visibile, errori con il motivo e «Riprova», stessa resa su app e pagina.
Versione secondo la REGOLA VERSIONI dopo git fetch, voce in novita.ts, scheda nel quaderno, APK alzato se cambia android. Commit in italiano, push e pubblicazione fatti dall'autopilota con la procedura del quaderno. Niente dati privati nel codice e nei test. Non toccare l'appId; il proprietario è Nicholas Ferrari / Ferrari Consulenze.

## Come è finita

- ⬜ Ogni funzione del negozio (ricerca, dettaglio, marketplace, plugin, skill, MCP, effetto nelle chat, app e pagina) è provata dal vero e ha la sua riga nel quaderno; i difetti sono corretti alla radice con un test ciascuno; la config reale di Nicholas non è stata alterata (lo giudica il supervisore)
- ⬜ Negozio migliorato: stato chiaro per voce, testi completi, avanzamento, errori con il motivo e «Riprova», stessa resa su PC, app e pagina (lo giudica il supervisore)
- ✅ La versione è successiva alla 0.52.6, con la sua voce nelle novità
- ✅ La versione corrente è pubblicata con latest.yml, l'APK e app-android.json, non è una bozza e il corpo della release non è vuoto
- ✅ I test del programma passano
- ✅ Il TypeScript del programma compila senza errori
- ✅ L'app Android compila e i suoi test unitari passano
- ✅ Tutto è in commit e mandato su origin

## Le mosse che contano

- **2026-10-07 14:45** — supervisore → prosegui: Nella 0.52.2 manca la schermata intera e dettagliata che Nicholas ha chiesto: non ci sono «Copia i dettagli» né «Torna al PC di prima», quindi il secondo criterio non è soddisfatto.
- **2026-10-07 15:01** — supervisore → finito: Ho verificato: la v0.52.3 è pubblicata e non in bozza, con 5 allegati e l'APK 2.52.3. Nell'app ci sono la schermata intera (SchermataViaggio.kt, Viaggio.kt) e «Copia i dettagli», con i test SelezioneTest e ViaggioTest. Origin è allineato e la causa è scritta nel quaderno. Restano solo le prove dal vivo con Nicholas.
- **2026-10-07 16:25** — su tua richiesta: **Il nome in alto.** Hai ragione, è un difetto. Nell'app, sia in alto sia nella schermata del cambio PC, compare il nome tecnico di Windows (tipo «DESKTOP-…») invece del nome che gli hai dato tu. Lo correggo subito come **0.52.4**: dappertutto (in alto, nella schermata «Mi collego a…», nelle chat re
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
- **2026-10-08 14:59** — comando bloccato dal programma: SierraDeck blocca questa cancellazione: «un file della cartella di prova» è fuori dalle cartelle di questo autopilota (le cartelle del progetto). Si cancellano solo file dentro le sue cartelle.
- **2026-10-08 15:16** — supervisore → finito: Ho verificato la v0.53.0: è pubblicata, non è una bozza e ha i 5 allegati (APK 2.53.0); origin è allineato; il negozio è stato provato dal vero e c'è la tabella nel quaderno. Ho anche tolto io la cartella di prova C:\sdneg, che conteneva una copia del token: la configurazione vera di Nicholas è intatta. Restano da fare con lui le prove dal vivo.

## In numeri

- interventi: 45
