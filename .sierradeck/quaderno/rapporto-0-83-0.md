---
titolo: "Rapporto 0.83.0: app Android ristrutturata (in preparazione)"
quando: 2026-10-21T15:30:00+02:00
tag: ["rapporto", "0.83.0", "android", "rilascio"]
---

**Stato (21/10, 15:30, c-52 Rilascio, ramo `ap/ap-f1e631f5/c-52` da main 4c292282):**
- versioni alzate: `package.json` 0.83.0, app `versionCode` 139 e `versionName` 2.83.0 (b953e665);
- novità 0.83.0 scritte in `src/shared/novita.ts`, con un posto segnato «Velocità: dopo c-48»;
- mancano: l'unione di c-48, la prova sull'emulatore, le foto, i numeri della velocità e Gradle.

La release **non è pubblicata e non è installata**.

Mappa prima e dopo: `app-android-0-83-0.md`. Novità: `src/shared/novita.ts` (bozza e storia in `novita-0-83-0-bozza.md`).

## Criteri di fine

### 1. Schermata dell'autopilota (app e pagina)
- **Fatto in main:**
  - una riga riassuntiva in alto che si apre con un tocco;
  - sotto, solo la conversazione;
  - la casella sopra la tastiera.

  Commit `3316262c` e `fa313896` (c-509 via c-46); la pagina è in `client-pagina.ts`, nello stesso commit. Test: `SchedaAutopilotaTest.kt`, `tests/main/autopilota-riassunto-0-83-0.test.ts`.
- **Manca:** la prova sull'emulatore («Hai risposto: …») e le foto prima e dopo. L'emulatore `sd11` è occupato dalle misure di c-48.

### 2. Mappa prima e dopo
- **Fatto in main:** `app-android-0-83-0.md` (c-45).
- **Ricontrollata da c-52 contro `inventario-app-0-83-0.md`:**
  - ogni schermata e funzione dell'inventario ha la sua riga e il suo posto nuovo;
  - funzioni dell'app: 76 prima e 76 dopo (§ 4); di `FUNZIONI` del PC: 37 prima e 37 dopo (§ 5);
  - nessuna funzione oltre i 2 tocchi;
  - l'unica che cambia forma è la linguetta «Workspace», che era doppia (n. 49) e si unisce alla n. 48;
  - non è servito aggiungere righe.
- **Manca:** le foto prima e dopo e l'invio a Nicholas con le foto, per informazione: il suo sì alla ristrutturazione completa c'è già (21/10).

### 3. Navigazione a quattro voci
- **Fatto in main:**
  - Adesso, Chat, Progetti e Altro;
  - «indietro» fa sempre la stessa cosa;
  - le domande stanno in cima ad Adesso;
  - due tocchi al massimo.

  Commit `f7ff7150`. Test: `NavigazioneTest.kt`, `DomandeAdessoTest.kt`, `MenuPrincipaleTest.kt`.

### 4. Velocità prima e dopo
- **Prima (2.82.0, mappa § 8):**
  - avvio a freddo: 1358 ms;
  - primo contenuto: 7,8 s;
  - chiamate: circa 29-30 al minuto, quasi tutte `/api/stato` ogni 2 s.
- **Manca:** il ramo `c-48` non è ancora unito. Alle 15:30 ha 5 commit fuori, l'ultimo è 188824ed, e sta misurando sull'emulatore. Mancano i numeri «dopo».

| Misura | Prima | Dopo |
|---|---|---|
| Avvio a freddo | 1358 ms | _dopo c-48_ |
| Primo contenuto visibile | 7,8 s | _dopo c-48_ |
| Cambio schermata | _c-48_ | _dopo c-48_ |
| Scorrimento lista lunga | _c-48_ | _dopo c-48_ |
| Chiamate al PC al minuto | ~29-30 | _dopo c-48_ |

### 5. Leggibilità
- **Fatto in main:**
  - contrasto AA;
  - caratteri da 12 sp in su che seguono la dimensione scelta nel telefono;
  - tocchi da 48 dp;
  - stati presi dalla tabella del PC.

  Commit `cb492fe3`, `304da880` e `a3cd2171`. Test: `LeggibilitaTest.kt`. Scheda: `app-android-leggibilita-0-83-0.md`.
- **Manca:** le foto prima (APK 2.82.0) e dopo, in tema scuro e chiaro, con i caratteri del telefono a 1.3.

### 6. File Kotlin sotto le 800 righe e test unitari
- **Fatto in main:** il file più lungo è `Api.kt`, con 740 righe (commit `f7ff7150`). Il conteggio va rifatto dopo c-48.

### 7. Pagina del telefono servita dal PC
- **Fatto in main** (commit `e12eccd7`, c-50/c-516; unione `4c292282`):
  - la fascia ha le quattro voci di `MENU_TELEFONO`;
  - i pallini sono colorati dalla tabella `ATT` del PC, con numero e parola;
  - «indietro» funziona come nell'app;
  - le regole stanno in `src/shared/navigazione-telefono.ts`.

  Test: `tests/shared/navigazione-telefono.test.ts`, `tests/main/client-pagina.test.ts`.

