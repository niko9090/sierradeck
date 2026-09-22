---
titolo: "Consumi con i limiti del piano: la riga di stato di Claude Code come sonda (0.31.0, app 2.34.0)"
quando: 2026-09-22T15:30:00+02:00
tag: ["consumi", "limiti", "statusline", "claude-code", "fumetti", "telefono"]
---

Nicholas (22/09): «controlla e migliora anche tutta la parte dei consumi,
importa anche qui i limiti se puoi e emetti avvisi in basso nel pop up per
aiutare a capire l'utente».

## Da dove vengono i limiti (e da dove NON vengono)

- I limiti del piano (finestra mobile di **5 ore** e tetto **settimanale**,
  con `used_percentage` e `resets_at`) non stanno in nessun file locale di
  Claude Code. `~/.claude.json` e `.credentials.json` hanno solo il tipo di
  piano (`subscriptionType: max`, `rateLimitTier`), non l'uso.
- L'unica interfaccia **documentata** che li porta fuori è la **riga di
  stato** (`statusLine` in settings): a ogni risposta Claude Code lancia il
  comando e gli passa su stdin un JSON con `rate_limits.five_hour/seven_day`
  (solo Pro/Max, solo dopo la prima risposta), `cost.total_cost_usd`,
  `context_window.used_percentage`, `model.display_name`, `session_id`
  (code.claude.com/docs/en/statusline). Gli hook NON hanno costi né limiti;
  `/api/oauth/usage` è interno; il JSONL è dichiarato instabile.

## Come lo fa SierraDeck

- `impostazioniPerChat` (index.ts) fonde in `--settings` di OGNI chat una
  `statusLine` = `curl -s -X POST … --data-binary @- http://127.0.0.1:<portaClient>/api/polso`
  (curl è in System32 da Windows 10). Claude Code stampa in fondo al terminale
  quello che il server risponde. Se l'utente ha già una `statusLine` in
  `~/.claude/settings.json`, la sua vince e i limiti restano «non letti»: il
  pannello lo dice.
- `client-server.ts`: `POST /api/polso` accettato **solo dal loopback**
  (`eLoopback`), senza chiave; risponde `text/plain` con la riga.
- `src/shared/polso-chat.ts` (puro, test): `leggiPolso` (resets_at in
  secondi → ms), `rigaDiStato` («Opus 5 · contesto 42% · 5 ore 63% (azzera
  14:20) · settimana 31% · 1.23 $»), `limitiAggiornati` (l'ultimo polso con
  limiti vale per tutti: sono del piano, non della chat; una finestra già
  azzerata torna a 0), `costoPerPeriodo` (il costo di sessione è cumulativo
  e va tutto al giorno dell'ultimo polso), `avvisiConsumi` (80%/95% per
  finestra con chiave `nome:soglia:resettaIl`, contesto ≥ 90% per chat).
- index.ts: `polsi` in memoria + `polso-chat.json` (scrittura differita 2 s);
  `arricchisciConsumi` aggiunge `limiti`, `costo`, `chatAperte` ai consumi
  dell'indice (IPC `sessioni:consumi` e `/api/consumi`).
- `consumi.ts`: `perModello` (ultimi 7 giorni, `nomeModello` da id) —
  i modelli grandi pesano di più sui limiti.
- Renderer: `PannelloConsumi` con le due barre (ambra ≥ 80, rosso ≥ 95),
  spiegazioni complete, spesa stimata, chat aperte con contesto, per
  modello; `App.tsx` interroga i consumi ogni 30 s e mostra **un fumetto per
  fatto** (chiavi già viste in `localStorage['avvisi-consumi']`).
- Telefono: `/api/consumi` porta `limiti`/`costo`; pagina (`limitiHtml`) e
  app (`Modelli.Consumi.limiti/costo`, `FinestraRiga` in Computer.kt).

## Limiti del metodo (da sapere)

- I limiti si conoscono solo dopo la prima risposta di una chat aperta da
  SierraDeck dalla 0.31 in poi; una chat aperta da un terminale nudo non
  passa di qui.
- Con chiave API a consumo non ci sono finestre: `rate_limits` manca.
- La spesa è quella che Claude Code calcola a listino: con abbonamento è
  un'indicazione.
- `resets_at` è un timestamp Unix in secondi: `leggiPolso` moltiplica se
  < 1e12.
