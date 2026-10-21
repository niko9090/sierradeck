---
titolo: "Hook ECC: ricontrollo del 21/10, spenti solo nella cartella principale e in 7 copie su 56"
quando: 2026-10-21T16:45:00+02:00
tag: ["ecc", "hook", "worktree", "autopilota", "c-52"]
---

Ricontrollo fatto da c-52 per la consegna c-524, solo in lettura. Continua la scheda «Hook ECC spenti solo nella cartella principale, non nelle copie delle chat (21/10)», che sta nella cartella principale.

- Nella cartella principale `.claude/settings.local.json` ha ancora `ECC_HOOKS_ENABLED=false` e `ECC_GATEGUARD=off`, come deciso nella 0.79.0. `.claude/settings.json` del progetto non c'è.
- Il file `settings.local.json` è escluso da git per tutto il PC (`~/.config/git/ignore`), quindi un worktree nuovo nasce senza. L'hanno solo 7 copie su 56: a-c, c-11-android, c-3, c-4-ws, c-1-chiudichat, c-1-test e c-241-notifiche. **Manca nelle copie attive c-48 e c-52 e in prova-unione-c48.**
- Una chat che parte da una di quelle copie ha gli hook ECC accesi. Se non trova Git Bash, l'hook `hookify-runtime` va in tempo scaduto e blocca Read e PowerShell.

Non ho cambiato hook, plugin o impostazioni. Le tre strade possibili sono:
- A: copiare il file alla creazione del worktree;
- B: lanciare le chat con `ECC_HOOKS_ENABLED=false`;
- C: mettere `env` nel `.claude/settings.json` del progetto.

La scelta la fa Nicholas.

Trappola vista facendo il controllo: una scheda che nella cartella principale non è in git (`??`) non va aggiunta col suo stesso nome a un ramo, perché l'unione in main si fermerebbe su «untracked working tree file would be overwritten». Si scrive una scheda nuova.
