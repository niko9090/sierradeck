---
titolo: "Supervisore muto per «spawn ENAMETOOLONG»: il prompt va dallo stdin (0.85.1)"
quando: 2026-10-23T21:25:00+02:00
tag: ["supervisore", "windows", "trappola", "0.85.1"]
---

## Cosa succedeva

Il 23/10 il supervisore è fallito 239 volte (124 di fila) con `Error: spawn ENAMETOOLONG`.
Il prompt passava come argomento (`claude -p <prompt>`) e, con obiettivo e criteri
cresciuti, superava il limite della riga di comando di Windows (32.767 caratteri).
Il processo non partiva nemmeno. Ogni chiamata ingoiava l'errore e ricadeva sulle
regole, quindi da fuori sembrava un autopilota lento che faceva domande strane.

## La correzione

- `argomentiSupervisore` passa solo `-p` senza testo; `interrogazioneReale` scrive il
  prompt su `figlio.stdin.end(prompt)`. Claude Code con `-p` e senza testo legge lo stdin.
- `conAllarme` (in `supervisore.ts`) avvolge `deps.interroga` dentro `creaServer`: conta
  i fallimenti **di fila**. Al terzo: `console.error('[supervisore] ALLARME — …')`, più una
  riga nel registro degli autopiloti della stessa cartella. Finché il conto resta ≥ 3,
  `GET /autopiloti` aggiunge `supervisoreMuto` e l'indicatore diventa rosso:
  «Supervisore muto: N risposte mancate di fila — motivo». Basta una risposta riuscita
  per azzerare il conto.
- Test: `tests/autopilot-host/supervisore.test.ts`, con un claude finto in Node e un prompt
  di 48.006 caratteri. Il test controlla la risposta e che gli argomenti restino sotto i 200 caratteri.

## Da ricordare

- **Mai testi che crescono con i dati sulla riga di comando** di `claude`. Oggi ci passano
  solo costanti corte: `--append-system-prompt` con la direttiva del quaderno in
  `config.ts` e le istruzioni dell'agente in `risoluzione.ts`. Le chat ricevono le
  consegne per file («Leggi ed esegui … .sierradeck/consegne/c-N.md»).
- Per provare un `execFile` di claude in un test: `interrogazioneReale(process.execPath, [script])`.
  `primaDegliArgomenti` mette lo script prima di `-p`, così Node non lo prende per il suo `-p` (print).
