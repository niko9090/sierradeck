---
titolo: "La prova di 2 ore del «mai fermo»: dov'è lo script e come si lancia"
quando: 2026-10-23T02:00:00+02:00
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
