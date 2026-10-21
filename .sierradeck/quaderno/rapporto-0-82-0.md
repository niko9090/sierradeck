---
titolo: "Rapporto della 0.82.0 (rilascio, c-39)"
quando: 2026-10-21T02:30:00+02:00
tag: ["release", "0.82.0", "rapporto"]
---

## Stato (21/10 05:20) — v0.82.0 PUBBLICATA, NON installata

**Release:** https://github.com/niko9090/sierradeck/releases/tag/v0.82.0
- Titolo «SierraDeck 0.82.0»: non bozza, non pre-release, **Latest**, una sola
  release sul tag.
- Il tag `v0.82.0` sta sul commit `e70faf87` (main 8faa6827 più il commit della
  versione). Su origin è spinto **solo il tag**.
- **Cinque allegati, tutti «uploaded»:**
  - `SierraDeck-Setup-0.82.0.exe` (115.347.237 byte) con il suo `.blockmap`;
  - `latest.yml`: `version: 0.82.0`, e la `size` combacia con l'exe;
  - `SierraDeck-2.82.0.apk` (16,8 MB): APK di rilascio, versionCode 138, firma
    verificata da `npm run allega-apk` («CN=Nicholas Ferrari, O=Ferrari
    Consulenze, C=IT»). Ricompilato perché `android/` è cambiato dalla v0.81.1;
  - `app-android.json`: app 2.82.0, punta all'APK della v0.82.0, programma 0.82.0.
- **Controllato dal link pubblico** `releases/latest/download/…`: latest.yml dice
  0.82.0 e app-android.json dice 2.82.0.
- **Mai installata da noi.** L'installazione la fa solo Nicholas.

**Novità (8 righe, in `src/shared/novita.ts`, le stesse nelle note di GitHub):**
- chat insieme decise dal PC;
- colore fisso per attività;
- chi sta lavorando;
- domande solo su cose da decidere;
- menu dei workspace rifatto;
- «Apri cartella»;
- meno cose in vista;
- righe più pulite (le correzioni di c-43).

**I 5 criteri sul codice della release** (main 8faa6827 + `e70faf87`, uno alla
volta, 21/10 04:59–05:07):

| Criterio | Esito |
|---|---|
| guardia delle cancellazioni | pulita |
| test del programma principale | 195 file, **1857 passati**, 2 saltati |
| altri test (servizio, renderer, condivisi, pty) | 260 file, **2840 passati** |
| `npm run typecheck` | 0 errori |
| Android `gradle testDebugUnitTest assembleDebug` | **BUILD SUCCESSFUL** (3 min 23 s) |

**Rami di questo lavoro, uno per uno:**

| Ramo | Cosa | Esito |
|---|---|---|
| c-32 | analisi della grafica 0.79.0 → 0.81.1, i cinque difetti | **unito** nel ramo c-39 (85795bb9), solo due schede del quaderno, senza conflitti: è il «prima» a cui rimanda questo rapporto, e i suoi difetti li ha corretti c-43 |
| c-33 | chat insieme decise dal PC (pezzo 1) | **unito** dopo la Revisione (b9dab2d0 e c6d06b2a), ramo chiuso |
| c-34 | domande contro lo stato vero (pezzo 4) | **unito** dopo la Revisione, ramo chiuso |
| c-35 | colore fisso e chi sta lavorando (pezzi 2 e 3) | **unito** dopo la Revisione, ramo chiuso |
| c-36 | menu dei workspace (pezzo 5) | **unito** dopo la Revisione (8185286c), ramo chiuso |
| c-37 | «Apri cartella» (pezzo 6) | **unito** dopo la Revisione, ramo chiuso |
| c-38 | grafica meno caotica (pezzo 7) | **unito** dopo la Revisione (599852f9), ramo chiuso |
| c-39 | rilascio (questa chat), correzione del test di sottofondo, i due difetti del «?» | si unisce a fine turno: versione, rapporto e unione di c-32 |
| c-40 | — | ramo chiuso, niente fuori da main |
| c-41 | collaudo della grafica (test `it.fails`) | **unito** dopo la revisione di c-42, 0 commit fuori |
| c-42 | revisione di c-41 | ramo chiuso, niente fuori da main |
| c-43 | i cinque difetti di c-32 (feddc338, 85bfd74c, b176a873) | **unito** (8faa6827), 0 commit fuori |

**Misura «N di M» dopo l'unione di c-43** (04:57–04:58, script con il codice
della 0.82.0):
- 24 claude.exe accesi, carico 43–45%, 8,8 GB liberi su 24,5.
- Risultato: **M = 6**, deciso dai processori (8 × 3/4). La finestra della copia
  diceva «0 di 4 chat» un minuto prima, quando il carico era ancora più alto.
