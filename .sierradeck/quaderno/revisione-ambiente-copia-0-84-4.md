---
titolo: "La Revisione e l'ambiente della copia: node_modules, local.properties, copia sparita (0.84.4)"
quando: 2026-10-23T12:30:00+02:00
tag: ["revisione", "copie", "node_modules", "criteri", "0.84.4", "trappola"]
---

## Il problema (23/10)
Le copie delle chat (`SierraDeck.sierradeck-wt/<ramo>`) hanno solo i file tracciati: **niente `node_modules`, niente `android/local.properties`**. Il programma, prima di accettare un «REVISIONE: OK», misura i criteri nella copia e sul ramo principale (`criteriPeggiorati`): nella copia `tsc` non partiva, `npx vitest` scaricava la 5.0.5 che non legge `vitest.config.ts`, gradle non trovava l'SDK. Risultato: «il ramo rompe quello che sul ramo principale passava», c-95 e c-106 rimandati 4-5 volte, domanda a Nicholas, tre «rifallo ancora».
Seconda variante: copia sparita / non più repository git (c-82, c-97, c-99, c-109) → anche `test -s lista-lavori.md` rosso.

## Come funziona dalla 0.84.4 (`src/autopilot-host/ambiente-copia.ts`)
- `preparaCopia(copia, principale)`: junction `node_modules` → quella della cartella principale, e copia di `android/local.properties`. Si fa all'apertura (o al riuso) di una chat di Revisione e prima della misura in `giudicaRevisione`. Mai sulla cartella principale.
- `togliCollegamenti(copia)`: `unlink` della junction **solo se è un collegamento**. Dopo l'unione approvata e in `togliPassi` prima di `git worktree remove`.
- `peggioratiDelRamo`: divide i criteri peggiorati in «del ramo» e «ambiente» (`problemaDiAmbiente` sull'uscita; copia senza git = tutto ambiente). Solo quelli del ramo rimandano indietro; l'ambiente va nelle note e nel diario dell'autopilota.
- `daRicordare` non mette in cache un esito rosso per l'ambiente: dopo la junction lo stesso commit si rimisura.

## Trappole verificate
- Una junction `node_modules` con `.gitignore` = `node_modules/` **non sporca** `git status`.
- `git worktree remove --force` **non attraversa** la junction (il bersaglio resta intatto, provato), ma la lascia lì e la cartella non si toglie: per questo si toglie prima.
- `fs.unlinkSync` su una junction toglie solo il collegamento.
- Non confondere con difetti veri: `error TS2307: Cannot find module './x'` o un import di un file tolto restano colpa del ramo (i test lo controllano).
