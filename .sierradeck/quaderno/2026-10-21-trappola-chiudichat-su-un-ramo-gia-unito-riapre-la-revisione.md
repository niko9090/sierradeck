---
titolo: "Trappola: chiudiChat su un ramo già unito riapre la Revisione (21/10)"
quando: 2026-10-21T03:36:53.184Z
tag: ["autopilota"]
---

Dopo il «finito» della 0.82.0, chiedere chiudiChat su c-32 (ramo già in main, 85795bb9) ha fatto riusare c-40 per rivederlo di nuovo, e il «finito» è stato rimandato tre volte. Rimedio: se un ramo ha 0 commit fuori da main e la chat è già «finita», non chiedere chiudiChat: basta dichiarare finito senza mosse.