- Il PC completamente a riposo **non c'è stato**: le altre chat lavoravano
  sempre. In tutto M è passato da 2 a 3, a 4, a 6, salendo man mano che il
  carico calava.

**Foto «dopo» rifatte sul main finale:** `30-tel-inizio`, `34-tel-chat` e
`10-pc-panoramica`, le schermate toccate da c-43.
- **«In moto»** sulla pagina conta solo chi lavora: c'è l'autopilota fermo,
  nessun «IN MOTO 4».
- **«Seconda prova»** risulta ancora «chiusa». Nella copia è giusto: quella chat
  non è mai stata accesa. La correzione 1 di c-43 (chat vive dei workspace
  dietro) qui non si poteva mostrare, perché non c'era una chat viva.
- Gli script delle foto sono in `note/foto-0-82-0/script/` della cartella
  principale. Puntano a `R:` e alla copia di c-39, che a fine lavoro non c'è
  più.

## Numeri e foto: cosa c'è e cosa manca (controllo del 21/10, 04:10)
- **CPU e memoria prima e dopo (c-33): ci sono**, sezione «Limiti delle chat in
  base al PC». Misurati però con il PC già al 100% di processore: il caso «PC a
  riposo» **manca** e va rifatto.
- **Foto del menu dei workspace (c-36): ci sono**, 6 «prima» e 14 «dopo».
  - Copiate in `note/foto-0-82-0/c-36/prima` e `/dopo` della cartella principale,
    fuori da git (`note/` è ignorata). Mostrano il nome del PC, quindi non vanno
    pubblicate.
  - L'originale sta nella copia di lavoro di c-36 (`note/prova-c36/foto`) e
    sparisce con lei.
  - Ho guardato le due foto a 480×300: prima la tendina esce dalla finestra,
    dopo ha ricerca, Recenti, gruppo «Questo PC» e «⋯», e finisce dentro.
- **Foto della grafica (c-38): mancano.** Il suo `grafica-0-82-0.md` cita
  `foto-0-82-0/prima` e `/dopo`, ma non le ho trovate né in `note/`, né nella
  copia di c-38, né fra i file temporanei. Restano le misure scritte in quella
  scheda (es. bande da 51 a 30 px).
- **Foto del collaudo (c-41): mancano, per scelta di c-41.** Non le ha fatte
  perché i cinque difetti erano ancora aperti, e vanno scattate dopo la
  correzione di c-43. c-41 ha lasciato i test `it.fails` in
  `tests/main/collaudo-grafica-0-82-0.test.ts`: chi corregge toglie `.fails`.
- **App:** nessuna foto da nessuna chat, perché non ci sono né emulatore né
  telefono. Le controllano i test JUnit.

## Foto della grafica, prima e dopo (c-39, 21/10 04:20–04:40)
- **Prima:** le 24 foto di c-32 sulla 0.81.1, in `note/foto-0-81-0/dopo/` della
  cartella principale.
- **Dopo:** in `note/foto-0-82-0/dopo/` della cartella principale, fuori da git.
  - Sono scattate dalla copia di prova sul codice di main c6d06b2a più le due
    correzioni qui sotto. La barra mostra ancora «v0.81.1», perché la versione
    non è ancora cambiata.
  - Mostrano gli indirizzi di rete e il nome «PC di prova»: non si pubblicano.
- **Avvertenza sul confronto:** la copia di c-32 aveva 4 chat finte e nessun
  autopilota, questa ha 14 workspace e un autopilota con 3 agenti. Il confronto
  vale per come è fatta la schermata, non riga per riga.
- **Copia:**
  - cartella `note/prova-c39` della mia copia di lavoro, vista come `R:`;
  - porte 47740/47741 dentro `preferenze`;
  - DevTools sulla 9403 per la finestra e sulla 9404 per Edge a 412 px;
  - `SIERRADECK_PROVA` e `CLAUDE_CONFIG_DIR` di prova.
  - Nel registro della copia non c'è nessuna traccia della 47630. Il servizio
    vero è rimasto acceso e intatto.
  - Spenta alle 04:42 con `avvia.ps1 -ferma`: nessun processo e nessuna porta
    rimasti.