### 8. Nessuna funzione tolta, nessun dato privato
- **Funzioni:** come al § 2. Si ricontrolla dopo c-48, che tocca solo la velocità.
- **Dati privati** (c-52, 21/10): letto il diff `git diff v0.82.0..main` del codice e dei test, 7118 righe aggiunte. Cercati:
  - indirizzi IP, solo quelli di Tailscale e della rete di casa: nessuno;
  - percorsi personali: c'è solo l'esempio generico `E:\Users\utente\Documents\Qualcosa`;
  - email: nessuna;
  - nomi dei PC: nessuno;
  - P.IVA e sede: nessuna, ci sono solo le etichette d'esempio del Quaderno personale («Email di contatto», «Partita IVA»).

  Il nome della cartella utente compare in alcune schede del quaderno, che non sono né codice né test. **Esito: nessun dato privato nel codice e nei test.** Da rifare sul diff di c-48 prima dell'unione.

### 9. Rami delle chat
Vedi la tabella sotto.

### 10. Release 0.83.0
- **Fatto (c-52):** versioni 0.83.0 / 2.83.0 e la voce in `novita.ts`.
- **Manca:**
  - `npm run allega-apk` (APK release firmato Ferrari Consulenze);
  - app-android.json, latest.yml, release non bozza.

  La pubblicazione non la fa c-52: «niente pubblicazione» nella consegna c-521.

### 11-15. Controlli automatici
Sul main 4c292282, 21/10 alle 15:10, esclusi i file di questo ramo:

| Controllo | Esito |
|---|---|
| Guardia delle cancellazioni | ok |
| `npm run typecheck` | 0 errori |
| `tests/main` | 196 file e 1861 test passati, 2 saltati |
| Autopilot-host, renderer, shared e pty-host | 261 file e 2853 test passati |
| `tests/shared/novita*.test.ts` sul ramo c-52 | 9 passati |
| Gradle (`testDebugUnitTest assembleDebug`) | **da lanciare** dopo c-48, un Gradle alla volta |

## Rami delle chat di questo lavoro (21/10, 15:30)

| Ramo | Stato | Scelta | Perché |
|---|---|---|---|
| c-11 | f1779d50, 1 commit fuori (base vecchia 41bcf37e) | **chiuso senza unirlo** | superato: la divisione dei file Kotlin è in main con c-46 (`f7ff7150`) e la velocità passa per c-48 |
| c-11-velocita | 646673b1 | **chiuso senza unirlo** | superato: la patch è identica ad ae632778 dentro c-48 (`git range-diff` dà «=») |
| c-24 | 674b4b78, 677b4197 (solo schede) | **unito con cherry-pick** | presi da c-51 come e2adfda3 e a03d2366 |
| c-45 | in main (`ef545158`) | unito | mappa prima e dopo |
| c-46 | in main (`41d63746`) | unito | quattro voci, file divisi, schermata dell'autopilota (c-509) |
| c-47 | in main (`8004c69a`) | **chiuso, doppio di c-46** | c-510 faceva la stessa schermata di c-509; in main c'è solo la sua scheda |
| c-48 | prima parte in main (`6c735bb2`); 5 commit fuori (ae632778…188824ed) | **da unire dopo la Revisione** | velocità; alle 15:30 sta ancora misurando. L'unione la fa il supervisore |
| c-49 | in main (`896eb89e`, `31b542ce`) | unito; chat chiusa | leggibilità, giri 1 e 2, più il rosso AA |
| c-50 | in main (`4c292282`) | unito; chat chiusa | pagina del telefono a quattro voci |
| c-51 | in main (`24b85f93`, `214f3848`) | unito; chat chiusa | Rilascio: bozza delle novità e rapporto; il rilascio passa a una chat nuova |
| c-52 | `ap/ap-f1e631f5/c-52` (questa chat) | da unire | Rilascio: versioni, novità, rapporto |

## Cosa resta, in ordine (dopo l'unione di c-48)
1. Fare `git fetch` e aggiornare il ramo c-52 da main.
2. Ricontrollare i dati privati sul diff di c-48 e i file Kotlin sotto le 800 righe.
3. Lanciare `cd android && gradle testDebugUnitTest assembleDebug --no-daemon`, un Gradle alla volta.
4. Sull'emulatore `sd11`, con l'app di main e una copia di prova (`SIERRADECK_PROVA`):
   - scrivere all'autopilota e vedere «Hai risposto: …»;
   - fare le foto prima (2.82.0) e dopo di Adesso, Chat, Progetti, Altro e autopilota, in tema scuro e chiaro e con i caratteri a 1.3.
5. Scrivere i numeri «dopo» di c-48 nella tabella del § 4 e la riga della velocità in `novita.ts`, al posto segnato.
6. Mandare a Nicholas la mappa con le foto.
7. Rilanciare tutti i controlli; poi la pubblicazione, quando la decide la regola del progetto: `npm run pubblica`, `npm run allega-apk`, release non bozza, controllo di latest.yml e app-android.json.

## Foto

_Da aggiungere dopo c-48: prima e dopo per le quattro voci, l'autopilota e il tema scuro._
