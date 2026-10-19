---
titolo: "Analisi 0.80.0"
quando: 2026-10-19T12:15:00+02:00
tag: ["0.80.0", "analisi", "per Nicholas"]
---

I numeri misurati e l'elenco dei problemi ordinato per importanza li scrive l'analisi (c-4, su main): vanno sopra questa sezione.

## Da togliere con «Elimina workspace»: i due workspace sbagliati del 19/10
Su questo PC ci sono due workspace nati per sbaglio. Si tolgono con **«Elimina workspace»**, che li tiene nel recupero per 30 giorni. Nessuna chat li toglie con le rotte o a mano sui file: lo fa Nicholas dal programma.

- **«visitafacile»** (19/10, 11:18):
  - Perché è sbagliato: il progetto vero visitafacile vive su **DESKTOP**. Aprendolo da qui, il programma ha creato una cartella vuota nuova, `E:\Users\nikof\Documents\VisitaFacile`, invece di aprirlo da là.
  - Dentro c'è un riquadro con una chat vuota (`e6ecbaf0…`, nessun file).
  - È rimasta anche una cartella vuota, `C:\Users\nikof\Progetti SierraDeck\visitafacile`.
- **«dentro al mio server nexora c'è gia un»** (19/10, 11:20):
  - Perché è sbagliato: è il primo messaggio scritto all'autopilota, diventato il nome di un workspace con la sua cartella (`C:\Users\nikof\Progetti SierraDeck\dentro al mio server nexora c'è gia un`, vuota).
  - **Attenzione:** è la casa dell'autopilota `ap-79a4ce02…`, fermo all'intervista.
    - Il suo obiettivo è quello di Nicholas: «dentro al mio server nexora c'è gia un progetto che stiamo cominciando. riprendi in mano tutto e vediamo a che punto sia».
    - Lavora nella cartella `E:\Users\nikof\Documents\VisitaFacile`, e l'intervista è la chat `353b4549…` (674 KB).
  - **Da decidere con Nicholas** prima di eliminarlo: quell'autopilota va rifatto nel workspace NexoraOS, oppure si può togliere insieme al workspace?
- **Il visitafacile vero su DESKTOP non va toccato.**
- Le due cause sono i punti 2 e 3 del compito «Difetti di chat e workspace».

## Test rossi su main il 19/10
- `rimozione-sicura.test.ts` («un altro PC firmato sì…») cadeva per tempo scaduto anche da solo: caricava `client-rotte` dentro il test, e trasformarlo a cache fredda costa più dei 20 s concessi. Ora lo carica in cima al file. Nessun difetto nel programma.
