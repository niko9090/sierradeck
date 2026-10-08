---
titolo: "La chat sul telefono con PC di larghezze diverse; PC vecchi; domande degli altri PC (0.52.6, app 2.52.6)"
quando: 2026-10-08T14:00:00+02:00
tag: ["telefono", "pagina", "android", "xterm", "colonne", "pc-vecchi", "domande", "battito", "ponte", "causa"]
---

# La segnalazione (Nicholas, 08/10)

«Con certi PC nel cell si vede male la chat e l'autopilota, come visualizzazione e tabulazione.»

# Causa vera (provata con Claude Code 2.1.294 a 80, 120 e 200 colonne)

- **Claude Code va a capo da solo** alla larghezza del terminale del PC, con **a capo veri**.
  - Una risposta da un PC con il riquadro largo 200 colonne arriva come righe da 200 caratteri.
  - In «Adatta» l'app e la pagina mostravano ogni riga del PC come un paragrafo a sé, che sul telefono andava a capo per conto suo: frasi spezzate a metà con un buco, più evidenti quanto più è largo il terminale del PC.
  - Le colonne dipendono dalla finestra e da quanti riquadri ha il mosaico, quindi cambiano da PC a PC: da qui il «con certi PC».
- **`isWrapped` di xterm da solo non basta.** xterm segna come continuazione solo le righe spezzate dal terminale (il prompt incollato, una riga di stato). Le righe della risposta di Claude non lo sono mai.
- **Le tabelle in «Adatta» andavano a capo** e perdevano l'allineamento.
- **Il criterio esatto con cui Claude va a capo** (misurato sui tre schermi): la riga sotto comincia con una parola che non ci stava più, cioè `lunghezza riga + 1 + prima parola > colonne`, e ha il rientro del corpo del messaggio (2 spazi dopo «● »).

# Cosa fa la 0.52.6

- **PC.** `righeDaSchermo` e `finestraDiPty` (`src/renderer/schermo-terminale.ts`) mandano `continua[]` (`isWrapped` riga per riga) e `colonne` (`term.cols`, registrato da `Terminal.tsx`).
  - `/api/storia` e `/api/dentro` li portano (`conLarghezza`, solo se tornano con le righe).
  - `/api/dentro` ora legge lo schermo di adesso dalla finestra (`righeDi`, 60 righe) e ripiega sulla foto.
- **`ricomponiSchermo`** (`src/shared/ricomponi-schermo.ts`, autosufficiente):
  1. attacca le continuazioni di xterm;
  2. unisce le righe spezzate da Claude con il criterio qui sopra;
  3. tabelle e riquadri (caratteri di cornice dentro la riga, o 3+ spazi di allineamento) diventano `griglia`; i bordi con incroci restano, le linee che separano e basta se ne vanno.
- **Pagina.** `${ricomponiSchermo.toString()}` come `ansiInHtml`, quindi è lo stesso codice. `schermoHtml`: `.r-t` va a capo, `.r-g` è `white-space: pre` con `overflow-x: auto`.
- **App.** `Ricomponi.kt` (copia) e `blocchiAdattati` in `Terminale.kt`: `Blocco.Testo` va a capo, `Blocco.Griglia` è una `Column` con `horizontalScroll`. «Griglia» (la fotografia) resta com'era.
- **PC vecchi** (senza `continua`/`colonne`): nessuna riga unita e le griglie ci sono lo stesso. Non si rompe niente.
- **Scheda dell'autopilota con un PC vecchio** (app):
  - `FunzioniPc.avvisiScheda(versione, nome)` mette una riga ambra sopra le linguette per ogni parte che manca: chat 0.29, albero 0.36, linguetta Domande 0.38, File 0.38, Istruzioni 0.41.
  - Gli avvisi dicono «arriva aggiornando NOME alla X»; `PcCorrente.nome` viene dall'intestazione.
  - Con una domanda aperta su un PC prima della 0.38 si dice di rispondere dalla scheda Domande dell'app, perché la linguetta non c'è.
  - La pagina non ne ha bisogno: la serve il PC stesso, quindi ha sempre la sua versione.
- **Domande delle chat degli altri PC con i pulsanti:**
  - il battito porta `scelte` (`OpzioneBattito`) per le chat ferme su una domanda; mai per una chat con il PIN, perché il battito lo leggono tutti i PC;
  - `raccogliDomande` ne fa una voce `scelta` con id `pc:<pcId>:<sessione>`;
  - `/api/scegli` con quell'id chiama `scegliAltroPc` (ponte → `/api/scegli` di quel PC, che ricontrolla sullo schermo vero); 409, 404 e 423 tornano come sono.

# Dati per i test (solo esempi)

- `tests/fixtures/schermi-larghezze/claude-{80,120,200}.json`: schermi veri, percorso reso neutro.
- `ricomposti.json`: generato dalla funzione condivisa, controllato dal vitest e confrontato con l'app da `RicomponiTest.kt`.
- Le risposte vere dei PC 0.36/0.38/0.42 stanno in `android/app/src/test/resources/pc/`, usate in `CompatibilitaPcTest.kt` per gli avvisi.

# Trappole

- **Le risposte di Claude cambiano a ogni giro** (testo, righe della tabella): i test confrontano la forma, cioè un paragrafo solo, 9 righe di tabella in griglia, il codice non unito. Non il testo.
- **Una riga di sola cornice** larga quanto il terminale fa segnare `isWrapped` alla riga dopo (il campo «❯»): non la si unisce.
- **Non verificato:** le colonne reali degli altri PC di Nicholas. Il PC le manda solo da questa versione; per la causa sono bastati gli schermi veri a tre larghezze.
- **Versione del portatile:** la consegna dice 0.38.2, mentre il registro del 07/10 lo vedeva a 0.50.0. Gli avvisi funzionano in tutti e due i casi.
