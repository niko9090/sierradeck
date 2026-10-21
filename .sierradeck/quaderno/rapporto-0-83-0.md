---
titolo: "Rapporto 0.83.0: app Android ristrutturata, pronta per la pubblicazione"
quando: 2026-10-21T17:35:00+02:00
tag: ["rapporto", "0.83.0", "android", "pagina", "rilascio"]
---

**Stato (21/10, 17:35, c-52 Rilascio, ramo `ap/ap-f1e631f5/c-52` con dentro main fino a c-54; «Hai risposto» corretto; foto con «Foglio» e caratteri 1.3 fatte. La pubblicazione la fa c-55, che ha unito c-52 e c-53):**
- tutto il codice della 0.83.0 è sul ramo c-52:
  - main con c-48 (velocità);
  - le 5 correzioni della Revisione di c-46;
  - versioni 0.83.0 / app 2.83.0 (versionCode 139);
  - novità in `src/shared/novita.ts`;
- i controlli sono verdi (§ 11-15);
- l'APK di rilascio con R8 si apre sull'emulatore senza crash;
- le foto prima e dopo sono in `foto-0-83-0/`.

La release **non è pubblicata e non è installata**: pubblica chi decide la regola del progetto, installa solo Nicholas. Il ramo c-52 lo unisce in main il supervisore con chiudiChat.

Mappa prima e dopo: `app-android-0-83-0.md`. Velocità: `velocita-app-0-83-0.md`. Unione con c-48: `0-83-0-unione-c48-con-correzioni-c46.md`.

## Criteri di fine

### 1. Schermata dell'autopilota (app e pagina)
- **Fatto:**
  - una riga riassuntiva in alto, che si apre con un tocco: «1 domanda per te · pronto · criteri 1/1 · 2 chat · 0 giri», uguale su app e pagina;
  - sotto, solo la conversazione;
  - la casella sempre in basso, anche con la tastiera aperta.

  Commit `3316262c` e `fa313896` (c-509 via c-46), più le correzioni della Revisione (8af2c0c0). Test: `SchedaAutopilotaTest.kt` e `tests/main/autopilota-riassunto-0-83-0.test.ts`.
- **Prova sull'emulatore** (`sd11`, app 2.83.0 di c-52, copia di prova `SIERRADECK_PROVA`):
  - Nicholas scrive all'autopilota dall'app;
  - il messaggio parte e compare nella conversazione come «tu · 14:33 Prova dalla app 2.83.0, …»;
  - la casella resta in basso sopra la tastiera (foto `dopo-scuro-autopilota-mandato.jpg`).
