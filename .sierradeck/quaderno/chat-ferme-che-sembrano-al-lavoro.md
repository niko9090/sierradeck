---
titolo: "Le chat ferme che sembravano al lavoro (e l'avviso di pausa a tutti)"
quando: 2026-08-31T00:45:00+02:00
tag: ["aggiornamenti", "terminale", "autopilota", "difetto"]
---

# Il flusso non basta: dopo un riavvio, chi ha finito tace

Sintomo: prima di installare la 0.12.44 l'avviso «finisci quello che hai in
mano e fermati» è finito **in tutte le chat**, comprese quelle ferme da ore.

## La causa

`aspetta` (ha finito e aspetta te) si giudicava con `terminalePronto`, che
guarda solo il **flusso** del PTY: serve `prontoVisto`, cioè aver visto passare
il prompt nei dati.

`prontoVisto` vive nella memoria del renderer, che nasce con la finestra. Un
riquadro che **riaggancia** un terminale già acceso — è quello che succede a
ogni riavvio, e a ogni finestra riaperta dall'area di notifica — non riceve
niente, perché quella chat **tace proprio in quanto ha finito**. `prontoVisto`
resta falso per sempre, `aspetta` resta falso, e per `inVolo` quella chat «ha
qualcosa in mano»: l'aggiornamento la avvisava, e poi aspettava fino ai dieci
minuti di `ATTESA_QUIETE_MS` una quiete che c'era già.

Il difetto colpiva anche le consegne dell'autopilota e la ripresa dopo
l'aggiornamento, per la stessa ragione.

## Il rimedio: due fonti, non una

`chatAspetta(attivita, schermo, adesso)` in `ultime-righe.ts`:

1. terminale morto → non aspetta nessuno;
2. il flusso ha visto il prompt → **comanda il flusso** (`terminalePronto`), che
   è più preciso sui millisecondi — ed è quella precisione che evita di
   scrivere in mezzo a un ridisegno;
3. altrimenti si legge lo **schermo disegnato** (`righeDiPty`, il buffer xterm):
   `esc to interrupt` = sta lavorando; `❯` / `bypass permissions` = campo
   disegnato e nessuno che ci scrive; niente dei due = si resta prudenti
   (`false`).

Lo schermo è **lo stato**, il flusso è il *racconto di come ci si è arrivati*.
Dopo un riaggancio il racconto manca e lo stato c'è: era l'unica fonte che
poteva rispondere.

In `App.tsx` c'è un solo `aspettaOra`, usato da tutti e tre i chiamanti
(annuncio al telefono, consegne, ripresa). Prima erano tre copie della stessa
riga, ed è così che una risposta può restare diversa dalle altre per giorni.

Prove: `tests/renderer/ultime-righe.test.ts`, in particolare «il riquadro
riagganciato dopo un riavvio: tace perché ha finito».
