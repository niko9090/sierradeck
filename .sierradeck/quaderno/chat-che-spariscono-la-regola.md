---
titolo: "Le chat che spariscono: la regola che mancava"
quando: 2026-08-31T00:45:00+02:00
tag: ["workspace", "layout", "persistenza", "aggiornamenti", "difetto"]
---

# «Una chat esce dall'archivio solo se qualcuno l'ha congedata»

Quarta volta che il lavoro si incrocia, e questa volta il registro messo il 28
agosto (vedi [[workspace-chat-che-spariscono]]) ha finalmente parlato:

```
22:27:11  sessione avviata · v0.12.44          ← riavvio per aggiornamento
22:27:38  ATTENZIONE — 1 chat non stanno più in nessun workspace
          (finestra 1, monitor 1920x1080@1920,0@1, dichiara «SierraDeck»,
           attivo «SierraDeck»): c1b61659… (era in «SierraDeck»)
22:27:47  ATTENZIONE — … e68693af… (era in «SierraDeck»)
```

Ventisette secondi dopo l'avvio, non alla chiusura. `c1b61659` era la chat
SierraDeck aperta dal 17 agosto (19.391 righe di trascrizione); `e68693af` era
nata **quattro secondi prima**, da una consegna dell'autopilota, e la
sparizione l'ha presa appena nata.

## La svolta: smettere di cercare il colpevole

Tre giri di correzioni ragionate — il nome del workspace, la chiave del
monitor, `attivo` che segue la principale — hanno chiuso tre cause vere e non
hanno chiuso il difetto. Il quarto giro non è una quarta teoria: è
**un'invariante che rende irrilevante quale sia la causa.**

Fino a qui `layout:salva` era una **dettatura**. La finestra diceva «ecco come
sono disposto adesso» e il Core scriveva, senza avere modo di distinguere le
sole due cose che possono aver tolto una chat da quell'elenco:

- «l'ho chiusa io» — un'istruzione, da eseguire;
- «non c'è più, e non so nemmeno io perché» — un guasto, da **non** eseguire.

Il Core non poteva distinguerle perché la differenza sta nel renderer, che è
l'unico che sa se qualcuno ha premuto qualcosa. Adesso gliela dice.

## Come funziona

- **Renderer** (`state/layout.ts`): l'insieme `congedate` raccoglie i
  `sessionUuid` di chi esce di scena **per volontà di qualcuno** —
  `closePane` (chiusa), `staccaPane` (spostata in un'altra finestra o in un
  altro workspace), `applyPreset` (troncata). `cambiaVista` **non** congeda
  niente: un workspace è una vista, non un interruttore.
- `congediDaMandare()` filtra chi è tornata a schermo: una chat chiusa e poi
  ripresa dalle Sessioni torna con lo **stesso** uuid, e lasciarle il congedo
  addosso significherebbe darle per sempre il permesso di sparire in silenzio.
- L'elenco viaggia come terzo argomento di `layout:salva`.
- **Core** (`ipc.ts` + `esitoDelSalvataggio` in `workspace-operazioni.ts`): si
  confronta l'archivio prima e dopo. Una chat che finirebbe in *nessun*
  workspace senza essere fra le congedate → **il salvataggio non si scrive**, e
  il registro dice `RIFIUTATO` con finestra, monitor e nome dichiarato.

Il prezzo di un rifiuto è che un riquadro appena aperto aspetta il salvataggio
successivo — e ne parte uno a ogni modifica del mosaico, quindi arriva subito.
Il prezzo dell'errore opposto è una conversazione persa, e si è pagato tre
volte.

Chiude in particolare il **sospetto numero uno** della scheda precedente: due
finestre che al riavvio risolvono per un istante alla stessa chiave di monitor
si sovrascrivono a vicenda, e la seconda salva un layout senza le chat della
prima. Adesso quel salvataggio viene rifiutato.

Prove: `tests/main/workspace-operazioni.test.ts` (chiusura dichiarata passa,
sparizione muta rifiutata, trasloco non è perdita) e
`tests/renderer/layout-store.test.ts` (chi congeda e chi no).

## Nel frattempo: niente è perduto su disco

Le due chat «sparite» hanno la trascrizione intatta in
`~/.claude/projects/<progetto>/<uuid>.jsonl`. Sparire dall'archivio dei
workspace **non** cancella la conversazione: si riapre da «Sessioni». Vale la
pena ricordarlo prima di andare nel panico.

## Il difetto gemello, sistemato di passaggio

`accogliPane` apriva il pacco che `staccaPane` prepara e ne buttava via metà:
`model` e `ibernata` non venivano copiati. Una chat spostata fra due finestre
tornava al modello predefinito, e una che dormiva si risvegliava da sola
accendendo un `claude.exe` che nessuno aveva chiesto.
