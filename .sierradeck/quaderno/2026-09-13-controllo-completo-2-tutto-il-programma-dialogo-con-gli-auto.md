---
titolo: "Controllo completo 2: tutto il programma + dialogo con gli autopiloti"
quando: 2026-09-13T23:03:52.547Z
tag: ["autopilota", "finito", "incompleto"]
sessione: 124704b2-6c37-41ce-96cb-62b416cf5e0a
---

## Obiettivo

Esegui per intero il mandato scritto in .sierradeck/quaderno/mandato-controllo-completo-2-2026-09-14.md: leggilo tutto prima di cominciare, poi il rapporto del primo mandato (.sierradeck/quaderno/rapporto-autopilota-2026-09-13.md, sezione 4) e le schede del quaderno man mano che tocchi un'area. Parte A: il dialogo con l'autopilota fuori dalla chat (scheda sul PC, pagina telefono e app Android): Nicholas scrive un messaggio all'autopilota e lui risponde con parole sue tramite il supervisore, applica le istruzioni e le consegna nella chat governata al momento giusto; conversazione salvata nell'archivio e visibile; e prima ancora capisci e correggi perché il primo mandato è stato consegnato nella chat che Nicholas stava usando (sessione ffea9ea8-…) invece che in una chat nuova dell'autopilota: un autopilota deve aprire SEMPRE una chat sua, nuova, nel workspace da cui è avviato. Parte B: il controllo completo di TUTTO il programma, le 11 aree elencate nel mandato (avvio e chiusura, aggiornamenti, Drive e sincronizzazione compresi i difetti lasciati aperti dal rapporto 1, progetti, chat e terminali, workspace e layout, indice, telefono su entrambi i lati, servizio autopiloti, negozio/quaderno/impostazioni/registro, promesse senza catch e scritture non atomiche): correggi ciò che è senza rischio, descrivi il resto. Regole: typecheck a 0 e suite vitest verde (output su file, riga in chiaro «Tests N passed» del reporter, mai in pipe) prima di ogni commit; test per ogni funzione pura nuova; testi UI completi; ogni correzione al telefono su entrambi i lati; schede nel quaderno; commit locali con le due righe di attribuzione del mandato; funzioni nuove in src/shared/novita.ts come 0.27.0; NON cambiare package.json, NON compilare l'APK, NON pubblicare, NON fare push, NON riavviare SierraDeck, NON toccare %APPDATA%\sierradeck. Lavora nella TUA chat: se ti trovi dentro una conversazione con la storia di un'altra persona, fermati e dillo. Alla fine scrivi il rapporto in .sierradeck/quaderno/rapporto-autopilota-2-2026-09-14.md con le sei sezioni previste e committalo.

## Come è finita

- ✅ Il typecheck passa: `npm run -s typecheck` esce con 0.
- ✅ La suite vitest è verde: vitest esce con 0 e nel file c'è la riga in chiaro «Tests N passed» e nessuna «Tests … failed».
- ✅ Esiste il rapporto .sierradeck/quaderno/rapporto-autopilota-2-2026-09-14.md con le sei sezioni e una voce per ognuna delle 11 aree della Parte B.
- ⬜ Parte A fatta: Nicholas può scrivere a un autopilota dalla scheda sul PC e dal telefono (pagina e app Android) e ricevere una risposta con parole sue; la conversazione è salvata nell'archivio dell'autopilota e visibile; le istruzioni vengono applicate e consegnate nella chat governata al momento giusto; c'è un test per la parte pura.
- ⬜ Il difetto della chat sbagliata è capito e corretto: un autopilota apre sempre una chat sua, nuova, nel workspace da cui è avviato, mai la chat di una persona; la causa è scritta in una scheda del quaderno.
- ⬜ Tutte le 11 aree della Parte B sono state controllate: per ognuna il rapporto dice cosa è stato guardato, cosa è stato trovato e cosa è stato fatto o proposto (file:riga, scenario, causa, correzione, rischio).
- ⬜ I punti 1 e 2 lasciati aperti dal rapporto 1 (copia di sicurezza delle impostazioni al ripristino completo; «Togli il workspace dal Drive») sono corretti, e i punti 3 e 4 valutati con una proposta o una correzione.
- ✅ Le funzioni nuove sono in src/shared/novita.ts come versione 0.27.0 e package.json è invariato (0.26.0).
- ✅ Tutto il lavoro è committato: `git status --porcelain` vuoto.

## Le mosse che contano

- **2026-09-13 23:03** — supervisore → finito: Tutti i criteri a comando sono già soddisfatti e ho verificato sul codice e nel quaderno i quattro criteri di giudizio: Parte A sui tre lati, causa della chat sbagliata documentata e rimossa dal codice, 11 aree nel rapporto, punti 1-4 del rapporto 1 chiusi o valutati.

## In numeri

- interventi: 1
- cartella: `E:\Users\nikof\Documents\SierraDeck`
