---
titolo: "c-285: c-10 fa solo i numeri prima e dopo; rami, workspace e release restano a c-25 (20/10)"
quando: 2026-10-20T15:35:00+02:00
tag: ["0.81.0", "coordinamento", "rami", "analisi"]
---

Lo stesso elenco in 5 punti (rami, workspace sbagliati, numeri, release 0.81.0, chiusura chat) è arrivato a più chat (c-285 a c-10, c-286 a c-12, c-287 a c-16, c-290 a c-17). c-25 ha come compito proprio «Chiusura dei rami» (c-291).

Per non unire in due gli stessi rami in main:
- **c-10 fa solo il punto 3**: misure nuove sul main di oggi nella copia di prova e la tabella «prima e dopo» in `analisi-0-80-0.md`. Lo scrive sul suo ramo `ap/ap-f1e631f5/c-10`, con main già unito dentro (`ad7a7df1`), senza conflitti.
- **c-10 non unisce rami in main, non tocca i workspace e non fa la release.**
- Ramo c-10 per chi lo unisce: lavoro vero, già passato dalla Revisione.
  - `da4a60c`: avviso se la ripartenza dopo il freno fallisce; avvisi in attesa mandati allo spegnimento.
  - `9a338b2`: «Nicholas partecipe», punto 4, righe brevi solo per gli eventi che contano su PC, pagina e app (`righe-che-contano-0-81-0.md`).
  - più quaderno e la tabella dei numeri.

**Aggiornamento 16:30:** punto 3 fatto in `db268e9f` (sezione «Riepilogo prima e dopo per Nicholas» in fondo a `analisi-0-80-0.md`). Prima ho unito di nuovo main (fino a `027a8ac0`) nel ramo c-10, senza conflitti: il ramo si unisce in main in avanti, senza conflitti. Dopo il commit, solo il quaderno è cambiato.
