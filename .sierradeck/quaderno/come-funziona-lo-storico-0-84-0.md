---
titolo: "Come funziona lo storico dei lavori (0.84.0)"
quando: 2026-10-21T18:30:00+02:00
tag: ["0.84.0", "autopilota", "storico", "quaderno"]
---

## Cosa fa

Ogni autopilota tiene `.sierradeck/quaderno/storico-<nome del lavoro>-<id corto>.md`
nella cartella del progetto: chat aperte, consegne, unioni, chiusure, release e
decisioni di Nicholas, in italiano piano, giorno per giorno, **una volta sola**
ciascuna (stessa frase dello stesso tipo = doppione, resta la prima).

## Come funziona

- `src/autopilot-host/storico.ts`: regole (regex) che riconoscono le righe del
  diario (`decisioni`) scritte da `server.ts` e le riscrivono in frasi. Le righe
  tecniche (proseguito, supervisore →, pause, criteri) restano fuori.
- `server.ts`, dentro `salva`: `aggiornaStorico` riscrive la scheda **solo se
  c'è una voce nuova** (impronta in memoria: numero voci + ultima). Dopo un
  riavvio del servizio la riscrive una volta, identica.
- Il nome del file va nell'archivio (`Autopilota.storico`): la pagina del
  telefono e l'app mostrano il tasto **«Storico»** nella scheda dell'autopilota,
  che apre direttamente quella scheda del quaderno. Sul PC è nel Quaderno (tag
  `storico`).

## Trappole

- **Se cambi il testo di una riga del diario in `server.ts`** (es. «apro la
  chat…», «unito il ramo…», «pubblicazione: hai detto sì…»), aggiorna la regola
  in `storico.ts` e il test `tests/autopilot-host/storico.test.ts`: altrimenti
  quella voce sparisce dallo storico in silenzio.
- Non chiamare a mano una scheda `storico-*.md`: è il nome riservato ai file
  generati, e l'antiloop (`improntaLavoro` in `criteri-veloci.ts`) li ignora,
  perché una riga di storico non è lavoro della chat. L'impronta dei criteri
  esclude già tutto `.sierradeck`.
- Pagina: in «Adesso», con un autopilota aperto, ora si disegna anche il
  pannello Quaderno (prima il tasto «Quaderno» lì apriva un pannello che si
  vedeva solo in Progetti).
- Lo storico si ricostruisce dal diario intero: oggi il diario non si accorcia;
  se un giorno lo si taglia, lo storico va reso «a sola aggiunta».
- Nella copia di lavoro di una chat manca `node_modules`: per i test basta una
  giunzione `mklink /J node_modules <cartella principale>\node_modules` (è ignorata da git).
