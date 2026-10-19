---
titolo: "0.80.0: l'analisi la fa c-4 su main, c-10 non è mai partita (19/10)"
quando: 2026-10-19T09:25:32.978Z
tag: ["autopilota"]
---

Il 19/10 alle 09:2x le chat c-10, c-11 e c-12 non avevano un commit né un file cambiato. c-10 e c-11 erano ferme su 76ed7c2, c-12 su 4416a72. L'analisi della 0.80.0 (analisi-0-80-0.md) l'ho affidata a c-4: è libera e il freno sui limiti (64%) non lascia aprire chat nuove. Se c-10 riparte, non deve rifare l'analisi: deve partire dal file in main. Scoperto in più: chiudiChat fallisce se il ramo della chat è già unito e la sua copia è stata tolta («not something we can merge»).
