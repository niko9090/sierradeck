---
titolo: "App Android nativa (Compose): piano, contratto API, stadi"
quando: 2026-08-26T23:10:00+02:00
tag: ["android", "app-nativa", "compose", "mobile", "rebrand"]
---

## Decisione (26/08)
L'esperienza mobile passa da **guscio nativo + WebView** (la pagina del desktop
caricata in WebView) a **app Android NATIVA in Jetpack Compose**. Rilascio **a
parità raggiunta** (non incrementale nello store, ma incrementale nel codice).
Costo accettato: da qui in poi ogni modifica mobile richiede un nuovo APK (prima
migliorando la pagina desktop il telefono la riceveva gratis). Rebrand: **via
«glos»**, il prodotto è di **Ferrari Consulenze — Nicholas Ferrari**.

## Fatto (Stadio 1, commit 9240712, assembleDebug verde)
- Package `it.glos.sierradeck` → **`it.ferrariconsulenze.sierradeck`** (appId +
  namespace + tutti i .kt). ⚠️ Cambio di appId ⇒ chi ha la vecchia app dovrà
  DISINSTALLARE e reinstallare (l'update non la riconosce). Accettato.
- Stack aggiunto: plugin compose-compiler + kotlin-serialization (2.0.21),
  Compose BOM 2024.10.01 (material3, activity/lifecycle-compose, icons),
  kotlinx-coroutines, kotlinx-serialization-json, OkHttp. `buildFeatures.compose`.
- La vecchia `ClientActivity` (WebView, AppCompat) resta finché non è tutta
  Compose; `appcompat` resta per lei e si toglierà alla fine.

## Da riusare (guscio già buono, in android/app/.../sierradeck/)
- **Pairing**: `Indirizzi` (valida: solo rete locale, no cleartext), scansione QR
  via ML Kit (`play-services-code-scanner`, nessun permesso fotocamera).
- **Notifiche ad app chiusa**: `GuardiaService` (foreground-service, polling
  `/api/stato` ogni 5s con header `x-sierradeck-chiave`) + logica `Avvisi`
  (testabile, già con test). Modello da mantenere 1:1 (niente FCM/push: LAN-only).
- **Auto-update APK**: `Aggiornamenti` + `Scaricamento` (scarica APK, installa via
  FileProvider). `Identita` (userAgent). `Guasti` (note di crash).
- Da sostituire/rimuovere: `ClientActivity` (WebView host), `Ponte` (bridge JS),
  `Collegamento` (chiave per-indirizzo → diventa un KeyStore Compose/DataStore).

## Contratto API del desktop (stabile, riusabile 1:1)
Porta **47640**, JSON, header **`x-sierradeck-chiave`** (o `Authorization: Bearer`).
Due muri: solo rete locale + chiave dispositivo (SHA-256, timingSafeEqual). CORS
chiuso. Body max 256KB. **Niente streaming**: tutto polling.
- **Libere (pre-pairing)**: `GET /`, `/manifest.json`, `/favicon.ico`, `/api/app`
  (APK), `/api/ciao`, `POST /api/accoppia {codice,nome}`→`{id,chiave}` (codice 6
  cifre, 3 min, max 10 tentativi; QR = indirizzo con `#codice=` che non va al server).
- **Autenticate (31)**: `GET /api/stato` (chat[],autopiloti[],domande[],workspace —
  senza code terminale), `/api/stile` (tavolozza+Banco/Foglio), `POST /api/dentro
  {chat}`→ultime righe `{righe[],grezze[]}` (grezze=ANSI; la nativa usa solo grezze),
  `/api/scrivi {chat,testo}` (max 2000), `/api/rispondi {domanda,risposta}`,
  `/api/apri`,`/api/cartelle`, autopilota: `/api/autopilota`(dettaglio),`/ferma`,
  `/riprendi`,`/vai`,`/crea {obiettivo,cartella}`,`/elimina`,`/riavvio`,
  `/api/quaderno`+`/scheda`, `/api/consumi`, `/api/preferenze`(GET/POST; rete
  bloccata), `/api/aggiornamento`+`/scarica`+`/installa`, `/api/sessioni`+`/riprendi`,
  `/api/workspace`+`/crea`+`/elimina`, `/api/salvataggi`+`/carica`, `/api/chat/chiudi`+`/nome`.
- **Azioni distruttive**: doppio tocco sul bottone (6s), non dialog.
- **NON reimplementare nel client**: `led`/`passaggi`/`misura`/colori arrivano già
  calcolati dal desktop (`/api/stile`, `shared/autopilota-vista.ts`) — reimplementarli
  ha già causato divergenze (fallito e finito stesso puntino).

## Schermate da costruire (4 + ingresso), fascia in basso con LED di stato
1. **Adesso** — colpo d'occhio a priorità: scollegato → domanda in attesa (textarea
   +Rispondi) → autopilota fermo (Riprendi/Guarda) → «in moto» → calma.
