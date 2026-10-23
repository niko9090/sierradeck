---
titolo: "Il tag della release va pushato PRIMA di npm run pubblica"
quando: 2026-10-23T05:30:00+02:00
tag: ["release", "tag", "github", "trappola", "pubblica"]
---

`npm run pubblica` (electron-builder `--publish always`) crea la release su
GitHub con il tag `vX.Y.Z`. Se quel tag **non è già sul remoto**, GitHub lo crea
da solo sul `main` remoto, che qui può essere vecchio di giorni: gli autopiloti
uniscono in locale e il `main` su GitHub era fermo a `a22c1dff` (0.80.0).

Successo alla **v0.84.2**: tag su `a22c1dff` invece che su `6da91bc1`/`88e683fe`.
I file della release erano giusti (costruiti dal codice locale), sbagliato solo
il commit del tag. Deciso: il tag pubblico non si sposta.

**Come si fa (provato alla 0.84.3, 23/10):**

1. Unire `main` nel ramo della release, poi `git push origin HEAD:main`: il
   `main` su GitHub diventa quel commit.
2. `git tag -a vX.Y.Z -m "SierraDeck X.Y.Z" HEAD` e `git push origin vX.Y.Z`.
3. `GH_TOKEN=$(gh auth token) gh release create vX.Y.Z --title vX.Y.Z --notes-file <note>`
   **prima** di pubblicare. Le note sono le righe di `novita.ts`, prese con
   `noteDi` di `scripts/note-novita.mjs`.
4. `GH_TOKEN=$(gh auth token) npm run pubblica`. Senza `GH_TOKEN` electron-builder
   si ferma subito («GitHub Personal Access Token is not set»), senza caricare niente.
5. `npm run allega-apk`, solo DOPO: carica su una release che deve già esistere
   (`gh release upload`). Con `--senza-build` usa l'APK già costruito; la firma
   la ricontrolla lo stesso.
6. Controlli:
   - `git ls-remote origin refs/heads/main "refs/tags/vX.Y.Z^{}"`: lo stesso commit;
   - `gh api repos/niko9090/sierradeck/releases --jq '.[]|select(.tag_name=="vX.Y.Z")|…'`: una riga sola;
   - `gh release view vX.Y.Z --json name,isDraft,assets`: 5 file (exe, blockmap,
     `latest.yml`, `SierraDeck-<app>.apk`, `app-android.json`);
   - la `size` e lo `sha512` di `latest.yml` sono quelli dell'exe.

**Intoppo della 0.84.3:** il punto 3 era saltato. electron-builder carica exe e
blockmap in parallelo e tutti e due provano a creare la release: uno la crea,
l'altro prende **422 `already_exists`**. La release resta con il solo blockmap e
senza `latest.yml`, quindi l'aggiornamento non si vede. Rimedio: c'era una sola
release, non in bozza; si rilancia `npm run pubblica`, che attacca exe, blockmap
e `latest.yml` a quella. Poi `allega-apk`, e `gh release edit vX.Y.Z --title
vX.Y.Z --notes-file …`, perché electron-builder la chiama «X.Y.Z» senza la v e
senza note.
