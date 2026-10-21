---
titolo: "Rapporto 0.83.0: app Android ristrutturata (in preparazione)"
quando: 2026-10-21T14:30:00+02:00
tag: ["rapporto", "0.83.0", "android", "rilascio"]
---

**Stato:** scheletro preparato da c-51 su main 24b85f93 (21/10, 14:30). La release **non è ancora pubblicata**: versioni ferme a 0.82.0 / app 2.82.0. Mai installata da noi.

Mappa prima e dopo: `app-android-0-83-0.md`. Novità: `novita-0-83-0-bozza.md`.

## Criteri di fine

### 1. Schermata dell'autopilota (app e pagina)
- **Fatto in main:** una riga riassuntiva in alto che si apre con un tocco, sotto solo la conversazione, la casella sopra la tastiera (`3316262c`, `fa313896`, c-509 via c-46). Test: `SchedaAutopilotaTest.kt`, `tests/main/autopilota-riassunto-0-83-0.test.ts`.
- **Manca:** la prova sull'emulatore («Hai risposto: …») e le foto prima e dopo.

### 2. Mappa prima e dopo
- **Fatto in main:** `app-android-0-83-0.md` (c-45, `1d187265`, unione `ef545158`): 37 funzioni prima, 37 dopo.
- **Manca:** foto prima e dopo, numeri finali al § 8, invio a Nicholas con le foto.

### 3. Navigazione a quattro voci
- **Fatto in main:** Adesso, Chat, Progetti, Altro; indietro sempre uguale; domande in cima ad Adesso; due tocchi al massimo (`f7ff7150`). Test: `NavigazioneTest.kt`, `DomandeAdessoTest.kt`, `MenuPrincipaleTest.kt`.

### 4. Velocità prima e dopo
- **Prima (2.82.0, mappa § 8):** primo contenuto 7,8 s; circa 29-30 chiamate al minuto, quasi tutte `/api/stato` ogni 2 s.
- **Manca:** il ramo `c-48` (ancora al lavoro, con dentro il lavoro di c-11) non è unito; mancano i numeri «dopo» per avvio a freddo, primo contenuto, cambio schermata, scorrimento e chiamate al minuto.

| Misura | Prima | Dopo |
|---|---|---|
| Avvio a freddo | _da mappa § 8_ | _manca_ |
| Primo contenuto visibile | 7,8 s | _manca_ |
| Cambio schermata | _manca_ | _manca_ |
| Scorrimento lista lunga | _manca_ | _manca_ |
| Chiamate al PC al minuto | ~29-30 | _manca_ |

### 5. Leggibilità
- **Fatto in main:** contrasto AA, caratteri da 12 sp, tocchi da 48 dp, stati dalla tabella del PC (`cb492fe3`); la tipografia segue la dimensione scelta nel telefono (`304da880`). Test: `LeggibilitaTest.kt`. Scheda: `app-android-leggibilita-0-83-0.md`.
- **Manca:** foto prima e dopo, anche nel tema scuro.

### 6. File Kotlin sotto le 800 righe e test unitari
- **Fatto in main:** il file più lungo è `Api.kt` con 740 righe; prima Lavori 1593, Computer 1384, Modelli 1252, Chat 1207 (`f7ff7150`). Test di navigazione e degli stati come al § 3.

### 7. Pagina del telefono servita dal PC
- **Fatto in main:** solo l'elenco condiviso `MENU_TELEFONO` (`src/shared/menu-principale.ts`) con il suo test.
- **Manca:** `client-pagina.ts` ha ancora le sette voci di `MENU_PRINCIPALE`; ci lavora c-50.

### 8. Nessuna funzione tolta, nessun dato privato
- Per l'app, 37 funzioni prima e 37 dopo (mappa § 5). Da ricontrollare dopo la pagina e la velocità; da fare con un `git grep` prima del rilascio.

### 9. Rami delle chat
Vedi la tabella sotto. **Manca:** chiudere le chat finite.

### 10. Release 0.83.0
- **Manca tutto:** git fetch; `package.json` 0.83.0; app `versionCode` 139 e `versionName` 2.83.0; `npm run allega-apk` (APK release firmato); app-android.json; bozza e poi --draft=false; controllo di latest.yml.

### 11-15. Controlli automatici
Guardia delle cancellazioni, test di main, altri test, typecheck, Gradle: **da lanciare** sul main finale, un Gradle alla volta.

## Rami delle chat di questo lavoro (21/10, 14:30)

| Ramo | Stato | Scelta | Perché |
|---|---|---|---|
| c-45 | in main (`ef545158`) | unito | mappa prima e dopo |
| c-46 | in main (`41d63746`) | unito | quattro voci, file divisi, schermata dell'autopilota (c-509) |
| c-47 | in main (`8004c69a`) | unito | solo la scheda «c-510 doppia di c-509» |
| c-48 | 1ª parte in main (`6c735bb2`); 4 commit di velocità fuori | da unire dopo la Revisione | velocità; ci sta ancora lavorando |
| c-49 | in main (`896eb89e`) | unito | leggibilità, giri 1 e 2 |
| c-50 | niente di suo in main | in corso | pagina del telefono a quattro voci |
| c-51 | in main (`24b85f93`) | unito | rilascio: schede di stato |
| c-11-velocita | 1 commit fuori (646673b1, 12:39) | _probabilmente da chiudere_ | non è un antenato di c-48, ma c-48 ha una versione successiva dello stesso commit di c-11 (12:59). Prima di chiudere, controllare che non manchi niente, con `git diff 646673b1 <commit 12:59 di c-48>` |
| c-24 | 2 commit di sole schede fuori | _al supervisore_ | lo decide il supervisore |

## Foto

_Da aggiungere: prima e dopo per le quattro voci, l'autopilota e il tema scuro._
