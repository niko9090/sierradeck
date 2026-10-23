---
titolo: "La prova di 2 ore del «mai fermo»: dov'è lo script e come si lancia"
quando: 2026-10-23T12:30:00+02:00
tag: ["prova", "mai-fermo", "autopilota", "release"]
---

La prova delle 2 ore richiesta a ogni release del «mai fermo» (0.84.1, 0.84.3)
usa lo script `scripts/prova-mai-fermo.ts`. Per la 0.84.1 c-72 l'aveva lasciato
solo nella sua cartella temporanea, e c-93 ha dovuto ripescarlo: adesso sta nel
progetto.

- Gira `creaServer` vero (orologi veri, guardiano ogni minuto, riavvio a metà)
  con il Gestore e 4 chat **simulati**, seme fisso. Non apre chat Claude vere.
- Solo dati di prova: `PROVA_DIR` in una cartella temporanea, `SIERRADECK_PROVA=1`,
  APPDATA di prova, porta 47683. Mai il servizio vero, mai «Installa».
- Si compila con esbuild (alias `@src` e `@shared`), comandi in cima allo script.
  Serve `node_modules` nella copia: una junction verso quella della cartella
  principale, da togliere poi con `rmdir` (mai una cancellazione ricorsiva).
- Esito in `esito-prova.json`: tratto più lungo senza chat al lavoro, tratti
  oltre 15 minuti, chat mute più a lungo (anche fra sorelle al lavoro), motivi
  dei giri, riprese, sostituzioni, doppioni.
- Limite noto: la memoria dei criteri vale per commit e nella prova il codice
  non cambia, quindi i criteri «verdi» degli ultimi 8 minuti non portano a «finito».
- Prima delle 2 ore conviene un giro di fumo con `PROVA_MINUTI=3` (circa 3
  minuti): dice subito se lo script compila ancora col codice nuovo. Il
  23/10 (c-122, 0.84.4) su main `df1a2ed2` compila e gira pulito. La prova che
  vale va lanciata solo DOPO l'unione dei rami che toccano `src/autopilot-host`
  (`server.ts`, `mai-fermo.ts`, `domande.ts`): ogni loro modifica la invalida,
  come nei tre giri buttati della 0.84.3 (`rapporto-0-84-3.md`).
- **Come aspettarla senza girare a vuoto** (0.84.4, c-122): un «aspetto» che
  chiude il turno ne fa aprire subito un altro dal supervisore. Il 23/10 sono
  stati 44 giri uguali. Lo `sleep` in primo piano è bloccato. Funziona invece
  un piccolo script node in primo piano (timeout 600 s) che legge il diario
  ogni 30 secondi ed esce dopo 9 minuti, oppure prima se trova
  `[prova] finita`, `DOPPIONE` o il diario fermo da oltre 25 minuti. Si
  rilancia finché non esce per uno di questi tre motivi, tutto nello stesso
  turno. L'esito vero si scrive solo alla fine (`esito-prova.json`).
- Esito 0.84.4 (codice `c54fbcd7`): prova pulita; numeri in `rapporto-0-84-4.md`.
