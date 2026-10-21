---
titolo: "Rapporto della 0.82.0 (rilascio, c-39)"
quando: 2026-10-21T02:30:00+02:00
tag: ["release", "0.82.0", "rapporto"]
---

## Stato (21/10 03:55) — NON ancora pubblicata

| Pezzo | Ramo | In main | Commit fuori da main |
|---|---|---|---|
| 1) chat insieme decise dal PC | c-33 | sì | 0 |
| 2) colore fisso per attività | c-35 | sì | 0 |
| 3) chi sta lavorando | c-35 | sì | 0 |
| 4) domande contro lo stato vero | c-34 | sì | 0 |
| 5) menu dei workspace rifatto | c-36 | sì (8185286c) | 0 |
| 6) «Apri cartella» | c-37 | sì | 0 |
| 7) grafica meno caotica | c-38 | sì (599852f9) | 0 |
| collaudo della grafica | c-41 | no (lo rivede c-42) | **1** (aspetto) |
| cinque difetti grafici | c-43 | no | **2** (aspetto) |
| rilascio (questa chat) | c-39 | sì | — |

Novità, versione e pubblicazione restano ferme finché c-41 e c-43 non hanno 0
commit fuori da main e i 5 criteri con comando sono verdi sul main finale. La
bozza delle novità è pronta (7 righe).

## Criterio «test del programma principale» rosso alle 01:36 UTC (21/10)
- **Test caduto: non ricostruibile.** L'uscita salvata nel file dell'autopilota
  è tagliata all'inizio: c'è solo lo stderr normale di `cassaforte-sincronia`,
  nessuna riga con × o FAIL.
- Alle 01:36 main era fra l'unione di c-33 e quella di c-36.
- **Su main 8185286c**, con c-33 e c-36 dentro, `tests/main` da solo con
  `--reporter=dot` (03:45–03:53 ora locale): 194 file, **1843 passati**, 2 saltati,
  nessun caduto. Non c'è un file caduto da rilanciare 3 volte.
- **Il criterio dell'autopilota** è tornato verde da solo alle 01:49:58 UTC
  (codice 0).
- **Conclusione:** caduta di tempo a PC carico (in quella mezz'ora giravano anche
  le suite delle altre chat), non un difetto di c-33 o c-36. Se ricapita, serve
  l'uscita intera: la riga «×» non sta nei primi caratteri salvati.

## Controlli su main 599852f9 (21/10 02:07–02:24)
- Test del programma principale: 191 file, **1824 passati**, 2 saltati, 7 min 25 s.
- Altri test (servizio, renderer, condivisi, pty): 254 file, **2776 passati**, 9 min 9 s.
- `npm run typecheck`: 0 errori. Guardia delle cancellazioni: pulita.
- Nessun test rosso: niente da attribuire a c-35, c-37 o c-38.

## Test che cadeva a PC carico: tests/main/sottofondo.test.ts (21/10)
- Su main d4884af0 (00:35) era caduto «un testo che Claude Code perde torna in
  coda e si riscrive». Era un problema di tempo, non un difetto del codice.
- **Causa:** `digerisci()` aspettava 20 ms fissi che xterm headless finisse di
  scrivere. Sotto carico non bastano: lo schermo letto è quello di prima.
- **Correzione (solo nel test):** il terminale di prova conta le scritture in
  sospeso con il callback di `write`. `digerisci()` aspetta che arrivino a zero.
  I controlli sono rimasti tutti, compreso «mai consegnato senza esserlo».
- **Controprova:** con `digerisci()` che non aspetta niente cadono 7 test su 16,
  compreso questo. Quindi adesso l'attesa è vera, non fortuna.
- **Esiti:** il file da solo 5 volte di fila, 16/16 ogni volta. Poi la suite
  principale (copia c-39, con la correzione) in parallelo all'altra suite
  (cartella principale), alle 02:53–03:05:
  - altra suite: **2816/2816**;
  - suite principale: 1822 passati e 2 caduti per tempo scaduto sotto il carico
    doppio, cioè `cassaforte-pacchetto` (limite 20 s) e `ospite` (legge tutto
    src, limite 60 s).
  - Quei due erano passati con la suite da sola (1824/1824) e non toccano i rami
    della 0.82.0. `sottofondo` è passato (1,5 s).
- Lo stesso `setTimeout(r, 20)` c'è anche in `consegna-durante-il-turno.test.ts`
  e in `consegna-in-sottofondo.test.ts`: se cadono a PC carico, il rimedio è lo
  stesso.

