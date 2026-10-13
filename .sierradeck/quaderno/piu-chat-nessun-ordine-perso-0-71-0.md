---
titolo: "Più chat insieme, nessun ordine perso: coda e domande su disco, una fermata una risposta (0.71.0)"
quando: 2026-10-13T14:12:00+02:00
tag: ["autopilota", "consegne", "domande", "riavvio", "idempotenza", "0.71.0", "trappola"]
---

# Il difetto vero

Il 12/10, più volte: «Il servizio è ripartito e la domanda aperta è andata perduta: torno al lavoro e la rifaccio». La causa: le domande aperte (`domande.ts`) e la coda delle consegne (`consegne.ts`) stavano **solo in memoria**.

# Cosa sta su disco adesso (`<autopiloti>/servizio/`)

- **`domande-aperte.json`**: il registro delle domande, ognuna con il suo contesto (`ricorda`: di chi è, quale chat, cosa chiedeva).
  - Al riavvio, chi ritrova la sua domanda resta in attesa («la domanda aperta è stata ritrovata»).
  - Una risposta arrivata dopo prende la strada della risposta tardiva e riprende la chat giusta.
  - `riportaChiAspettava` («andata perduta») vale solo per chi non ha più la sua domanda, cioè i file di prima.
- **`coda-consegne.json`**: le istruzioni messe e non ancora ritirate. Al riavvio ripartono, e il numero `c-N` non torna indietro.
- **`consegne-scritte.json`** (nei dati del PC, `avviaRitiro`): le chiavi delle consegne già scritte. Dopo un riavvio, una consegna ripresentata si conferma senza riscriverla.
- **`tempi.jsonl`** e **`memoria.json`**: vedi le schede su velocità e intelligenza.

La cartella `servizio/` è una sottocartella apposta: `archivio.elenca()` legge ogni `*.json` della cartella degli autopiloti e mette da parte come «illeggibile» quelli che non sono autopiloti (la trappola del 12/10 con `consegne-numero.json`).

# Una fermata, una risposta

Lo stesso Stop può arrivare due volte (hook ripetuto, rete che riprova). `stopUnaVolta` usa una chiave del turno: autopilota, chat, sessione, trascrizione e ultimo messaggio. Il secondo Stop, se arriva mentre il primo è ancora in giudizio, aspetta e riceve la stessa risposta. Solo mentre è in corso: due turni diversi possono avere lo stesso testo.

# I testi in coda nel sottofondo

`coda-ceduta.ts`, 13/10: quando la finestra si riaggancia a una chat in sottofondo, i testi in coda vanno alla finestra con l'id della consegna del servizio. Così il «partita» arriva al servizio. Se nessuna finestra la mostra, tornano nel sottofondo; se nemmeno lì si può, tornano nella coda dell'autopilota. Prima andavano persi: è successo con la c-14.

# Le consegne non si rubano la finestra

Questo c'era già dalla 0.56.1 (il turno fra workspace) e dalla 0.60.8 (il sottofondo, che non cambia lo schermo). Per chat diverse le consegne non si sostituiscono (`metti` sostituisce solo per la stessa chat).

# Test

- `domande-su-disco.test.ts`
- `coda-su-disco.test.ts`, con tre chat e il riavvio
- `coda-ceduta.test.ts`
- `server.test.ts`, che copre:
  - «la domanda aperta sopravvive al riavvio del servizio»;
  - «tre chat insieme»: tre Stop nello stesso istante, ognuna con le sue istruzioni, un supervisore per chat;
  - «una fermata, una risposta».
