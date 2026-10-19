---
titolo: "c-11 unisce anche ap/ap-f1e631f5/c-1-test-verdi (bea1fa9)"
quando: 2026-10-19T10:52:23.228Z
tag: ["autopilota"]
---

19/10, 10:50 UTC. Su main tests/main/rimozione-sicura.test.ts cade per tempo scaduto a 20 secondi. La causa: carica client-rotte dentro il test e, a cache fredda, il modulo impiega circa 23 secondi a prepararsi. Non è un difetto del programma. La correzione è sul ramo ap/ap-f1e631f5/c-1-test-verdi, commit bea1fa9: client-rotte si importa in cima al file. Lì la corsa intera è verde, 4194 test superati e 2 saltati. Lo stesso ramo ha anche la guardia delle cancellazioni robusta e la parte sui due workspace sbagliati in analisi-0-80-0.md. La chat c-1 non si può chiudere con la versione installata, quindi c-11 deve fare git merge ap/ap-f1e631f5/c-1-test-verdi nel suo ramo prima della Revisione, così entra in main con lei. La regola da tenere: nessun test deve caricare con import() dentro il test un modulo pesante; si importa in cima al file.
