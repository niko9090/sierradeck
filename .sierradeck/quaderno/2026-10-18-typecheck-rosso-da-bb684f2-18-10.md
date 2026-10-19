---
titolo: "Typecheck rosso da bb684f2 (18/10)"
quando: 2026-10-18T13:29:29.298Z
tag: ["autopilota"]
---

Il commit bb684f2 («test: due test che cadevano solo a macchina carica») fatto nella cartella principale ha introdotto un errore TS18048 in tests/main/pty-host-client.test.ts:343: dentro vi.waitFor c'è client.isRunning() con client che può essere undefined. Per correggerlo basta client!.isRunning() o un controllo prima della chiamata, come nelle righe dopo. La correzione la fa la chat che lavora sui test lenti nella cartella principale, prima del rilascio della 0.80.0. Fino ad allora il criterio «TypeScript compila» resta rosso per tutte le chat.
