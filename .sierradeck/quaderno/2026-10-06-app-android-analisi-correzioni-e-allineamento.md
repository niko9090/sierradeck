---
titolo: "App Android: analisi, correzioni e allineamento"
quando: 2026-10-06T11:06:06.936Z
tag: ["autopilota", "finito", "incompleto"]
sessione: 1ff78f5e-523c-43b4-b74f-044d9691131d
---

## Obiettivo

Dopo le tappe A-E (pubblicate fino alla 0.49.1), la richiesta di Nicholas del 06/10: condividere file dal telefono a una chat o a un autopilota, dentro il progetto di quella chat.
- Lato telefono: «Condividi → SierraDeck» e «📎 Allega» nell'app, «Scegli file» nella pagina.
- Destinazione: chat di tutti i PC tramite il ponte, oppure autopiloti.
- Salvataggio: in cwd/.sierradeck/allegati/data, con nome ripulito, escluso da git e mai eseguito.
- Avviso automatico alla chat (consegna «umano» che rispetta il PIN) o nel dialogo dell'autopilota.
- Invio a pezzi con avanzamento e ripresa, limite di 100 MB.
- Sicurezza: solo i dispositivi dello stesso Drive, con test di rifiuto.
Versione 0.50.0 dopo git fetch, con voce in novita.ts, scheda nel quaderno, APK alzato. Commit in italiano, push e pubblicazione fatti dall'autopilota con la procedura del quaderno. Non toccare l'appId; il proprietario è Nicholas Ferrari / Ferrari Consulenze.

## Come è finita

- ⬜ Condivisione dal telefono a chat e autopiloti: share target e «Allega» nell'app, «Scegli file» nella pagina, file salvato nel progetto con nome ripulito e fuori da git, avviso alla chat o all'autopilota, PIN rispettato, altri PC tramite il ponte, invio a pezzi con ripresa; test vitest e Kotlin, compresi i rifiuti (lo giudica il supervisore)
- ✅ La versione è 0.50.x o successiva, con la sua voce nelle novità
- ✅ La versione corrente è pubblicata con latest.yml, l'APK e app-android.json, non è una bozza e il corpo della release non è vuoto
- ✅ I test del programma passano
- ✅ Il TypeScript del programma compila senza errori
- ✅ L'app Android compila e i suoi test unitari passano
- ✅ Tutto è in commit e mandato su origin

## Le mosse che contano

- **2026-10-02 13:30** — supervisore → prosegui: Le tappe 0.40-0.42 sono pubblicate e verificate; manca la 0.43.0 per il telefono, che è il criterio che fallisce.
- **2026-10-02 13:58** — supervisore → finito: Ho verificato tutto: v0.43.0 pubblicata, non in bozza, con i 5 allegati e l'APK 2.46.0; WorkManager in ControlloApp.kt; test CompatibilitaPcTest e AggiornamentiTest presenti; origin allineato. Le tappe 0.40-0.42 erano già state verificate. Restano solo le prove dal vivo con Nicholas e le sue indicazioni sull'aspetto dell'app.
- **2026-10-02 15:23** — su tua richiesta: Bene, allora faccio i punti 3, 4, 5, 6 e 7. Li pubblico uno dopo l'altro, ognuno quando è verde:

1. **Criteri controllati quando vengono scritti** (7) e **pannello «Salute del sistema»** (4). Sono i più veloci e ti proteggono subito: il pannello mostra in una schermata Drive, battiti degli altri PC
- **2026-10-02 15:24** — su tua richiesta: Va bene, lo aggiungo come una tappa a sé. Ecco come lo farei:

- **Si accende dalle Impostazioni**, nella voce «PIN delle chat»: scegli un PIN (da 4 a 8 cifre). Finché non lo attivi non cambia niente.
- **Decidi tu quali chat proteggere.** Con il tasto destro su una chat, o dal suo menu, scegli «Pro
- **2026-10-02 16:47** — supervisore → prosegui: Le tappe A-D e la sicurezza sono pubblicate e verificate (0.44-0.48); manca la tappa E del PIN, che Nicholas ha chiesto.
- **2026-10-02 16:52** — supervisore → prosegui: Il lavoro del PIN è a metà, con file non tracciati e la chat in attesa: va messo al sicuro in un commit e fatto proseguire sulle parti già note.
- **2026-10-02 17:18** — supervisore → prosegui: La v0.49.0 è uscita, ma lascia due buchi che contraddicono il criterio «PIN valido anche da telefono e PC remoti»: lo sblocco condiviso fra tutti i PC e l'input via cassetta che lo aggira.
- **2026-10-02 17:33** — supervisore → finito: Le tappe A-E e la regola di sicurezza sono pubblicate (0.44.0-0.49.1); ho verificato la 0.49.1: 5 allegati, non è una bozza, origin è allineato. Restano solo le prove dal vivo con Nicholas e un campo PIN nelle Domande dell'app, segnato nel quaderno come miglioria facoltativa.
- **2026-10-06 10:35** — su tua richiesta: Chiaro: dal telefono mandi un file a **una chat precisa** o a **un autopilota**, e il file finisce nel progetto di quella chat, non in una cartella qualsiasi del PC. Lo faccio così, come **0.50.0** con l'app nuova:

- **Da qualunque app del telefono**, che sia Galleria, File, WhatsApp o un PDF: prem
- **2026-10-06 10:58** — supervisore → prosegui: La 0.50.0 è pronta nel codice ma non è ancora pubblicata né spinta su origin: due criteri verificabili falliscono.
- **2026-10-06 11:00** — supervisore → prosegui: Il pacchetto è a metà (installer pronto, APK in compilazione); la release e il push mancano ancora, e sono due criteri che falliscono.
- **2026-10-06 11:06** — supervisore → finito: La v0.50.0 è pubblicata e non è una bozza: ha i 5 allegati e l'APK 2.50.0, e origin è allineato. Ci sono il share target, «Allega» e «Scegli file», il salvataggio nel progetto escluso da git, il PIN e i test di rifiuto in vitest e Kotlin. I limiti sono annotati nel quaderno; manca solo la prova dal vivo con Nicholas.

## In numeri

- interventi: 36
- cartella: `E:\Users\nikof\Documents\SierraDeck`
