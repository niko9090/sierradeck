---
titolo: "Telefono: le scritte mischiate e l'invio che andava a capo"
quando: 2026-08-27T23:05:00+02:00
tag: ["mobile", "android", "terminale", "client", "api"]
---

## Due difetti, una radice comune: il terminale non è un testo

### 1. Le scritte mischiate
Dal telefono la chat si leggeva a pezzi sovrapposti. Non era l'app: era il
computer a mandare i dati sbagliati.

`ultime-righe.ts` prendeva il flusso grezzo del pty, lo spezzava agli «a capo» e
teneva in fila gli ultimi pezzi. Ma il flusso di un pty **non è un testo**: è una
sequenza di istruzioni per dipingere uno schermo. Claude Code è un'interfaccia a
tutto schermo e si riscrive in posizione. Da lì:
- ogni **ridisegno** diventava righe nuove accodate alle vecchie → la stessa cosa
  ripetuta più volte;
- un **ritorno a capo da solo** (`\r` senza `\n`) non è un separatore per
  `split(/\r?\n/)`: il testo vecchio e quello nuovo finivano incollati sulla
  stessa riga. Quello era, letteralmente, il «mischiato».

**Correzione**: non si reinterpreta il flusso una seconda volta, si legge il
**risultato**. `xterm.js` sta già disegnando quella griglia nel riquadro; il
nuovo `src/renderer/schermo-terminale.ts` legge `term.buffer.active` (da `baseY`
in giù = quello che si vede adesso) e ne ricava le righe nude e le righe vestite,
ricostruendo le SGR dagli attributi di ogni cella (tavolozza → `38;5;N`, colore
pieno → `38;2;r;g;b`). Un registro `ptyId → schermo` fa da filo fra `Terminal.tsx`
(che registra all'arrivo dell'id e dimentica allo smontaggio) e `App.tsx` (che
annuncia le chat). Senza riquadro si torna al modo di prima invece di mostrare il
vuoto. Righe mandate: **24** invece di 14 — sono righe di schermo vero, tutte
diverse, non ridisegni.

Regola: il client non deve reimplementare un emulatore di terminale. Ce n'è già
uno, ed è quello che l'utente sta guardando.

### 2. L'invio che andava a capo
Scrivendo dall'app il testo arrivava nel campo della chat sul PC, andava a capo e
**restava lì** senza partire. `App.tsx` mandava `testo + CR` in una scrittura
sola: Claude Code riceve il blocco e lo legge per quello che sembra — del testo
incollato che finisce con un a capo — e **dentro un incollato l'a capo è una riga
nuova, non un invio**. È lo stesso motivo per cui gli appunti passano da
`term.paste` invece che da `write`.

**Correzione**: testo e invio separati, con 150 ms in mezzo
(`PAUSA_PRIMA_DELL_INVIO_MS`). L'invio diventa un tasto premuto dopo, come lo
premerebbe una persona.

## Costo da tenere d'occhio
L'annuncio delle chat gira **ogni 2 secondi per ogni riquadro**, anche senza
nessun telefono collegato, e adesso legge 24 righe di celle invece di prendere
una lista già pronta. È modesto, ma se un giorno si cerca lavoro sprecato: la via
è saltare del tutto la lettura quando non c'è nessun dispositivo accoppiato — il
Core lo sa, il renderer no. Vedi [[efficienza-punti-caldi]].

Vedi [[app-android-nativa]].
