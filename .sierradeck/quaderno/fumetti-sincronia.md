---
titolo: "I fumetti: la sincronia non sposta più l'impaginazione (0.27.0)"
quando: 2026-09-15T14:30:00+02:00
tag: ["ui", "drive", "sincronia", "fumetti", "preferenze"]
---

# Il difetto

Nicholas (15/09): «quando si opera su una chat in continuo si vede che
sincronizza con il cloud e che l'impaginazione continua a muoversi ed è
veramente scomodo. fai dei fumetti o comunque cambiamo modo». La
`StrisciaLavoroDrive` stava nel flusso sopra il mosaico: a ogni salvataggio
automatico (5 min) e a ogni arrivo entrava e usciva, e con lei la striscia
«N chat arrivate» e l'esito; i riquadri si spostavano di ~40 px.

# Com'è adesso

- `src/renderer/components/Fumetti.tsx`: `Fumetti` (livello `position:
  fixed` in basso a destra, `pointer-events: none`), `Fumetto` (toni
  lavoro/ok/attesa/errore, `pillola` = una riga piccola senza tasti),
  `FumettoLavoroDrive` (il vecchio contenuto della striscia, orologio e
  progresso dentro, «Dettagli»/«Annulla»), `useChiusuraAutomatica`.
- `src/renderer/fumetti-sync.ts` (puro, provato): `decidiFumettiDrive`.
  Lavoro chiesto da te (fusione, ripristino, porta qui) → fumetto pieno;
  automatico (salvataggio, arrivo) → niente, o `pillola` se la preferenza
  `fumettiSincroniaAutomatica` è accesa (predefinito **spento**); esito →
  sempre per i lavori tuoi, solo se errore per gli automatici; gli esiti ok
  si chiudono da soli dopo 12 s, «chat arrivate» dopo 20 s.
- `App.tsx`: via le quattro strisce (lavoro, esito, chat arrivate, riavvio
  consigliato) dal flusso; tutte nei `<Fumetti>` in fondo alla radice.
  Le strisce degli **aggiornamenti** restano dove sono (rare).
- Impostazioni: spunta «Mostra un fumetto anche per la sincronia automatica»
  con la nota che spiega cosa si vede e cosa no.
- CSS: `.fumetti`, `.fumetto`, `.fumetto--pillola`, `fumetto-entra`.

# Se serve

Un altro avviso che «entra ed esce» va messo nei fumetti, non in una
striscia: la regola è che sopra il mosaico stanno solo le cose che restano
a lungo (un aggiornamento da installare, un'attesa di quiete).
