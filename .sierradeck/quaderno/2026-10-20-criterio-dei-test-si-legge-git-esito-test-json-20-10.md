---
titolo: "Criterio dei test: si legge .git/esito-test.json (20/10)"
quando: 2026-10-20T10:29:52.923Z
tag: ["autopilota"]
---

Il programma installato (0.80.1) misura la suite intera con il tempo limite vecchio, e la suite dura circa 19 minuti: il criterio restava rosso per tempo da 17 giri. Ora il criterio legge .git/esito-test.json, che è l'esito JSON di `npx vitest run --reporter=json --outputFile=.git/esito-test.json` lanciato nella cartella principale. Passa solo se il file è più recente dell'ultimo commit di main, se success è true, se i test falliti sono 0 e se i test sono più di 4000. Sta in .git, quindi non sporca la cartella principale e non blocca chiudiChat. Dopo ogni unione in main la corsa va rifatta. Quando Nicholas avrà installato una versione con il tempo limite di 20 minuti, si potrà tornare al comando diretto.
