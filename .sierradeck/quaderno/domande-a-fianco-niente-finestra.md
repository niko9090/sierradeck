---
titolo: "Domande sempre a fianco della chat, niente finestra; nessuna domanda persa (0.37.2)"
quando: 2026-10-01T18:00:00+02:00
tag: ["domande", "autopilota", "colonna", "telefono", "decisione-nicholas"]
---

# La decisione e il difetto

Nicholas (01/10), a una domanda dell'autopilota che gli era arrivata nella vecchia finestra modale: «non vedo tutte le domande. devo aggiornare il programma per rendere applicata la modifica che ti ho chiesto di farmele vedere a fianco della chat e non come finestra??».

**Decisione:** le domande vanno a fianco della chat, non in una finestra.

**Cause.**
1. **La modale c'era ancora.** La 0.36.0 aveva aggiunto la colonna laterale, ma `DomandaModale` (in `App.tsx`) continuava ad aprirsi sopra tutto. La colonna invece partiva chiusa e non si apriva mai da sola.
2. **Domande perse.** `conversazioniDomande` faceva una sola conversazione per autopilota: con due domande aperte dello stesso autopilota la seconda spariva. Capita con due chat della stessa flotta, oppure con «chiedi» del supervisore più «Pubblico adesso?».
3. **Chat degli altri PC.** Le chat degli altri PC accesi che aspettano (dal loro battito) non arrivavano mai nelle Domande.
4. **Conteggi diversi.** Il telefono e la pagina contavano `domande + chat.chiede` da `/api/stato` e lasciavano fuori gli autopiloti pronti che aspettano il via. La colonna invece li contava.

# La correzione

- **Niente più modale.** `DomandaModale.tsx` è tolto. `App.tsx` sonda `/api/domande` ogni 3 s e usa `domandeNuove(conversazioni, viste)` (in `shared/domande-conversazioni.ts`):
  - per una domanda mai vista apre la colonna, con la stessa regola del tasto (se manca lo spazio chiude i Consumi);
  - passa `evidenza` a `PannelloDomande`, che apre quella conversazione e la accende d'ambra per 8 s (`domande-pc__voce--nuova`);
  - non chiama `focus()`, così chi scrive in una chat non perde la tastiera;
  - le identità viste (`identitaDomanda`: `d:<id>` per una domanda del servizio, `via:<ap>` per il via, `k:<chat>:<testo>:<opzioni>` per un permesso) stanno in `localStorage['domande-viste']`. Chiusa a mano, la colonna si riapre solo per una domanda nuova.
- **Una conversazione per ogni domanda in più** dello stesso autopilota: `ap:<id>:<domandaId>`, «<nome> · un'altra domanda», con la sua risposta.
- **Chat degli altri PC accesi** che aspettano: `raccogliDomande({ altriPc })` le aggiunge come chat che hanno finito il turno, con id `pc:<pcId>:<sessione>` (`idChatAltroPc`).
  - `/api/scrivi` riconosce l'id e chiama `scriviAltroPc`; nel main questa cerca la chat per sessione sul Client di quel PC e le scrive.
  - Le chat dei PC spenti non compaiono.
- **Un conteggio solo:** `quanteAspettano(conversazioni)`.
  - `/api/domande` restituisce `chiedono` e `/api/stato` `domandeInAttesa`.
  - Il PC (tasto e colonna), la pagina (`domandeInAttesa(s)`) e l'app (`domandeInAttesa(Stato)` in `Conversazioni.kt`) mostrano quel numero.
  - Da un computer più vecchio si conta come prima.

# Test

- `tests/shared/domande-tutte.test.ts`: uno stato con una domanda per ogni tipo, e nessuna deve mancare. I tipi sono:
  - domanda iniziale, «chiedi», «Pubblico adesso?» dello stesso autopilota, via;
  - permesso, chat che ha finito, chat di un altro PC acceso;
  - la governata e il PC spento esclusi.
  - Lo stesso test controlla il conteggio (5) e le domande nuove contro quelle viste.
- `tests/main/client-rotte.test.ts` («tutte le domande e un conteggio solo»): `chiedono` è uguale a `domandeInAttesa`, la chat di questo stesso PC non è doppia, `/api/scrivi` con `pc:` funziona e con il PC che non risponde dà 502.
- `tests/renderer/colonna-domande.test.ts`: la modale non c'è; apertura ed evidenza; niente `focus()`.
- `DomandeContoTest.kt`.
