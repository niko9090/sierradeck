---
titolo: "Analisi 0.80.0, seconda passata (c-10): programma vero, registro, agenti ECC"
quando: 2026-10-19T13:10:00+02:00
tag: ["0.80.0", "analisi", "velocità", "memoria", "difetti", "grafica", "per Nicholas"]
---

# Analisi della 0.80.0, seconda passata (c-10)

Fatta in parallelo all'analisi di c-4 (`analisi-0-80-0.md`, quella di riferimento). Aggiunge: CPU e memoria del **programma vero** (solo osservato), le statistiche del registro vero 13–19/10, le 107 segnalazioni dei 5 agenti ECC e gli script `scripts/misure/`. Dove le due analisi dicono la stessa cosa, vale quella di c-4.

**In breve, per Nicholas**
- **La cosa che pesa di più è la finestra del PC.** Oggi, con le chat al lavoro, il programma vero usa da solo **l'84% di un core** (25 s di CPU ogni 30 s) e 405 MB. La causa principale: ogni 0,4 s rilegge lo schermo di tutte le chat, e ogni chat controlla il PIN ogni 3 s.
- **Ci sono 6 punti in cui un errore di scrittura su disco può far perdere dati senza dirlo.** Il più serio: una copia di conflitto del Drive che non riesce sovrascrive il file di qui.
- **PC, pagina e app non dicono sempre la stessa cosa.** La stessa chat è «ferma» sul PC e «aspetta te» sul telefono, e la pagina mostra «Aspettano te 0» con sotto 4 chat che aspettano.
- **Il servizio degli autopiloti si blocca fino a 6,5 s mentre unisce un ramo**, perché usa git sincrono: 78 volte in 7 giorni non ha risposto.
- **Corretto oggi** (ramo c-10): le chat con il ramo già unito o tolto ora si chiudono. È il motivo per cui ti si chiedeva di chiuderle a mano.

## Come ho misurato
- **Copia di prova** (`SIERRADECK_PROVA`, porte 47670/47671, mai la 47630 del programma vero), costruita dal ramo c-10 (= `main` 76ed7c2 + la correzione di chiudiChat).
  - Tre situazioni: vuota; con le **687 conversazioni vere copiate** (1,4 GB) in una Claude Code a parte; con **6 chat aperte** in 2 workspace.
  - Script riutilizzabili: `scripts/misure/prepara.mjs` e `scripts/misure/misura.mjs`. I numeri «dopo» si prendono con gli stessi comandi.
- **Programma vero solo osservato**: CPU e memoria dei processi, e il registro dal 13 al 19/10 (2.949 righe negli ultimi 3 giorni). Niente toccato.
- **Attenzione ai tempi dell'interfaccia.** Durante le misure il PC era al **100% di CPU su 8 core** per il lavoro delle altre chat (16 claude.exe, test, gradle). Per questo i tempi dei clic sono pessimisti: fino a 46 s per una valutazione banale, quando la copia stessa usava 0,2 s di CPU ogni 15 s. I tempi delle rotte sono invece stabili, perché presi come mediana di 5 giri.
- **Agenti ECC** (sola lettura): typescript-reviewer, react-reviewer, kotlin-reviewer, silent-failure-hunter, performance-optimizer. Hanno dato 107 segnalazioni. Le prime di ogni elenco le ho verificate nel codice; quelle segnate «da verificare» non ancora.

## I numeri

### Avvio della copia
| Situazione | Porta in ascolto | Interfaccia pronta |
|---|---|---|
| vuota, primo avvio | 2,7 s | 8,5 s |
| 687 conversazioni, primo avvio (indicizza) | 6,6 s | **23,0 s** |
| 687 conversazioni + 4 chat, avvio successivo | 3,0 s | 6,3 s |

