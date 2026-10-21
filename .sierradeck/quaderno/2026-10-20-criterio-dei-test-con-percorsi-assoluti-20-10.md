---
titolo: "Criterio dei test con percorsi assoluti (20/10)"
quando: 2026-10-20T11:14:53.103Z
tag: ["autopilota"]
---

Il criterio «I test del programma passano» adesso legge E:/Users/nikof/Documents/SierraDeck.sierradeck-wt/esiti/test-<commit di main>.json, con il commit preso da `git -C E:/Users/nikof/Documents/SierraDeck rev-parse main`. Prima usava percorsi relativi e HEAD, e falliva sempre se veniva misurato da una cartella senza git (per esempio quella di una chat già chiusa). Il file si produce come prima: `npx vitest run --reporter=json --outputFile=<quel file>`, da una cartella esattamente al commit di main. Al 20/10 alle 11:12 la cartella esiti non esiste ancora: tocca a c-23.
