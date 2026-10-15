---
titolo: "Pubblicare una release (installer + APK) e cosa fare se gh non è più loggato"
quando: 2026-09-15T17:35:00+02:00
tag: ["release", "github", "gh", "apk", "procedura"]
---

## REGOLA DI NICHOLAS (12/10/2026): installa solo lui
«HO DETTO CHE INSTALLO IO E BASTA» · «UN SOLO AGGIORNAMENTO QUANDO HAI RISOLTO TUTTO».
- Pubblicare sì; **mai** premere o chiamare Installa, «Installa là»,
  `/api/installa-la`, né script che chiedono l'installazione alla quiete.
- Dalla 0.68.1 il programma non installa mai da solo (né alla quiete né alla
  chiusura): scarica e mostra «Versione pronta — Installa».
- **Attenzione con i PC alla 0.67.1–0.68.0**: installano da soli alla quiete
  se «Scarica gli aggiornamenti da solo» è acceso. Prima di pubblicare la
  versione che li porta alla 0.68.1, chiedere a Nicholas di spegnerlo (o di
  dire che va bene), altrimenti l'installazione parte senza di lui.
- Ordine giusto: `gh release create vX --draft` → `npm run pubblica` →
  `npm run allega-apk` (firma verificata) → `gh release edit vX --draft=false --latest`.
- Le verifiche dopo l'aggiornamento si fanno quando Nicholas ha installato.
- **13/10 (0.71.0)**: `npm run pubblica` può fallire con «GitHub Personal Access Token is not set»: lanciarlo come `GH_TOKEN=$(gh auth token) npm run pubblica` (Git Bash). La bozza creata prima con `gh release create vX --draft` riceve exe, blockmap e latest.yml.
- **15/10 (0.72.0)**: dal terminale di Claude Code `! gh auth login -h github.com` sembra «bloccato» ma aspetta il codice del device flow: il codice e l'indirizzo sono nel file di output del comando in sottofondo. Nicholas li inserisce su github.com/login/device e il login finisce da solo. Poi `gh auth setup-git`.
- **15/10**: le note di app-android.json (`scripts/note-novita.mjs`) toglievano solo l'escape degli apici: una barra rovesciata scritta `\\` in novita.ts arrivava doppia nell'app. Corretto (tutti gli escape, test `tests/shared/note-novita.test.ts`).

Procedura provata con la 0.27.0 (15/09/2026), tutta da terminale, senza
`npm run pubblica` (che sdoppia le release o perde `latest.yml`).

1. **Costruire**: `npm run pacchetto` (build + electron-builder, niente
   upload) → `dist/SierraDeck Setup X.Y.Z.exe`, `.blockmap`, `latest.yml`.
   Se `android/` è cambiato dall'ultima release: bump `versionCode`/`versionName`
   in `android/app/build.gradle.kts`, poi `cd android && gradle assembleRelease`
   (mai insieme a vitest) → `app/build/outputs/apk/release/app-release.apk`.
2. **Commit + push + tag**: `git push` usa il Credential Manager di Windows,
   che può essere scaduto anche se `gh` va: usare
   `git -c credential.helper= -c credential.helper='!gh auth git-credential' push origin main`
   e lo stesso per `push origin vX.Y.Z`. Tag PRIMA della release.
3. **Allegati con i nomi a trattini** (GitHub rinomina gli spazi): copiare in
   una cartella di lavoro `SierraDeck-Setup-X.Y.Z.exe`, `...exe.blockmap`,
   `latest.yml` (il suo `url`/`path` è già a trattini), l'APK come
   `SierraDeck-<app>.apk`, e `node scripts/app-android-json.mjs <dove>` per
   `app-android.json`.
4. **Note in UTF-8**: estrarle da `src/shared/novita.ts` con uno script Node
   (`fs.writeFileSync(..., 'utf8')`), mai con `print` di Python rediretto
   (cp1252 → «�» su GitHub).
5. **Una release sola**: `gh release create vX.Y.Z --title "vX.Y.Z"
   --notes-file note.md --latest latest.yml SierraDeck-Setup-X.Y.Z.exe
   SierraDeck-Setup-X.Y.Z.exe.blockmap SierraDeck-<app>.apk app-android.json`.
6. **Verifica** (sempre): `gh api repos/niko9090/sierradeck/releases --jq
   '.[]|select(.tag_name=="vX.Y.Z")|{name,assets:[.assets[].name]}'` → UNA riga
   con 5 allegati; `curl -sL .../releases/latest/download/latest.yml` dice la
   versione giusta e la `size` combacia con l'exe; idem `app-android.json`.

## Se `gh auth status` dice «token invalid» e Nicholas non può fare `gh auth login`

Il login interattivo non passa dal terminale di Claude (stdin chiuso). Si
usa il **device flow** a mano con il client id pubblico di gh:

```
curl -s -X POST https://github.com/login/device/code -H "Accept: application/json" \
  -d "client_id=178c6fc778ccc68e1d6a&scope=repo%20read:org%20gist%20workflow"
```
Dà `user_code` (da far inserire a Nicholas su https://github.com/login/device,
si può aprire con `cmd //c start "" <url>`) e `device_code`. Poi ogni 5 s:
```
curl -s -X POST https://github.com/login/oauth/access_token -H "Accept: application/json" \
  -d "client_id=178c6fc778ccc68e1d6a&device_code=<dc>&grant_type=urn:ietf:params:oauth:grant-type:device_code"
```
finché arriva `access_token` → `gh auth login -h github.com --with-token < file`
e cancellare il file. Il codice scade in 15 minuti. Attenzione: in questo
ambiente `$TMP_SCRATCH` era vuoto, usare il percorso dello scratchpad per
esteso.


# Dal portatile (18/09/2026)

Si puo': vedi `build-sul-portatile.md`. Due differenze: Smart App Control blocca `npm run pacchetto` → usare `node scripts/pacchetto-senza-eseguire.cjs` (dopo `npm run build` e `dist` svuotata); la chiave dell'APK sta solo sul fisso → o la si copia in `C:/Users/asus/`, o si riallega l'ultimo APK firmato con `app-android.json` scritto a mano. Installer non firmato (nessun certificato sul portatile).
