---
titolo: "La coda condivisa dei comandi di un progetto (0.15.0)"
quando: 2026-09-06T12:10:00+02:00
tag: ["drive", "progetti", "coda", "multi-pc", "consegna"]
---

# Cos'è

Una fila di istruzioni per progetto, sul Drive, cifrata come le presenze
(`coda-<id>` via `sincronia.scatola()`). Si scrive, si modifica e si toglie
da qualunque PC; la consegna il PC che ha il testimone del progetto, una
voce per giro di ronda (30 s), alla prima chat del progetto che «aspetta te»
o alla chat scelta (`sessione`). Nicholas: «una coda condivisa di comandi
che si possono piazzare, editare e lanciare in comune» — è solo lui su più
PC, quindi niente identità né chat fra persone.

# Com'è fatto

- `presenza.ts`: `VoceCoda { id, testo, creataIl, daNome, sessione?, stato:
  'attesa'|'consegnata', consegnataIl?, aNome?, aSessione? }`, `Coda { voci }`.
  Ronda: `coda / aggiungiInCoda / modificaInCoda / togliDallaCoda / pulisciCoda`
  (read-modify-write sulla scatola; una coda vuota si cancella dal Drive).
  `consegnaDallaCoda(s, p)` gira solo nei rami `chi === 'io'` con chat vive:
  prende la prima `attesa`, chiama `deps.consegna(p, voce)` e se torna un
  esito marca `consegnata` con `aNome`/`aSessione`/`consegnataIl`. Una per
  giro: la chat lavora quella prima di riceverne un'altra.
- `index.ts` `consegna`: cerca in `chatAperte` una chat `viva && aspetta`
  dentro il percorso locale del progetto (e con la `sessione` chiesta, se
  c'è) e scrive con `scriviNelRiquadro` (lo stesso canale del telefono:
  testo + invio separati). Se nessuna aspetta → `undefined`, la voce resta.
- `stati()` porta `inCoda` (quante in attesa), letto a ogni giro per ogni
  progetto (anche non mio).
- UI: `ModaleCoda.tsx` dal tasto «Coda…» accanto a ogni progetto nel
  pannello Account: elenco in attesa (modifica/togli), consegnate a parte
  (con «pulisci»), campo per aggiungere + destinatario (`progetti:chatDi`:
  le chat del progetto dall'archivio dei workspace). Ctrl+Invio = metti in coda.

# Limiti noti

- Due PC che modificano la coda nello stesso istante: l'ultimo scrive vince
  (oggetti piccoli, caso raro; non vale una fusione).
- Il telefono non vede ancora la coda.
- Se nessuna chat del progetto aspetta mai (tutte ibernate), la voce resta
  in attesa per sempre: si vede dal contatore «N in coda».
