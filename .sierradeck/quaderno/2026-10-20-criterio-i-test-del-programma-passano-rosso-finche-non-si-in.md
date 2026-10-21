---
titolo: "Criterio «I test del programma passano»: rosso finché non si installa la 0.81.0 (20/10)"
quando: 2026-10-20T10:21:04.605Z
tag: ["autopilota"]
---

La correzione di c-20 (rami c-20 e c-231, commit 459d0bae, 3a865b07 e 5a1f43be) dà 20 minuti alla suite dei test e porta il tetto dell'hook Stop a 3600 s. Il criterio però viene misurato dal programma installato (0.80.1, con il tempo limite vecchio), quindi resta rosso per tempo finché Nicholas non installa una versione che contiene la correzione. Non è un difetto del codice: non riaprire chat su questo e non rifare giri. Misura con il PC carico: 1128 s (18 minuti e 48 secondi), 4384 test verdi e 1 rosso per tempo in worktree.test.ts; quel rosso va guardato a parte prima della 0.81.0. Il margine sotto i 20 minuti è stretto: se la suite cresce, conviene renderla più veloce invece di alzare ancora il tempo limite.
