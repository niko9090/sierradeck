---
titolo: "Il tag della release va pushato PRIMA di npm run pubblica"
quando: 2026-10-23T02:00:00+02:00
tag: ["release", "tag", "github", "trappola", "pubblica"]
---

`npm run pubblica` (electron-builder `--publish always`) crea la release su
GitHub con il tag `vX.Y.Z`. Se quel tag **non è già sul remoto**, GitHub lo crea
da solo sul `main` remoto, che qui può essere vecchio di giorni: gli autopiloti
uniscono in locale e il `main` su GitHub era fermo a `a22c1dff` (0.80.0).

Successo alla **v0.84.2**: tag su `a22c1dff` invece che su `6da91bc1`/`88e683fe`.
I file della release erano giusti (costruiti dal codice locale), sbagliato solo
il commit del tag. Deciso: il tag pubblico non si sposta.

**Come si fa dalla 0.84.3:** commit di versione in main → `git tag vX.Y.Z <commit
di main>` → `git push origin main vX.Y.Z` → `npm run allega-apk` / `npm run
pubblica` → controllare con `git ls-remote origin refs/tags/vX.Y.Z` che punti al
commit giusto, che la release non sia bozza e che ci siano `latest.yml` e
`app-android.json`.