### Memoria (privata)
| | main | finestra | GPU | pty-host | servizio | **programma** | chat Claude Code |
|---|---|---|---|---|---|---|---|
| copia vuota | 137 MB | 53 | 129 | 22 | 27 | **380 MB** | — |
| copia con 6 chat | 149 | 71 | 132 | 85 | 27 | **469 MB** | 6 × ~460 MB = 2,77 GB |
| **programma vero** (19/10 12:30) | 231 | **405** | 247 | 153 | 45 | **~1,2 GB** | ~10 chat |

- Ogni chat di Claude Code pesa da sola 300–480 MB. Non è SierraDeck, ma è la voce più grossa sul PC.
- **CPU del programma vero, in 30 s:** finestra 25,2 s, main 3,1, GPU 2,1, pty-host 1,6, servizio 0,4.
- **Copia con 6 chat ferme e finestra in primo piano:** 0,36 s di CPU ogni 15 s. In cima al profilo c'è la lettura dello schermo dei terminali (`testoDiRiga`, `righeDaSchermo`, `rigaVestita`). Cresce con il numero di chat e con quanto scrivono.

### Rotte (copia con 687 conversazioni e 6 chat; mediana di 5, tra parentesi la prima chiamata)
| Rotta | Tempo | Peso |
|---|---|---|
| `/api/stato` (telefono, ogni 2 s) | 27 ms (209) | 3 KB |
| `/api/sessioni` (elenco chat) | 8 ms | 7 KB |
| `/api/panoramica` | 18 ms | — |
| `/api/file/progetti` (Progetti) | **177 ms** | 4 KB |
| `/api/drive/pannello` (Drive) | **189 ms** | **516 KB** |
| `/api/salute`, `/api/consumi`, `/api/domande`, `/api/pc` | 8–27 ms | 1–3 KB |
| `/api/negozio` | 30 ms, ma **15,8–30,2 s alla prima** | 19 KB |
| pagina del telefono `/` | 17 ms | **405 KB** senza compressione |

### Drive, ponte e servizio (registro vero, 13–19/10)
- **Pannello del Drive pronto:** mediana 3,5 s, p90 5,6 s, massimo 12,9 s. Di questi, 3,3 s sono la lettura del manifesto del Drive.
- **Salvataggio** ogni circa 5 minuti su 13.595 file; 21 conflitti in 7 giorni.
- **Strade verso il portatile:** il collegamento diretto (WebRTC) è fallito **941 volte** in 7 giorni, e altrettante volte si è ripiegato sul Drive (lento). Dopo 26 fallimenti di fila riprova ogni 30 minuti.
- **Ponte fra PC:** non misurato. La copia non ha un altro PC e la prova vera fra i PC non era nel compito.
- **Servizio degli autopiloti:**
  - un giro dura in mediana 166 s (p90 785 s), di cui il supervisore in mediana 44 s (p90 301 s);
  - **9 supervisori scaduti dopo 5 minuti**;
  - **78 volte la salute non ha risposto**, perché il servizio era bloccato.
- **Criteri:**
  - `npm test`: mediana 199 s (p90 604 s);
  - typecheck: mediana 17 s (p90 99 s);
  - gradle: mediana 104 s (p90 485 s).
- **Consegne alle chat:** pronte in mediana in 0,4 s, p90 13 s, massimo 1.200 s.

## Problemi in ordine di importanza

Legenda: **[PC]** programma, **[Pag]** pagina del telefono, **[App]** app Android. «Verificato» vuol dire controllato da me nel codice.

