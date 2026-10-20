---
titolo: "tests/main a metà (20/10, c-28): nessun file appeso, solo lento a PC carico"
quando: 2026-10-20T19:30:00+02:00
tag: ["test", "vitest", "tempi", "0.81.0", "criteri"]
---

Cercato il file che «tiene appeso» `npx vitest run tests/main --maxWorkers=2`, che è scaduto due volte ai 20 minuti.
Il PC era carico: c'erano molte chat al lavoro e la bash di Git dava «couldn't create signal pipe».

| Prova | File | Esito | Tempo |
|---|---|---|---|
| prima metà (`--reporter=verbose`, tetto 900 s) | 95 | **tetto superato**: 88 file chiusi, 7 no | >900 s |
| seconda metà | 95 | verde | 385 s |
| i 7 file non chiusi, uno per volta | area-notifica, attesa-drive, client-pagina-microfono, conflitti-a-catena, consegna-vera, dump-pagina, finestre-pannello-separate | **tutti verdi** | 53–157 s ciascuno (area-notifica 157 s) |

**Conclusione:** nessun file resta appeso da solo. Il rosso è dovuto al tempo totale, che col PC carico supera il tetto.

Il file più lento della prima metà era `file-autopilota.test.ts`, con un test da 40 s. c-17 lo ha alleggerito (498f2b7f).

Trappola: i lanci di vitest e gradle fatti da una chat per «capire» il problema aggiungono carico. Così fanno scadere anche i criteri delle altre chat. Il supervisore ha chiesto di non lanciarne altri.
