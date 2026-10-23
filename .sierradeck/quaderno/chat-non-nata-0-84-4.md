---
titolo: "Chat il cui terminale non nasce: riaperta da sola o sostituita (0.84.4)"
quando: 2026-10-23T12:15:00+02:00
tag: ["0.84.4", "autopilota", "mai-fermo", "terminale", "worktree", "revisione"]
---

## Il guasto del 23/10 (registro del PC, UTC)

- Dalle **04:04 alle 09:48** la Revisione del ramo c-98 non è mai partita: «resa dopo 90 s, terminale mai nato», una consegna ogni 11 minuti (40 rese in tutto nel registro del giorno).
- **La causa vera** era una riga `[ERRORE] … non si apre — cartella-sparita … pty:spawn: cwd non accessibile`. La cartella `…sierradeck-wt/ap-f1e631f5-c-98` non c'era più: c-98 era finita, il suo ramo era unito e tolto, e la sua copia era stata cancellata. La Revisione invece era rimasta «al lavoro», con quella cartella.
- Il giro mai fermo la trattava come una chat **muta**. L'ha sostituita due volte (c-115 → c-117 → c-118), e ogni chat nuova **ereditava la stessa cartella sparita**. Arrivato al tetto delle sostituzioni (2), l'ha ripresa 12 volte di fila (`ripresa.volte: 12`), senza fine.

## Come funziona adesso

La regola, pura, sta in `src/autopilot-host/non-nata.ts` (`rimedioNonNata`). La esegue `rimediaNonNata` in `server.ts`. Scatta in due modi:

1. **A ogni giro del guardiano** (`giriDaSoli`, prima della regola mai fermo): una chat in `lavoro`, non conclusa, con la cartella `mancante` o `non-git` (`deps.copia`). Non si aspettano 10 minuti di silenzio.
2. **Dall'esito del PC**: alla resa con il riquadro trovato ma senza terminale, il renderer scrive `consegna X: non consegnata (non nata: …)`. `esitoDaPasso` lo legge, il main lo passa al servizio con `nonNata: true`, e il servizio trova la chat dalla linguetta Istruzioni (`chatDellaConsegna`).

Cosa si fa, sempre senza domande a Nicholas:

| Caso | Mossa |
|---|---|
| Revisione di un ramo che non c'è più (autore finito/concluso, o ramo assente) | **superata**: la chat si chiude e va nel recupero; i suoi messaggi in coda si tolgono |
| Copia sparita ma ramo ancora presente (della chat, o dell'autore per la Revisione) | **ricrea**: `creaWorktree` rimette la copia sul ramo e **la stessa chat** riparte lì («riaperta da sola») |
| Copia sparita e ramo sparito (chat di sviluppo) | **sostituisci** con una chat nuova che ha una copia sua |
| Cartella presente ma il terminale non nasce | **sostituisci** subito con una chat nuova nella stessa cartella e sullo stesso ramo; i messaggi in coda passano alla nuova |
| 3 chat di fila sullo stesso compito non nate (`nonNate`, su disco) | **tetto**: una riga nel diario e un avviso a Nicholas (non una domanda); nessuna chat in più |

La sostituzione per «non nata» **non conta** fra le sostituzioni per silenzio del giro mai fermo, perché la chat non è stata zitta: non è mai partita. Ha un suo contatore, `nonNate`.

## Trappole

- **Una chat nuova non deve ereditare un posto che non c'è.** `chatCheSostituisce` copia `cartella` e `ramo` della vecchia: va bene per il silenzio, ma è sbagliato quando la cartella è sparita.
- **La Revisione era esclusa dal controllo della copia** (`chatSenzaLavoro`: «se sparisce, il verdetto arriva lo stesso»). Vale per il verdetto, ma la chat stessa non può nascere in una cartella che non c'è.
- **Mai ricreare il lavoro di una chat già conclusa** (`conclusa` impostata dopo l'unione): il giro la salta.
- Test: `tests/autopilot-host/non-nata-0-84-4.test.ts`, con la flotta vera del 23/10 (c-98, c-115, c-117, c-118).
