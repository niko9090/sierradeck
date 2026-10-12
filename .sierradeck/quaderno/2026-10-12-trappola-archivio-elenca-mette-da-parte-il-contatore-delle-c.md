---
titolo: "Trappola: archivio.elenca() mette da parte il contatore delle consegne"
quando: 2026-10-12T20:17:10.829Z
tag: ["autopilota"]
---

12/10/2026: `apriArchivio().elenca()` (src/autopilot-host/archivio.ts) legge ogni *.json della cartella autopiloti, compreso `consegne-numero.json` (src/autopilot-host/index.ts). Non è un autopilota, quindi lo rinomina in `.illeggibile-N` (47 volte su PC-Fisso) e gli id delle consegne ripartono da c-1 a ogni riavvio. È lo stesso effetto del difetto della 0.57.1. Inoltre gli ordini dell'autopilota aspettano la fine del turno: con chat che lavorano più di 20 minuti, per Nicholas «l'autopilota non comanda». Va corretto nella versione unica 0.68.1/0.69.0.

**Corretto (0.69.0, commit 5a13824).** `elenca` salta `FILE_DEL_SERVIZIO`. All'avvio il contatore riparte da `ultimoNumeroConsegne`, cioè dal numero più alto fra il file e le copie `.illeggibile-N`. Un messaggio in coda da più di 2 minuti si scrive anche a una chat al lavoro (`ancheAlLavoro`).