- **«Hai risposto: …» anche per le risposte scritte a mano: corretto da c-52** (commit `f50a70ce` e `0aa46493`, 21/10). Era il difetto che Nicholas segnala dal 20/10: una risposta scritta nella casella a «gli dai il via?» compariva come un messaggio qualunque.
  - **Cosa fa adesso il servizio** (`/autopiloti/:id/dialogo`):
    - se c'è una domanda del registro aperta, il testo scritto a mano è la risposta a quella domanda, con la stessa strada di `/domande/:id/risposta`: la domanda si chiude e la chat che l'ha fatta riceve la risposta;
    - se l'ultima battuta dell'autopilota finisce con «?», o se aspetta il via, la tua battuta ricorda la domanda (`risponde`) e il supervisore la legge come prima.
  - **Cosa si vede** sul PC, sulla pagina e nell'app: la domanda intera e sotto «Hai risposto: …». La conversazione è una sola, composta dal PC (`conversazione()`).
  - **Test:** `tests/autopilot-host/hai-risposto-a-mano-0-83-0.test.ts`, 5 test sulle rotte vere del servizio e sulle funzioni pure. Suite intera: 4720 passati e 2 saltati, typecheck senza errori.
  - **Provato nella copia di prova** (`SIERRADECK_PROVA`, porte 47760/47761) con il codice di c-52, senza «Vai» e senza chat vere. Su Prova 5, che aspettava il via, ho scritto a mano dall'app sull'emulatore. Nell'app e sulla pagina compaiono «Mi sono preparato: … Mi dai il via?» e sotto «Hai risposto: Prima di partire togli il criterio». Il testo è corto perché `adb input` ha perso le ultime parole; il servizio ha salvato esattamente quello che è arrivato. Foto: `dopo-scuro-hai-risposto.jpg`, `pagina-dopo-hai-risposto.jpg`, `chiaro13-autopilota.jpg`.
  - Dopo la prova la copia di prova è tornata al suo codice 0.82.0. Il codice di c-52 resta accanto in `T:\app\out-0.83.0-c52`, da togliere a mano (la cancellazione fuori dalle cartelle dell'autopilota è bloccata, giustamente).
- **Visto nella copia di prova, da portare nella 0.84.0 (cause dei blocchi):** il supervisore della copia non risponde. Nella conversazione compare «Non sono riuscito a risponderti: il supervisore non ha risposto (interrogazione del supervisore fallita: uscita: {"duration_api_ms":0,…} uscito con 1)», con il JSON grezzo dentro (foto `pagina-dopo-autopilota.jpg`).

### 2. Mappa prima e dopo
- **Fatto:** `app-android-0-83-0.md` (c-45), ricontrollata da c-52 contro `inventario-app-0-83-0.md`:
  - 76 funzioni dell'app prima e 76 dopo; 37 prima e 37 dopo in `FUNZIONI` del PC;
  - nessuna oltre i 2 tocchi.
- **Foto:** in `foto-0-83-0/`. C'è anche il foglio unico `foglio-prima-dopo.jpg`.
- **Mandata a Nicholas: in coda, aspetta la sua conferma.** Alle 17:40 c-52 ha chiesto di mandargli il foglio delle foto e la mappa con `manda_al_telefono`. La chiamata è scaduta, ma tutti e due i file sono nella coda del PC (`al-telefono/coda.json`, stato «conferma»), perché vengono da una cartella diversa da quella della chat. Partono quando Nicholas conferma; non vanno rimandati. Il suo sì alla ristrutturazione completa c'è già (21/10). Vedi § Foto.

### 3. Navigazione a quattro voci
- **Fatto:**
  - Adesso, Chat, Progetti e Altro;
  - «indietro» uguale dappertutto: provato sull'emulatore, da una sezione di Altro torna all'elenco di Altro, poi ad Adesso, poi esce;
  - le domande in cima ad Adesso;
  - due tocchi al massimo.

  Commit `f7ff7150`. Test: `NavigazioneTest.kt`, `DomandeAdessoTest.kt` e `MenuPrincipaleTest.kt`.

### 4. Velocità prima e dopo
Numeri di c-48 (`velocita-app-0-83-0.md`). Stesso emulatore, stessa copia di prova, APK di rilascio 0.82.0 pubblicato contro APK di rilascio nuovo, misurati **a turni** perché il PC era carico.

| Misura | Prima (0.82.0) | Dopo (0.83.0) | |
|---|---|---|---|
| Avvio a freddo (mediana di 24) | 3282 ms | **2808 ms** | −14 %, più veloce |
| Primo contenuto visibile (mediana di 12) | 9032 ms | **7340 ms** | −19 %, più veloce |
| Schermata ferma, finiti i salti | 12069 ms | **8757 ms** | −27 % |
| Cambio schermata (mediana) | 652 ms | **459 ms** | −30 % |
| Scorrimento di 250 righe, p50 / p90 per fotogramma | 65 / 109 ms | **57 / 101 ms** | meglio |
| Chiamate al PC al minuto, app davanti | 29,0 | **26,7** | −8 % |
| Chiamate al PC al minuto, app dietro | 4,5 | 4,5 | uguale |

**Ogni numero è uguale o migliore, e avvio e primo contenuto sono più veloci.** Nessun numero è peggiorato.

Una nota onesta: l'emulatore non ha GPU, quindi tutti i fotogrammi superano i 16 ms, sia prima sia dopo. Per questo «senza scatti» si legge dai percentili, che migliorano, e non dal conto dei fotogrammi lenti.

La riga nelle novità: «avvio il 14 % più rapido, contenuto in vista il 19 % prima, cambio di voce il 30 % più rapido».

### 5. Leggibilità
- **Fatto:**
  - contrasto AA;
  - caratteri da 12 sp in su, che seguono la dimensione del telefono;
  - tocchi da 48 dp;
  - stati presi dalla tabella del PC, con parola o simbolo.

  Commit `cb492fe3`, `304da880` e `a3cd2171`. Test: `LeggibilitaTest.kt`. Scheda: `app-android-leggibilita-0-83-0.md`.
- **Foto:** prima e dopo in tema scuro, che è quello predefinito. In più, con «Foglio», chiarore al massimo e caratteri del telefono a 1.3: `chiaro13-adesso`, `-chat`, `-progetti`, `-altro`, `-altro-aspetto`, `-autopilota` (.jpg). Si legge tutto e niente esce dallo schermo. Anche al massimo il fondo resta grigio scuro: un tema bianco non c'è. Dopo le foto l'emulatore è tornato com'era (caratteri predefiniti, «Banco», chiarore a circa un quinto).

### 6. File Kotlin sotto le 800 righe e test unitari
- **Fatto:** nessun file oltre 800 righe dopo c-48; il comando del criterio lo conferma (§ 11-15). Test unitari Kotlin verdi.

### 7. Pagina del telefono servita dal PC
- **Fatto** (`e12eccd7`, c-50/c-516):
  - quattro voci da `MENU_TELEFONO`;
  - pallini dalla tabella `ATT` del PC;
  - «indietro» come nell'app.

  Test: `tests/shared/navigazione-telefono.test.ts` e `tests/main/client-pagina.test.ts`.
- **Foto:** «prima» dalla copia di prova (pagina 0.82.0, sette voci) e «dopo» con la pagina del ramo c-52 sugli stessi dati. La pagina di c-52 l'ha servita un piccolo programma di passaggio su 127.0.0.1:47797 (`note/prova-c52/proxy.mjs`, fuori da git, spento dopo le foto).

### 8. Nessuna funzione tolta, nessun dato privato
- **Funzioni:** 76 = 76 (§ 2). Sull'emulatore si aprono senza crash:
  - Adesso, Chat › Workspace e Negozio;
  - Progetti › File e Drive;
  - in Altro: Salute, Altri computer, Consumi, Aggiornamenti, Quaderno personale, Account, Aspetto, Avvisi, Info ed errori.
- **Dati privati:** nel diff `v0.82.0..main` del codice e dei test non c'è niente. I commit di c-48 non toccano dati personali; i nomi dei computer sono coperti nelle foto (`em.py` copre nome macchina e indirizzi). I percorsi `T:\Progetti\…` delle foto sono dati finti della copia di prova. **Esito: nessun dato privato nel codice, nei test e nelle foto.**

### 9. Rami delle chat
Vedi la tabella sotto.

### 10. Release 0.83.0
- **Pronto:**
  - versioni 0.83.0 e 2.83.0 (139);
  - novità con la riga della velocità;
  - R8 provato: `gradle assembleRelease` in locale dà un APK di 4,2 MB firmato «CN=Nicholas Ferrari, O=Ferrari Consulenze, C=IT»; sull'emulatore si apre (avvio 1960 ms) e tutte le schermate provate funzionano senza crash. Non servono regole keep in più.
- **Al momento di pubblicare** (non lo fa c-52):
  - `git fetch`;
  - `npm run pubblica`;
  - `npm run allega-apk`, che ricompila l'APK firmato e lo verifica;
  - release non bozza;
  - controllo di `latest.yml` e di `releases/latest/download/app-android.json`.

### 11-15. Controlli automatici (ramo c-52, 21/10)

| Controllo | Esito |
|---|---|
| Guardia delle cancellazioni | ok |
| `npm run typecheck` | 0 errori |
| `tests/main` | 196 file; 1861 test passati e 2 saltati, su 1863 |
| `tests/shared/novita*.test.ts` (dopo la riga della velocità) | 9 passati |
| `gradle testDebugUnitTest` | BUILD SUCCESSFUL |
| `gradle assembleRelease` (R8) | BUILD SUCCESSFUL, APK di 4,2 MB |
| File Kotlin oltre 800 righe | nessuno |

## Rami delle chat di questo lavoro (21/10, 17:30)

| Ramo | Stato | Scelta | Perché |
|---|---|---|---|
| c-11 | f1779d50 | **chiuso senza unirlo** | superato: file divisi da c-46 (`f7ff7150`), velocità da c-48 |
| c-11-velocita | 646673b1 | **chiuso senza unirlo** | superato: patch identica ad ae632778 dentro c-48 |
| c-24 | solo schede | **unito con cherry-pick** | e2adfda3 e a03d2366 |
| c-45 | in main (`ef545158`) | unito | mappa prima e dopo |
| c-46 | in main (`41d63746`) | unito | quattro voci, file divisi, schermata dell'autopilota |
| c-46 (Revisione) | 5 correzioni mai entrate in main | **riportate da c-52** (8af2c0c0) | banda delle urgenze nel dettaglio, polso fuori dalla lista, domande non sopra un altro PC, Cerca nella sezione giusta, riga riassuntiva uguale fra app e pagina |
| c-47 | in main (`8004c69a`) | **chiuso, doppio di c-46** | stessa schermata di c-509 |
| c-48 | in main (`651e898d`) | unito dal supervisore | velocità. Portava un test rosso (`copia-incolla`, `items` → `itemsIndexed`), corretto da c-52 nell'unione |
| c-49 | in main | unito; chat chiusa | leggibilità |
| c-50 | in main (`4c292282`) | unito; chat chiusa | pagina a quattro voci |
| c-51 | in main | unito; chat chiusa | rapporto e bozza delle novità |
| c-52 | `ap/ap-f1e631f5/c-52` (questa chat) | **da unire** (supervisore, con chiudiChat) | Rilascio: versioni, novità, correzioni di c-46, unione di c-48, foto, rapporto |
| prova-unione-c48 | ramo cancellato | chiuso | era solo la prova dell'unione |

## Da togliere a mano
- La cartella `E:\Users\nikof\Documents\SierraDeck.sierradeck-wt\prova-unione-c48` (16 MB, fuori da git). `git worktree remove` si è fermato su percorsi troppo lunghi della build di Gradle, e non si forzano cancellazioni ricorsive.
- `note/prova-c52/` nella copia c-52 (pagina e programma di passaggio, ignorati da git).
- `T:\app\out-0.83.0-c52` nella copia di prova: il codice di c-52 usato per provare «Hai risposto» (la copia gira di nuovo con il suo `out` 0.82.0).

## Foto
Tutte in `.sierradeck/quaderno/foto-0-83-0/` della cartella principale, copiate lì da c-52 perché restino dopo la chiusura della sua copia. Sono fuori da git per regola (`.gitignore`: le foto delle prove restano sul PC). JPEG larghi 540 px, nomi di PC e indirizzi coperti. **Il foglio da guardare per primo è `foglio-prima-dopo.jpg`**, una riga per schermata, con la 2.82.0 a sinistra e la 2.83.0 a destra.

| Schermata | Prima (2.82.0) | Dopo (2.83.0) |
|---|---|---|
| App, apertura | `prima-scuro-chat.jpg` (si apriva su Chat) | `dopo-scuro-adesso.jpg` (si apre su Adesso, domande in cima) |
| App, domande | `prima-scuro-domande.jpg` | `dopo-scuro-adesso.jpg` |
| App, Chat | `prima-scuro-chat.jpg` | `dopo-scuro-chat.jpg` |
| App, Progetti e File | `prima-scuro-progetti.jpg`, `prima-scuro-file.jpg` | `dopo-scuro-progetti.jpg` |
| App, Impostazioni → Altro | `prima-scuro-impostazioni.jpg` | `dopo-scuro-altro.jpg` |
| App, autopilota | `prima-scuro-autopilota.jpg`, `prima-scuro-autopiloti.jpg` | `dopo-scuro-autopilota.jpg` |
| App, autopilota con la tastiera | `prima-scuro-autopilota-tastiera.jpg` | `dopo-scuro-autopilota-tastiera.jpg`, `-scritto`, `-mandato` |
| Pagina, apertura | `pagina-prima-domande.jpg` | `pagina-dopo-adesso.jpg` |
| Pagina, Chat / Progetti / Altro | `pagina-prima-chat.jpg`, `-progetti`, `-impostazioni`, `-autopiloti` | `pagina-dopo-chat.jpg`, `-progetti`, `-altro` |
| Pagina, autopilota | `pagina-prima-autopilota.jpg` | `pagina-dopo-autopilota.jpg` |
| «Hai risposto» scritto a mano al via | — (compariva come messaggio qualunque) | `dopo-scuro-hai-risposto.jpg`, `pagina-dopo-hai-risposto.jpg` |
| «Foglio», chiarore al massimo, caratteri 1.3 | — | `chiaro13-adesso.jpg`, `-chat`, `-progetti`, `-altro`, `-altro-aspetto`, `-autopilota` |
