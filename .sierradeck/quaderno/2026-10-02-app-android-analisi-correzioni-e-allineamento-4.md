---
titolo: "App Android: analisi, correzioni e allineamento"
quando: 2026-10-02T13:58:08.749Z
tag: ["autopilota", "finito", "incompleto"]
sessione: 1ff78f5e-523c-43b4-b74f-044d9691131d
---

## Obiettivo

Lavoro deciso da Nicholas il 02/10, pubblicato a tappe:
- 0.40.0: WebRTC fra PC (fatta);
- 0.41.0: linguetta Istruzioni, domande strutturate e validate, parte destra ridimensionabile;
- 0.42.0: «una chat, una casa», con progetto nel quaderno, casa delle chat, Riordina senza cancellazioni e annullabile, Drive come salvataggio con migrazione senza perdite, Sposta progetto guidato;
- 0.43.0: app del telefono che cerca da sola gli aggiornamenti su GitHub in background e avvisa con le note; compatibile con PC più vecchi (parsing tollerante, funzioni mancanti spiegate, test con risposte di PC vecchi) e il PC compatibile con app vecchie; miglioramenti generali dell'app sui punti aperti del 30/09 e su quelli che indicherà Nicholas.
Funzioni pure con i test (vitest e Kotlin). Voce in novita.ts, scheda nel quaderno, APK alzato se cambia android. Commit in italiano, push e pubblicazione fatti dall'autopilota con la procedura del quaderno. Non toccare l'appId; il proprietario è Nicholas Ferrari / Ferrari Consulenze.

## Come è finita

- ⬜ Tappe 0.40-0.42 fatte: WebRTC, Istruzioni e domande strutturate e parte destra ridimensionabile, «una chat, una casa» con Riordina e Sposta progetto (lo giudica il supervisore)
- ✅ Nel quaderno c'è il progetto «una chat, una casa»
- ⬜ App del telefono: controllo periodico in background su GitHub con notifica (una per versione), compatibilità con PC 0.36/0.38/0.42 provata dai test Kotlin, funzioni mancanti spiegate, punti aperti del 30/09 sistemati (lo giudica il supervisore)
- ✅ La versione è 0.43.x o successiva, con la sua voce nelle novità
- ✅ La versione corrente è pubblicata con latest.yml, l'APK e app-android.json, non è una bozza e il corpo della release non è vuoto
- ✅ I test del programma passano
- ✅ Il TypeScript del programma compila senza errori
- ✅ L'app Android compila e i suoi test unitari passano
- ✅ Tutto è in commit e mandato su origin

## Le mosse che contano

- **2026-10-02 09:56** — supervisore → finito: Ho controllato tutto. La causa del taglio è stata trovata sui dati veri: il limite di 500 caratteri dopo l'obiettivo, tolto in 579e055. La colonna non si apre più per gli autopiloti (31c0191). L'app 2.43.1 ha il suo test. La v0.39.1 è pubblicata, non in bozza, con i 5 allegati, e origin è allineato. Resta un limite già dichiarato da Nicholas: per le chat che hanno solo finito il turno, il telefono mostra le ultime 20 righe.
- **2026-10-02 09:58** — su tua richiesta: Grazie, il registro del portatile è stato decisivo, e mi fa correggere quello che ti avevo detto. Ecco cosa è successo davvero:

- **Alle 08:32** il portatile si è aggiornato alla 0.38.2 senza problemi: un minuto dopo ripartiva con la versione nuova.
- **Alle 11:29** ha trovato la 0.39.0 e l'ha scar
- **2026-10-02 10:15** — su tua richiesta: Ho trovato il motivo degli errori, ed è più grave di quanto pensassi.

**Il Drive di SierraDeck è scollegato dal 23 settembre, sia su questo PC sia sul portatile.** Nel registro c'è «Google Drive non connesso: manca l'autorizzazione», e da allora a ogni avvio risulta «connesso: false». I PC si ricon
- **2026-10-02 10:19** — supervisore → prosegui: La 0.39.2 è fatta, ma il criterio della 0.39.3 fallisce: il difetto del multi-PC (Drive scollegato dal 23/09, chat remote con errori) è ancora tutto da correggere.
- **2026-10-02 10:51** — supervisore → finito: La v0.39.3 è pubblicata e non in bozza, con i 5 allegati (APK 2.43.3); origin è allineato e tutti i criteri con comando passano. La causa del Drive scollegato è documentata (invalid_grant di Google del 23/09) e lo stato del programma ora vede il Drive acceso e i due PC accesi. Resta solo la prova dal vivo con Nicholas, come era stato deciso.
- **2026-10-02 11:50** — su tua richiesta: Perfetto, procedo. Ti dico come lo organizzo, così sai cosa aspettarti e in che ordine lo potrai provare.

**1. Prima la strada per le chat su reti diverse (0.40.0).** Collegamento diretto fra i PC con la tecnica delle videochiamate (WebRTC). Il Drive serve solo a scambiarsi «dove sono». Come riserv
- **2026-10-02 11:53** — su tua richiesta: Hai ragione su tutte e due le cose. Le metto **prima** del lavoro sul multi-PC, perché ti servono ogni giorno.

**1. Una linguetta «Istruzioni» sotto la chat dell'autopilota.** Nella chat vedi solo «Leggi ed esegui le istruzioni in …c-5.md», che non ti dice niente. Nella linguetta trovi invece il te
- **2026-10-02 12:03** — su tua richiesta: Sì, lo aggiungo alla stessa versione delle linguette Istruzioni e delle domande chiare.

- **Tutta la parte destra si allarga e si stringe.** Prendi il bordo sinistro e lo trascini: la scheda dell'autopilota, la colonna Domande e quella Consumi diventano larghe quanto vuoi tu.
- **Anche dentro si ri
- **2026-10-02 12:29** — supervisore → prosegui: WebRTC è uscita come 0.40.0, quindi mancano ancora la tappa 0 (0.41.0) e la tappa 2 (0.42.0); i criteri sul quaderno e sulla versione 0.42 falliscono.
- **2026-10-02 13:25** — su tua richiesta: Va bene. Intanto ti dico dove siamo: la chat sta pubblicando adesso la **0.42.0**, cioè il riordino delle chat con il Drive come salvataggio. Prima erano uscite la 0.40.0 (collegamento fra PC su reti diverse) e la 0.41.0 (linguetta Istruzioni, domande chiare, parte destra ridimensionabile).

Poi pas
- **2026-10-02 13:30** — supervisore → prosegui: Le tappe 0.40-0.42 sono pubblicate e verificate; manca la 0.43.0 per il telefono, che è il criterio che fallisce.
- **2026-10-02 13:58** — supervisore → finito: Ho verificato tutto: v0.43.0 pubblicata, non in bozza, con i 5 allegati e l'APK 2.46.0; WorkManager in ControlloApp.kt; test CompatibilitaPcTest e AggiornamentiTest presenti; origin allineato. Le tappe 0.40-0.42 erano già state verificate. Restano solo le prove dal vivo con Nicholas e le sue indicazioni sull'aspetto dell'app.

## In numeri

- interventi: 29
- cartella: `E:\Users\nikof\Documents\SierraDeck`
