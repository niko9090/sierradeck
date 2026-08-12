# SierraDeck per Android

L'app che tiene SierraDeck in tasca: le chat e gli autopiloti del tuo computer,
e **una notifica quando serve una tua risposta** — anche con l'app chiusa.

## Perché un'app e non la pagina web

La pagina del Client funziona già da qualunque browser, ed è quella che vedi
qui dentro. Quello che il browser **non** può fare, su una rete di casa, è
restare in ascolto quando lo chiudi: le notifiche in background di una pagina
web passano obbligatoriamente dai server di Google, che richiedono HTTPS e
Internet — e il tuo computer sta dietro il router di casa.

Un'app Android non ha quel vincolo. Un **servizio in primo piano** — una di
quelle notifiche fisse tipo «SierraDeck sta guardando» — può interrogare il
tuo computer sulla rete locale ogni pochi secondi e avvisarti quando un
autopilota si ferma a chiederti qualcosa. Niente Google, niente Internet,
niente account: parla solo con il tuo computer.

## Com'è fatta

Tre pezzi, e nessuno di più:

- **`ClientActivity`** — una WebView che mostra la stessa pagina del Client.
  Non si riscrive l'interfaccia in Kotlin: è già scritta, funziona, e ogni
  miglioramento fatto sul computer arriva qui senza ripubblicare l'app.
- **`GuardiaService`** — il servizio in primo piano che interroga
  `/api/stato` e fa comparire una notifica quando qualcuno chiede una
  risposta. Toccandola si apre l'app sulla domanda.
- **`Collegamento`** — dove sono salvati indirizzo e chiave del computer. La
  chiave è la stessa che ottieni con le sei cifre: l'app la conserva e non la
  chiede più.

## Costruirla

Serve Android Studio (o le sole build tools con `sdkmanager`). Da questa
cartella:

```bash
./gradlew assembleRelease
```

L'APK esce in `app/build/outputs/apk/release/`. Per il Play Store serve un
bundle firmato:

```bash
./gradlew bundleRelease
```

La firma si configura in `keystore.properties` (non è in questo repository, e
non deve esserci: una chiave di firma in git è una chiave persa).

## Cosa manca, dichiarato

- **La scoperta automatica del computer sulla rete.** Adesso l'indirizzo si
  digita una volta; con mDNS si troverebbe da solo.
- **Le notifiche quando il telefono non è sulla stessa rete.** Fuori casa
  servirebbe un ponte su Internet, che è una scelta di sicurezza diversa e va
  fatta apposta, non di nascosto.
