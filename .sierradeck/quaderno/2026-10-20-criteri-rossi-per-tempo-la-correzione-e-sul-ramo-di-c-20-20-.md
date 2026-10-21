---
titolo: "Criteri rossi per tempo: la correzione è sul ramo di c-20 (20/10)"
quando: 2026-10-20T10:19:24.849Z
tag: ["autopilota"]
---

Il criterio «I test del programma passano» scade per il limite di 10 minuti (src/autopilot-host/verifiche.ts, TIMEOUT_PREDEFINITO_MS); la suite intera col PC carico richiede circa 1128 s. Il ramo ap/ap-f1e631f5/c-20 (459d0bae, 3a865b07, 5a1f43be) porta la suite a 20 minuti e lascia agli altri criteri il tempo di prima. Anche gradle alla prima compilazione dopo modifiche ad android/ ha richiesto 12 min 7 s (c-21): passa al secondo giro. Resta sul disco SierraDeck.sierradeck-wt/c-235-android (solo build, percorsi troppo lunghi per git): va tolta con la pulizia di SierraDeck, non a mano dalla chat.
