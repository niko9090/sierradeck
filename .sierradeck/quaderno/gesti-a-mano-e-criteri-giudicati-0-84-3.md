---
titolo: "0.84.3 — Mai gesti a mano, «lo giudico io», chiusura con criteri non misurabili"
quando: 2026-10-23T09:30:00Z
tag: ["autopilota", "domande", "criteri", "0.84.3"]
---

Caso vero del 22/10: «Chiudi tu a mano l'autopilota del gestionale, visto che il programma non mi
lascia né chiuderlo né correggere il controllo del gruppo 3?» — scelte «Sì, lo chiudo io» /
«Correggo io il comando». Catena: criterio misurato-e-bocciato → correzione rifiutata dalla rete
(«quel comando misura, e boccia») → «finito» rifiutato → domanda a Nicholas.

**Come funziona adesso (ramo c-89)**

- `src/shared/domanda-chiara.ts`: `GESTO_A_MANO` (chiudere, spostare, cancellare, correggere,
  lanciare, incollare, modificare… con «tu», «… io», «puoi/devi …», verbo + «a mano») e
  `NOME_INTERNO` («gruppo 3», «lotto 2», «D1»). Entrano in `noteDiChiarezza`: il supervisore
  riscrive una volta. **Installare NON è un gesto**: resta di Nicholas per regola.
- `src/autopilot-host/gesti-a-mano.ts`: se anche riscritta la domanda ha un gesto, un nome interno
  o sigle nella domanda/scelte, `scartaSeNonVa` la toglie: non si apre, la chat riceve
  `FAI_DA_SOLO`. **Mai una scelta presa al posto di Nicholas** (la consigliata può essere
  «Sì, installo»). Nel percorso della chat il controllo sta DOPO «già risolta dallo stato».
- Domande già aperte: `ricontrollaDomande` le chiude come superate (`domandaDaNonFare`), anche la
  vecchia «Chiudo lo stesso il lavoro, o correggi prima il comando…?»; la chat bloccata (o
  l'autopilota a chat sola in `attesa`) riparte con la strada (`riprendiDopoSuperata`).
- `src/autopilot-host/criteri-giudicati.ts`: i rifiuti di correzione si **contano dalla storia**
  (`rifiutiDi`: righe «correzione rifiutata per «X»» e «Il comando del criterio «X» non va bene»),
  così valgono anche per autopiloti nati prima. Al 1° rifiuto: motivo + un altro tentativo. Al 2°:
  `criterio.giudicato = {il, perche}`, riga a Nicholas (annota + avvisa), nessuna domanda.
  `esitiCheDecidono` toglie i giudicati prima di `applicaRete` e prima della rimisura del «finito».
- `applicaRete` con «finito» e criteri non misurati (e nessuno bocciato) → `finito` con
  `senzaMisura`; il servizio scrive `rigaChiusoSenzaMisura` (quale criterio, perché, recupero 30
  giorni, «Riprendi»). Un bocciato vero continua a impedire la chiusura.

**Trappole**
- `conservaCambiUtente` porta dal turno solo alcuni campi del criterio: `giudicato` va copiato
  esplicitamente, o si perde al salvataggio.
- In `server.ts` il nome `Decisione` è la riga di storia (`@shared/autopilota`); la mossa è
  `Mossa` (alias di `Decisione` di `./decisione`).
- `parseAutopilota` vuole `versione: 1`: nei test di rilettura va aggiunta a mano.
- I test che fissavano la vecchia regola «non misurato → domanda» sono stati cambiati di proposito
  (rete-sicurezza.test.ts), e due domande di prova con sigle sconosciute riscritte senza sigle.

Test: `tests/autopilot-host/gesti-a-mano.test.ts`, `tests/autopilot-host/criteri-giudicati.test.ts`.