## Da decidere per Nicholas
- **c-38 ha messo Istruzioni, File e «Ha deciso» della scheda dell'autopilota
  dietro «⋯»** (non tolte). La regola dice niente funzioni spostate senza il suo
  sì: lo decide lui, si può rimettere com'era.

## In attesa di Nicholas (dopo l'installazione, che fa solo lui)
- I tre gesti per i workspace del 19/10: «Sposta in…» dell'autopilota
  «Recupero VisitaFacile» → NexoraOS, poi «Elimina» sui due workspace sbagliati.
- «Chat delle prove» sul Drive: da togliere, la conferma lui.
- La cartella prova-c2 sul DESKTOP: da togliere, la conferma lui.

## Note per chi rilascia
- Nella copia di lavoro della chat non c'è `node_modules`: le suite si lanciano
  nella cartella principale (che è su main), come fanno i criteri.
- `android/` è cambiato dalla v0.81.1 → APK 2.82.0 (versionCode 138) con
  `npm run allega-apk`.

## Limiti delle chat in base al PC (c-33)

**Cosa fa.** Il numero di chat degli autopiloti al lavoro insieme lo decide il
PC: processori, memoria libera e carico degli ultimi minuti. Vale per tutti gli
autopiloti insieme, va da 2 a 8, scende subito sotto sforzo e risale di un posto
ogni 3 minuti. Le chat in più aspettano: «in fila: parte quando si libera un
posto». Le chat finite e ferme da 5 minuti, o di un autopilota fermo da 30
minuti senza domande aperte, si chiudono da sole (la conversazione resta fra le
chiuse). Non si chiudono mai le chat al lavoro, quelle adottate, quelle bloccate
o quelle con una scelta aperta. In vista c'è «N di M chat» sul PC, nella pagina
e nell'app, con il motivo dietro «?». Nelle Impostazioni (Chat e autopiloti) ci
sono tre scelte: Meno chat, Come dice il PC, Più chat.
Come funziona dentro: scheda `posti-delle-chat-0-82-0.md`.

**Test.** PC finti piccolo, medio, grande e sotto carico; salita lenta; fila;
chiusura da sola e nuovo tentativo; scelta aperta; «più chat»; la consegna
«chiudi»; la misura del carico (prima lettura, rumore); i testi su pagina,
programma e app (`PostiChatTest.kt`).

**Misura nella copia di prova.** Lo stesso lavoro, prima e dopo: un autopilota
con 8 compiti; ogni «chat» è un processo che tiene 300 MB e calcola per 40 s.
Il PC ha 8 processori e 24,5 GB.
«Prima» è il servizio senza misura del PC, cioè tetto 8 come fino alla 0.81.1.
«Dopo» usa i posti dal PC.

| | Prima | Dopo |
|---|---|---|
| Chat insieme (massimo) | 8 | 2 |
| Tempo per finire | 45 s | 169 s |
| Processore (media) | 100% | 100% |
| Memoria libera, minima | 3.551 MB | 4.669 MB (+1.118) |
| Memoria libera, media | 3.902 MB | 5.518 MB (+1.616) |

Da leggere con onestà:
- **Il PC era già pieno prima di cominciare.** Il processore stava al 100% anche
  a riposo, per il lavoro delle altre chat dell'autopilota (test, build). Per
  questo il «dopo» si ferma al minimo di 2 e il processore resta al 100% in
  tutti e due i casi: il carico non veniva da questo lavoro.
- Il guadagno è la memoria: circa 1,1 GB in più nel momento peggiore e 1,6 GB
  in media. Il prezzo è il tempo: lo stesso lavoro dura quasi 4 volte tanto,
  perché aspetta in fila invece di contendersi un PC già saturo.
