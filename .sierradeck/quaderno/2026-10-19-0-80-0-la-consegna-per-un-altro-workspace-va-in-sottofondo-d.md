---
titolo: "0.80.0: la consegna per un altro workspace va in sottofondo da sola (cambia la regola 0.72.0)"
quando: 2026-10-19T12:34:51.323Z
tag: ["autopilota"]
---

Il 19/10 con 0c9d839, sul ramo ap/ap-f1e631f5/c-4, una consegna dell'autopilota per un workspace che non è davanti lavora in sottofondo e compare in «Al lavoro in sottofondo». Solo «Guarda» porta la finestra là. Sostituisce la regola 0.72.0, per cui la chat governata doveva essere sempre visibile nel suo riquadro e la finestra andava nel suo workspace dopo 45 s di tastiera ferma. La regola nuova viene dal criterio di Nicholas del 19/10: il workspace sullo schermo cambia solo quando lo sceglie lui. Ogni cambio passa da un punto unico che scrive nel registro «[schermo] «A» → «B» (causa)». Restano scoperti due casi: una chat nuova che chiede la cartella utente o Documenti mentre il progetto non esiste ancora da nessuna parte crea ancora la cartella del progetto; se il progetto vive su un altro PC, la richiesta viene rifiutata.
