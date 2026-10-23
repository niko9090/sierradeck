---
titolo: "Trappola: i criteri misurati nella copia di una chat «falliscono» senza node_modules"
quando: 2026-10-23T09:30:00+02:00
tag: ["revisione", "worktree", "criteri", "node_modules", "trappola"]
---

Caso del 23/10 (ramo c-106): la Revisione lo ha rimandato 4 volte con «il ramo rompe
`npm run typecheck` e gli altri test», mentre con le librerie installate passavano tutti
(typecheck pulito, 3149 + 1949 test verdi). Il codice del ramo era già uguale a main.

**Causa:** le copie delle chat (`SierraDeck.sierradeck-wt/<ramo>`) non hanno `node_modules`.
Lì `npm run typecheck` dà «"tsc" non è riconosciuto» e `npx vitest` scarica un'altra versione
(5.0.5 invece della 4.1.x del progetto), che non legge `vitest.config.ts`. Il criterio fallisce
per l'ambiente, non per il codice.

**Come riconoscerla:** l'errore dice «tsc non è riconosciuto» o «Cannot find module
'vitest/config'». Basta questo per dire che non si tratta del codice.

**Come misurare nella copia:** collegamento temporaneo alle librerie di main
(PowerShell: `New-Item -ItemType Junction -Path node_modules -Target <cartella principale>\node_modules`),
poi `node node_modules/vitest/vitest.mjs run …`, e alla fine **togliere il collegamento con
`cmd /c rmdir node_modules`**. Mai lasciarlo lì e mai cancellarlo in modo ricorsivo: una
cancellazione che segue il collegamento svuota le librerie della cartella principale.

**Da fare nel programma (proposta):** la Revisione dovrebbe misurare i criteri del codice
dopo l'unione, nella cartella principale (come dice già la consegna: «dove si misurano i
criteri»), oppure col collegamento sopra.
