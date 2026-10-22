# Rapporto 0.84.2 (22/10)

Patch con una sola correzione, chiesta da Nicholas il 22/10: «togli i vincoli, a quelli penso io se stiamo consumando troppo».

## Le ore ferme del 22/10
- **11:02-19:22 UTC:** nessuna chat al lavoro. Sul PC girava la 0.84.0, che faceva partire un giro solo quando una chat chiudeva un turno. Corretto nella 0.84.1 (giro da solo dopo 10 minuti), installata da Nicholas alle 19:22 UTC.
- **Dalle 19:45 UTC:** il giro da solo partiva ogni 10 minuti ma non apriva niente. Causa: il freno sui limiti del piano. Con la settimana al 64% (soglia 60%) e zero chat al lavoro lasciava passare solo le revisioni, e in coda non ce n'erano. In più la riga diceva «apro le chat» anche quando non ne apriva nessuna.

## Correzione
- `frenoPerAutopiloti` (src/shared/harness.ts): nel servizio vero il freno è spento (`frenoPiano: false` in src/autopilot-host/index.ts). Gli autopiloti aprono tutte le chat utili. Restano i posti del PC (processori, memoria, carico).
- Il pannello non scrive più «Niente chat nuove»: la percentuale dei limiti resta solo come informazione.
- Test: tests/shared/harness.test.ts, con il caso vero (64%, zero chat al lavoro).
- La riga «apro le chat» che non dice il motivo vero va nella 0.84.3, insieme agli altri lavori in coda.

APK: android/ non è cambiato, quindi viene riallegato l'APK 2.84.1. Non installata da noi.
