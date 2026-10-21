---
titolo: "Chat chiusa che chiama ancora il supervisore: anche c-15 (20/10)"
quando: 2026-10-20T08:38:29.848Z
tag: ["autopilota"]
---

Stesso difetto di c-13, già messo in coda come correzione per la 0.81.0. c-15 è stata chiusa alle 08:13 UTC del 20/10, con il lavoro unito in main (3851104, 76d99aa). Dopo la chiusura il supervisore ha ricevuto almeno 5 giri uguali, uno con «ok, mi fermo qui»; la chat diceva anche che la sua copia non era più un repository git e che il suo ramo non esisteva più. Da correggere: quando una chat è finita e il suo ramo è tolto, il programma non deve più chiamare il supervisore per lei. Al massimo una riga nel registro. Test con due casi: c-13 e c-15.
