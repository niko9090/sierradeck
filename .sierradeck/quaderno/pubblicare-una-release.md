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

## Rilascio dalla copia di lavoro di una chat (21/10, 0.82.0, c-39)
- **`google-oauth.json` sta solo nella cartella principale** (git lo ignora). `npm run pubblica` da un worktree si ferma subito con «mancano le credenziali OAuth di Google Drive»: è la guardia giusta, non un errore. Copiarlo nel worktree per la build e cancellarlo subito dopo.
- **Manca anche `node_modules`:** una junction verso quella della cartella principale basta per build, electron-builder, gradle e vitest (vedi `test-lenti-a-pc-carico-0-81-0.md`).
- **Ordine provato, liscio in 10 minuti:**
  1. `git tag vX <commit>`, poi push del **solo tag** con `-c credential.helper='!gh auth git-credential'`;
  2. `gh release create vX --draft --title "SierraDeck X" --notes-file note.md` (note da `noteDi(sorgente, versione)` di `scripts/note-novita.mjs`, scritte in UTF-8);
  3. `GH_TOKEN=$(gh auth token) npm run pubblica`, che porta exe, blockmap e latest.yml sulla bozza;
  4. `npm run allega-apk`, che porta l'APK firmato e app-android.json;
  5. `gh release edit vX --draft=false --latest`.
- **Verifica:** `gh release view vX --json isDraft,assets` (5 allegati «uploaded») e un curl su `releases/latest/download/latest.yml` e su `app-android.json`.
- **La guardia delle cancellazioni** rifiuta percorsi su unità `subst` (`R:`) e con variabili (`$P/...`): scrivere il percorso vero per intero.
- **0.84.1 (22/10, c-79): stessa procedura, liscia in 15 minuti** (5 per l'installer, 5 per l'APK). Il tag può stare su un commit che non è in `origin/main`: da settimane il main remoto è fermo alla 0.80.0 e si spinge **solo il tag**. Prima del tag conviene unire main nel ramo della release, perché altre chat continuano a unire quaderno.
- **Trappola dei testi del quaderno scritti dalla shell:** un `node -e "…"` fra virgolette doppie con dentro dei backtick Markdown (`` `latest.yml` ``) fa eseguire alla shell ogni pezzo fra backtick come comando (il 22/10 ha provato a lanciare `npm run build\` e simili, senza danni). Per i testi con backtick usare lo strumento Edit, mai la shell.
- **Togliere la junction `node_modules` dalla copia** con `rmdir` (cancella solo il collegamento) appena finito: se la copia viene cancellata con la junction dentro, si rischia di svuotare la `node_modules` della cartella principale.
- **0.84.2 (22/10): tag dimenticato, finito sulla 0.80.0.** `npm run pubblica` è partito senza il tag `v0.84.2` su GitHub: electron-builder ha creato la release con `target_commitish: main` e GitHub ha messo il tag sul `main` remoto, fermo a `a22c1dff` (0.80.0). Gli allegati sono giusti (costruiti dal codice locale, `88e683fe`), sbagliato è solo il tag. Controllo veloce: `git ls-remote --tags origin vX.Y.Z` deve dare il commit della versione. **Sempre: tag creato e pushato PRIMA di `npm run pubblica`.** Sistemare il tag già pubblicato vuol dire riscriverlo su GitHub: farlo solo con il permesso.
- **0.84.4 (23/10, c-122): release pubblicata con un solo file, il blockmap.** La chat della release ha creato tag e release (non in bozza) e poi si è fermata: per 30 minuti `releases/latest` era la 0.84.4 senza installer né `latest.yml`, quindi nessun aggiornamento. **Prima di chiudere una chat di release: `gh release view vX --json isDraft,assets`, 5 file «uploaded».**
  - **Come si completa una release già pubblicata:**
    1. copia pulita staccata sul tag (`git worktree add --detach <wt>/rilascio-X vX`), con la junction e `google-oauth.json`;
    2. `npm run pacchetto` (non `pubblica`), poi controllo di `latest.yml` contro lo sha512 dell'exe;
    3. `gh release upload vX <exe> <blockmap> latest.yml --clobber` con i nomi a trattini; il blockmap va sostituito, perché deve corrispondere all'exe;
    4. `npm run allega-apk`;
    5. scaricare da `releases/latest` e ricontrollare lo sha512.
  - **Non usare l'installer in `dist` della cartella principale** senza sapere da che commit viene: il 23/10 era su un commit più vecchio del tag.
  - **Falso positivo del guardiano «installa solo Nicholas»:** blocca un comando (anche una `cp`, o un testo scritto dalla shell) che contiene `../` seguito dal nome dell'installer. Usare i percorsi assoluti, e per i testi lo strumento Edit (riga 0u della lista dei lavori).
  - `allega-apk.mjs` **non conosce `--help`**: lo ignora e fa tutto, cioè costruisce e carica. Lanciarlo solo quando si vuole davvero caricare, o con `--solo-verifica`.

- **0.85.1 (24/10, notte): la stessa release affidata a due chat.** c-146 ha pubblicato `v0.85.1` (cambio di versione `61f74643`, pushato direttamente come `main` su GitHub, tag e release creati alle 23:52 UTC) mentre c-147 riceveva la stessa consegna (c-1139) e aveva già fatto il suo cambio di versione. c-147 se n'è accorta solo al controllo di `origin/main` subito prima del tag, e ha tolto il suo commit dal ramo. **Prima di toccare la versione:** `git fetch` e poi `gh release list --limit 2` e `git log --oneline -3 origin/main`. Se la release c'è già senza file, un'altra chat sta costruendo (guardare `dist/` nelle copie delle chat): non pubblicare una seconda volta, aspettare.
