---
titolo: "L'ordine dei workspace cambiava a ogni salvataggio + ripristino"
quando: 2026-09-04T14:10:00+02:00
tag: ["workspace", "istantanee", "ordine"]
---

# Perché dopo un aggiornamento «Nas film» era finito in coda

**Il fatto.** Prima dell'aggiornamento alla 0.12.52 la fascia era
`Nas film, DDJ, Wdeck, HA, SierraDeck, serverDSM, flux`; dopo, con
«Nas film» in coda. Nessuna chat persa.

**La causa, in due passi.**

1. `workspaceDaSalvare` (`shared/istantanea.ts`) costruiva il salvataggio
   come `[...altri, aggiornato]`: il workspace **attivo finiva sempre
   ultimo**. Deck_1 salvata alle 13:33 con «Nas film» davanti → «Nas film»
   in coda nel file.
2. `workspaceDopoRipristino` prendeva l'ordine **del salvataggio**
   (`[...archivio non nel salvataggio, ...salvati]`). Il ripristino di Deck_1
   dopo l'aggiornamento ha riscritto l'archivio con quell'ordine.

**La correzione (0.12.53).** Il salvataggio tiene l'ordine dell'archivio con
l'attivo al suo posto (`map` invece di `[...altri, aggiornato]`); il
ripristino tiene l'ordine **del computer** (chi c'era resta dov'era, con il
contenuto del salvataggio; chi arriva dal salvataggio si accoda). Test in
`tests/shared/istantanea.test.ts`.

**Da ricordare.** `unaChatUnWorkspace(elenco, prioritario)` ordina solo
*internamente* per decidere chi vince sui doppioni: restituisce sempre
l'ordine dell'elenco che riceve. Quindi l'ordine lo decide chi costruisce
l'elenco, non lei.
