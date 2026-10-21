---
titolo: "c-17 chiusa due volte e ancora richiamata dal supervisore (20/10)"
quando: 2026-10-20T10:30:49.472Z
tag: ["autopilota"]
---

c-17 (Notifiche 0.81.0) è stata chiusa con chiudiChat alle 09:33:45 e di nuovo alle 10:09:41 UTC del 20/10; il ramo è unito in main (5187eed7, di nuovo 10:06) e la cartella è stata tolta. Il programma continua lo stesso a chiamare il supervisore per lei (18 giri identici fino alle 10:30). Fra le 10:05 e le 10:08 la chat chiusa ha anche lanciato la suite completa dei test in sottofondo, aggiungendo carico mentre il criterio «I test del programma passano» scadeva per tempo. Secondo caso dopo c-15 per c-18: dopo chiudiChat il programma deve smettere di chiamare il supervisore e fermare il processo della chat, anche quando la chat è già senza cartella.
