---
titolo: "Mappa dei workspace sbagliati 0.80.0 (c-7, 19/10, sola lettura)"
quando: 2026-10-19T12:37:01.744Z
tag: ["autopilota"]
---

1) Cartella vuota per un progetto che vive altrove. progettoPerWorkspaceGlobale (index.ts:2645-2656) crea cartellaProgetti/<nome>. La salta solo se il registro locale conosce il progetto con il percorso di un altro PC: non guarda la residenza, il Drive o gli altri PC. La chiamano anche strade che non dovrebbero creare cartelle: index.ts:1440 (registerLayoutIpc), index.ts:4060 sistema:cartelleBase (la crea solo aprendo il modale Nuova chat, ModaleNuovaChat.tsx:45), index.ts:5059, 5552 e 5563 (aggiungiWorkspace dal telefono). risolviSuDisco (index.ts:3832) è giusto. sincronia.ts:411 preparaCartella, chiamato da 1178 e 1274: da verificare.

2) Nome del workspace preso dal testo. validation.ts:354 usa obiettivo.slice(0,40) quando manca il nome. index.ts:5447 creaAutopilota → workspaceDellAutopilota(r.nome) (azioni-telefono.ts:138). PannelloAutopiloti.tsx:130 usa le prime 4 parole. server.ts:3159 fa lo stesso. «dentro al mio server nexora c'è gia un» è l'obiettivo tagliato a 40 caratteri.

3) Workspace senza autopilota. index.ts:355 apriNelSuoWorkspace, 3568 (progetti all'avvio), 2781 (altro PC), 5555 (telefono) e «Nuovo workspace»: nessuno collega un autopilota. Lo dice solo la panoramica (ElencoWorkspace.tsx:115, WorkspacePanoramica.tsx:489), mai la fascia o il momento della creazione.

4) Elimina workspace. PC: ipc.ts:1219 + workspace-operazioni.ts:156. Pagina: client-pagina.ts:2422 e 4317. App: Gestione.kt:153 → client-rotte.ts:2300 → index.ts:5568. Toglie il workspace dalla lista e spegne i terminali; le conversazioni restano. La copia è un solo file, workspaces.prima-dell-eliminazione.json, riscritto ogni volta. Non c'è recupero di 30 giorni né «?»: solo la conferma (azioni-telefono.ts:88, PannelloWorkspace.tsx:206). divieti.ts:40-41 e 90 vietano all'autopilota eliminaWorkspace, cambiaWorkspace e /api/workspace/elimina, ma la rotta non controlla chi chiama.
