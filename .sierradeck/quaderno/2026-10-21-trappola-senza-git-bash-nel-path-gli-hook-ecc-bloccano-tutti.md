---
titolo: "Trappola: senza Git Bash nel PATH gli hook ECC bloccano tutti gli strumenti della chat"
quando: 2026-10-21T08:37:05.765Z
tag: ["autopilota"]
---

21/10, c-41. L'hook hookify-runtime del plugin ECC va in tempo scaduto quando la sessione non trova Git Bash, e il suo blocco vale come rifiuto: si fermano Read, PowerShell e tutto il resto, e la chat non può nemmeno leggere le sue consegne (c-459, c-502). Sul PC di sviluppo Git è in E:\Programs. Rimedio: rimettere Git for Windows nel PATH della chat, oppure lanciarla con ECC_GATEGUARD=off o con pre:hookify-runtime e pre:governance-capture in ECC_DISABLED_HOOKS. C'era poi un altro problema: il worktree ap-f1e631f5-c-41 era già stato tolto dopo l'unione, ma alla chat arrivavano ancora consegne. Una chat con il worktree tolto va chiusa, non riempita di consegne.
