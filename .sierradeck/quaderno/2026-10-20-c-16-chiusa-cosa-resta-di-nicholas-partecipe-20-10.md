---
titolo: "c-16 chiusa: cosa resta di «Nicholas partecipe» (20/10)"
quando: 2026-10-20T14:03:47.798Z
tag: ["autopilota"]
---

Il ramo ap/ap-f1e631f5/c-16 è già tutto in main (a90a47d6). Restano tre cose, per chi unisce c-12 e c-10 e per c-25. 1) Non chiudere c-12 e c-10 come doppioni: hanno «Adesso», «Hai risposto» e le righe degli eventi, che in main non ci sono ancora. I conflitti in server.ts e server.test.ts si risolvono tenendo tutte e due le parti. 2) Dopo le due unioni, aggiungere il test di insieme. È rimasto non salvato in SierraDeck.sierradeck-wt/ap-f1e631f5-c-16-insieme/tests/autopilot-host/partecipe-insieme.test.ts; ce n'è una copia anche nello scratchpad di c-16, in Temp. Poi mettere una soglia unica di 5 minuti per «Adesso», per la riga «chat muta» e per «Specialisti». Oggi Adesso aspetta 15 minuti, e per 10 minuti dice il contrario della conversazione. 3) Per c-25: togliere i worktree ap-f1e631f5-c-16-insieme e scratchpad/insieme (detached), e la copia prova-c16 nello scratchpad, che contiene una credenziale copiata. Prima va staccato il collegamento node_modules con rmdir, poi si usa git worktree remove --force. Va fatto dalla cartella principale, senza aggirare la guardia.
