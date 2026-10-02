---
titolo: "Segnali di Claude Code: lo stato delle chat senza leggere lo schermo (0.45.0)"
quando: 2026-10-02T17:30:00+02:00
tag: ["hook", "stato-chat", "powershell", "autopilota", "statusLine"]
---

# Come funziona

- Ogni chat aperta da SierraDeck riceve in `--settings` degli hook **http**
  (`hookSegnali` in `src/shared/segnali-chat.ts`) per SessionStart,
  UserPromptSubmit, PermissionRequest, Notification, Stop, StopFailure,
  SessionEnd. Vanno sommati a quelli dell'autopilota con `unisciConHook`,
  mai sostituiti.
- Gli hook fanno POST a `http://127.0.0.1:<porta client>/api/segnale`
  (solo loopback, risponde 204 senza corpo, quindi l'hook non decide niente
  al posto di Claude Code: PermissionRequest senza risposta = scelta allo schermo).
- `statoDaSegnali` → fase lavora / chiede / aspetta / errore / chiusa;
  `statoChat` fa vincere i segnali sullo schermo. Lo schermo resta riserva e
  il registro lo scrive una volta per sessione («nessun segnale da Claude Code…»).
- Le consegne degli autopiloti usano `prontaDaSegnali` (aspetta da ≥1,5 s) e
  `partitaDaSegnali` (turno iniziato da <60 s), via `src/renderer/segnali-vivi.ts`.
- StopFailure (limite del piano, login scaduto) → voce rossa in «Salute».

# Trappola: PowerShell (provata il 02/10)

Claude Code 2.1.287 su questo PC lancia i comandi degli hook e della
statusLine con **PowerShell**: lì `curl` è Invoke-WebRequest e `@-` nudo è
un'altra cosa → gli hook `command` con curl **fallivano in silenzio** (un
hook diagnostico ha provato che non partivano neanche). Rimedi:
- per gli hook: `type: "http"` (nessuna shell);
- per la statusLine (che non ha il tipo http): `curl.exe … --data-binary "@-"`,
  che va sia in PowerShell sia in bash. Prima di 0.45.0 i limiti del piano
  non arrivavano per questo motivo.

# JSON veri

`tests/fixtures/hook-claude-2.1.287/` — catture vere di `claude -p` (percorsi
resi neutri). Notification e StopFailure non arrivano in `-p`: quei file sono
presi dalla documentazione e hanno «dalla-documentazione» nel nome.
