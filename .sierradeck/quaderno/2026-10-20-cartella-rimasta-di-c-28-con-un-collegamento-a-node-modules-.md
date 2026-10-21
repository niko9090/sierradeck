---
titolo: "Cartella rimasta di c-28 con un collegamento a node_modules (20/10)"
quando: 2026-10-20T18:54:51.582Z
tag: ["autopilota"]
---

La chat c-28 è chiusa, ma la cartella E:\Users\nikof\Documents\SierraDeck.sierradeck-wt\ap-f1e631f5-c-28 è rimasta sul disco e non è più un worktree git. Dentro c'è un collegamento `node_modules` che porta alla cartella principale: chi pulisce non deve usare rm -rf o Remove-Item -Recurse senza prima togliere il collegamento, altrimenti svuota il node_modules vero. Le copie di google-oauth.json e android/local.properties le toglie c-28 con il percorso intero. Il resto della cartella si toglie a mano, togliendo prima il collegamento.
