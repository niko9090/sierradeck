---
titolo: "Hook ECC spenti solo nella cartella principale, non nelle copie delle chat (21/10)"
quando: 2026-10-21T16:30:00+02:00
tag: ["autopilota", "ecc", "hook", "trappola", "worktree"]
---

Sintomo (21/10): in alcune chat dell'autopilota Read e PowerShell venivano rifiutati da un hook che cercava Git Bash e non lo trovava.

Cosa c'è oggi (solo lettura, non ho cambiato niente):
- Gli hook ECC vengono dal plugin `ecc@ecc` 2.2.3, attivo in `~/.claude/settings.json`. Si spengono con la variabile `ECC_HOOKS_ENABLED=false`, che legge `scripts/lib/hook-flags.js` del plugin.
- Nella cartella principale lo spegnimento c'è: `.claude/settings.local.json` contiene `env: { ECC_HOOKS_ENABLED: "false", ECC_GATEGUARD: "off" }` (0.79.0).
- **Nelle copie delle chat (`SierraDeck.sierradeck-wt/*`) di solito manca.** Solo 7 copie su 56 hanno quel file, e non c'è nemmeno nelle copie attive c-48 e c-52.
- Il motivo: `settings.local.json` è escluso da git per tutto il PC (`~/.config/git/ignore`: `**/.claude/settings.local.json`). Un worktree nuovo nasce senza quel file, quindi senza lo spegnimento, e il programma (`src/autopilot-host/worktree.ts`) non lo copia.

Correzione possibile, da decidere con Nicholas perché tocca il comportamento degli hook:
- A: alla creazione del worktree copiare `.claude/settings.local.json` dalla cartella principale.
- B: lanciare le chat dell'autopilota con `ECC_HOOKS_ENABLED=false` nell'ambiente.
- C: mettere `env` in `.claude/settings.json` del progetto. Questa va in git, quindi arriva a tutte le copie, ma vale per chiunque apra il progetto.

Non va toccato senza il suo sì: gli hook globali e il plugin.

**Ricontrollo del 21/10, ore 16:45 (c-52, consegna c-524), solo lettura:**
- nella cartella principale `.claude/settings.local.json` ha ancora `ECC_HOOKS_ENABLED=false` e `ECC_GATEGUARD=off`;
- `.claude/settings.json` del progetto non c'è;
- lo spegnimento c'è in 7 copie su 56 (a-c, c-11-android, c-3, c-4-ws, c-1-chiudichat, c-1-test, c-241-notifiche); manca nelle copie attive c-48 e c-52 e in prova-unione-c48.

c-52 lavora dalla cartella principale, quindi per lei gli hook sono spenti; le sue copie le usa solo per git e per i test. Non ho cambiato hook, plugin o impostazioni. La scelta fra A, B e C resta a Nicholas.
