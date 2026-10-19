---
titolo: "0.80.0: due chat mandate a pubblicare la stessa versione (19/10)"
quando: 2026-10-19T18:30:00+02:00
tag: ["0.80.0", "release", "trappola", "c-11", "c-12"]
---

# Due chat a pubblicare la stessa versione

## Cosa è successo
- La consegna c-161 diceva a c-11: «pubblica ADESSO la 0.80.0 da main (3cc0acc)».
- Intanto su GitHub `main` era già a `a22c1df`, con il commit «la 0.80.0 la pubblica c-12» e la grafica di c-12.
- La bozza `v0.80.0` (creata alle 15:25 UTC, senza allegati) aveva già le note con quella grafica.

## Cosa ha fatto c-11
- Controlli verdi sulla copia ferma su 3cc0acc (`SierraDeck.sierradeck-wt/rilascio-0-80-0`):
  - vitest: 4.293 passati, 2 saltati;
  - typecheck verde;
  - guardia delle cancellazioni rispettata;
  - gradle `testDebugUnitTest assembleDebug` verde.
- Ha caricato il tag `v0.80.0` su 3cc0acc. Il push di `main` è stato rifiutato, perché su GitHub c'era di più.
- **Il tag l'ha tolto subito** (era suo, nessuna release lo usava). Non ha caricato allegati e non ha toccato la bozza.
- Ha lasciato la pubblicazione a c-12.

## Trappola
- **Prima di pubblicare:**
  1. `git fetch`;
  2. `git log <commit indicato>..origin/main`;
  3. `gh release view vX` (c'è già una bozza? di chi?).
- Se `origin/main` è più avanti, o una bozza c'è già, un'altra chat sta pubblicando. Non creare tag e non caricare niente: chiedere al supervisore chi pubblica.
- La cartella `rilascio-0-80-0` ha `node_modules` come **giunzione** verso la cartella principale. Prima di toglierla, togliere la giunzione con `cmd /c rmdir node_modules`: rimuove solo il collegamento. Mai cancellare ricorsivamente attraverso la giunzione.
