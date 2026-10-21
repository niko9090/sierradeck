---
titolo: "17 suite vitest aperte insieme, le più vecchie dalle 12:08 (20/10)"
quando: 2026-10-20T12:35:49.424Z
tag: ["autopilota"]
---

Alle 14:35 UTC sul PC di sviluppo c'erano 17 processi node con vitest: due partiti alle 12:08, due alle 12:47, due alle 13:54, gli altri dopo le 14:29. La CPU al 100% rende rossi per tempo i test che usano git, e così il criterio «I test del programma passano» non passa mai. La correzione 1e9add64/6e508683 (un criterio scaduto chiude tutto il suo albero di processi) è in main, ma le suite partite prima restano aperte. Da fare: c-18 o chi segue i criteri controlli di chi sono queste suite e fermi solo quelle orfane dei criteri scaduti, mai quelle di chat al lavoro. Va controllato anche che una nuova misura del criterio non parta mentre ne gira già una. c-24 viene unita senza la corsa intera: la suite la misura il criterio su main.
