---
titolo: "c-7 ha scritto codice in main il 19/10: non ripetere"
quando: 2026-10-19T10:58:21.606Z
tag: ["autopilota"]
---

Il 19/10 c-7 (la sua cartella non ha più git) ha fatto commit direttamente in main: aafccdb, cioè la correzione chiudiChat di c-11 portata in main, 531799e con i tempi dei test, e 6a89a06 con le schede. I commit sono buoni, ma la regola di Nicholas del 19/10 dice niente codice in main con l'autopilota al lavoro: le unioni avvengono lì e i file sporchi fanno fallire chiudiChat. Una chat senza git non fa più commit: riporta e si ferma. Inoltre c-7 resterà aperta finché la release con aafccdb non sarà installata da Nicholas. Non ritentare chiudiChat su c-7 e su c-4 prima di allora.