- Una misura precedente, fatta prima della correzione qui sotto, ha aperto
  6 chat su un PC pieno. La prima misura dava carico 0 perché arrivava subito
  dopo la creazione del misuratore. Ora la primissima misura aspetta il secondo
  che manca, senza usare il processore. Il numero va rifatto con il PC a riposo
  (nessun'altra chat al lavoro) per vedere il caso medio.

**Revisione.** Una revisione indipendente non ha trovato difetti gravi. Ha
trovato quattro difetti che ho corretto, ognuno con il suo test:
- una chat con un permesso aperto contava come «ferma» e poteva essere chiusa;
- una `chiudi` persa teneva occupato il posto per sempre;
- senza stato del programma la regolazione tornava a «Come dice il PC» di colpo;
- una `chiudi` in coda apriva una finestra solo per chiudere una chat.

Restano due limiti, scritti nella scheda:
- le chat nate prima della 0.81.0 si chiudono un po' più tardi;
- oltre 80 chat accese, le altre non si chiudono da sole.

**Prove.**
- `typecheck` pulito.
- Test di autopilot-host, renderer, shared, pty-host e main: 4632 passati.
- Il test di `sottofondo` caduto sotto carico è «un testo che Claude Code
  perde torna in coda e si riscrive». La causa era nella prova, non nel
  programma: `digerisci` aspettava 20 ms fissi che xterm elaborasse lo
  schermo, e con il PC al 100% non bastavano. Ora aspetta che xterm abbia
  elaborato tutte le scritture ricevute (callback di `write`; in main è la versione di un'altra chat che ha fatto la stessa correzione, tenuta all'unione).
  Asserzioni e tempi finti sono gli stessi di prima. Sotto carico (suite main
  in parallelo, più Gradle) passa **10 volte su 10**, con tutti i 16 test del
  file.
- Test del programma principale, dopo le unioni di c-33 e c-36 (main
  8185286c, 21/10): la misura delle 01:34 UTC era rossa, ma il test caduto
  non si è ritrovato. Rilanciata due volte, `tests/main` è **verde**:
  194 file, **1843 passati su 1845** (2 saltati), 0 falliti. Una volta a PC
  tranquillo e una con i test del servizio e del renderer in parallelo.
  Se ricade, va preso il nome esatto del test dall'esito di quella misura.
- Android, sul codice unito (main b9dab2d0): `gradle testDebugUnitTest
  assembleDebug`, **BUILD SUCCESSFUL**, 390 test, 0 falliti, 1 saltato. L'APK
  debug si compila. Nel progetto non c'è `gradlew`: si usa `gradle`.
  Una prima build ha dato «Unresolved reference» in `Gestione.kt`
  (`TitoloDialogo`, `apriCartellaDa`, `Aiuto`). Era la cache incrementale di
  Kotlin rimasta da prima dell'unione: rilanciata sullo stesso albero, è verde.

## 5) Menu dei workspace rifatto — c-36 (21/10, 03:30)

**Cosa c'è.** Su PC, pagina e app: in cima la ricerca per nome; gruppi
«Recenti» (dove sei + gli ultimi dove sei andato, max 5, solo con più di 5
workspace), «Questo PC», un gruppo per ogni altro PC; azioni di ogni workspace
dietro «⋯» (apri, rinomina, Apri cartella, Sposta su un altro PC — solo sul PC,
è il trasloco —, Elimina con recupero 30 gg; altri PC: Apri, Porta qui). Il piede
«Crea, rinomina o elimina…» resta. Dettagli e trappole: `menu-workspace.md`.

**Funzioni spostate (non tolte), da far vedere a Nicholas:** rinomina, elimina e
«Apri cartella» erano righe/tasti per il solo workspace davanti (pagina:
riquadro Workspace; PC: piede «📁 Apri cartella» messo da c-37; app: icona
cartella). Ora sono nel «⋯» di **ogni** riga, come chiedeva la consegna.

**Dentro lo schermo — foto dalla copia di prova** (30 workspace finti,
`note/prova-c36/foto/prima` e `/dopo`, fuori da git): prima a 560×380 la tendina
finiva a 384 px (fuori dalla finestra) e a 480×300 tagliata; dopo, a 800×500,
560×380 e 480×300 finisce 8 px sopra il bordo e l'elenco scorre dentro; il «⋯»
dell'ultima riga si apre sopra. Pagina: il riquadro Workspace da 982 a 698 px.

**Guasti trovati e corretti strada facendo.**
- Un workspace rinominato tornava col nome vecchio al riavvio (ripescato dalle
  copie «migrazione-elenco-…»): ora la rinomina lo annota come eliminato.
- «Apri cartella» da pagina e app rispondeva sempre «aggiornalo alla 0.82.0»
  (la rotta di c-37 non era collegata in `index.ts`): collegata e provata.
- `CompatibilitaVecchiTest` (Android) cadeva per la `FunzionePc.CARTELLA` nuova:
  sistemato (main aveva la stessa correzione, tenuta la sua).

**Revisione** (TypeScript e Kotlin, a parte): niente di grave; corretti 9 punti
(tastiera nel «⋯», fuoco perso dopo rinomina e «Porta qui», errore di «Porta
qui» muto, casella della rinomina che restava sulla pagina, nell'app voce
spenta senza il perché e «⋯» che restava aperto con l'elenco cambiato, casi
di test Kotlin mancanti per Sposta e PC senza «Apri cartella»).
