---
titolo: "Le foto delle prove sono fuori da git: copiarle nella cartella principale"
quando: 2026-10-21T17:45:00+02:00
tag: ["foto", "gitignore", "quaderno", "copie delle chat", "telefono"]
---

- Il `.gitignore` esclude `.sierradeck/quaderno/foto-*/` perché le foto possono mostrare percorsi della macchina. Non va forzato con `git add -f`.
- Le foto fatte in una copia di chat (`SierraDeck.sierradeck-wt/...`) **si perdono** quando chiudiChat toglie la copia. Vanno copiate in `.sierradeck/quaderno/foto-<versione>/` della cartella principale, dove restano sul PC fuori da git. Le schede devono dire dove sono.
- `manda_al_telefono` può scadere («The operation timed out») senza restituire un id. Allora `stato_invio_al_telefono` non serve. Non ripetere l invio alla cieca per non mandare doppioni: scriverlo nel rapporto e controllare la coda File del PC (21/10, c-52, foto della 0.83.0).
