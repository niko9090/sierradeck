---
titolo: "Compilare e pubblicare SierraDeck dal portatile (asus): cosa c'è, come si aggira Smart App Control, cosa manca ancora (la chiave dell'APK)"
quando: 2026-09-18T15:00:00+02:00
tag: ["build", "release", "android", "portatile", "smart-app-control", "trappola"]
---

# Cosa è stato messo su il 18/09 (Nicholas: «installa quello che manca»)

- **Node 24** scompattato in `E:\Programs\node-v24.21.0-win-x64` (il sistema
  ha Node 26: `better-sqlite3` non ha prebuild per l'ABI 137... e comunque
  **non serve compilare niente**: sia `better-sqlite3` 13 sia `node-pty` 1.1
  portano i binari nel pacchetto npm, `prebuilds/win32-x64`). Quindi:
  `npm ci --ignore-scripts` e basta. Senza `--ignore-scripts` npm lancia
  `node-gyp rebuild` (c'è `binding.gyp`) e muore senza Visual Studio.
- **Gradle 8.11.1** in `E:\Programs\Gradle\gradle-8.11.1` (non c'è il wrapper).
- **JDK 21** già presente: `C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot`.
- **Android SDK** in `E:\Android\Sdk`: cmdline-tools `latest`, platform-tools,
  `platforms;android-35`, `build-tools;34.0.0` e `35.0.0`, licenze accettate.
  `android/local.properties` → `sdk.dir=E:/Android/Sdk` (**barre dritte**:
  con `E:\Android\Sdk` Gradle diceva «La sintassi del nome del file non è
  corretta»).
- Nessuna di queste variabili è nell'ambiente: per compilare da una chat
  `export JAVA_HOME=...; export ANDROID_HOME="E:\Android\Sdk"; PATH` con
  gradle e node-24 davanti.

`gradle --console=plain assembleRelease` → **BUILD SUCCESSFUL** (6 min la
prima volta), ma esce `app-release-unsigned.apk`: vedi sotto.

# Trappole viste

- `sdkmanager.bat --sdk_root=E:\\Android\\Sdk` da bash: le barre spariscono e
  i pacchetti finiscono in `cmdline-tools\latest\bin\AndroidSdk\`. Usare
  `--sdk_root=E:/Android/Sdk`.
- Il `yes | sdkmanager --licenses` scrive le licenze nella stessa cartella
  sbagliata: dopo lo spostamento a mano in `E:\Android\Sdk\licenses` va tutto.

# I due blocchi (che il portatile non può togliere da solo)

1. **Chiave dell'APK.** `~/.sierradeck-chiave.jks` e `~/.sierradeck-chiave.pass`
   stanno solo sul fisso (`C:\Users\nikof\`). Senza, l'APK esce non firmato e
   Android non lo installa sopra quello che c'è (firma diversa). Vanno copiati
   in `C:\Users\asus\` (RDP, chiavetta, o dal fisso via rete: il fisso
   risponde su Tailscale `100.100.60.114`, SSH 22 e SMB 445, ma con password;
   le chiavi SSH del portatile non sono autorizzate là).
2. **Smart App Control** (Windows 11, acceso su questo portatile,
   `HKLM\SYSTEM\CurrentControlSet\Control\CI\Policy\VerifiedAndReputablePolicyState = 1`).
   electron-builder, per costruire l'installer NSIS, **esegue** l'exe appena
   generato (per estrarre il disinstallatore): non firmato, SAC lo blocca →
   `⨯ spawn UNKNOWN` in `NsisTarget.computeScriptAndSignUninstaller`, e nel
   registro eventi `CodeIntegrity/Operational` gli eventi 3077/3033 «Smart App
   Control Block». Non si aggira: SAC vuole firme «reputable», una
   autofirmata non basta. Si spegne solo a mano (Sicurezza di Windows →
   Controllo app e browser → Smart App Control → Disattivato, **per sempre**)
   oppure si costruisce l'installer sul fisso.
   **AGGIRATO (16:30)**: `node scripts/pacchetto-senza-eseguire.cjs` forza in
   electron-builder il ramo «macOS Catalina», che ricava il disinstallatore
   leggendo il file (`UninstallerReader`, puro JS) invece di eseguirlo. Prima
   `npm run build` e `dist` svuotata. Installer identico, non firmato: Windows
   chiede conferma alla prima installazione a mano; l'aggiornamento automatico
   non verifica la firma (nessun `publisherName` in electron-builder.yml).

# La 0.29.0 è uscita da qui (18/09, 16:35)

Release `v0.29.0` con i cinque allegati: installer non firmato costruito con
lo script sopra, blockmap, latest.yml, **APK 2.30.2** (quello già pubblicato
nella 0.28.3, firmato) e `app-android.json` scritto a mano che punta a quello.
La 2.31.0 (sezione nuova dell'autopilota) è compilata in
`android/app/build/outputs/apk/release/app-release-unsigned.apk` ma **non
firmata**: appena i due file della chiave sono in `C:/Users/asus/`,
`gradle assembleRelease` → `SierraDeck-2.31.0.apk` → `gh release upload
v0.29.0` + `app-android.json` rigenerato (`node scripts/app-android-json.mjs`)
caricato con `--clobber`: il telefono legge `latest/download/app-android.json`
e la prende da lì. `versionName` in `build.gradle.kts` è già 2.31.0.

Creata come pre-release con gli allegati piccoli, exe caricato dopo (in un
colpo, 113 MB), poi `PATCH prerelease=false make_latest=true`: così «latest»
non è mai stata a metà. `gh` ha il login nel portachiavi: nessun codice.

# Quindi, per una release dal portatile

Serve prima la chiave dell'APK (o si riallega l'ultimo APK firmato, come
sopra). Poi: `npm run build`, `dist` svuotata, `node
scripts/pacchetto-senza-eseguire.cjs`, `gradle assembleRelease`, rinominare
`app-release.apk` in `SierraDeck-<ver>.apk`, `node scripts/app-android-json.mjs`,
release con i cinque allegati (`pubblicare-una-release.md`). `gh` c'e' dal
18/09 (winget, utente): `C:/Users/asus/AppData/Local/Microsoft/WinGet/Packages/GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe/bin/gh.exe`
(nel PATH dei terminali nuovi), login di niko9090 nel portachiavi e
`gh auth setup-git` fatto: `git push` e `gh release` vanno senza codici.
