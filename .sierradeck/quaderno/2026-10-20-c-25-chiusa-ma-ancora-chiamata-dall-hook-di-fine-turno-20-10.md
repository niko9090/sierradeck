---
titolo: "c-25 chiusa ma ancora chiamata dall'hook di fine turno (20/10, 18:47)"
quando: 2026-10-20T18:47:23.950Z
tag: ["autopilota"]
---

c-25 risulta finita: il suo ramo è in main (42a4b402) e il worktree è stato tolto. Eppure l'hook Stop del suo worktree continua a chiedere un giro al supervisore a ogni sua risposta. Ha fatto più di 10 giri uguali con «ok, ferma». È lo stesso difetto che la 0.81.1 dichiara corretto («le chat chiuse non ricevono più giri»), ma questo PC gira ancora la 0.80.1: va ricontrollato dopo che Nicholas avrà installato la 0.81.1. Se succede ancora, la causa è nel servizio che accetta l'hook di una chat chiusa senza un worktree.
