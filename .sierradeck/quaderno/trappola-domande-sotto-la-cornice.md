---
titolo: "Trappola: una cornice in fondo allo schermo nascondeva le domande"
quando: 2026-10-13T01:40:00+02:00
tag: ["domande", "telefono", "schermo", "0.70.0"]
---

Al telefono e alle Domande vanno le **ultime 24 righe** dello schermo di una chat (`righeDaSchermo` in `src/renderer/schermo-terminale.ts`), tolte le righe vuote in fondo.

Claude Code a volte lascia in fondo al riquadro una cornice ridisegnata da prima (il bordo della casella, «──── Lavoro-esempio ─»), dopo decine di righe vuote. Il taglio delle vuote si fermava su quella cornice, e le 24 righe erano tutte vuote: una domanda con le opzioni (AskUserQuestion) più in alto non arrivava né alle Domande né al telefono. Il segnale degli hook diceva «chiede», ma senza opzioni la chat finiva fra quelle «che hanno finito il turno».

Dalla 0.70.0 una cornice da sola in fondo, dopo righe vuote, si toglie (`eCorniceSola`, almeno 10 tratti e al più 40 altri caratteri). Una cornice attaccata al testo resta.

Per provarlo: in una chat della copia di prova, «usa AskUserQuestion per chiedermi…»; poi `/api/dentro` dà lo schermo vero (`righe`), e le Domande devono dire «Aspettano te 1».
