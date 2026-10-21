---
titolo: "Criterio dei test con node, non con npx (20/10)"
quando: 2026-10-20T12:42:22.432Z
tag: ["autopilota"]
---

Il criterio «I test del programma passano» ora lancia `node node_modules/vitest/vitest.mjs run --maxWorkers=2` invece di passare da npx. Motivo, trovato da c-17: allo scadere il servizio installato (versione vecchia) chiude la bash di Git ma non npx/vitest, che per Windows hanno un altro padre. Le suite restano vive (fino a 17 insieme alle 12:35) e ogni misura dopo scade per il carico. La correzione nel codice (1e9add64, 6e508683, in main con fb205c55) vale solo dopo che Nicholas avrà installato la versione nuova. Le suite rimaste accese si spengono da sole o con l'installazione: non chiuderle per nome dalle chat.
