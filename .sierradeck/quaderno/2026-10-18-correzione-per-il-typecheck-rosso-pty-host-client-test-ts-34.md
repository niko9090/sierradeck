---
titolo: "Correzione per il typecheck rosso (pty-host-client.test.ts:343), per c-11"
quando: 2026-10-18T13:31:23.961Z
tag: ["autopilota"]
---

In bb684f2, alla riga 343 di tests/main/pty-host-client.test.ts, la chiamata client.isRunning() dentro vi.waitFor dà TS18048, perché lì TypeScript non sa più che client non è undefined. Correzione più piccola: dopo client.start() aggiungere `const c = client` e nel waitFor usare `c.isRunning()`; in alternativa `client!.isRunning()`. Poi lanciare npm run typecheck e npx vitest run tests/main/pty-host-client.test.ts. Commit: «test: tipo di client nel waitFor del pty host». Va fatta nel ramo di c-11 e passata dalla Revisione, non nella cartella principale. Lì ci sono modifiche non salvate di altre chat (criteri-veloci, worktree, collegamento-rtc) che nessuno deve toccare senza sapere di chi sono.
