---
titolo: "Chat chiuse: niente più giri né compiti (c-310, ramo ap/ap-f1e631f5/c-310, 20/10)"
quando: 2026-10-20T18:10:00.000Z
tag: ["autopilota", "0.81.0", "trappola"]
---

**Da dove venivano i giri a vuoto (c-13, c-15).** `suStopMisurato` in `src/autopilot-host/server.ts` non guardava lo stato della chat. A ogni fine turno di una chat finita misurava i criteri e chiamava il supervisore. Con un criterio rosso il supervisore diceva «prosegui», la chat rispondeva «ok», e il giro ripartiva ogni 40 secondi circa.

**Da dove venivano i compiti alle chat chiuse (c-233 … c-309).** Una chat finita resta ferma e Claude Code manda la notifica `idle_prompt`. `suNotification` faceva rispondere il supervisore e mandava la risposta come consegna nuova con `avviaLavoro`. Ogni consegna ha un numero c-N, e così la c-15 ha ricevuto c-272 e c-309. I numeri c-N sono delle **consegne**, non delle chat.

**Cosa fa ora il ramo c-310 (commit 23823755, non ancora unito):**
- `chatSenzaLavoro` restituisce il motivo se la chat è finita, o se la sua copia manca o non è più un repository git (`statoCopia` in `worktree.ts`). In quel caso la fine turno e la notifica rispondono `{}` senza supervisore e scrivono una riga nel registro. Una chat ancora «al lavoro» ma senza copia viene chiusa.
- Il controllo della copia è la dipendenza facoltativa `copia`, che passa solo il servizio vero (`index.ts`). Nei test il git finto crea worktree che sul disco non esistono: senza `copia` il controllo resta spento.
- `avviaLavoro` non manda niente a una chat con `stato: 'finita'`, e i messaggi tornano in coda. Chi vuole davvero riprenderla deve passarla in `lavoro` (Revisione riusata, ultimo giro, conflitto finale).
- L'ultimo giro di una chat approvata senza copia non riceve «prosegui». Il lavoro che resta va in coda come compito per una chat nuova con un ramo.
- `chiudiChat` su una chat già finita la ferma (Ctrl+C) e lo scrive nel registro. `ferma` funziona anche dopo un riavvio del servizio, passando la sessione. Ora toglie dalla coda solo gli ordini di **quella** chat: prima `dimentica(id)` cancellava anche quelli delle sorelle.

Test: `tests/autopilot-host/server.test.ts` (describe «le chat chiuse…»), `nel-mosaico.test.ts`, `stato-copia.test.ts`.
