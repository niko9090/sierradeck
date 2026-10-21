---
titolo: "Rosso di «altri test» delle 18:38: era il carico, non un difetto (20/10)"
quando: 2026-10-20T18:43:00.513Z
tag: ["autopilota"]
---

Alle 18:38 il criterio «Gli altri test del programma passano» era rosso su tests/autopilot-host/server.test.ts. Il supervisore l'ha rilanciato da solo su main (fb12ad3d, 0.81.1): 1 file, 153 test, tutti verdi. In quel momento giravano le suite di altre chat e la chat delle foto c-32. Non serve una correzione: il criterio torna verde quando il PC è in quiete. Si misura una suite alla volta, come ha fatto c-324 (290 s tests/main, 390 s il resto).
