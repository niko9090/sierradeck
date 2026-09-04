---
titolo: "Il supervisore è uno per chat (0.13.0)"
quando: 2026-09-05T00:20:00+02:00
tag: ["autopilota", "supervisore", "flotta", "decisione"]
---

# La decisione

Scelta di Nicholas (2026-09-05): **uno per chat**, non uno per autopilota.
Costa una conversazione di supervisione per ogni chat della flotta; in cambio
ognuna è seguita per intero, e sparisce il difetto del supervisore concorrente.

# Il difetto che chiude

`sessioneSupervisore` stava sull'`Autopilota`. In `suStop` due chat della
stessa flotta che si fermavano insieme leggevano `a` all'inizio e ognuna
scriveva la propria sessione: l'ultima vinceva, la conversazione dell'altra
restava orfana e al turno dopo ne apriva una nuova (perdita di contesto).
Rileggere prima di scrivere non aiutava: cambiava solo *quale* delle due si
buttava.

# Com'è fatto

- `ChatGovernata.sessioneSupervisore` (parse in `shared/autopilota.ts`).
- `suStop`: `sessioneDiPartenza` = quella della chat che si è fermata; se non
  ce l'ha ancora, eredita quella dell'autopilota **solo se è l'unica chat**
  (è la stessa conversazione di prima, non una a caso). Il nuovo id si scrive
  sulla chat (`aggiornato.chats.map`), non sull'autopilota.
- La concorrenza la risolve `conservaCambiUtente`, che porta nel salvataggio
  **solo la chat di questo turno** (`mia`) e prende le altre da `fresco`.
- `Autopilota.sessioneSupervisore` resta per: autopiloti senza chat, e
  `chiediCambio` (la traduzione di un tuo cambio, che è dell'autopilota).
- Test: «il supervisore e uno per chat: due fermate insieme non si rubano la
  sessione» in `server.test.ts` (due stop in `Promise.all`).
