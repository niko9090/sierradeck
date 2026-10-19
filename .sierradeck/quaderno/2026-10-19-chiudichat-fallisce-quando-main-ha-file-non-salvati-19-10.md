---
titolo: "chiudiChat fallisce quando main ha file non salvati (19/10)"
quando: 2026-10-19T09:52:27.954Z
tag: ["autopilota"]
---

19/10, alle 09:39 UTC: chiudiChat su c-7 è fallito con «conflitto», ma il testo del conflitto era solo un avviso di git («LF will be replaced by CRLF») su src/autopilot-host/worktree.ts. In main c'erano 4 file modificati e non salvati: server.ts, worktree.ts e i loro test, cambiati da un'altra sessione direttamente su main. Ci sono due difetti per c-11. Il primo: chiudiChat prende gli avvisi CRLF di git per conflitti. Il secondo: con main sporco ogni chiusura fallisce e il supervisore riprova all'infinito. La chiusura deve dire chiaro quale file blocca e aspettare, senza girare a vuoto. La correzione per i rami già uniti o tolti è 12f85e0, sul ramo ap/ap-f1e631f5/c-11.