| Foto (dopo) | Prima (0.81.1) | Cosa si vede ora | Cosa è cambiato |
|---|---|---|---|
| `10-pc-panoramica` | `10-pc-panoramica` | Panoramica di un autopilota fermo: obiettivo e criteri in cima, «Al lavoro», «Adesso» con una riga per agente (Sviluppo, Revisione), piano a colonne con l'etichetta colorata del ruolo | un solo «?» per le due viste; «Adesso» non ripete «Nessuna chat al lavoro»; i ruoli hanno colore e lettera (S, R) |
| `11-pc-tutte-affiancate` | `11-pc-tutte-affiancate` | l'interruttore «Panoramica · Tutte le chat affiancate» con un «?» | bande sopra più basse (30 px invece di 51) |
| `13-pc-autopiloti` | `13-pc-autopiloti` | elenco con chat, criteri, ultima azione, da quanto, stato | — (stessa tabella) |
| `13b-pc-scheda-autopilota` | — | scheda: stato «fermo · da 1 min», criteri, «Dal vivo», **Specialisti**: una riga per agente con segno, ruolo, stato e cosa fa («lavora a: …», «rilegge: …») | nuovo (pezzi 2 e 3); Istruzioni, File e «Ha deciso» sono dietro «⋯» (da decidere per Nicholas) |
| `15-pc-menu-workspace-560x380` | `15-pc-chat-e-workspace` (c-36: `note/foto-0-82-0/c-36/prima`) | il menu a 560×380 con 14 workspace: ricerca, «Recenti», «Questo PC · PC di prova», «⋯» per riga, piede «Crea, rinomina o elimina…»; finisce dentro la finestra e scorre | prima usciva dalla finestra (foto di c-36) |
| `15b-…-ricerca-560x380` | — | «fat» → resta solo «Prova 07 fatture» | nuovo (ricerca) |
| `18-pc-impostazioni` | `18-pc-impostazioni` | sezione «Chat e autopiloti»: «Chat degli autopiloti al lavoro insieme» con «Meno chat · Come dice il PC · Più chat» e «?» | nuovo (pezzo 1) |
| `19-pc-posti-aiuto` | — | «0 di 2 chat» in alto e il suo «?» aperto: processori, memoria, carico, chiusura da sola, dove si regola | nuovo; **qui ho trovato e corretto due difetti** (sotto) |
| `30-tel-inizio` | `30-tel-inizio` | pagina, Domande: «Niente da rispondere ?» e «In moto adesso» con l'autopilota fermo in una scheda con «Riprendi» e «Guarda» | prima: quattro chat ferme in «IN MOTO 4» (è il difetto 2 di c-41, ancora da correggere in c-43) |
| `32-tel-autopiloti` | `32-tel-autopiloti` | «0 di 3 chat ?» in cima, l'autopilota in una riga con stato, da quanto e criteri | nuovo «N di M» anche sulla pagina |
| `34-tel-chat` | `34-tel-chat` | le chat per workspace; «Seconda prova» dice «chiusa · tocca per riaprirla» | è il difetto 1 di c-41 (da c-43) |

**Due difetti trovati nelle foto e corretti** (commit f9a43fc0, con i loro test):
- **Il «?» di «N di M chat» nella barra in alto non si leggeva.**
  - Il fumetto c'era, 420×194 px, ma la barra (`.console`, `overflow-x: auto`)
    lo tagliava a una striscia di pochi pixel.
  - Ora dentro una barra si apre `fixed`, alle coordinate del tasto
    (`posizioneFissa` in `Aiuto.tsx`, `tests/renderer/aiuto-nelle-barre.test.ts`).
  - Vale per tutti i «?» delle barre `.console`. Provato dal vero: si apre
    intero, 420×212 px a (601, 43).
- **Il «?» si contraddiceva.**
  - Con il PC sotto sforzo e in risalita diceva insieme «sotto sforzo» e «si è
    liberato». Ora dice «ne darebbe di più: il numero risale con calma».
  - Il testo è lo stesso per pagina e app, perché arriva dal servizio.
  - Corretto anche il rimando: «Impostazioni → Chat e autopiloti».

**Trappola delle copie di prova:** un autopilota finto senza `iniziatoIl` né
`ultimoEvento` riceve il 1° gennaio 1970. Risulta «fermo da 29875820 minuti» e
le sue chat si chiudono da sole al primo giro. Si vede in `13-pc-autopiloti`.
Non è un difetto di c-33, perché gli autopiloti veri li scrive il servizio con
`iniziatoIl`. Nel `prepara.mjs` di c-39 ora ci sono tutti e due.

## Misura del PC a riposo, «N di M» calcolato (pezzo 1)
Il programma installato è la 0.81.1 e non ha `/posti-chat`, perché la 0.82.0 non
si installa. Per questo «N di M» viene dal codice della 0.82.0 in due modi:
- con `creaMisuratore` e `postiDalPc` su questo PC, sei giri da 10 s
  (`note/prova-c39/misura-posti.ts`);
- dalla copia di prova accesa, che usa le stesse funzioni.

