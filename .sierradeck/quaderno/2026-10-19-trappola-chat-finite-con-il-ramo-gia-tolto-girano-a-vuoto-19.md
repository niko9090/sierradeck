---
titolo: "Trappola: chat finite con il ramo già tolto girano a vuoto (19/10)"
quando: 2026-10-19T16:21:47.919Z
tag: ["autopilota"]
---

c-10, c-12 e c-7 hanno finito e i loro rami sono già in main e poi tolti. Il servizio installato (0.79.0) prova a unirli a ogni giro e fallisce con «not something we can merge», così la chat non si chiude e il supervisore continua a ricevere giri vuoti. Non serve riprovare chiudiChat né dare compiti nuovi a queste chat. Dopo che Nicholas installa la 0.80.0 (chiudiChat chiude anche i rami già uniti o mancanti, aafccdb) vanno chiuse tutte e tre in un giro solo. Il lavoro della 0.81.0 resta a c-3.