### A. Dati che si possono perdere senza avviso
1. **[PC] Copia di conflitto del Drive persa.** `cassaforte/incrementale.ts:640`: `rename(disco, discoCopia).catch(() => undefined)`. Se il file è aperto in un editor o il disco è pieno, la copia non nasce, ma viene contata come fatta e la versione del Drive sovrascrive le modifiche di qui. *Verificato.*
2. **[PC] Il PIN può spegnersi da solo.** `index.ts:1217`: `pin-chat.json` è scritto con `writeFileSync`, non in modo atomico. Se la lettura fallisce si torna a «nessun PIN», e il salvataggio successivo lo cancella. *Verificato.*
3. **[PC] Elenco del recupero dei progetti sostituito.** `rimozione-sicura.ts:185-221`: un `elenco.json` illeggibile diventa `[]`, la rimozione dopo lo riscrive con una sola voce e le cartelle già nel recupero restano senza «Ripristina». Anche la scrittura non è controllata. `gestione-chat.ts` invece fa giusto e mette da parte il file illeggibile.
4. **[PC] «Annulla l'unione» promesso ma non registrato.** `residenza.ts:425/440`: il registro dell'unione si scrive per ultimo e l'esito non si guarda (il `try/catch` non può scattare). Se la scrittura fallisce, l'unione non si può più annullare.
5. **[PC] Un `workspaces.json` del Drive illeggibile vale come assente.** `cassaforte/sincronia.ts:462`, `fusione.ts:565`: questo PC carica la sua lista sopra, e i workspace degli altri PC si perdono.
6. **[PC] Cancellazioni fallite tolte lo stesso dal manifesto.** `incrementale.ts:463` e `~500`, `raccolta.ts:~150`: un file non cancellato torna su al salvataggio dopo, e sul Drive restano file orfani che occupano la quota.
7. **[PC] Scritture «atomiche» con un solo tentativo, e l'esito ignorato.** `shared/scrittura-atomica.ts` restituisce `false` e non solleva errori. I `try/catch` intorno non servono in: `aggiornamenti.ts:297` (il segno «installazione non riuscita»), `trasloco.ts:79`, `sottofondo.ts:139`, `una-casa.ts:221/258`, archivio del servizio (`archivio.ts:190`). Su Windows un antivirus che tiene il file basta a far fallire il rename.
8. **[PC] Messaggi riscritti di continuo a una chat adottata.** `adozione-chat.ts:198-210`: se il servizio non conferma «scritti», gli stessi messaggi si riscrivono ogni 4 s, senza una riga nel registro.
9. **[PC] «Elimina workspace» annotato anche quando non elimina.** `ipc.ts:1217-1227`: se è l'ultimo workspace o il nome non esiste, viene comunque segnato «eliminato» e non si ritrova più dalle copie. *Verificato.*

### B. Velocità e memoria
10. **[PC] Finestra all'84% di un core.** *Verificato.* Le cause, una sopra l'altra:
    - `App.tsx:343`: ogni 400 ms, per **ogni** riquadro, si legge lo schermo intero del terminale, anche a finestra ridotta;
    - `ChatConPin.tsx:15-33`: un giro di 2 chiamate ogni 3 s **due volte per riquadro**, anche nascosto (`TastoPin`). Con 50 chat sono circa 70 chiamate al secondo;
    - `App.tsx:1289`: `useSessionStore()` senza selettore, così ogni avanzamento dell'indice ridisegna tutta la finestra;
    - `Mosaic.tsx:273-292` non memorizzato, con un calcolo per riquadro su tutti i riquadri (O(n²));
    - `Terminal.tsx:68`: `sessions.find` su 20.000 righe in ogni terminale a ogni cambio.
