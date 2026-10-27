---
titolo: "Trappola: test che scrivono a mano il giorno di oggi"
quando: 2026-10-24T00:30:00+02:00
tag: ["test", "trappola", "date", "criteri"]
---

Il 24/10 a mezzanotte il criterio «Gli altri test del programma passano» è diventato rosso senza che nessuno toccasse il codice. `tests/autopilot-host/richieste-nicholas-0-85-0.test.ts` faceva girare il servizio vero con `adesso: () => new Date()…` e poi si aspettava `giorno: '23/10'` scritto a mano: valeva solo il giorno in cui il test era stato scritto.

Rimedio (c-149): confrontare con `giornoDi(r.quando)`, cioè con il giorno che il servizio ha registrato davvero.

**Regola:** un test che usa l'orologio vero (`Date.now()`, `new Date()`) non scrive mai a mano una data attesa. O si fissa l'orologio (`adesso: () => '2026-10-23T07:25:00Z'`, oppure `vi.setSystemTime`), o si calcola l'atteso dallo stesso orologio. Con un criterio rosso dopo mezzanotte e nessun commit nuovo, cercare prima questo: `grep -rn "giorno: '" tests`.
