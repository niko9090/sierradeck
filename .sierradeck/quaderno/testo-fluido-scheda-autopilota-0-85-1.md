---
titolo: "Testo a scatti nella scheda dell'autopilota (0.85.1): cause, misure, cosa manca"
quando: 2026-10-23T23:30:00+02:00
tag: ["0.85.1", "renderer", "prestazioni", "chat-autopilota", "doppione"]
---

**Correzione già fatta da c-143** (commit `1dadc186` sul ramo `ap/ap-f1e631f5/c-143`, da unire dopo la Revisione). c-149 l'ha rifatta in parallelo senza saperlo: il suo ramo **non porta codice** (doppione, chiudere senza unire). Prima di rifarla, `git log --all --grep "fluido"`.

## Le due cause (misurate, stessi numeri di c-143)

1. **Il testo del campo stava nello stato di `ChatAutopilota`.** Ogni lettera ridisegnava tutta la chat: conversazione ricalcolata (`conversazione` + `separaConversazione` ≈ 30–40 ms con 600 righe nel diario), il Punto (≈ 13 ms) e tutte le righe.
2. **`toLocaleTimeString('it-IT', …)` per l'ora di ogni riga.** Costruisce un formato nuovo a ogni chiamata: 700 righe ≈ 190 ms solo per gli orari. Con un `Intl.DateTimeFormat` fatto una volta: ≈ 15 ms.

Misura (vitest, senza DOM: tempo di disegno del componente che tiene il testo, autopilota finto con 600 decisioni, 120 battute, 12 chat):
- **prima: ≈ 620 ms per lettera** (c-143: 643 ms)
- **dopo: ≈ 2,3 ms per lettera** (c-143: 2 ms)

Nei test non c'è jsdom né `@testing-library`: il Profiler di React non si può far girare, si usa `renderToStaticMarkup` cronometrato. I numeri sono in modalità sviluppo di React (più lenti del programma installato), ma il rapporto prima/dopo è quello che conta.

## Cosa manca dopo l'unione di c-143 (piccolo, da fare sopra il suo codice)

- Il suo `CampoAutopilota` **non è in `memo`** e riceve `onManda`/`disfa` come funzioni nuove a ogni disegno: ogni rilettura dal servizio che cambia l'autopilota (ogni 5 s mentre lavora) ridisegna anche il campo. Il compito chiedeva «niente aggiornamenti dal servizio che ridisegnano il campo». Rimedio: `memo` con un confronto che guarda solo id, `campoPronto`, testo del «Disfa», `inCorso`, `errore`, e la funzione presa da un `useRef`.
- `conversazione(...)` e `separaConversazione(...)` in `useMemo` su `[autopilota, soloConversazione]`.
- Con un diario di una giornata la chat intera costa ancora ≈ 185 ms (sviluppo) a ogni rilettura. Mostrare solo le ultime 200 righe con un tasto «Mostra le N righe più vecchie» lo abbassa, **ma** `tests/renderer/panoramica-al-lavoro.test.tsx` vuole il diario intero (riga `const battute = …` letterale): cambiarlo è togliere una cosa vista da Nicholas → chiedere a lui prima.
