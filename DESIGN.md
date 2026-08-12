# Design

<!-- impeccable:design-schema 1 -->

## Il mondo: una console di regia

L'interfaccia sta **intorno** a terminali vivi, e il modello è la testata di una
console di regia: una fascia di comandi serigrafata, sezioni separate da
incisioni, tasti in rilievo, e **LED che dicono lo stato da lontano**.

La metafora non è decorativa: una console governa molti canali che suonano
insieme, che è esattamente cosa sono le chat di questo programma. Da qui
discendono tre regole che valgono ovunque:

1. **Il colore appartiene allo stato, non alla decorazione.** I comandi sono
   grigi in rilievo; verde, ambra e rosso significano qualcosa e nient'altro.
2. **Lo stato si legge a due metri.** Forma e colore prima del testo: chi ha
   lasciato lavorare un autopilota alza la testa e deve capire senza avvicinarsi.
3. **Una fascia sola.** Ogni pixel verticale tolto ai comandi è testo di
   terminale in più. I gruppi che non servono sempre si aprono a scomparsa.

## Palette

Fondo scuro, obbligato: i terminali xterm sono su `#1e1e1e` e l'interfaccia non
può schiarire quel fondo senza far sembrare le chat dei buchi neri.

| Ruolo | Valore | Dove |
|---|---|---|
| `--fondo` | `#141517` | Dietro tutto, più scuro del terminale: il mosaico galleggia sopra la console |
| `--chassis` | `#232629` | La fascia dei comandi e i pannelli |
| `--chassis-alto` | `#2b2f33` | Tasti a riposo |
| `--chassis-premuto` | `#1b1e21` | Tasti premuti e campi |
| `--incisione` | `#131517` | Solchi fra le sezioni (scuro) |
| `--luce-incisione` | `#3a3f45` | Il filo di luce sotto il solco |
| `--testo` | `#dfe3e7` | Etichette dei comandi (12.4:1 su chassis) |
| `--testo-quieto` | `#9aa1a9` | Serigrafie e valori secondari (5.8:1) |
| `--verde` | `#54c07a` | Lavora |
| `--ambra` | `#e0a33c` | Aspetta una risposta |
| `--rosso` | `#dc5f5f` | Fermo, fallito |
| `--spento` | `#4a5058` | Finito, inattivo |

**Nessun accento di marca oltre questi.** L'azione primaria si distingue per
materiale — un tasto più chiaro, in rilievo più netto — non per un colore in
più: è così che funziona una console vera, dove i tasti sono grigi e i LED
portano il significato.

## Materiale

I tasti hanno un bordo superiore chiaro e un'ombra bassa: leggono come rilievo
sotto una luce da soffitto. Premuti, invertono (bordo scuro sopra, nessuna
ombra). Le sezioni della fascia sono separate da un solco di due pixel — uno
scuro, uno chiaro — non da una linea piatta.

I LED sono cerchi di 8px con un alone stretto dello stesso colore: piccolo e
netto, mai un bagliore diffuso. Un LED che lampeggia significa **una cosa sola**
in tutta l'applicazione: un autopilota aspetta una risposta.

## Tipografia

Stack di sistema per l'interfaccia (`Segoe UI`), Cascadia Mono per i **valori
misurati** — contatori di cicli, tempi, conteggi — mai come costume tecnico.

Le etichette di sezione sono maiuscole tracciate a 10px: è la serigrafia delle
console, la grammatica nativa di questo mondo, e vive **solo** lì — sulle
sezioni della fascia e sulle intestazioni dei pannelli, mai sopra ogni blocco.

## Composizione

```
fascia (44px)  ▸ sezioni: sessioni │ chat e disposizione │ workspace │ autopiloti
pannello       ▸ si apre sotto la fascia, solo quando serve, e si richiude
mosaico        ▸ tutto il resto dell'altezza
```

I pannelli a scomparsa non spingono mai il mosaico: gli scorrono sopra, con
un'ombra che li stacca. Chiudendoli, il mosaico non si è mosso di un pixel.

## Motion

**Un solo momento autoriale**: l'apertura di un pannello, che scende da sotto la
fascia in 180ms con una decelerazione esponenziale, come uno sportello di rack.
Tutto il resto è immediato — i tasti rispondono al `:active` senza transizione,
perché una console non ha ritardi.

Nessuna animazione sui riquadri: lì sotto c'è testo che si muove da solo, e
un'interfaccia che si anima intorno lo rende illeggibile.

## Cosa questo mondo rifiuta

- Card uguali in griglia come struttura: qui la struttura è la fascia e il
  mosaico.
- Vetro, sfocature, gradienti come decorazione.
- Colori di marca sparsi sui comandi: il colore è riservato allo stato.
- Barre multiple impilate — è il difetto da cui nasce questo redesign.
