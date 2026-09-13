---
titolo: "Sincronizzazione nei due versi: l'arrivo automatico delle chat e l'unione dei workspace sul Drive (0.26.0)"
quando: 2026-09-13T23:30:00+02:00
tag: ["drive", "sync", "chat", "workspace", "arrivo", "autopilota"]
---

# Perché

Nicholas (2026-09-13): «qui non sono apparse le chat sincronizzate dal
portatile». Due cause vere, trovate nel registro del fisso:

1. **Il salvataggio automatico solo caricava.** Le chat dell'altro PC
   scendevano solo con «Fondi» o «Porta qui». Alle 20:10Z una fusione ne ha
   scaricate 532, ma l'indice delle chat si rileggeva solo all'avvio e col
   pulsante «Rileggi»: nell'elenco non c'erano fino al riavvio delle 20:24Z.
2. **`sierradeck/workspaces.json` è un file solo sul Drive per tutti i PC**,
   e ogni salvataggio lo sovrascriveva con l'archivio locale («SALVA
   conflitto su workspaces.json: vince questo PC» a ogni giro, su tutti e
   due i PC). I workspace del portatile sparivano dal Drive prima che il
   fisso li potesse fondere: `fondiArchivi` in fusione trovava il proprio
   stesso archivio.

# Com'è fatto (0.26.0)

## L'arrivo (`sincronia.arrivo()`, tipo di lavoro `arrivo`)

- Chiamato da `salvaSeServe()` dopo ogni salvataggio automatico (ogni 5 o
  15 minuti, e un minuto dopo l'avvio). Alla chiusura del programma si
  passa `{ conArrivo: false }`: c'è un tetto di 45 s.
- Prima **guarda** (manifesto del Drive + `firmaRadici` locale): candidati
  = chat solo sul Drive, o con `size` maggiore sul Drive (una chat cresce e
  basta; la sola data diversa = stesso file salito da un altro PC). Se
  zero candidati non prende il lavoro e non scrive niente.
- Esclude le chat «già qui sotto un'altra cartella» (`altroveQui`: stesso
  uuid sotto un altro slug, cioè la copia rimappata su questo PC). Lo
  stesso filtro vale ora nel ripristino completo, e il piano di fusione le
  marca `salta` con «già qui, in un'altra cartella». Senza, ogni chat
  rimappata tornerebbe giù dal Drive a ogni giro.
- `ripristinaIncrementale` con `soloPrefissi: chat`, `escludi`, niente
  `elimina`, niente copie. Regola nuova in `incrementale.ts`: per le chat
  (prefissi senza copia) in conflitto **vince la più lunga**, non la più
  recente: un arrivo non accorcia mai una chat di qui.
- Il manifesto locale impara solo le voci scese (`soloSuDisco` filtra).
- Etichetta «Arrivo dal Drive» su PC, pagina telefono e app Android
  (`etichettaLavoro`), passi in `passiDelLavoro`. L'esito «arrivo» non
  resta nella striscia: al suo posto c'è l'avviso «N chat arrivate».

## Dopo ogni lavoro che scarica (`index.ts`, `dopoArrivo`)

`EsitoLavoro.scaricati` (nuovo, da `Presa.fine(..., scaricati)`) → il Core:
`reindicizzaSessioni()` (esportata da `ipc.ts`, letture in fila) →
`rimappaChatSulDisco()` → `rimappaChat()` (i pane dei workspace) →
rilettura se ha spostato qualcosa → evento `chat:arrivate {quante, tipo,
quando, rimappate}` → striscia in `App.tsx` con «Apri l'elenco». Lo store
delle sessioni si ricarica già su `sessioni:esito`.

## L'unione dei workspace (`salvaIncrementale.sostituto`)

`salvaIncrementale` accetta `sostituto(percorso, contenuto, base)`: il
contenuto da caricare al posto del file. Per `sierradeck/workspaces.json`
`sincronia.unioneWorkspace` legge l'archivio del Drive e carica
`fondiArchivi(mio, drive, 'unione')`. La voce nel manifesto porta la firma
del file **locale** (così il giro dopo non lo rivede come cambiato) e
l'impronta del fuso; se il Drive ha già quell'impronta non sale niente. Un
percorso sostituito non è mai un conflitto. Il file locale **non** cambia:
i workspace di un PC li decide quel PC; gli altri si prendono da ☁ Drive
(«Porta qui il workspace») o con «Fondi».

Limite noto: un workspace cancellato su un PC resta nell'unione sul Drive
(come le chat: il Drive è la memoria lunga) e ricompare qui con un «Fondi»
in modalità unione. Se serve un «Togli il workspace dal Drive», è da fare.

`impostazioni.json` e `istantanee.json` restano file per-PC con
last-writer-wins sul Drive: un cambio dell'altro PC non è più contato né
loggato come conflitto («… riscritti da un altro PC: sono file per-PC»).
Attenzione: il **ripristino completo** («Ripristina dal Drive») scarica
anche questi due se sul Drive sono più recenti, cioè porta qui le
impostazioni dell'altro PC. Non toccato: è un'azione esplicita e rara.

# Trappole viste scrivendolo

- `firmaRadici` restituisce anche `disco`; `stessaFirma` confronta size +
  mtime (1,5 ms): per "più avanti" usare `size`, mai la data.
- Un `sostituto` che riscrive la voce con la dimensione del fuso fa
  rivedere il file come «cambiato» a ogni giro (dimensione locale ≠ voce):
  ecco perché la voce porta la firma locale.
- `creaLavoro(adesso, coalescenzaMs)`: nei test 0, in produzione 200.
