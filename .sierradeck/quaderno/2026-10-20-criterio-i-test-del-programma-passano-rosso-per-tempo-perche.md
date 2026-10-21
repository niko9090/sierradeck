---
titolo: "Criterio «I test del programma passano» rosso per tempo: perché resta rosso anche dopo l'unione di c-20 (20/10)"
quando: 2026-10-20T10:20:06.791Z
tag: ["autopilota"]
---

Il ramo ap/ap-f1e631f5/c-20 (uguale a c-231: 459d0bae, 3a865b07, 5a1f43be) dà 20 minuti alla suite vitest invece di 10 (tempoDelCriterio in verifiche.ts, con test). Il 20/10 il supervisore l'ha mandato alla Revisione e all'unione con chiudiChat c-20. Attenzione: i criteri li misura il programma INSTALLATO, non main. Fino a quando Nicholas non installa la 0.81.0 (lo fa solo lui), il criterio può restare rosso per tempo con il PC carico (1128 s misurati con 13 chat). Non è un test fallito: non rimandare le chat chiuse a girare a vuoto per questo, e non rifare la correzione.
