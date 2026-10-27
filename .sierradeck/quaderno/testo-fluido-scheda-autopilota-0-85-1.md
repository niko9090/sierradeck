---
titolo: "Testo a scatti nella scheda dell'autopilota (0.85.1): cause, misure, cosa manca"
quando: 2026-10-23T23:30:00+02:00
tag: ["0.85.1", "renderer", "prestazioni", "chat-autopilota", "doppione"]
---

**In main con c-149 (23/10 notte).** c-143 aveva fatto la stessa correzione (`1dadc186`, sul suo ramo, mai unito); mentre c-143 aspettava, c-148 ha portato in main anche la sua guardia del PC. Allora c-149 ha messo la sua versione, che in più ha `memo`: **quando c-143 si unisce, per `ChatAutopilota.tsx` tenere quella di main** e chiudere il suo pezzo come doppione. Prima di rifarla, `git log --all --grep "fluido"`.

## Le due cause (misurate, stessi numeri di c-143)

1. **Il testo del campo stava nello stato di `ChatAutopilota`.** Ogni lettera ridisegnava tutta la chat: conversazione ricalcolata (`conversazione` + `separaConversazione` ≈ 30–40 ms con 600 righe nel diario), il Punto (≈ 13 ms) e tutte le righe.
2. **`toLocaleTimeString('it-IT', …)` per l'ora di ogni riga.** Costruisce un formato nuovo a ogni chiamata: 700 righe ≈ 190 ms solo per gli orari. Con un `Intl.DateTimeFormat` fatto una volta: ≈ 15 ms.

Misura (vitest, senza DOM: tempo di disegno del componente che tiene il testo, autopilota finto con 600 decisioni, 120 battute, 12 chat):
- **prima: ≈ 620 ms per lettera** (c-143: 643 ms)
- **dopo: ≈ 2,3 ms per lettera** (c-143: 2 ms)

Nei test non c'è jsdom né `@testing-library`: il Profiler di React non si può far girare, si usa `renderToStaticMarkup` cronometrato. I numeri sono in modalità sviluppo di React (più lenti del programma installato), ma il rapporto prima/dopo è quello che conta.

## Com'è fatta adesso (c-149)

- `CampoChatAutopilota.tsx`: il testo, «Manda», microfono e «Disfa» con il loro stato; `memo` con `stessoCampo`, che guarda solo id, `campoPronto` e testo del «Disfa». La funzione di chi sta sopra si prende da un `useRef`, quindi una rilettura dal servizio (ogni 5 s mentre lavora) **non ridisegna il campo**.
- `ChatAutopilota.tsx`: conversazione in `useMemo` su `[autopilota, soloConversazione]`, ora con `FORMATO_ORA` fatto una volta sola.
- Test: `tests/renderer/campo-autopilota-fluido.test.tsx` (stato fuori dalla chat, confronto di `memo`, misura con la lettera almeno 5 volte meno cara della chat intera).

## Resta aperto (decide Nicholas)

Con un diario di una giornata la chat intera costa ancora ≈ 185–375 ms (React in modalità sviluppo) a ogni rilettura che porta novità. Si potrebbero mostrare solo le ultime 200 righe, con «Mostra le N righe più vecchie», ma `tests/renderer/panoramica-al-lavoro.test.tsx` vuole il diario intero: è una cosa che Nicholas vede, quindi **chiedere a lui prima**.
