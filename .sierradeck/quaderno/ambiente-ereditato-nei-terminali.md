---
titolo: "Le chat grigie: l'ambiente che il gestore eredita e passa ai terminali"
quando: 2026-08-27T22:05:00+02:00
tag: ["pty", "ambiente", "colori", "diagnosi", "sicurezza"]
---

## Il sintomo
Le chat nel mosaico perdevano **tutti i colori**: testo grigio uniforme, nessun
errore, nessuna impostazione toccata. Sembrava un guasto del terminale o di
`xterm.js`, e non lo era.

## La causa
SierraDeck era stato avviato **da dentro una sessione di Claude Code** (per
esempio da un terminale del gestore, o da noi durante lo sviluppo). Quella
sessione mette `NO_COLOR=1` nell'ambiente dei comandi che lancia. Il PTY host
copiava l'ambiente del processo in **ogni** chat, e `claude.exe` ubbidiva al
divieto: interfaccia senza un colore.

Nello stesso pacchetto viaggiavano `CLAUDECODE=1`, `CLAUDE_CODE_ENTRYPOINT`,
`CLAUDE_EFFORT` e — peggio — `CLAUDE_CODE_MESSAGING_SOCKET`/`_TOKEN`, cioè il
canale privato e il gettone della sessione che ci aveva avviati, consegnati a
qualunque cosa girasse in un riquadro.

## La correzione (`src/pty-host/pty-manager.ts`)
- Quelle variabili sono entrate in `NON_EREDITATE`, accanto a
  `ELECTRON_RUN_AS_NODE` e ai marcatori di sessione già noti.
- Il terminale ora **dichiara cosa sa fare** invece di ereditare il divieto di
  un altro guscio: `TERM=xterm-256color`, `COLORTERM=truecolor`. Sta fra
  l'ambiente ereditato e le aggiunte esplicite, così chi vuole davvero il grigio
  può ancora imporlo.

## Come si diagnostica (vale per il prossimo caso)
Il sintomo non si riproduce lanciando lo stesso comando a mano: l'ambiente è
diverso. Due prove che chiudono la questione in cinque minuti:
1. **Il pty colora?** `node-pty` + `powershell -Command "Write-Host x
   -ForegroundColor Green"`, poi si contano le sequenze `\x1b[...m` nell'output.
   Se ci sono, il pty non c'entra.
2. **Cosa ha davvero in pancia il processo che gira?** Si legge il blocco
   d'ambiente dal PEB (`NtQueryInformationProcess` + `ReadProcessMemory`,
   offset `0x20` → ProcessParameters, `0x80` → Environment). È l'unico modo per
   sapere con cosa è partito un programma già avviato, e ha dimostrato in un
   colpo che `NO_COLOR=1` era lì dentro.

## La regola
Il gestore ospita i terminali dell'utente: deve **riprodurre l'ambiente della
sua shell**, non il proprio. Ogni variabile che il gestore riceve dal padre e
non è dell'utente va tolta esplicitamente — e le capacità del terminale che
offriamo vanno dichiarate, non subite.

Vedi [[app-android-nativa]].
