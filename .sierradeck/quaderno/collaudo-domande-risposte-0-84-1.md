---
titolo: "Collaudo 0.84.1 — domande dagli altri PC e risposte verificate: funziona fra due PC, 4 difetti"
quando: 2026-10-22T11:45:00+02:00
tag: ["0.84.1", "collaudo", "domande", "altri-pc", "risposte", "c-82"]
---

Collaudo di c-82 (22/10) sulle righe 5d (c-74, domande dagli altri PC) e 5b
(c-75, risposte verificate) della lista dei lavori, già in main. Test:
`tests/main/collaudo-domande-risposte-0-84-1.test.ts`. Il PC A (dove tocca
Nicholas) e il PC B (dove lavora la chat) usano le rotte vere, gli schermi veri
di Claude Code 2.1.294 e un ponte finto che gira le chiamate come `index.ts`.

## Cosa funziona (provato)

- La domanda di B arriva su A intera, con le opzioni in italiano («Scrivo io la
  risposta», «Ne parlo nella chat», «Sì»). Per un permesso la scheda mostra
  «Do you want to proceed?»; la richiesta intera e il comando da approvare
  stanno nei dettagli («La domanda intera», «Prima della domanda»).
- Un tocco su A viene premuto da B. A riceve «Presa: «Blu», la chat è andata
  avanti.» con il numero di tentativi. Il registro ha una riga su B (chi preme)
  e una su A (chi ha chiesto).
- Se B non ci riesce, riprova una volta da solo (2 pressioni, 4 righe
  `[risposta]` nel registro di B). Poi A riceve 409 con la frase di B.
- Una risposta scritta da A arriva come risposta libera su B ed è verificata.

## Difetti (test `.fails`, si toglie `.fails` quando sono corretti)

- **D1. Un'opzione lunga più di 200 caratteri non si può premere da un altro
  PC.** Il battito taglia il testo a 200 caratteri
  (`src/main/index.ts:1934`, `o.testo.slice(0, 200)`). B però confronta il testo
  toccato con lo schermo intero (`src/main/client-rotte.ts:1676`,
  `o.testo === voluta`). Ogni tocco torna 409 «la scelta e cambiata», per
  sempre. Succede con un permesso «Yes, and don't ask again for … in <cartella
  lunga>» in una finestra larga.
  Passi: chat su B con un permesso di 3 opzioni e la seconda di 250 caratteri;
  da A toccare la seconda; risposta 409.
- **D2. La verifica non ha un limite di tempo vero.** `premiEVerifica` conta il
  tempo sommando le pause (`src/main/risposta-verificata.ts:71`,
  `passato += ogni`), senza il tempo di ogni lettura. Se nessuna finestra
  disegna la chat, ogni lettura aspetta 3 s (`ATTESA_RIGHE_MS`,
  `src/main/index.ts:280` e `:362`). Con due tentativi sono circa 2 minuti
  (nel test: 121,6 s). Il ponte di A smette di aspettare dopo 14 s
  (`src/main/pc-remoto.ts:174`) e l'app dopo 15 s, così Nicholas legge «non so
  se è arrivato» mentre B sta ancora premendo. **Da verificare dal vero:** non
  ho provato se succede con le chat dei workspace non aperti.
- **D3. Nell'app non si vede l'esito di una risposta presa.** PC e pagina
  mostrano la frase («Presa: …», «Mandata: … non controlla»). L'app no:
  `Fatto` (`android/app/src/main/java/it/ferrariconsulenze/sierradeck/ModelliLavoro.kt:342`)
  ha solo `fatto` e `autopilota`. Nell'app si vede solo la «non presa», come
  errore. La scheda di c-75 lo dice: `android/` non era stato toccato per non
  rifare l'APK. Ma la 0.84.1 ha comunque un APK nuovo (c-70, c-74).
- **D4. Da un altro PC mancano le spiegazioni delle opzioni.** Il battito non
  porta `descrizione` (`src/main/index.ts:1934`). Sullo stesso PC la scheda ha
  «Le scelte, spiegate» («Rosso — Il colore della passione…»), da un altro PC
  no. Spesso le spiegazioni dicono proprio cosa comporta la scelta.

## Note (non difetti)

- Basta **una** lettura senza la domanda per dire «presa». È voluto: così un
  permesso uguale che ricompare non fa premere due volte. Il prezzo: se la
  finestra si sta ridisegnando e per un attimo la domanda non si legge, la
  risposta risulta «presa» anche se non lo è.
- App → A → B: A prima chiama `/api/stato` di B (fino a 4 s), poi `/api/scegli`
  (fino a 14 s). In tutto si può arrivare a 18 s, ma l'app aspetta 15 s.
- Trappola per i test: negli schermi veri fra «2. » e il testo dell'opzione c'è
  un codice colore, e le righe finiscono con `\r`. Per cambiare un'opzione si
  sostituisce la riga grezza (`mNo` + ESC), non quella ripulita.
- In questa copia c'è una junction `node_modules` verso la cartella principale.
  Va tolta con `rmdir`, mai cancellata ricorsivamente.
