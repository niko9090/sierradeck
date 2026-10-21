---
titolo: "Trappola: consegne scritte nella cartella principale, la chat le cerca nella sua copia (20/10)"
quando: 2026-10-20T12:22:22.826Z
tag: ["autopilota"]
---

Il 20/10 c-18 ha girato a vuoto 4 volte cercando c-225.md, c-227.md e c-268.md. Erano in .sierradeck/consegne della cartella principale, mentre la chat guarda in quella della sua copia (SierraDeck.sierradeck-wt/ap-f1e631f5-c-18). In più quelle consegne erano per altri compiti: c-225 e c-227 sono la correzione della chat chiusa (fatta da c-19), c-268 è il piano di c-24. Cosa fare: una chat che ha finito il suo compito si chiude con chiudiChat. Non le si mandano consegne di altri. Da sistemare nel programma: la consegna va scritta nella copia della chat a cui è destinata.
