---
titolo: "Il registro da 7 GB: il giro senza fine degli scontrini"
quando: 2026-09-04T14:10:00+02:00
tag: ["registro", "layout", "scontrino", "difetto", "disco"]
---

# Un rifiuto che si rispinge da solo, cinquecento volte al secondo

**Il fatto.** `%APPDATA%\sierradeck\log\sierradeck-2026-09-03.log` pesava
**7,18 GB**: dalle 11:07Z alle 20:26Z, ~42 milioni di righe uguali

```
[layout] RIFIUTATO — la finestra 2 salva senza una consegna valida (scontrino N, atteso N+1): 0 riquadri non scritti
```

a una ogni ~2 ms. Sessione 0.12.47 (sul PC principale 0.12.48/49/50 non sono
mai state installate: la 0.12.51 ha trovato `venivo dalla sconosciuta`).

**Il meccanismo** (tre pezzi che da soli sono giusti):

1. Il Core rifiuta un salvataggio con scontrino vecchio e **rispinge la
   verità** con uno scontrino nuovo (`rimandaLaVerita` in `ipc.ts`). Giusto:
   la finestra non deve restare muta.
2. La finestra riceve la spinta (`suApplica` nel preload → `ricevi` aggiorna
   lo scontrino → `cambiaVista`). Lo store notifica i sottoscritti in modo
   **sincrono**, e `creaPersistenza` salva a ogni notifica → parte subito un
   `layout:salva`.
3. Basta che la finestra abbia **due spinte in coda** (due scontrini emessi
   in una raffica, p.es. `layout:carica` + una spinta all'avvio) e il giro
   non finisce più: ogni salvataggio porta lo scontrino della spinta appena
   applicata, ma il Core ne ha già emesso uno dopo → rifiuto → spinta →
   salvataggio → … Il ritardo cresce col tempo (a fine giornata la finestra
   era indietro di 39 scontrini).

Il registro scriveva ogni rifiuto: 170 byte × 500/s × 9 h.

**La correzione (0.12.53), tre reti una dentro l'altra:**

- `persistenza.applicaDaFuori(l)`: un layout che arriva **dal Core** si
  applica **senza risalvarlo** (bandiera `applicando` che copre la notifica
  sincrona). È già la verità del disco. → il giro non si alimenta più.
- `creaFreno(1000)` in `consegne-layout.ts`: il Core rispinge la verità a
  una finestra **al massimo una volta al secondo**. → se un giorno qualcos'altro
  risponde a una spinta con un salvataggio sbagliato, costa 1 riga/s.
- `registro.ts`: **50 righe al secondo** (le altre si contano: «… N righe
  tralasciate») e **200 MB al giorno** per processo, poi il file di oggi si
  chiude con una riga che lo dice. I limiti si passano ad `apriRegistro`
  (quarto parametro) per i test.

**Da ricordare.** Ogni volta che il Core «risponde» a una finestra con
qualcosa che la finestra può a sua volta «rispondere», chiedersi: chi ferma il
giro? Un `set` dello store con lo stesso contenuto notifica lo stesso. E un
registro senza tetto è un disco pieno che aspetta.

**Il file da 7 GB va cancellato a mano** (è solo la stessa riga ripetuta):
`sierradeck-2026-09-03.log`. Le poche righe utili di quel giorno sono le ultime
(20:27Z, avvio 0.12.51 + tre `trasloco`).
