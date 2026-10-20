---
titolo: "Criteri scaduti che restavano vivi: la bash di Git e taskkill /T (0.81.0)"
quando: 2026-10-20T13:40:00+02:00
tag: ["autopilota", "criteri", "test", "windows", "processi"]
---

# Criteri scaduti che restavano vivi (20/10, c-17, commit `1e9add64`)

## Il sintomo
Il criterio «I test del programma passano» scadeva sempre. Il 20/10 erano vive **7 suite `npx vitest run --maxWorkers=2` insieme**, con il PC al 100%:
- le suite erano partite alle 12:08 e alle 13:06 erano ancora in giro;
- il registro del servizio le dava per interrotte a circa 602 s;
- ogni misura nuova scadeva di nuovo, perché doveva dividere la CPU con le orfane.

Alzare il tempo (c-231 lo porta a 20 min) **non toglie la causa**.

## La causa
Il servizio esegue i criteri in Git Bash (`usr/bin/bash.exe -l script`). Allo scadere chiamava `taskkill /PID <bash> /T /F`.

La bash di Git (MSYS) avvia la catena `npx` → bash → node in processi che **per Windows hanno un altro padre**. Per questo `taskkill /T` non li vede, e vitest e i suoi lavoratori sopravvivono.

`ps` di Git invece conosce l'albero vero (colonne PID PPID PGID WINPID).

## La correzione (`src/autopilot-host/verifiche.ts`)
Allo scadere, `gruppoMsys` legge `ps` di Git **in modo asincrono** (5 s al massimo, senza fermare il servizio). `winpidDelGruppo` poi prende:
- i discendenti della radice per PPID;
- il gruppo PGID **solo se la radice ne è il capo** (PGID = PID e maggiore di 1).

Non vengono mai presi:
- il servizio stesso e suo padre;
- i WINPID ≤ 4;
- niente del tutto se l'intestazione di `ps` non è `PID PPID PGID WINPID`.

`terminaAlbero` chiude la radice come prima, poi tutto il gruppo con **un solo** `taskkill /F /T /PID a /PID b …`. Se `ps` manca o non risponde, scrive un `console.warn` e chiude solo l'albero di Windows.

**Revisione:** due giri, poi APPROVE. Le correzioni chieste sono già nel codice: PGID solo se la radice è capo, esclusioni, `ps` asincrono e `taskkill` unico. In più, commit `6e508683`: se la bash esce da sola mentre si aspetta `ps`, il suo PID può essere già passato a un altro processo, quindi **non** si fa `taskkill` su di lui, solo sui discendenti che `ps` ha visto.

## La prova dal vero
Gli script sono nello scratchpad della sessione: `albero2.mjs` e `albero2-prima.mjs`. Lanciano `npx vitest run` su un test che dorme 90 s, lo fermano come il servizio e contano i sopravvissuti:
- **prima** (solo `taskkill /T`): 3 processi vivi dopo l'interruzione (bash, bash, node vitest);
- **dopo**: 4 vivi prima, **0** dopo.

## Trappole
- Una riproduzione **non** deve fare pulizia «per nome» (per esempio «ogni processo vitest creato negli ultimi 40 s»). La prima prova di c-17 l'ha fatto e ha chiuso anche circa 5 lavoratori delle suite orfane del servizio. Andavano chiusi comunque, ma non dovevo farlo io. La pulizia va fatta solo sui WINPID trovati da `ps` per la propria radice.
- Le suite orfane già in giro **non** le chiude questa correzione: vale per le prossime scadenze, dopo l'installazione della versione nuova.
- In un test, `.sort()` sui numeri ordina come stringhe (31500 viene prima di 8440). Va usato `sort((a, b) => a - b)`.
