---
titolo: "Trappola: senza Git Bash nel PATH gli hook ECC bloccano tutti gli strumenti della chat"
quando: 2026-10-21T16:00:00+02:00
tag: ["autopilota", "hook", "ECC", "worktree", "trappola"]
---

21/10, c-41. L'hook hookify-runtime del plugin ECC va in tempo scaduto quando la sessione non trova Git Bash, e il suo blocco vale come rifiuto: si fermano Read, PowerShell e tutto il resto, e la chat non può nemmeno leggere le sue consegne (c-459, c-502). Sul PC di sviluppo Git è in E:\Programs. Rimedio: rimettere Git for Windows nel PATH della chat, oppure lanciarla con ECC_GATEGUARD=off o con pre:hookify-runtime e pre:governance-capture in ECC_DISABLED_HOOKS. C'era poi un altro problema: il worktree ap-f1e631f5-c-41 era già stato tolto dopo l'unione, ma alla chat arrivavano ancora consegne. Una chat con il worktree tolto va chiusa, non riempita di consegne.

## Controllo del 21/10 pomeriggio (c-48, consegna c-523): gli hook sono spenti solo nella cartella principale

Nicholas ha chiesto di verificare che nel progetto gli hook ECC siano spenti davvero, come deciso con la 0.79.0. Non ho cambiato niente: né gli hook globali né i file.

- **Cartella principale:** sono spenti. `.claude/settings.local.json` ha `env` con `ECC_HOOKS_ENABLED=false` e `ECC_GATEGUARD=off`. Sono le chiavi giuste: l'ECC 2.2.3 legge `ECC_HOOKS_ENABLED` in `scripts/lib/hook-flags.js` (`areHooksEnabled`) e `ECC_GATEGUARD` in `run-with-flags.js` e `gateguard-fact-force.js`.
- **Copie delle chat (`SierraDeck.sierradeck-wt\…`):** lì sono **accesi**. Il file è personale e lo ignora la regola globale `~/.config/git/ignore` (`**/.claude/settings.local.json`), quindi le copie nuove non lo ricevono. Il 21/10 lo avevano solo 7 copie su 25 (a-c, c-11-android, c-3, c-4-ws, c-1-chiudichat, c-1-test, c-241-notifiche). Nel progetto non c'è nemmeno un `.claude/settings.json` salvato in git.
- **Effetto visto in c-48:** la GateGuard ha bloccato cinque volte la prima scrittura di un file. Su un PC dove la chat non trova Git Bash gli stessi hook bloccano Read e PowerShell, come descritto sopra.
- **Il codice:** SierraDeck non copia `.claude/settings.local.json` quando crea una copia (lo cerca con grep in `src`: lo leggono solo il Negozio e la cassaforte).

**Da decidere con Nicholas, una sola delle tre:**
1. SierraDeck copia `.claude/settings.local.json` della cartella principale in ogni copia che crea (un cambio di codice);
2. un `.claude/settings.json` salvato in git con lo stesso `env` (vale anche nelle copie, ma lo vede chiunque cloni il progetto);
3. le due chiavi nelle variabili d'ambiente con cui SierraDeck avvia le chat dei suoi autopiloti.

## Corretto nel codice (21/10 sera, c-556, per la 0.84.0)

Scelta la strada 1, come chiesto dal supervisore: SierraDeck riporta nella copia **solo** le chiavi dello spegnimento degli hook (`ECC_HOOKS_ENABLED`, `ECC_GATEGUARD`, `ECC_DISABLED_HOOKS`) dalla cartella principale, unendole al file della copia senza toccare gli altri permessi. Succede quando crea o ritrova una copia e all'avvio del servizio per tutte quelle aperte (`src/autopilot-host/hook-ecc.ts`). Per riaccendere gli hook nelle copie basta cambiarli nella cartella principale: le copie seguono il suo valore. Dettagli e prova in `blocchi-0-84-0.md`, punto 4.
