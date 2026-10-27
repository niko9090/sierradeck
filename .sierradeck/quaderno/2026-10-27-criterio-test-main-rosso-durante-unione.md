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

**Conferma (27/10, 12:28Z, c-163).** Rilanciato di nuovo lo stesso comando nella cartella principale, senza nessuna unione in corso: uscita 0, 205 file e 1951 test passati, 0 falliti, 339 s. Nessun codice toccato. Il rosso delle 12:03Z era quindi solo la misura presa durante l'unione di c-146.

**Da non confondere.** Nello stesso registro, «spawn ENAMETOOLONG» del supervisore (550 di fila) viene dall'app *installata*, che non ha ancora la 0.85.1. Nel codice la correzione c'è già: il prompt passa dallo stdin, `supervisore.ts` vicino alla riga 59. Sparisce solo quando Nicholas installa la 0.85.1.
