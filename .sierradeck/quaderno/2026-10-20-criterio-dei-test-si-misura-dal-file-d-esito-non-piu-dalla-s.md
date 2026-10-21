---
titolo: "Criterio dei test: si misura dal file d'esito, non più dalla suite lanciata dal programma (20/10)"
quando: 2026-10-20T10:29:32.929Z
tag: ["autopilota"]
---

Il programma installato (0.80.1) taglia la suite prima che finisca (circa 19 minuti) e il criterio era rosso da 27 giri. Adesso il criterio controlla ../SierraDeck.sierradeck-wt/esiti/test-<commit di main>.json: esito JSON di vitest, success vero, 0 falliti, più di 4000 test. Si produce con `npx vitest run --reporter=json --outputFile=<quel file>` da una cartella esattamente al commit di main. Va rifatto dopo ogni unione e prima della release 0.81.0. Prima bisogna sistemare il test rosso per tempo in worktree.test.ts.
