---
titolo: "0.80.0: per c-11, attesa fissa in collegamento-rtc.test.ts:208"
quando: 2026-10-19T11:17:46.481Z
tag: ["autopilota"]
---

Il 19/10 alle 11:1x la suite su main (npx vitest run --maxWorkers=2) ha dato 4193 test passati, 1 caduto e 2 saltati, in 926 s. Cade solo tests/main/collegamento-rtc.test.ts:208: aspetta 2 s fissi, che sotto carico non bastano. Da solo passa 3 volte su 3. Correzione per c-11 sul suo ramo: al posto dell'attesa fissa usare vi.waitFor con un tetto largo (10 s o più), come già fatto in pty-host-client (67444aa). È l'unico rosso che resta in main e blocca il criterio «I test del programma passano». Da analisi-0-80-0.md, sezione 4 (b561cfb).
