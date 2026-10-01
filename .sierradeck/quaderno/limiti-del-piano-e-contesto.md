---
titolo: "Limiti del piano e contesto delle chat: come si leggono (0.37.0)"
quando: 2026-10-01T16:00:00+02:00
tag: ["consumi", "limiti", "statusline", "freno", "autopilota"]
---

# Da dove arrivano

I limiti del piano (`rate_limits.five_hour` e `seven_day`) e il contesto (`context_window`) li manda Claude Code **solo** al comando della riga di stato. SierraDeck lo registra per ogni chat e il comando li rimanda a `POST /api/polso` (porta 47640, solo da 127.0.0.1). Documentazione: code.claude.com/docs/en/statusline.

Fatti della documentazione da ricordare:
- `rate_limits` c'è solo con Pro/Max (o un gateway con spend limit) e solo dopo la prima risposta della sessione.
- Ogni finestra può mancare **da sola**, e Claude Code la **toglie quando passa `resets_at`** (secondi Unix).
- `used_percentage` del contesto conta **solo i token in ingresso** (`input + cache_creation + cache_read`), non l'output.
- `current_usage` è `null` prima della prima risposta e subito dopo `/compact`; `used_percentage` può essere `null` all'inizio.
- La riga di stato si ridisegna anche **senza** una risposta nuova (eventi, `refreshInterval`), e porta i limiti dell'ultima risposta di **quella** sessione.

# I difetti trovati (fino alla 0.36.x) e la causa

1. **Valore vecchio dopo l'azzeramento.** Si mostrava il vecchio valore, oppure uno 0 che sembrava una lettura vera.
2. **«L'ultima chat che ha scritto».** `limitiAggiornati` prendeva il polso con `quando` più recente. Una chat ferma da ore che ridisegna la riga rimetteva in cima i suoi numeri vecchi.
3. **Nessuna età visibile** della lettura.
4. **Chat senza `rate_limits` cancellava il valore buono.** Il polso nuovo sostituiva in blocco quello vecchio della sessione.
5. **Contesto con l'output dentro.** I token mostrati non tornavano con la percentuale.

# La correzione: `src/shared/limiti-piano.ts`, l'unico posto

- **`unisciPolso(prima, nuovo)`** (lo usa `ricordaPolso` in `index.ts`):
  - una finestra che manca nel polso nuovo resta quella di prima (punto 4, e la finestra tolta all'azzeramento diventa «azzerata»);
  - una finestra identica senza risposta nuova (costo e contesto uguali) tiene il suo `lettoIl`: un ridisegno non ringiovanisce una lettura (punto 2).
- **`quadroLimiti(polsi, adesso)`**: per ogni finestra `letturaPiuRecente`. Prima vince la **finestra più nuova** (`resettaIl` più lontano, a passi di 5 min), poi il `lettoIl` più recente. Mai la percentuale più alta.
- **`statoFinestra`** restituisce `fresca | vecchia | azzerata`:
  - vecchia oltre `LETTURA_VECCHIA_MS` = 20 min;
  - azzerata quando `resettaIl <= adesso`, con `percento` 0 e `percentoLetto` conservato;
  - c'è sempre un'`etichetta` completa («63% usato · si azzera 14:20 · letto 3 minuti fa»).
- **`contestoDa`**: solo ingresso. Se `used_percentage` manca, si ricava dagli stessi numeri; dopo `/compact` il contesto è sconosciuto. `etichettaContesto` è uguale ovunque.

# Chi la usa (stessi numeri ovunque)

- **`/api/consumi`** (`arricchisciConsumi` in `index.ts`):
  - `limiti` con le etichette;
  - `chatAperte`, cioè tutte le chat aperte, con `contestoEtichetta`;
  - `freno` = `frenoDaiLimiti(limitiPerFreno(quadro))` + `testoFreno`.
- **Pagina** (`limitiHtml`) e **app** (`fraseFinestra`, `rigaContesto` in `Computer.kt`) mostrano le frasi del computer così come sono. Non ricalcolano niente.
- **Freno degli autopiloti** (`harness.ts`):
  - il Gestore manda il quadro a `/stato-programma`;
  - `leggiStatoProgramma` prende `percentoLetto` + `lettoIl`;
  - `frenoDaiLimiti` lo rigiudica con la stessa `statoFinestra`: azzerata = via libera in attesa; vecchia = vale ancora, ma il motivo lo dice.

**Test:** `tests/shared/limiti-piano.test.ts` (un caso per difetto), `tests/main/consumi-pagina.test.ts`, `ConsumiTest.kt`, `tests/shared/polso-chat.test.ts` (aggiornato: `usati` senza output).

# La colonna «Consumi e limiti» sul PC

`ColonnaConsumi.tsx` usa la stessa ossatura di `PannelloDomande` (classe `domande-lato` + `consumi-lato`):
- si apre dal tasto «Consumi» della console;
- le preferenze sono `consumiLaterali` e `larghezzaConsumi` (300–760 px);
- rilegge `/api/consumi` ogni 15 s.

`colonne-laterali.ts` → `restaApertaLAltra`: le due colonne stanno insieme se la finestra ha posto per tutte e due più 520 px di mosaico. Se non c'è posto, aprirne una chiude l'altra (`commutaColonna` in `App.tsx`).

**Trappola:** la riga di stato di SierraDeck si installa solo se l'utente non ne ha una sua in `~/.claude/settings.json`. Con una riga sua, i limiti non arrivano mai.
