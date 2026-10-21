---
titolo: "Criterio «I test del programma passano» rosso per tempo: limite di 10 minuti sotto carico (20/10)"
quando: 2026-10-20T09:03:56.524Z
tag: ["autopilota"]
---

Il 20/10 il criterio è rosso alle 08:11, verde alle 08:37 e alle 08:42, di nuovo rosso alle 08:59, e scade anche quando si rimisura. Nessun test fallisce nel pezzo di uscita registrato. La chat c-15 aveva lanciato a mano 4330 test, tutti passati. La causa: in src/autopilot-host/verifiche.ts:14, TIMEOUT_PREDEFINITO_MS = 10 * 60_000 vale per ogni criterio. La suite intera (vitest run, testTimeout 20 s) con 13 chat al lavoro sul PC supera i 10 minuti, e la seconda misura cade nello stesso carico. Il comando del criterio è giusto, quindi correggerlo non serve. Correzione da fare prima del rilascio della 0.81.0 (c-19 aspetta tutto verde): un tempo per criterio, più lungo per la suite (per esempio 20 minuti), oppure la seconda misura rimandata finché non finisce un altro comando pesante (typecheck, gradle). Serve un test per il criterio lento che non diventa rosso, e il tempo vero della suite va scritto nel rapporto analisi-0-80-0.md.

## Corretto (20/10, ramo ap/ap-f1e631f5/c-231 = c-20, 5a1f43be, da unire con la 0.81.0)

- **Strada scelta: un tempo per criterio.** `tempoDelCriterio(comando)` in `verifiche.ts` dà 20 minuti a vitest/jest/`npm test`; gli altri criteri restano col tetto dell'esecutore (10 min). È la più semplice: il secondo modo (rimandare la rimisura finché non finisce un altro comando pesante) aspetta comunque sullo stesso carico e richiede di sapere cosa fanno le altre chat.
- **Trappola: i criteri girano dentro l'hook Stop**, che aveva un tetto di 900 s (`TIMEOUT_HOOK_S`). Già prima 10 min + rimisura superavano i 15 min. Portato a 3600 s; vale solo per le chat avviate dopo l'install (le impostazioni si iniettano all'avvio della sessione).
- `Esecutore` ha un terzo parametro facoltativo `timeoutMs`; `conDivieti` lo inoltra. Chi scrive un esecutore nuovo deve inoltrarlo anche lui.
- Misura vera col PC carico (17 claude, 61 node): **1128 s**, 1 rosso per tempo in `worktree.test.ts`. Sotto i 20 min, ma con poco margine. A PC scarico ancora da misurare.

**21/10:** in main (459d0bae, 3a865b07, 5a1f43be), quindi nelle release 0.81.x. Manca ancora la misura a PC scarico: oggi il PC è così carico che anche `tasklist` supera i 2 minuti. Va fatta a PC quieto, con lo stesso comando (`npx vitest run --maxWorkers=2`), e scritta in analisi-0-80-0.md.
