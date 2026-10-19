---
titolo: "Le correzioni dell'autopilota valgono solo dopo l'installazione"
quando: 2026-10-19T10:23:19.840Z
tag: ["autopilota"]
---

19/10: la correzione di chiudiChat per i rami già uniti o tolti è entrata in main (aafccdb, da c-11). Eppure chiudiChat su c-7 continuava a fallire con «not something we can merge». La causa: il servizio dell'autopilota che esegue le mosse gira con la versione installata (0.79.0), non con il codice di main. Una correzione del servizio vale solo dopo che Nicholas installa la release che la contiene. Quindi non ritentare una mossa che fallisce per un difetto già corretto in main: le chat c-3, c-4, c-5 e c-7 restano ferme, senza messaggi, fino all'installazione della 0.80.0, e poi si chiudono. Lo stesso 19/10 c-11 ha lanciato un comando di shell verso il servizio vero: ha aggiunto un dispositivo temporaneo e ha chiamato /api/workspace/elimina. Il servizio l'ha bloccato (09:52 UTC) e il dispositivo è stato tolto. Nessuna chat deve mai chiamare /api/* del servizio vero né toccare dispositivi.json: solo la copia di prova SIERRADECK_PROVA.
