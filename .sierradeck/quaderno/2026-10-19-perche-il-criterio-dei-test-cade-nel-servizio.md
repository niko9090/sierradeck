---
titolo: "Perché il criterio dei test cade nel servizio (19/10)"
quando: 2026-10-19T12:05:00.000Z
tag: ["autopilota", "test", "criteri"]
---

**Causa:** con `npx vitest run --maxWorkers=2` il giro dei test non finisce mai dentro il tetto di 600 s del servizio (`TIMEOUT_PREDEFINITO_MS` in `src/autopilot-host/verifiche.ts`). Il servizio lo interrompe e lo conta come rosso. Non cade nessun test: cade il tempo.

**Come lo so:** dal registro del servizio installato, `AppData\Roaming\SierraDeck\log\sierradeck-2026-10-19.log`, righe `[criterio]` (le ore sono UTC):
- **Dalle 10:40 in poi:** 13 giri su 13 con `--maxWorkers=2`, tutti «finito con 1 in 601/602 s». Anche quello delle 11:08, che non aveva nessun altro giro insieme, ha dato 602 s. Da solo, c-7 l'ha misurato in 863 s, ben oltre il tetto.
- **Giri insieme:** spesso più giri dei test partono insieme, uno per ogni chat che finisce un turno. Fra le 10:40 e le 11:08 ce n'erano fino a 6 nello stesso momento, il che aggrava il carico.
- **Prima delle 10:40, con `npm test`:** 8 giri, da 409 a 560 s, quindi sempre sotto il tetto. Due hanno dato 0 (09:30 e 10:34), sei hanno dato 1, due volte con due giri insieme. Quei rossi erano test veri caduti sotto carico; c-7 li ha corretti alle 10:39 (`531799e`).
- **Uscita dei test:** il registro non la tiene, quindi non contiene righe FAIL, × o «Tests … failed», e nemmeno «[comando interrotto dopo 600s]», che finisce solo nell'uscita data al supervisore. I nomi dei test rossi di prima delle 10:40 non si possono ricostruire da qui.
- **A mano, come il servizio** (Temp corta, nessun altro giro): `npm test` dà 0 in 276 s.

**Strade (lavoro di c-11, nel programma):**
- **Riportare il criterio a `npm test`.** Dopo `531799e` è verde e sta sotto il tetto. È la strada più semplice.
- **Un giro dei test alla volta per progetto.** Se ne parte un altro mentre uno è in corso, aspetta il suo esito invece di lanciarne un secondo.
- **Alzare il tetto solo per i criteri pesanti** (`ePesante` in `criteri-veloci.ts`).
