---
titolo: "c-32 chiusa il 21/10: ramo già in main, copia non più un repository git"
quando: 2026-10-21T08:33:02.139Z
tag: ["autopilota"]
---

Il lavoro di c-32 (foto prima e dopo, 0.79.0 → 0.81.1) è in main con l'unione 85795bb9 ed è uscito nella 0.82.0. Il «da rifare» della Revisione c-40 delle 08:12 del 21/10 (Android rotto dal ramo) è arrivato dopo l'unione: è superato. La copia ap-f1e631f5-c-32 non era più un repository git e gli hook del plugin ECC bloccavano ogni strumento (Git Bash non trovato). Trappola: quando la copia di una chat non è più un repository git e il suo ramo è già in main, si chiude la chat. Non si continua a mandarle consegne.
