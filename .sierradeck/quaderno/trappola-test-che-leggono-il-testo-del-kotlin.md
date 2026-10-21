---
titolo: "Trappola: i test che leggono il testo dei file Kotlin cadono quando cambia una firma"
quando: 2026-10-21T18:10:00+02:00
tag: ["test", "android", "trappola", "criteri"]
---

Alcuni test vitest non provano l'app: aprono un file `.kt` e cercano un pezzo di testo preciso. Due esempi sono `tests/main/copia-incolla.test.ts` e `tests/shared/menu-principale.test.ts`. Quando un'altra chat cambia la firma di una chiamata, il test diventa rosso anche se l'app funziona. Può succedere con `items(...)` che diventa `itemsIndexed(..., key = …)`, o con un argomento in più.

**21/10:** con la velocità della 0.83.0 (c-48) sono caduti due criteri di main:
- `items(messaggi) { b ->` era diventato `itemsIndexed(messaggi, key = …)`. Il test usava `indexOf` senza controllarne l'esito: con -1 tagliava un pezzo vuoto e diceva «expected '' to contain 'SelectionContainer'».
- `domandeInCima(api, domande)` aveva preso l'argomento in più `firma`.

Corretto da c-54 (`dd3979e5`).

Come evitarlo:
- in quei test, cercare solo l'inizio della chiamata (`domandeInCima(api, domande`), non la chiamata intera;
- controllare che l'`indexOf` trovi qualcosa (`expect(i).toBeGreaterThan(-1)`), così l'errore dice cosa manca davvero;
- chi cambia una firma nel Kotlin cerchi il nome anche in `tests/`: `git grep -n "nomeFunzione" -- tests`.

Le copie delle chat (worktree) non hanno `node_modules`. Per misurare si lancia vitest nella cartella principale, solo in lettura. Non si crea un collegamento a `node_modules` nella copia.

Vicina: `2026-10-19-trappola-nomi-dei-test-kotlin-senza-punti.md`.