2. **Chat** — elenco (LED+ultima riga) → dettaglio (terminale ANSI a polling 2s +
   campo Invia) + menu (rinomina/chiudi) + nuova chat + riprendi sessione.
3. **Lavori** — autopiloti (dettaglio da `vistaAutopilota`: passaggi, %, obiettivo
   chiesto vs capito, criteri con orario+comando, ultime 6 decisioni) + Vai/Ferma/
   Riprendi + Quaderno + Affida un lavoro.
4. **Computer** — workspace (cambia/crea/elimina), salvataggi (carica), consumi
   (token oggi/7g/totale), impostazioni (stile+chiarore), update del PC.

## Progresso stadi
- **Stadio 2 FATTO** (commit c28b005): MainActivity Compose (launcher, non più
  ClientActivity), livello dati (Modelli/Api/Tema), Ingresso (pairing QR/codice),
  Principale (fascia 4 schede + polling /api/stato 2s + GuardiaService), **Adesso**.
- **Stadio 3a FATTO** (commit c3a57f3): **Chat** — Ansi.kt (parser SGR→AnnotatedString,
  16/256/truecolor), elenco→dettaglio terminale (polling /api/dentro), invio,
  rinomina/chiudi, apri-nuova (/api/cartelle+/apri), riprendi (/api/sessioni+/riprendi).
- **Stadio 3b FATTO** (commit de41e17): **Lavori** (dettaglio passaggi/misura/
  criteri/decisioni dal desktop, Vai/Ferma/Riprendi, riparti-al-riavvio, Elimina,
  Affida un lavoro, Quaderno) + **Computer** (workspace, consumi, salvataggi,
  Banco/Foglio + chiarore 0..100, update PC). Tutte e 4 le schede native + ingresso.
  Note apprese: `/api/cartelle` = List<String> (non oggetti); `Criterio` =
  {descrizione, comando?, soddisfatto, raggiuntoIl?}; flag `riprendiAlRiavvio?`
  (assente=sì); `chiarore` intero 0..100 (default 20); dettaglio autopilota =
  tutto l'Autopilota + `passaggi` (Passo[]) + `misura` (MisuraPasso).
- **Stadio 4 FATTO** (commit d71bc02): app 100% Compose. Rimossi ClientActivity+
  Ponte (WebView), layout ingresso.xml, dipendenza appcompat. Auto-update APK
  portato in Compose (DialogoAggiornamentoApp + Aggiornamenti.controlla in
  MainActivity + Scaricamento). GuardiaService → tap notifica apre MainActivity.
  Logo cristallo nell'Ingresso. Test unitari Android verdi. Tema «vivo» da
  /api/stile: NON ancora fatto (l'app usa la tavolozza statica del Banco).
- **Stadio 5 DA FARE (rilascio)**:
  1. bump `versionName` 1.3.1→2.0.0 e `versionCode` 10→20 in app/build.gradle.kts.
  2. `gradle assembleRelease` (firma con `~/.sierradeck-chiave.jks`+`.pass`, alias
     "sierradeck" — indipendente dall'appId, ok). APK in app/build/outputs/apk/release/.
  3. Pubblicare l'APK su una release GitHub, RINOMINATO `SierraDeck-2.0.0.apk`
     (Aggiornamenti.controlla cerca l'asset con quel pattern nella *latest*).
  4. Aggiornare `/api/app` del desktop (src/main/apk-disponibile.ts) perché serva
     il nuovo APK/versione al telefono.
  ⚠️ Cambio appId: l'app vecchia `it.glos.*` NON si auto-aggiorna a `it.ferrariconsulenze.*`
  (package diverso) → va installata a mano la prima volta. Accettato (la vecchia
  non funziona comunque).
- **Restyling completo** (roadmap punto 3): l'app ora ha una grafica pulita e
  coerente (palette Banco), ma un redesign visivo completo è un lavoro a sé.

## Build da questa sessione (le variabili User NON sono nell'ambiente della chat)
`export JAVA_HOME="C:/Program Files/Microsoft/jdk-21.0.12.8-hotspot"; export
ANDROID_HOME="E:/Android/Sdk"; export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:/e/Programs/Gradle/gradle-8.11.1/bin:$PATH"; cd android && gradle assembleDebug --no-daemon --console=plain`. Niente gradle wrapper. Vedi [[sierradeck-app-mobile-indietro]] [[sierradeck-proprieta]].
