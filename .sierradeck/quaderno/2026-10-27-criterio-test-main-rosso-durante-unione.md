---
titolo: "Criterio «test del programma principale» rosso perché girava durante un'unione (27/10)"
quando: 2026-10-27T12:30:00Z
tag: ["autopilota", "criteri", "trappola"]
---

**Cosa è successo.** Il 27/10, per 4 giri di fila, l'hook di c-149 ha detto rosso «I test del programma principale passano» (`node node_modules/vitest/vitest.mjs run tests/main --maxWorkers=2` nella cartella principale). Rilanciato a mano lo stesso comando, due volte: codice d'uscita 0, 1951 test passati e 0 falliti su 205 file, in circa 8 minuti.

**Causa (dal registro `%APPDATA%\sierradeck\log\sierradeck-2026-10-27.log`).**
- Le sei misure di quel giorno fra 09:45Z e 11:28Z sono finite tutte con 0. L'unico 1 è quella partita alle 12:01:23Z e finita alle 12:03:45Z.
- Alle 12:01:20Z (13:01:20 ora italiana) l'autopilota ha unito c-146 in main (`e51e73cd`). I test giravano quindi sulla cartella principale proprio mentre `git merge` ne riscriveva i file.
- Nello stesso minuto sono partiti due gruppi di criteri sulla stessa cartella: due `npm run typecheck` sovrapposti, più la suite di autopilot-host.
- Dopo il rosso il criterio non è stato più rimisurato fino a 12:24Z. L'hook ripeteva l'esito vecchio, da qui i «4 giri identici».

**Perché il messaggio non serve a capire.** `verifiche.ts` accumula al massimo 16000 caratteri dell'uscita e nel verdetto ne mette i primi 4000 (`uscita.slice(0, USCITA_MAX)`). Vitest scrive all'inizio gli avvisi su stderr dei test che provocano errori apposta: «Error: non mio» di cassaforte-sincronia, JSON rotti e simili. Il riepilogo e i test falliti arrivano invece alla fine. Il verdetto mostra quindi sempre e solo rumore, e si perde anche la riga «[comando interrotto dopo …]».

**Cosa fare la prossima volta.**
1. Prima di toccare codice, leggere nel registro `[criterio] finito con <codice> in <s>` e confrontare l'ora con `git log --format='%h %ci' main`.
2. Se coincide con un'unione, rilanciare il comando e basta.
3. Correzione proposta, non ancora fatta: nel verdetto tenere la coda dell'uscita (ultimi ~3000 caratteri) invece della testa, e non far partire i criteri mentre l'autopilota sta unendo. È lo stesso problema della proposta del 18/10 «misurare i criteri su una copia pulita di main».

**Ricontrollo del 27/10 pomeriggio (consegna c-6333, ramo c-143).** Nel registro l'unica misura con codice 1 di `tests/main` resta quella delle 12:03:45Z; dopo non è più stata rimisurata. Rilanciato il comando identico nella cartella principale (main `d40d73c7`): 205 file passati, 1 saltato, 1951 test passati e 0 falliti. Il codice non andava toccato. Il rosso che arriva alla chat è la misura vecchia ripetuta, quindi basta rimisurare.
