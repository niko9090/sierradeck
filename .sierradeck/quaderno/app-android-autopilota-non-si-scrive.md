---
titolo: "App Android: dall'autopilota non si riesce a scrivere (21/10), e come far arrivare un messaggio all'autopilota"
quando: 2026-10-21T13:00:00+02:00
tag: ["app", "android", "autopilota", "0.83.0", "difetto", "per Nicholas"]
---

## Il difetto (Nicholas, 21/10)
«Non riesco a scrivere nella parte autopilota perché l'app Android non è fatta bene e non si vede nulla, troppe info che occupano tutta la parte di schermo. Ristrutturazione completa, dove vedo e interagisco con tutto in modo semplice e veloce e comprensibile.»

Il dettaglio dell'autopilota sul telefono riempie lo schermo di informazioni, e il campo «Scrivigli» non si vede. Nicholas non può rispondere né dare ordini all'autopilota dal telefono. Per questo ha scritto in un'altra chat del progetto.

**Per la 0.83.0** (c-46, mappa in `app-android-0-83-0.md` § 4, righe 30-43):
- il campo per scrivere all'autopilota resta **sempre visibile in fondo**, sopra la tastiera, a qualsiasi scorrimento;
- sopra stanno poche righe: stato, chi lavora, la domanda aperta;
- tutto il resto si apre a richiesta.

Va provato con la tastiera aperta.

## Come far arrivare un suo messaggio all'autopilota da una chat
Il servizio degli autopiloti, in locale sulla porta 47630, ha `POST /autopiloti/<id intero>/dialogo` con corpo `{"testo": "…"}`. Risponde 202 `ricevuto` e mette il messaggio nel dialogo come scritto da Nicholas («tu»).
- L'id intero si legge da `GET /autopiloti`. `GET /autopiloti/<id>` non esiste («rotta sconosciuta»).
- Si usa solo con le sue parole, e si dice da dove arrivano.
- Il 21/10 il suo messaggio è passato così al dialogo di ap-f1e631f5.
