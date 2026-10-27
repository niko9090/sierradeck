---
titolo: "Trappola: l'uscita di un criterio rosso mostra l'inizio, mai il test che è fallito"
quando: 2026-10-27T12:40:00Z
tag: ["autopilota", "criteri", "vitest", "trappola"]
---

**Cosa succede.** Il criterio «I test del programma principale passano» (`vitest run tests/main`) è diventato rosso una volta, alle 12:03 UTC del 27/10. Il registro del servizio dice `finito con 1 in 143 s`. Poi la chat c-159 ha ricevuto lo stesso esito per 4 giri di fila. Nel registro non risulta nessuna nuova misura di quel comando dopo le 12:03.

**Perché il messaggio non serve.** In `src/autopilot-host/verifiche.ts` l'uscita del comando viene raccolta **dall'inizio** e poi tagliata **in testa**:
- durante la raccolta si accumulano al massimo 16 000 caratteri;
- l'esito ne tiene 4000 (`uscita.slice(0, USCITA_MAX)`);
- `decisione.ts` ne passa alla chat 1200.

vitest stampa per primi gli avvisi su stderr che i test producono apposta, per esempio `[sync] maestra ricordata illeggibile…` della cassaforte. Il riassunto con `FAIL` e `Test Files` arriva in fondo. Per questo la chat vede solo rumore e **non può sapere quale test è fallito**.

**Prova a mano (27/10, cartella principale, main e51e73cd).** Lo stesso comando, lanciato due volte, finisce con `exit=0`: 205 file verdi, 1 saltato, 1951 test verdi. Il rosso delle 12:03 era un test instabile sotto carico (in quel momento giravano anche gradle e l'altra suite) e non un difetto del codice.

**Correzione proposta (non fatta: tocca il codice dell'autopilota, decide Nicholas):**
1. Tenere **la coda** dell'uscita, non la testa: `uscita.slice(-USCITA_MAX)` in `verifiche.ts` e `decisione.ts`. Durante la raccolta, buttare l'inizio invece di smettere di accumulare.
2. Per vitest, aggiungere `--reporter=dot` (o filtrare le righe `FAIL`/`×`), così le righe utili stanno nei 1200 caratteri.
3. Quando la chat dice «a mano passa», rimisurare il criterio invece di riusare l'esito vecchio.

**Cosa fare intanto.** Se arriva di nuovo questo messaggio:
- rilanciare il comando a mano con l'uscita salvata in un file;
- cercare `FAIL`/`Test Files` in fondo e controllare `echo $?`;
- guardare `[criterio] finito con` in `%APPDATA%\SierraDeck\log\sierradeck-<data>.log` per vedere quando il servizio ha misurato davvero.

Vedi anche `2026-10-19-perche-il-criterio-dei-test-cade-nel-servizio.md` (stesso criterio, causa tempo).
