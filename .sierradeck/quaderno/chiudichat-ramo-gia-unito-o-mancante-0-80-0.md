---
titolo: "chiudiChat con il ramo già unito o mancante (0.80.0)"
quando: 2026-10-19T12:00:00+02:00
tag: ["autopilota", "git", "worktree", "chiudiChat", "0.80.0", "regola di Nicholas"]
---

## Il difetto
Le chat della 0.79.0 (c-1, c-3, c-4, c-5, c-7, c-9) avevano il lavoro già in `main`, ma la mossa `chiudiChat` del supervisore non riusciva a chiuderle:
- **ramo già unito** (unito a mano o da un giro precedente): una chat specialista (`sviluppo`, `interfaccia`…) andava comunque in **Revisione**, che rivedeva un ramo senza niente di nuovo;
- **ramo tolto** (`togliWorktree` cancella il ramo dopo l'unione): `git merge` di un ramo che non c'è falliva con «not something we can merge», il diario diceva «c-N non si chiude» e la chat restava aperta per sempre. Lo stesso errore sporcava l'unione finale (T6) e la Revisione.

## La correzione
- `statoRamo(git, {cwd, ramo, base})` in `src/autopilot-host/worktree.ts`: `mancante` (`show-ref` non lo trova), `unito` (`rev-list --count base..ramo` = 0), altrimenti `da-unire`. Nel dubbio `da-unire`, cioè come prima.
- `unisciRamo` con un ramo mancante risponde `{ok: true, unito: false}`: niente da unire, non è un errore.
- In `chiudiChat` (`server.ts`), **prima** della Revisione: si salva il lavoro rimasto nella cartella (un commit nuovo rende il ramo di nuovo `da-unire`, quindi niente va perso); se il ramo è `unito` o `mancante`, la chat diventa `finita` + `approvata` (così i compiti che la aspettano partono e la fine non la rimanda in Revisione), il worktree si toglie solo se `unito`, nel diario «chiudo la chat c-N: il suo ramo … è già in main / non esiste più».
- Test: `tests/autopilot-host/worktree.test.ts` (git vero: da-unire → unito → mancante) e `tests/autopilot-host/server.test.ts` («0.80.0: chiudiChat con il ramo già unito o mancante»).

## Regola di Nicholas (19/10)
**Mai chiedergli di chiudere una chat a mano**, né aspettare che lo faccia. Se `chiudiChat` fallisce perché il ramo è già unito o non esiste più, la chat si lascia ferma, senza mandarle messaggi, e si va avanti: le chiude il programma, con questa correzione installata.

## Trappola nei test
Il `gitFinto` di `server.test.ts` risponde codice 1 a ogni `rev-parse --verify` e 0 a tutto il resto (anche `merge-base --is-ancestor`). Per questo `statoRamo` usa `show-ref` e `rev-list --count`: con il finto il ramo «esiste» e il conto vuoto non vale 0, così i test della Revisione restano com'erano.

## Dopo la Revisione (typescript-reviewer)
- **Lavoro non salvato:** la scorciatoia vale solo se la cartella della chat è pulita dopo il salvataggio (`cartellaPulita`, `git status --porcelain` vuoto). Se resta qualcosa fuori dai commit (per esempio la cartella non è su un ramo `ap/…`, quindi `salvaLavoro` non committa), si va per la strada di prima: `togliWorktree --force` lo perderebbe. Test: «0.80.0: chiudiChat non toglie una cartella con lavoro non salvato».
- **Lasciato com'è, da sapere:** un ramo senza commit propri (mai usato) conta come `unito` e la chat si chiude senza Revisione: non c'è niente da rivedere. Nel verdetto della Revisione, un ramo che non esiste più ora vale «OK, niente da unire» invece di «unione non riuscita».
- Suite intera il 19/10: 4191 verdi; caduto per tempo (20 s, macchina carica da altre chat) `rimozione-sicura.test.ts › un altro PC firmato sì…`, che non tocca questo codice; 9/10 verdi rilanciato da solo, lo stesso test ancora in timeout.
