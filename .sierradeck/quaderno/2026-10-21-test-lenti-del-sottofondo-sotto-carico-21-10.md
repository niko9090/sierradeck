---
titolo: "Test lenti del sottofondo sotto carico (21/10)"
quando: 2026-10-21T01:13:28.929Z
tag: ["autopilota"]
---

Con tutta la suite tests/main cadono a turno sottofondo-rotte.test.ts («parte senza finestre… il testo in coda arriva appena è pronta») e sottofondo.test.ts («un testo che Claude Code perde torna in coda…», expected true to be false). Lanciati da soli passano 6/6 e 3/3. Non dipendono da c-35: sono da rendere stabili, senza indebolirli, prima della release 0.82.0.
