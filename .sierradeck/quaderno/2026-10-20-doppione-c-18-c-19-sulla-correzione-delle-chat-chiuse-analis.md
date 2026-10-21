---
titolo: "Doppione c-18/c-19 sulla correzione delle chat chiuse; analisi e rilascio 0.81.0 senza chat (20/10)"
quando: 2026-10-20T09:05:55.390Z
tag: ["autopilota"]
---

Alle 09:01 UTC si sono aperte c-18 e c-19 con lo stesso compito: una chat già chiusa continua a chiamare il supervisore (casi c-13 e c-15). Entrambe sono segnate «Rilascio», ma fanno una correzione nel codice. La c-19 è chiusa come doppione e resta la c-18. Alle 08:57 c-18 e c-19 erano state aperte per altri due compiti: l'analisi completa in analisi-0-80-0.md e il rilascio 0.81.0 quando tutto è verde. Adesso nessuna chat li porta avanti e vanno riaperti. Il rilascio parte solo dopo la correzione del limite di 10 minuti sui criteri (scheda «Criterio «I test del programma passano» rosso per tempo…»), altrimenti il criterio dei test resta rosso. Probabile difetto in più: i nuovi compiti in coda hanno preso i numeri c-18 e c-19 già usati alle 08:57. Da controllare insieme alla correzione.
