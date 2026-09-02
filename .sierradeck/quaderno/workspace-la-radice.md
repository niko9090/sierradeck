---
titolo: "Workspace e layout: l'analisi a fondo, e la radice vera"
quando: 2026-08-31T02:30:00+02:00
tag: ["workspace", "layout", "persistenza", "difetto", "radice", "analisi"]
---

# Perché quattro correzioni non hanno chiuso il difetto

Le tre schede precedenti ([[workspace-chat-che-spariscono]],
[[chat-che-spariscono-la-regola]], [[chat-ferme-che-sembrano-al-lavoro]]) hanno
chiuso quattro cause vere — il nome vecchio, la chiave del monitor ricalcolata,
`crea`/`elimina` che partivano dall'attivo, il salvataggio-dettatura. Il difetto
è rimasto perché **nessuna delle quattro tocca il modello**. Sono tutte
correzioni *dentro* uno schema che non regge.

Questa scheda non è una quinta teoria: è la lettura del modello.

## Lo schema di oggi, detto in tre righe

1. L'archivio (`workspaces.json`) tiene, per ogni workspace, **una mappa di
   layout per monitor**, con chiave = geometria dello schermo.
2. Una finestra chiede `perMonitor[chiave]`, se lo mette a schermo, e a ogni
   modifica **riscrive quella casella per intero** con quello che ha davanti.
3. La chiave la calcolano **due funzioni diverse**: `chiaveDiFinestra` (viva, in
   `index.ts`) e `chiaveDellaFinestra` (congelata alla prima domanda, in
   `ipc.ts`).

Ognuna delle tre righe contiene un difetto strutturale.

## Difetto 1 — la dimensione «monitor» è già stata abbandonata a metà

La decisione **«un workspace, una disposizione»** è già presa e scritta nei
commenti di `unicoLayout` e in `main/index.ts`: all'avvio tutte le caselle di
ogni workspace vengono fuse sotto **una sola chiave**, quella della prima
finestra (`casa`).

Ma il resto del codice non l'ha seguita. `layoutPerFinestra` continua a leggere
**stretto**: `perMonitor[chiave] ?? vuoto`, senza ripiego (tolto apposta, per
non mostrare la stessa chat in due finestre). Quindi:

> dopo la fusione, **ogni finestra che non risolve esattamente a `casa` trova il
> vuoto** — e le chat sono lì, nel file, sotto una chiave che nessuno chiede
> più.

È letteralmente il sintomo dell'utente: *«le chat non ritornano nei giusti
workspace»*. Non sono perse: non c'è nessuno a chiederle.

E subito dopo quella finestra vuota **salva**, sotto la *sua* chiave. Al riavvio
successivo `unicoLayout` fonde le due caselle — e `aggiungiPaneA` deduplica
**per id di riquadro, non per `sessionUuid`**: la stessa conversazione, se ha
preso due id di riquadro in due giri, entra **due volte** nello stesso layout.
Due riquadri, due `claude.exe`, due `--resume` sulla stessa conversazione.

## Difetto 2 — la chiave è calcolata due volte, in due modi

