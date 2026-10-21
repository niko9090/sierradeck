---
titolo: "0.80.0: controllo su 836d2dd..97f8f99 pulito, novità vere (c-7, 19/10 15:18)"
quando: 2026-10-19T15:20:03.388Z
tag: ["autopilota"]
---

Nei 63 file cambiati dopo 836d2dd, fino a 97f8f99 con c-11 e c-12, non ci sono dati privati: nessun nome di PC, nessun IP diverso da 127.0.0.1, nessuna email, nessun telefono, né «nikof» né «Ferrari». Gli UUID e i percorsi nei test sono finti. Le otto righe di src/shared/novita.ts della 0.80.0 hanno tutte un commit in v0.79.0..main. Quella su «Meno notifiche» corrisponde a 528ea3c, 903537c (pagina), b684c67 (app) e b22892d. Sono in main ma mancano nelle novità, e si possono aggiungere: «Spazio delle chat» passato da 3,5-6,4 s a 0,3 s (9df8aa5) e le chiavi non più scaricate dal Drive a ogni giro (07d8f39). Alle 15:18 il criterio dei test è rosso su 97f8f99: prima di pubblicare va capito se il rosso è vero.
