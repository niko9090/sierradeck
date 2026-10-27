---
titolo: "Criterio «test del programma principale» rosso per un'unione in corso, e poi mai rimisurato (27/10)"
quando: 2026-10-27T14:10:00+01:00
tag: ["autopilota", "criteri", "trappola"]
---

**Cosa si vedeva.** Per più giri di fila il gancio di fine turno diceva che
`node node_modules/vitest/vitest.mjs run tests/main --maxWorkers=2` falliva. L'uscita
mostrata era solo l'inizio: un avviso `[sync] maestra ricordata illeggibile, la butto`.
Quell'avviso **non è l'errore**: lo scrive apposta il test «un portachiavi che non riapre
il file…» e compare anche nei giri verdi. Nel registro vengono salvati solo i primi 600
caratteri dell'uscita, quindi il nome del test rosso non si vede mai.

**Causa (dal registro `%APPDATA%\SierraDeck\log\sierradeck-2026-10-27.log`).**
- Alle 12:01:20Z l'autopilota ha unito c-146 in `main` (vedi `git reflog main`).
- Alle 12:01:23Z, 3 secondi dopo, nella stessa cartella principale è partito il criterio:
  è finito con 1 in 143 s, perché i file cambiavano mentre i test giravano.
- Dopo, il criterio **non è più stato lanciato**: nel registro c'è una sola riga `finito
  con 1`. Il gancio però ha rimostrato quel risultato vecchio a ogni giro, scrivendo «4 giri
  identici».
- Rilanciati a mano lo stesso comando e la stessa cartella, i test passano tre volte di
  fila: su `e51e73cd` e su `d40d73c7` fanno 1951 verdi, 0 rossi, codice 0, in circa 500 s.

**Cosa ricordare.**
- Un rosso dei criteri subito dopo un'unione va rimisurato prima di correggere il codice.
  Il confronto si fa così: `git reflog --date=iso main` contro le righe `[criterio] parte` e
  `[criterio] finito con` del registro.
- Proposta per il servizio, già fatta il 18/10 e ancora aperta: misurare i criteri su una
  copia pulita di `main` (`git worktree add`), oppure non lanciarli finché un'unione è in
  corso. Inoltre il servizio deve rilanciare un criterio rosso quando `main` cambia, invece
  di rimostrare l'esito vecchio. Infine deve salvare la **coda** dell'uscita (le righe
  `FAIL` e il riepilogo), non i primi 600 caratteri.