| Quando | Chat al lavoro (claude.exe accesi) | Carico | Memoria libera | «N di M» |
|---|---|---|---|---|
| 04:17–04:18, script | 28 claude.exe (tutte le chat di tutti gli autopiloti) | 73–92% | 7,0–7,2 GB su 24,5 | M = **4** (6 dai processori, ridotti per il carico sopra il 70%) |
| 04:24, finestra della copia | 0 della copia | 97% | 6,7 GB | «**0 di 2** chat» (carico sopra l'85%: metà) |
| ~04:38, pagina della copia | 0 della copia | in calo | — | «**0 di 3** chat»: il numero risale di un posto |

- Si vede **M che scende col carico (4 → 2) e risale (2 → 3)**.
- **A PC a riposo: manca.** In quella mezz'ora il carico non è mai sceso sotto
  il 70%. La seconda misura la prendo dopo l'unione di c-43, quando meno chat
  sono al lavoro. Se non scende, resta scritto che manca.

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
- **c-36 ha messo rinomina, Elimina e «Apri cartella» nel «⋯» di ogni
  workspace** (prima erano tasti per il solo workspace davanti). Lo chiedeva la
  consegna, ma è uno spostamento: lo vede lui.

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

## Correzione grafica: i cinque difetti di c-32 (c-43, 21/10)

Ramo `ap/ap-f1e631f5/c-43`, partito da main `973aab3c` con c-41 unito (il suo
test e la sua scheda servivano qui). Tutti e cinque corretti su PC, pagina e
app. Nel test di c-41 non resta nessun `.fails`, e il `todo` del difetto 1 ora
è un test vero. Nessuna funzione tolta o spostata.

| # | Difetto | Correzione |
|---|---|---|
| 1 | Pagina e app: le chat del workspace che non è davanti risultano «chiusa», anche se girano | La finestra annuncia anche le chat vive dei workspace che tiene in memoria (`chatDietro` in `memoria-workspace.ts`), con il loro workspace e `dietro: true`. Pagina e app le mettono nel gruppo giusto, accese. Dal telefono ci si scrive e se ne leggono le righe (`riquadroDelTelefono`). Per le consegne non contano «in finestra» (`chatDietroPerFinestra` in `index.ts`): lì resta tutto com'era |
| 2 | «IN MOTO 4» con quattro chat ferme | Il numero conta solo chi lavora davvero. Le altre restano in vista, sotto «ALTRE CHAT n» |
| 3 | Righe inutili sotto il nome di una chat | Tolte «Opus 5.5 · 0.00 $» e «›», anche nella lettura di riserva dal flusso. Nella copia è uscito altro, tolto pure quello: la cornice con il titolo (solo trattini), «◐ medium · /effort», il suggerimento «❯ Try "…"», «1 more notice hidden» |
| 4 | «Fatta: 2 autopiloti nuovi» con Autopiloti vuoto | «Fatta: Panoramica nuova in N workspace, parte quando le scrivi.» Il «?» dice che fino al primo messaggio non compaiono fra gli Autopiloti. Uguale sui tre lati |
| 5 | Nuova chat promette «Nuova chat» e poi rifiuta il nome vuoto | Il nome vuoto vale «Nuova chat», come promette la riga. «Apri la chat» è attivo |

**Prova dal vero del difetto 1** (copia `SIERRADECK_PROVA`, porte 47720/47721,
due workspace Prova-082-a con 3 chat e Prova-082-b con 1):
- con A davanti, prima di aprire B: «Seconda prova» di B fra le chiuse (giusto, non era mai partita);
- aperto B e tornati ad A: «Seconda prova» accesa sotto PROVA-082-B, `dietro`, nessuna chiusa;
- `/api/storia` della chat dietro: 8 righe, risponde la finestra;
- stesso esito dopo un riavvio della copia. Copia spenta, nessun processo rimasto, cartella tolta.

**Foto «dopo»** in `note/foto-0-82-0/c-43/` della cartella principale, fuori da git:
`pag-1-domande-in-moto` (IN MOTO 0, ALTRE CHAT 3), `pag-2-chat-due-workspace`
(B accesa con A davanti), `pc-1-nuova-chat-nome-vuoto`,
`pc-2-impostazioni-trasformazione`.

**Controlli (c-43), sul ramo con main `8308b002` unito (c-36 compreso):**
typecheck pulito, guardia delle cancellazioni pulita. `tests/main`: 195 file,
**1857 passati**, 2 saltati. Servizio, renderer, condivisi, pty: 259 file,
**2834 passati**. Android `gradle testDebugUnitTest assembleDebug`: verde, 394
test, 0 falliti (`RaggruppoTest` +1, `MigrazioneTest` aggiornato).

**Da sapere:** nella copia la finestra legge le chat dal flusso, non dallo
schermo disegnato, anche per le chat davanti (sotto il nome compariva la cornice
del flusso). Le righe vengono pulite lo stesso. Perché `righeDiPty` non risponda
non l'ho cercato: è fuori da questo compito, va guardato a parte.