11. **[PC] Servizio bloccato dal git sincrono.** `autopilot-host/worktree.ts:24` usa `spawnSync`. Un'unione dura fino a 6,5 s e in quel tempo il servizio non risponde a nessuno (78 «salute non risposta»). Questo rallenta anche consegne e Domande. *Verificato.*
12. **[PC] Il main rilegge lo schermo di tutte le chat in sottofondo a ogni segnale.** `index.ts:414-432` e il timer di 500 ms (`index.ts:1348`): con 10 chat in sottofondo e gli strumenti al lavoro sono circa 100 conversioni dello schermo al secondo.
13. **[PC] Drive: compressione e impronta sincrone nel main.** `cassaforte/compressione.ts` usa `gzipSync` e calcola sha256 su conversazioni fino a 72 MB, 6 alla volta. In quei momenti finestra, ponte e telefono restano fermi da 1 a 3 s. In più, ogni 5 minuti il manifesto del Drive si scarica due volte (`salva` e `arrivo`).
14. **[PC] Diario dell'autopilota senza tetto, mandato a ogni giro di lettura.** Oggi è di 594 voci (153 KB su un file di 351 KB) e lo leggono finestra, pannelli e telefono ogni 2–5 s. Le istruzioni (696 KB) si rileggono dal disco ogni 3 s (`istruzioni.ts:36-68`).
15. **[PC/Pag] Pannello del Drive pesante.** Sono 516 KB e circa 190 ms, chiamati ogni 2–2,5 s mentre il Drive lavora, con uno `statSync` per ogni conversazione (`index.ts:2944`).
16. **[PC/Pag/App] Negozio: 15–30 s alla prima apertura.** Il tempo è quello dell'elenco dei plugin di Claude Code, e si ripete a ogni scadenza della cache.
17. **[PC] Primo avvio con tante conversazioni: interfaccia pronta in 23 s**, contro i 6–8 s degli altri avvii.
18. **[Pag] La pagina pesa 405 KB e si ricostruisce a ogni richiesta**, senza compressione né cache. Compressa sarebbe di circa 80–90 KB.
19. **[App] I giri di lettura continuano con lo schermo spento.** Solo il giro principale (`App.kt:436`) rallenta. Gli altri, cioè Chat, Lavori, Domande, Drive, Istruzioni e Computer, continuano ogni 2–4 s.
    - `Computer.kt:110-154` fa girare **tutti** i suoi giri per ogni parte, compreso `/api/aggiornamento` ogni 2 s anche dentro Workspace e Progetti.
    - `Gestione.kt:229`: dopo «Installa là» il giro non si ferma più.
20. **[App] Lavoro pesante sul filo principale.** `/api/stato` viene letto due volte ogni 2 s (`App.kt:440`). Il terminale si ricompone tutto a ogni ricomposizione (`Terminale.kt:190`). La storia della chat si scarica tutta ogni 2 s (`Chat.kt:497`).
21. **[PC] Memoria delle chat in sottofondo.** Un xterm nel main con 5.000 righe di storia per chat (`sottofondo.ts`), mentre il pty-host tiene già 256 KB per riprenderle.

### C. Difetti visibili e PC, pagina e app che non concordano
22. **[App/PC] Rotte lente diverse fra app e PC.** In `Api.ROTTE_LENTE` dell'app mancano `/api/workspace/crea`, `/api/file/progetti`, `/api/file/elenco`, `/api/workspace/progetto` e `/api/trasloco/*`. Via ponte il PC aspetta 45 s, l'app solo 15 s. Creando un workspace su un altro PC l'app dice «scaduto» mentre il PC lo sta creando, e chi riprova ne fa **due**.
23. **[PC/Pag] Stessa chat, stato diverso.** Una chat nuova ferma al prompt è «ferma» sulla Panoramica del PC e «aspetta te» sulla pagina. Sulla pagina, nella stessa schermata, c'è «Aspettano te 0 · Niente ti aspetta» e sotto «Aspettano te: Prova 1–4» (foto `30-tel-inizio`, `10-pc-panoramica`).
24. **[PC] La Panoramica si contraddice.** In alto c'è «il suo autopilota aspetta il tuo primo messaggio, a sinistra», a sinistra «Nessun autopilota in questo workspace» (foto `10`).
25. **[PC] Falso «la chat non è arrivata al prompt».** Una chat **nuova** è rimasta segnata così per 43 s, con il testo «con una conversazione molto lunga…» (foto `01`). Lo stesso errore è nel registro vero 3 volte il 18/10. Sotto carico, 20 s non bastano.
26. **[Pag] Storia del collegamento diversa da PC e app.** `client-pagina.ts:5647` è una copia vecchia di `rigaStoria` e non mostra la strada né il «passo da X a Y».
27. **[PC/Pag] Dimensioni scritte in 8 modi:** «3.4 MB» sul PC, «3,4 MB» sul telefono. La funzione giusta è già in `shared/spazio-drive.byteLeggibili`.
28. **[App/Pag] Il messaggio del ponte dice che il Drive non passa** (`Ponte.kt:83`, `shared/ponte-telefono.ts:66`), mentre `/api/drive/pannello` e `/api/drive/azione` passano.
29. **[PC/Pag] Un autopilota creato dal PC o dal telefono prende un nome diverso:** dal PC sono i primi 40 caratteri, dal telefono 8 parole. I controlli sono due e diversi (`validation.ts:305` e `azioni-telefono.ts:223`).
30. **[PC] Regex del registro rotta.** `index.ts:1760` ha `/^sierradeck-d{4}-d{2}-d{2}.log$/`, senza le barre rovesciate: «scollegato dal…» non si ritrova mai dal registro. *Verificato.*
31. **[PC] Drive 403 «troppe richieste» non ritentato** (`google-drive.ts:251`), mentre il codice stesso ricorda ore di 403 per quota il 12/10. Il token OAuth viene letto prima di controllare `r.ok` (`oauth-google.ts:189/212`).
32. **[PC] 941 tentativi WebRTC falliti in 7 giorni verso il portatile**, ognuno con un'offerta scritta sul Drive (strada sempre fallita, vedi i numeri).