`casa` (la fusione, all'avvio) usa la geometria **viva**; `chiaveDellaFinestra`
(carica e salva) **congela** la geometria alla prima domanda del renderer. Fra i
due istanti la finestra viene posizionata, ingrandita, messa a schermo intero.

Basta un pixel o un fattore di scala di differenza e la finestra legge una
casella diversa da quella in cui è stato fuso tutto. Non è una gara rara: è la
sequenza normale dell'avvio, e spiega il *«spesso»* dell'utente — a volte i due
istanti coincidono, a volte no.

**La geometria di uno schermo non è un'identità.** Cambia con la risoluzione, la
scalatura, il monitor staccato, la finestra trascinata. Usarla come chiave di
archiviazione è la scelta da cui discende tutto il resto.

## Difetto 3 — un salvataggio è una dettatura senza provenienza

Il Core riceve `layout:salva(layout, nome, congedate)` e **non ha modo di sapere
su cosa quel layout è stato calcolato**. Non distingue:

- «questo è il workspace X come me l'hai dato, più una chat in più» — da
  scrivere;
- «questo è quello che ho a schermo, ma non ho mai ricevuto X» — da buttare.

La regola dei `congedi` (quarto giro, non ancora pubblicata) è un rimedio di
**contenuto**: si accorge solo delle chat che finirebbero in *nessun* workspace.
Non vede una chat scritta nel workspace **sbagliato**, non vede un salvataggio
basato su una casella vuota che però contiene già dei riquadri nuovi, non vede
due finestre che si sovrascrivono a vicenda restando entrambe non vuote.

## Difetto 4 — due finestre finiscono sempre sullo stesso workspace

`workspace:cambiato` → ogni finestra fa `segui` → `trasloca`: **tutte le
finestre seguono l'attivo**. Con «un workspace, una disposizione» questo
significa che due finestre mostrano *lo stesso layout*, cioè gli stessi
riquadri con gli stessi id, ognuna con il proprio terminale agganciato allo
stesso `ptyId` — e ognuna che risalva la propria vista sopra quella dell'altra.

## Difetto 5 — un salvataggio fallito non lo dice nessuno

`WorkspaceStore.scrivi` chiama `scriviJsonAtomico` e **butta via il booleano**.
`scriviAtomico` non solleva mai per progetto (chi salva è dentro un canale a
senso unico). Su Windows la `rename` sopra un file esistente fallisce con EPERM
quando l'antivirus o un altro lettore lo tiene aperto — e `workspaces.json`
viene **riletto ogni 1,5–2 secondi** dal Client e dalle consegne d'autopilota.

Un fallimento lascia sul disco la versione di prima. Peggio: la cache di
`leggi` non viene invalidata dalla scrittura, quindi in memoria tutto sembra a
posto. La perdita si scopre solo al riavvio. È il *«i salvataggi non sono
corretti»* dell'utente, nella sua forma più letterale.

## Difetto 6 — `layout:applica` uccide i terminali

`App.tsx` collega `layout.suApplica` a `useLayoutStore.carica`, e `carica`
**non tocca `ceduti`**. Quando i riquadri cambiano id — un ripristino
d'istantanea, la fusione all'avvio — i vecchi `Terminal` si smontano, la loro
pulizia non trova il riquadro fra i `ceduti` e chiama `chiudi()` invece di
`stacca()`: `claude.exe` ucciso.

`cambiaVista` fa la cosa giusta ed esiste già. `carica` è la porta lasciata
aperta. È il *«spesso le chiude»*.

## La radice, in una frase

> **Il layout è archiviato sotto una chiave che non identifica nessuno
> (la geometria di uno schermo), e ogni salvataggio è una dettatura di cui il
> Core non conosce la provenienza.**

Tutto il resto — le chat che non tornano, quelle che si sdoppiano, quelle che
spariscono, i salvataggi che non si vedono — sono conseguenze di queste due
cose. Ecco perché quattro correzioni ragionate, tutte giuste, non hanno chiuso
niente: correggevano *chi* scrive e *sotto quale nome*, mai *sotto quale
identità* e *a partire da cosa*.

## La correzione, fatta

### 1. La chiave è lo **slot**, non la geometria

`WorkspaceSalvato.perMonitor` → `perSlot`. La chiave non è più
`1920x1080@0,0@1` ma `1`, `2`: il numero d'ordine della finestra, assegnato
prendendo **il più basso libero** — così chiudendo la seconda finestra e
riaprendone una, quella nuova ritrova la disposizione della vecchia invece di
inaugurare una terza casella che nessuno chiederà più.

La migrazione sta in `parseArchivio` (`raccogliInUnoSlot`), cioè **alla
lettura**, prima che chiunque possa chiedere qualcosa. Prima stava in
`main/index.ts` e girava *dopo* la nascita della finestra: correva contro la sua
`layout:carica`, e usava una chiave calcolata da una funzione diversa da quella
di carica/salva. Quel blocco non c'è più.

### 2. Lo **scontrino**: un salvataggio è la risposta a una consegna

`src/main/consegne-layout.ts` — modulo puro, provato senza Electron.

Ogni volta che un layout **arriva** a una finestra (avvio, cambio di workspace,
ripristino, rifiuto rimandato indietro) resta una ricevuta: un numero
progressivo e **per quale workspace** valeva. Il salvataggio rimanda il numero;
se non combacia, il layout descrive un mondo che non c'è più e **non si
scrive** — si rimanda invece la verità, e la finestra si riallinea.

Due conseguenze che da sole valgono la modifica:

- una finestra che non ha **mai** ricevuto un layout non ha ricevuta, quindi non
  può salvare. Muore lì la classe intera dei salvataggi «basati sul nulla»;
- **il workspace sotto cui si scrive lo dice la ricevuta, non la finestra.**
  Sparisce tutta l'euristica di `salvaLayoutAttivo` («nome autorevole, altrimenti
  ripiego sull'attivo»), che è stata l'origine di tre perdite. Non c'è più niente
  da dichiarare, quindi niente da sbagliare. La funzione ora si chiama
  `salvaLayoutIn(archivio, workspace, slot, layout)` e non indovina niente.

Lo scontrino vive **nel ponte** (`preload/index.ts`), non nella logica: è una
proprietà del canale. Ogni arrivo passa da `ricevi()`, ogni salvataggio riparte
da lì. Tenerlo nel renderer avrebbe voluto dire ricordarsi di passarlo in cinque
punti, e il giorno che uno se ne dimentica si torna al guasto.

### 3. `carica` **non esiste più**

Accanto a `cambiaVista` c'era `carica`, che faceva la stessa sostituzione **senza
toccare i `ceduti`**. I due nomi sembravano sinonimi e non lo erano: chi usava
`carica` faceva morire i `claude.exe` di ogni chat che usciva di scena, perché il
`Terminal`, smontandosi, non trovava il proprio riquadro fra i ceduti e chiamava
`chiudi()` invece di `stacca()`. Ci erano cascati **il ripristino di
un'istantanea** (`ModaleIstantanee`) e **ogni layout spinto dal Core**
(`layout:applica`). Era il «spesso le chiude».

Toglierla rende l'errore impossibile invece che raro.

### 4. La deduplica passa da `sessionUuid`

`aggiungiPaneA` deduplicava per id di riquadro: la stessa chat che in due giri
aveva preso due id entrava due volte nello stesso layout — due riquadri, due
`claude.exe`, due `--resume` sulla stessa conversazione.

E dentro un workspace **vince lo slot che si sta scrivendo**. Lasciandolo decidere
a `unaChatUnWorkspace` avrebbe deciso l'ordine delle chiavi — e le chiavi sono
numeri, che JavaScript ordina *sempre* in modo crescente: avrebbe vinto lo slot
`1`, e la seconda finestra si sarebbe vista strappare via, a ogni salvataggio, la
chat che ha davanti.

### 5. Un salvataggio fallito lo dice

`WorkspaceStore.scrivi` restituisce `boolean`, invalida la cache, e in
`layout:salva` un `false` finisce nel registro della sessione come
`SALVATAGGIO NON SCRITTO`.

### 6. Le istantanee archiviano sotto lo stesso slot

`FinestraSalvata` ha ora `slot` accanto a `monitor`: il primo archivia, il
secondo serve solo a rimettere la finestra sullo schermo dov'era. Prima erano la
stessa cosa, e il ripristino scriveva le chat sotto una chiave che la finestra non
avrebbe mai chiesto — il ripristino sembrava riuscito e il lavoro non tornava.
Le istantanee vecchie, che lo slot non ce l'hanno, si numerano per posizione.

### 7. Nessuna chat in uno slot che nessuna finestra aprirà

La prima stesura degli slot lasciava aperto il difetto **nella sua terza forma**.
Prima la chiave era la geometria di uno schermo che non c'era più; adesso sarebbe
il numero di una finestra che nessuno riapre. In tutti e due i casi il lavoro è
nel file e non lo vede nessuno — che per chi lo ha fatto è indistinguibile
dall'averlo perso. Tre cose lo chiudono:

**I numeri si compattano, alla lettura.** Slot occupati `{1, 3}` diventano
`{1, 2}`, con la stessa rinumerazione per **tutti** i workspace — deve esserlo,
perché la finestra numero 2 è la stessa ovunque. E si guarda l'archivio intero,
non il solo workspace davanti: lo slot 2 di un workspace che non hai davanti è
lavoro come gli altri. Oltre `SLOT_MAX` (4) si raccoglie nell'ultimo: si perde
una disposizione, non una conversazione. Dopo, gli slot occupati sono esattamente
`1..K`.

**All'avvio si aprono K finestre**, e il numero si sa **prima** di aprirne una.
Chi lavorava con due finestre e riapriva con una sola vedeva metà del suo lavoro.
Lo slot si riserva alla **nascita** della finestra, non alla prima domanda del suo
renderer: l'ordine in cui i renderer finiscono di caricare non è quello in cui le
finestre sono state aperte, e due finestre nate insieme si sarebbero prese gli
slot a rovescio.

**E chi ha lo slot più basso adotta gli orfani.** Un workspace non è quello
dell'avvio: passandoci dentro puoi trovarne uno che l'ultima volta era disposto
su due finestre mentre adesso ne hai una. `layoutPerFinestraViva` dà a quella
finestra anche tutto ciò che sta in slot che nessuna finestra aperta rivendica —
sempre la stessa finestra, non quella che per caso chiede per prima, o le chat
comparirebbero in doppio. L'adozione si consolida da sola: il primo salvataggio
le scrive nel proprio slot e l'invariante le toglie da quelli vecchi.

Vale per ogni strada — avvio, cambio di workspace, ripristino di un salvataggio,
verità rimandata dopo un rifiuto — perché tutte passano da `daConsegnare`.

### 8. Due monitor sono due finestre, anche dopo la migrazione

La prima stesura della migrazione raccoglieva tutto nello **slot 1**, un
workspace alla volta. Provata sui dati veri di questa macchina — due monitor,
due finestre, cinque workspace — voleva dire: **due finestre diventano una** e le
chat dei due schermi finiscono ammucchiate. Tornare a metà non è tornare.

Adesso ogni monitor diventa **uno slot suo**, e la corrispondenza è la stessa per
tutto l'archivio: il monitor di sinistra è lo slot 1 in *ogni* workspace, così la
finestra numero 1 lo ritrova ovunque. Fatta workspace per workspace, la stessa
finestra avrebbe pescato in posti diversi a seconda di dove ti trovi.

E `ordineDeiMonitor` è **la stessa funzione** che usa chi apre le finestre: la
prima finestra va sul primo monitor di quell'ordine, che è quello le cui chat
stanno nello slot 1. Se le due parti ordinassero in modo diverso, la finestra di
destra si aprirebbe con le chat di quella di sinistra — di nuovo «le chat non sono
dove le avevo lasciate», e per un motivo che nessuno avrebbe trovato leggendo il
codice di una sola delle due.

**La lezione, che vale oltre questo difetto:** quattro giri di ragionamento non
avevano visto quello che il primo sguardo ai dati veri ha mostrato in un minuto.
Un caso costruito a tavolino dimostra quello che chi lo scrive ha già pensato; il
file di chi usa davvero il programma contiene anche quello a cui non ha pensato
nessuno. `tests/shared/ritorna-tutto.test.ts` legge quel file, se c'è, e confronta
le chat **salvate** con quelle **consegnate a una finestra**, workspace per
workspace.

### Quante finestre si aprono, e come si cambia

Domanda che tornerà: *«perché all'avvio me ne apre due?»*. Il numero lo decide
**il salvataggio**, non una preferenza: si apre una finestra per ogni slot che
contiene delle chat. Con lavoro archiviato su due schermi le finestre sono due,
e non c'è modo di fare altrimenti — una finestra sola non può mostrare due
disposizioni, ed è proprio non aprendo la seconda che le sue chat sparivano.

Non serve un interruttore, perché il gesto esiste già: spostando le chat della
seconda finestra nella prima (trascinamento, o «sposta in un'altra finestra»)
quello slot resta vuoto, `slotOccupati` non lo conta più e dal riavvio dopo si
apre una finestra sola. E al contrario: rimettendo del lavoro sul secondo
monitor, la seconda finestra torna da sé. Lo stato lo racconta il lavoro, non
una casella nelle impostazioni.

### 9. Quante finestre, e dove: **registrate, non dedotte**

Il difetto è tornato ancora, e per la stessa ragione di sempre in una veste
nuova. Chi aveva **una finestra sola sul monitor destro** se ne è ritrovate due
al riavvio.

**Il numero di finestre lo deducevo dagli slot pieni.** Ma uno slot pieno dice
«qui c'era del lavoro», non «qui c'era una finestra». Nell'archivio di quella
macchina c'erano chat sotto tutti e due i monitor: le une di quel giorno, le
altre **vecchie di settimane**, di quando due finestre le usava davvero. Nessuno
aveva mai scritto da nessuna parte quante finestre ci fossero, e una deduzione
su dati vecchi è una deduzione sbagliata.

Adesso `Archivio.finestre` è un **fatto registrato**: si riscrive a ogni
salvataggio del layout e a ogni finestra che nasce o muore. Assente vuol dire
«non lo so», e allora si torna a dedurre — che è peggio, ma non fa perdere
niente, perché le chat degli slot che nessuno rivendica le adotta la prima
finestra.

**E `finestre.json` aveva lo stesso guasto:** teneva un ricordo *per monitor*,
accumulato una finestra alla volta e mai ripulito. Riaprendo si cercava «uno
schermo dove c'era del lavoro», e a sinistra c'era un ricordo di settimane
prima: la finestra unica si apriva a sinistra invece che a destra. Adesso si
scrive **la fotografia intera** delle finestre di adesso, e la n-esima finestra
torna dov'era la n-esima — per posizione, non per numero di slot, perché gli
slot si rinumerano quando una finestra sparisce e la finestra rimasta deve
tornare *dove stava lei*.

Uscendo la fotografia si scatta **una volta sola**, all'inizio: le finestre si
chiudono una per una, e l'ultima ne scriverebbe una vuota.

### 10. E un modo per dire «di finestre ne voglio una»

Mancava. Con l'icona nell'area di notifica la X **nascondeva** sempre, anche
avendo altre finestre aperte: chiudendone una la si ritrovava al riavvio, per
sempre. Nascondere ha senso per **l'ultima** finestra — vuol dire «il programma
continua a lavorare senza niente a schermo»; con altre aperte non vuol dire
niente. Adesso la X chiude, e le chat di quella finestra passano subito a quella
rimasta (`assorbiOrfani`) invece di sembrare sparite fino al riavvio.

## Le prove

- `tests/main/consegne-layout.test.ts` (11) — lo slot più basso libero, lo slot
  che non cambia più, chi non ha consegna non salva, uno scontrino vecchio o di
  un'altra finestra non vale, una ricevuta scaduta resta leggibile per poter
  rimandare la verità.
- `tests/shared/workspace.test.ts` — la migrazione dalle chiavi-geometria, anche
  con una chiave sola, e la deduplica per conversazione.
- `tests/main/workspace-operazioni.test.ts` — `salvaLayoutIn` scrive sotto il
  workspace della consegna, e a vincere è lo slot che si sta scrivendo.
- `tests/main/workspace-store.test.ts` — `scrivi` dice quando non ha scritto.

Ognuna verificata rimettendo il difetto: senza la correzione, cadono.

## L'invariante, in una riga

> **Tutti i workspace e le loro chat tornano come sono stati salvati — che il
> salvataggio l'abbia fatto un aggiornamento o l'utente.**

Non è un obiettivo: è la proprietà da cui discendono la rinumerazione degli slot,
il numero di finestre deciso prima di aprirne una, e l'adozione degli orfani. Se
un giorno una di queste tre sembra togliersi, la domanda da farsi è quale chat
diventa irraggiungibile — non se il codice si semplifica.
