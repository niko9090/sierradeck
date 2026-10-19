---
titolo: "Mappa dei cambi di workspace 0.80.0 (c-7, 19/10, sola lettura)"
quando: 2026-10-19T12:19:48.502Z
tag: ["autopilota"]
---

Nessun cambio di workspace scrive nel registro «X → Y, causa …».

Cambi decisi da Nicholas (OK):
- Console.tsx:141/414 menu → ipc.ts:1267 workspace:cambia
- Console.tsx:213 scorciatoia
- POST /api/workspace (client-rotte.ts:2598) dalla pagina (client-pagina.ts:5396) e dall'app (Api.kt:257): cambia ogni finestra e non scrive nel registro. Solo divieti.ts:40 lo vieta all'autopilota, la rotta non lo blocca.
- «Mostra qui» index.ts:2276
- SpecialistiVista.tsx:34 → App.tsx:611

Strade che violano la regola:
A) consegna di un autopilota: App.tsx:491 con consegna-visibile.ts:37, quando comePortare dà 'cambia' dopo 5 s di tastiera ferma. È la causa più probabile del «cambia da solo».
B) tornaNelSuoWorkspace del Ponte, App.tsx:307.
C) riprendiSessione da un altro PC o dal telefono: index.ts:5543 → apriNelSuoWorkspace (index.ts:350) → client:apri, App.tsx:554. Deve aprire in un workspace non mostrato oppure con una banda «vai lì?».
D) da verificare: index.ts:2135, la sincronia potrebbe portare un attivo diverso.

Gli annunci workspace:cambiato con precedente = attivo (index.ts:2135, 2781, 3527, 3538, 3568, 4904, 5449, 5555) non spostano lo schermo, perché App.tsx:1432 segui(precedente, attivo) non cambia niente.

Da fare: scrivere nel registro con la causa in ipc.ts workspace:cambia e in azioniDiFinestra().cambia; togliere A, B e C; aggiungere un test per ogni strada.
