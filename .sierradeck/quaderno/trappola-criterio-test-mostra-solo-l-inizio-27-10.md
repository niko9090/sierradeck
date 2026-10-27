---
titolo: "Trappola: il criterio «I test del programma principale passano» mostra solo l'inizio dell'uscita"
quando: 2026-10-27T13:40:00+01:00
tag: ["criteri", "autopilota", "vitest", "trappola"]
---

## Cosa si vede
Il 27/10 l'hook di fine turno ha dato rosso per 4 giri di fila lo stesso criterio:
`node node_modules/vitest/vitest.mjs run tests/main --maxWorkers=2`, lanciato nella
cartella principale. Il messaggio era sempre identico: la riga `RUN` e un pezzo di
stderr di `cassaforte-sincronia.test.ts` («maestra ricordata illeggibile, la butto:
Error: non mio»). **Quel pezzo è un log voluto dal test, non l'errore.**

Lanciato a mano nella stessa cartella e sullo stesso commit (main `e51e73cd`), il
comando esce con codice 0: 205 file, 1951 test verdi, 2 saltati, 477 s col PC carico.

## Perché non si capisce mai quale test cade
In `src/autopilot-host/verifiche.ts` l'uscita del comando si raccoglie solo finché
non arriva a `USCITA_MAX * 4` = 16.000 caratteri (riga ~378), poi si taglia ai primi
4.000. `decisione.ts` la taglia ancora ai primi 1.200. Il riepilogo di vitest
(`FAIL …`, `Test Files … failed`) sta **alla fine** dell'uscita, quindi non arriva
mai nel messaggio: la chat vede sempre e solo l'inizio, uguale a ogni giro.

## Cosa fare
- **Correzione proposta:** tenere la **coda** dell'uscita (gli ultimi N caratteri)
  invece della testa. Oppure far scrivere a vitest un file d'esito
  (`--reporter=json --outputFile=…`) e leggere `numFailedTests` e i nomi dei test
  rossi, come proposto il 20/10 (`2026-10-20-criterio-dei-test-si-misura-dal-file-d-esito-non-piu-dalla-s.md`).
- Alle 13:22 del 27/10 nella cartella principale giravano insieme due vitest
  (`tests/main` intero e `cassaforte-sincronia.test.ts` da solo). Un rosso vero
  sotto carico o per suite concorrenti è possibile, ma col messaggio di oggi non si
  può sapere quale test è caduto.
- Finché la correzione non c'è, per capire un rosso: rilanciare il comando a mano,
  salvare l'uscita in un file e leggerne la **coda** (`tail -40`) e il codice d'uscita.
