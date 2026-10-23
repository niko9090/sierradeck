---
titolo: "Collaudo del Punto dell'autopilota (0.84.3): cosa va e 4 difetti"
quando: 2026-10-23T02:00:00+02:00
tag: ["0.84.3", "punto", "collaudo", "autopilota", "mai-fermo", "sigle"]
---

Collaudo c-96 (23/10) del Punto fatto da c-90 (`punto-autopilota-0-84-3.md`). Test:
`tests/shared/collaudo-punto-0-84-3.test.ts` (regole pure) e
`tests/autopilot-host/collaudo-punto-0-84-3.test.ts` (dal vero nel servizio, archivio in una
cartella temporanea, nessuna chat vera). I difetti sono `it.fails`: chi li corregge toglie il `.fails`.

## Cosa va (provato)

- Nel Punto una chat senza ruolo è «Una chat», il compito senza «(c-N)».
- Nel servizio: sorella al lavoro, l'altra zitta → al minuto 15 **una** riga
  «Interfaccia («…») è ferma da 15 minuti senza segnali: le riscrivo l'ultima istruzione.»,
  la chat ripresa con l'ultima istruzione, la sorella non toccata; a 14 minuti niente.
- Ancora zitta dopo la ripresa → riga «non risponde nemmeno dopo la ripresa…» e
  «Interfaccia: comincia «…»» per la chat nuova; nessuna sigla nelle righe dei traguardi.
- «Da te» con 0, 1, più domande.

## Difetti

- **D1 — Sul PC, nella Panoramica, le chat hanno ancora le sigle e nessun segnale.** Lì il Punto è
  `senzaChat` (`WorkspacePanoramica.tsx:215` → `ChatAutopilota soloConversazione`) e le righe stanno in
  «Adesso» (`AdessoAutopilota`, `DalVivoAutopilota.tsx:153`) che usa `adessoDi` com'è: chat senza ruolo
  = «c-14» (`adesso.ts:85`), compito con «(c-14)», niente segnale. Pagina e app invece hanno le chat nel
  Punto col segnale: il PC dice meno del telefono. Passi: Panoramica di un workspace con autopilota, una
  chat senza ruolo con «(c-N)» nel compito.
- **D2 — Chi aspetta una sorella al lavoro è trattata da «ferma».** `SEGNALE: aspetto c-1` mentre c-1
  lavora: a 15 minuti il giro da solo la riprende (`mai-fermo.ts:192`, il filtro guarda solo il
  silenzio) e scrive «è ferma da 16 minuti senza segnali», di nuovo ogni 15 minuti finché la sorella
  lavora. Nel Punto la stessa riga è rossa «nessun segno da 16 min» (`adesso.ts:108`) accanto al
  segnale ambra «aspetta Sviluppo».
- **D3 — `senzaSigle` lascia frasi rotte.** «La Revisione di c-90 e c-91» → «La Revisione di e»;
  «…del gestionale del gruppo 3» → «…del gestionale del». Sono compiti veri della lista. Il test di c-90
  accetta «del gestionale del» (`punto-autopilota.test.ts:44`): va cambiato insieme.
- **D4 (minore) — Senza la Panoramica si leggono le note di lavoro, non le righe.** Nella colonna
  dell'autopilota (`App.tsx:2190`) e nel diario (`DiarioAutopilota.tsx:363`) `ChatAutopilota.tsx:53`
  toglie i traguardi e mostra le note: «c-2 è ferma da 15 minuti…» con la sigla, e alla riga dei 5
  minuti ancora «a 60 minuti la metto da parte» (`server.ts:1662`) mentre il traguardo dice 15.

## Trappola

- Nelle prove nel servizio, contare le righe con `conversazione(a).filter(b => b.tono === 'traguardo')`:
  la stessa ripresa ha anche la nota di lavoro («c-2 è ferma…») e la riga del giro, e senza il filtro
  sembrano doppioni.
