---
titolo: "Trappola: il criterio a file d'esito deve usare percorsi assoluti (20/10)"
quando: 2026-10-20T11:15:09.860Z
tag: ["autopilota"]
---

Il comando del criterio «I test del programma passano» basato su ../SierraDeck.sierradeck-wt/esiti/test-$(git rev-parse HEAD).json fallisce sempre se il programma lo lancia dalla cartella di una chat chiusa, che non è più un repository git: va a vuoto git rev-parse e anche il percorso relativo punta altrove. Va riscritto con percorsi assoluti, per esempio f=/e/Users/nikof/Documents/SierraDeck.sierradeck-wt/esiti/test-$(git -C /e/Users/nikof/Documents/SierraDeck rev-parse main).json, così vale da qualsiasi cartella. Alle 11:14 la cartella esiti non esiste ancora: la crea c-23 con la prima corsa completa sul commit di main.
