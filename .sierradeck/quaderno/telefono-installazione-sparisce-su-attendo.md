---
titolo: "La schermata di installazione sul telefono spariva su «attendo» (app 2.26.5)"
quando: 2026-09-09T11:40:00+02:00
tag: ["android", "aggiornamento", "bug"]
---

# Il difetto

«L'aggiornamento dal cellulare spesso esce e non fa vedere tutta la
procedura.» In `App.kt` il giro di `/api/stato` chiamava
`Installazione.finita()` quando la fase era `attendo` — pensata come «non
sta installando». Ma dalla 0.12.x l'aggiornamento **aspetta** che le chat
finiscano il turno (fase `attendo`, con `chatOccupate`): è l'inizio della
procedura, non un rifiuto. Premuto «Installa», la schermata spariva quasi
subito; il resto (chiusura, installer, ritorno) lo vedeva solo chi era
fortunato col polling di 2 s.

# La cura

- `App.kt`: si esce solo su `pronto` + `errore` (rifiuto vero). Il «finito»
  lo decide `SchermoInstallazione` quando `/api/ciao` risponde con la
  versione nuova.
- `SchermoInstallazione.kt`: legge `fase`/`chatOccupate` da
  `/api/aggiornamento`; in `attendo` titolo «Aspetto che le chat finiscano»
  e racconto con il numero; il tetto dei 10 minuti (`troppo`) riparte
  dall'ultimo `attendo` visto (`attendoFino`).
