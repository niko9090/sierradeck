---
titolo: "Trappola: chat chiusa che continua a mandare giri al supervisore (c-13, 20/10)"
quando: 2026-10-20T08:31:48.604Z
tag: ["autopilota"]
---

Il 20/10 c-13 è stata chiusa alle 08:15 UTC: il ramo era già in main (6297a3f) e la cartella di lavoro non era più un repository git. Dopo la chiusura il supervisore ha ricevuto altri giri di c-13 alle 08:19, 08:31 e 08:3x, sempre con lo stesso esito («prosegui» vuoto). Per la 0.81.0: una chat «finita» con la cartella di lavoro tolta non deve più chiamare il supervisore. Il suo hook Stop deve uscire subito, senza giro e senza riga nel registro. Ci vuole un test: una chat chiusa, con il ramo unito e la cartella tolta, fa 0 giri. Da affidare a c-16 o a c-17, dentro la 0.81.0.
