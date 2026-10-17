---
titolo: "Prova ECC: esito sulla 0.79.0"
quando: 2026-10-17T21:55:00.081Z
tag: ["autopilota"]
---

17/10: 4 agenti ECC (typescript, react, kotlin, silent-failure-hunter) lanciati con claude -p --agent, solo strumenti di lettura, sul diff della 0.79.0. In tutto 47 segnalazioni: 36 vere e 11 falsi allarmi, $2,25, meno di 5 minuti in parallelo. Le correzioni sono nel commit 8a5f7cd e i test passano (4145). Gli hook di ECC sono spenti solo nel progetto con .claude/settings.local.json; i worktree nuovi non lo ereditano. Ogni segnalazione va verificata sul codice prima di correggere.
