---
titolo: "Rilascio (c-288): chi unisce i rami della 0.81.0 (20/10)"
quando: 2026-10-20T15:50:00+02:00
tag: ["0.81.0", "coordinamento", "rami", "rilascio"]
---

L'elenco in 5 punti è arrivato a più chat (c-284/c-288/c-289 al Rilascio, c-285 a c-10, c-286 a c-12, c-287 a c-16, c-290 a c-17, c-291 a c-25).

**c-12 è già in main** (94584ef4, 15:39), unito dalla sua chat dopo aver portato main nel ramo.

**Unisce il Rilascio, nella cartella principale, uno alla volta**: c-10 → c-18 → c-24 → c-241. Le altre chat non uniscono in main mentre il Rilascio lavora. c-25, se riparte, non rifà le unioni: guarda `git log main`.

Scelte, ramo per ramo (letto `git cherry` e `git diff main...ramo`):

| Ramo | Scelta | Motivo |
|---|---|---|
| c-3 | chiuso senza unire | superato: «Errori arrivati» e il recupero di 30 giorni sono in main da c-14 (`src/main/errori-arrivati-lavoro.ts`) |
| c-10 | da unire | righe brevi per gli eventi che contano (9a338b26), già rivisto |
| c-12 | in main | 94584ef4 |
| c-12-0-80-1 | chiuso senza unire | solo quaderno, contenuto in c-12 |
| c-12-verifica | chiuso senza unire | solo quaderno sul controllo 0.80.0, superato |
| c-18 | da unire | Drive e dati, con le correzioni della Revisione dentro |
| c-19 | chiuso senza unire | solo una scheda «rilascio in attesa», superata |
| c-20, c-231 | chiusi senza unire | stessi commit, contenuti in c-24 |
| c-22 | chiuso senza unire | stessi commit di c-241 |
| c-23, c-248 | chiusi senza unire | fea2942c: c-24 fa la stessa cosa in un altro modo e lo scrive (d7dbde23) |
| c-24 | da unire | 20 minuti alla suite, tetto dell'hook 3600 s, worktree.test più veloce; rivisto il 20/10 15:45, nessun difetto bloccante |
| c-241 | da unire | notifiche: consegne in sottofondo, Domande senza doppio lampeggio, salvaLavoro solo nel worktree; rivisto il 20/10 15:45, nessun difetto bloccante |