### D. Grafica, schermata per schermata (foto in `note/foto-0-80-0` della cartella principale del progetto)
- **Barra in alto (PC):** la riga della migrazione è sempre lì dal 15/10 («Tutti i workspace … Le chat sono rimaste com'erano.»), lunga e senza «?».
- **Nuova chat (PC, foto `20`):** i testi d'aiuto sono a spaziatura fissa, diversi dal resto. C'è l'opzione «In Documenti», contro la regola 0.65.1 «mai Documenti». I percorsi interi vanno a capo.
- **Panoramica (PC, `10`):**
  - senza autopilota la metà sinistra è vuota;
  - «Nessuna chat al lavoro» compare due volte («Al lavoro» e «Adesso»);
  - la pillola «· Chat» e il tasto «solo mia» non hanno «?».
- **Riquadro «non arrivata al prompt» (PC, `01`):** un paragrafo di 4 righe con 3 tasti; andrebbe una riga e un «?».
- **Progetti (PC, `4pc-progetti`):** pulita. Sulla pagina (`31`) ogni riga ripete «da sistemare · senza casa».
- **Chat (pagina, `34`):** sotto il nome c'è la riga di stato di Claude Code («Opus 5.5 · 5 ore 14%…»), che non dice niente della chat.
- **Inizio (pagina, `30`):** il riquadro del collegamento, con le 4 strade sempre aperte, occupa un quarto dello schermo.
- **Dialoghi (PC):**
  - 50 su 65 sono senza `role="dialog"`;
  - Esc chiude due finestre sovrapposte insieme (`ModaleConferma`, `ModaleSessioni`, `PannelloTrasferimenti`);
  - i margini sono diversi fra loro;
  - `ModaleFusione.tsx:461` ha un paragrafo fisso.
- **App:** non vista dal vero. Su questo PC c'è solo `adb`, nessun emulatore. I testi schermata per schermata fra app e pagina sono **da confrontare**.

### E. Codice doppio (rischio che le due copie si separino)
- `client-pagina.ts` ricopia a mano alcune funzioni di `src/shared`: macchina del collegamento, storia, byte, «quanto tempo fa», `statoChat` (che in TS esiste solo nella pagina e in Kotlin).
  - Una ha già divergenze (punto 26).
  - La via giusta è quella già usata per `ricomponiSchermo`: iniettare la funzione con `.toString()`.
- **4 funzioni che confrontano le versioni**, con regole diverse sui suffissi (`novita.ts`, `installa-la.ts`, `salute.ts`, `apk-disponibile.ts`).
- **Nome del workspace controllato due volte**, con messaggi diversi (`validation.ts:247` e `azioni-telefono.ts:122`).
- **Drive:** `errore()` è scritto due volte, e il ritento c'è solo nell'archivio, non nel magazzino (`google-drive.ts:95/236`).
- **Stesse azioni, controlli diversi:** IPC e HTTP fanno le stesse azioni (elimina workspace, archivia autopilota) con controlli diversi. Il punto 9 nasce da qui.
- **Kotlin:** `Linea.kt`, `NomePc.kt` e `Ricomponi.kt` oggi sono allineati agli originali. Manca un test che fallisca se cambia un lato solo.

## Prime correzioni consigliate (ordine)
1. Punti 1–9: sono dati. Prima di tutto l'esito controllato di `scriviJsonAtomico` con più tentativi; poi niente sovrascrittura se la copia di conflitto non nasce, e il PIN atomico.
2. Punto 10, la finestra:
   - lettura dello schermo solo dei riquadri visibili e solo se il terminale è cambiato;
   - un solo giro del PIN per tutta la finestra;
   - selettori stretti;
   - `Mosaic` memorizzato.
3. Punto 11: git asincrono nel servizio.
4. Punto 22 (workspace doppi dall'app) e punti 23–25 (stati che si contraddicono).
5. Punti 12–15, cioè main e Drive: schermo in cache, compressione fuori dal main, tetto al diario, pannello leggero.
6. Punto 19: app ferma quando lo schermo è spento.
7. Grafica (sezione D) e codice doppio (sezione E).

## Da chiedere a Nicholas (toglierebbero o sposterebbero qualcosa)
1. Togliere la riga della migrazione dalla barra in alto, o spostarla in Salute.
2. Pagina, schermata d'inizio: tenere chiuso il riquadro delle 4 strade del collegamento e lasciarne una riga (le strade dietro un «?»).
3. Pagina, elenco chat: togliere la riga di stato di Claude Code da sotto il nome, e mettere al suo posto l'ultima cosa fatta.
4. Nuova chat: togliere l'opzione «In Documenti».
5. Panoramica senza autopilota: togliere la colonna di sinistra vuota.
6. Portatile che non risponde da giorni: smettere di provare il collegamento diretto ogni 30 minuti (per esempio ogni 6 ore, o solo quando torna sul Drive).
7. Chat in sottofondo: storia scorrevole di 1.000 righe invece di 5.000 (meno memoria, meno storia da scorrere sul PC).
8. Diario dell'autopilota: tenere visibili le ultime 100 voci e archiviare le altre.
9. App: con lo schermo spento, aggiornamenti più lenti (gli avvisi possono arrivare qualche secondo dopo).

## Fatto oggi, prima dell'analisi
- **Corretto `chiudiChat`** sui rami già uniti o tolti, con test (`50597e7`). Dettagli e cause in `chiudichat-ramo-gia-unito-e-pulizia-19-10.md`.
- **Pulizia dei due workspace del 19/10: verificata, non fatta.** La chat VisitaFacile è vuota, ma le due cartelle sono progetti registrati nel Drive e oggi il programma non ha un «Elimina workspace» con il recupero di 30 giorni. Serve prima quello (voce 5 dei «Difetti»).

## Non provato o non misurato
- **App Android dal vero:** non c'è un emulatore. Ho guardato il codice con l'agente kotlin-reviewer.
- **Ponte fra PC e Drive vero nella copia:** i numeri del Drive vengono dal registro vero.
- **Tempi dei clic nell'interfaccia:** la macchina era al 100% per le altre chat. Vanno rifatti con il PC scarico, con `scripts/misure`.
- Non ho confrontato riga per riga i testi fra app e pagina.
- Le segnalazioni «medie» degli agenti non tutte verificate.
