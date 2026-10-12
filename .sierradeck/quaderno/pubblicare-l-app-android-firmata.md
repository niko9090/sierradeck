---
titolo: "Pubblicare l'app Android: solo l'APK di rilascio firmato Ferrari Consulenze"
quando: 2026-10-12T18:30:00+02:00
tag: ["app Android", "pubblicazione", "firma", "apksigner", "release", "procedura"]
---

# L'errore (12/10)

Le app 2.65.0 e 2.66.0, allegate alle release dalla 0.65.0 alla 0.66.3, erano l'APK di **debug** (`android/app/build/outputs/apk/debug/app-debug.apk`), firmato «CN=Android Debug». Le avevo allegate a mano io. L'app sul telefono di Nicholas è firmata «CN=Nicholas Ferrari, O=Ferrari Consulenze, C=IT», quindi Android rifiutava l'aggiornamento perché la firma era diversa. Nicholas ci ha provato due volte senza riuscirci.

Una seconda trappola ha nascosto il problema per giorni: `gradle … | tail` restituisce il codice d'uscita di `tail`, quindi è sempre 0. Così `PonteTest` è rimasto rosso dalla 0.63 senza che nessuno lo vedesse.

# La procedura (dalla 0.66.4)

1. Si alza l'app in `android/app/build.gradle.kts`, in `versionCode` e `versionName`, solo se `android/` è cambiato. Se no si riallega l'ultimo APK firmato, che `allega-apk` ricostruisce uguale.
2. `GH_TOKEN=$(gh auth token) npm run pubblica`: installer, `latest.yml` e blockmap.
3. **`npm run allega-apk`** (`scripts/allega-apk.mjs`):
   - lancia `gradle assembleRelease` e controlla il suo codice d'uscita vero;
   - prende **solo** `outputs/apk/release/app-release.apk`;
   - lo verifica con `apksigner verify --print-certs` (lo trova dall'SDK di `android/local.properties`) e **si ferma** se il certificato è «Android Debug» o non contiene «O=Ferrari Consulenze»;
   - lo carica come `SierraDeck-<versionName>.apk` insieme a `app-android.json`.
   Con `--senza-build` non ricompila; con `--solo-verifica` controlla soltanto la firma.
4. Per sicurezza si controlla quello che il telefono vede davvero: si scarica l'APK dalla release e lo si verifica con `apksigner`, poi si legge `releases/latest/download/app-android.json`.

La chiave di rilascio e la sua password stanno **fuori dal repository**, in `~/.sierradeck-chiave.jks` e `~/.sierradeck-chiave.pass`, su questo PC.

# Per i test dell'app

Mai `gradle … | tail`. Si scrive l'uscita in un file e si legge `$?`, oppure si usa direttamente il comando del criterio: `cd android && gradle testDebugUnitTest assembleDebug --no-daemon`.
