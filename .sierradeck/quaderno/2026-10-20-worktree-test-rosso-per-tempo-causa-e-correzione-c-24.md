---
titolo: "worktree.test.ts rosso per tempo: causa e correzione (c-24)"
quando: 2026-10-20T14:30:00+02:00
tag: ["0.81.0", "test", "tempi", "git", "worktree"]
---

**Causa:** nessun test resta appeso (niente git o figli lasciati aperti, niente
timer). È il PC carico: CPU al 100%, 54 node e 24 claude aperti. In quelle
condizioni `cmd /c exit` costa circa 0,9 s e ogni processo git circa 1,1–1,7 s.
Il `beforeEach` del file rifaceva per ogni test un repository nuovo con 6
processi git (init, 3 config, add, commit), anche per i test che git non lo
usano. Il test più lento («ramo tolto dopo l'unione») fa circa 38 chiamate git
e arrivava a 51 s da solo: nella suite intera, con più carico, superava il tetto
di 60 s.

Le funzioni di produzione (`worktree.ts`) fanno poche chiamate: creaWorktree 3,
salvaLavoro 5, ramoGiaChiuso 4, unisciRamo 6, togliWorktree 4. Non le ho toccate.

**Correzione** (ramo `ap/ap-f1e631f5/c-24`, commit `a850b524`): il repository di
partenza si fa una volta in `beforeAll` e ogni test ne riceve una copia con
`cpSync`. C'è un test nuovo: un commit in una copia non tocca il modello. Il
tetto del tempo non è stato alzato.

| Misura (file da solo, PC carico) | Prima | Dopo |
|---|---|---|
| Tempo dei test | 283 s | 117 s |
| Test più lento | 51 s | 19 s |
| Test senza git (piano, cartelle vuote) | 5,5 s / 6,9 s | 0,08 s / 0,16 s |

**Regola:** nei test con git vero, preparare il repository una volta sola e
copiarlo. Ogni processo in meno conta molto di più a PC carico.
