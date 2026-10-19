---
titolo: "Correzioni per i workspace sbagliati 0.80.0 (c-7, 19/10)"
quando: 2026-10-19T12:38:03.118Z
tag: ["autopilota"]
---

1) progettoPerWorkspaceGlobale (index.ts:2645): prima di creare la cartella chiedere a residenza, indice del Drive e registri degli altri PC; se il progetto vive altrove, non crearla. Test: un progetto noto solo su un altro PC non crea niente qui.
2) Togliere la chiamata da sistema:cartelleBase (index.ts:4060, apertura di Nuova chat) e da aggiungiWorkspace (index.ts:5552, 5563): aggiungere un nome non crea una cartella. Test su tutte e due.
3) Nome dell'autopilota (validation.ts:354, PannelloAutopiloti.tsx:130, server.ts:3159): senza nome usare il nome della cartella oppure «Autopilota N», mai l'obiettivo. Test con «dentro al mio server nexora c'è gia un».
4) Workspace senza autopilota: alla creazione e nella fascia, la riga «Nessun autopilota qui» con «?» e «Avvia un autopilota», uguale su PC, pagina e app, testo condiviso. Test.
5) Elimina workspace: la lista va nel recupero di 30 giorni con cancellaSicura; la cartella del progetto ci va solo se è vuota e l'ha creata il programma; «?» sulle tre facce. Test del ripristino.
6) /api/workspace/elimina (client-rotte.ts:2300): rifiutare chi arriva come autopilota, non solo in divieti.ts. Test.

Misura dei test: la suite è verde (4194 test, 863 s con 2 worker). Il criterio va misurato con un limite di almeno 20 minuti, solo sul codice d'uscita di vitest e su una copia pulita di main (git worktree add).
