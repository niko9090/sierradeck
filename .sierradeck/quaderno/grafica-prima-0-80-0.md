---
titolo: "Grafica 0.80.0, il «prima»: differenze PC/pagina/app, testi lunghi, cose tagliate"
quando: 2026-10-19T14:30:00+02:00
tag: ["0.80.0", "grafica", "analisi", "foto", "PC", "pagina", "app"]
---

Materiale grezzo per l'elenco di c-10: **niente è stato corretto**. Copia di prova `SIERRADECK_PROVA` (codice di main del 19/10, v0.79.0), con:
- tre chat vere di haiku;
- due workspace;
- un autopilota sospeso con due chat;
- il telefono di prova.

**Foto:** in `.sierradeck/quaderno/foto-0-80-0/prima/`, 11 del PC a 1584×961 e 9 della pagina a 412×915. Sono **fuori da git** (riga in `.gitignore`): mostrano percorsi e indirizzi della macchina, e il repository è pubblico. Come per la 0.70.

**App:** nessuna foto, perché qui non ci sono emulatore né telefono. Il confronto con l'app è fatto leggendo il Kotlin.

## Le più utili (prima queste)
1. **Lo stato «fermo» ha tre colori.**
   - Sul PC è grigio («• fermo» in Autopiloti, `--testo-quieto` in `DalVivoAutopilota.tsx`).
   - Sulla pagina è rosso: «SI È FERMATO» con il bordo rosso nelle Domande, pallino rosso in Autopiloti.
   - Nell'app è rosso: `Banco.rosso` in `Lavori.kt:763/786/882`.
   - DESIGN.md riserva il rosso a «fermo, fallito». Va deciso una volta e copiato su tutti e tre. Foto: `pc-03-autopiloti`, `pag-01-chat`, `pag-03-autopiloti`.
2. **«Aspettano te 0» e «aspettano te» insieme (pagina).** Nelle Domande:
   - in cima «Aspettano te 0 · Niente ti aspetta»;
   - più sotto il riquadro «ASPETTANO TE» con due chat «aspetta te»;
   - nella sezione Chat, «2 aspettano te».
   - Sono due conteggi diversi con la stessa parola: le domande in attesa e le chat ferme a fine turno. Sul PC la colonna Domande dice «Aspettano te 0 · Tutte 2». Foto: `pag-01-chat`, `pag-02-chat-elenco`, `pc-04-domande`.
3. **Account: il PC dice «entrato», la pagina «fuori · Prossimo passo: Entra».**
   - Può dipendere solo dalla copia di prova: l'utente d'esempio sta solo nell'IPC del PC (`account:utente`), mentre la pagina legge lo stato vero. Da verificare sul programma vero prima di correggere.
   - Il «Prossimo passo» della catena c'è sulla pagina e nell'app (`passoAccount`, `Modelli.kt:1012`), ma **non** nella scheda Account e Drive del PC: la riprogettazione 0.70 lo prevedeva. Foto: `pc-07-drive`, `pag-09-impostazioni`.
4. **«collegamento ottima / buona»: accordo sbagliato** (deve essere «collegamento ottimo/buono», oppure «linea ottima»). È su ogni schermata della pagina (`client-pagina.ts:5778`). Nell'app la stessa parola esce da `Linea.kt:90`: va controllato dove la mostra.
5. **Autopiloti, «2 · 1 al lavoro» con l'autopilota fermo** (PC). La colonna Chat conta come «al lavoro» la chat c-2, che ha `stato: lavoro` sotto un autopilota sospeso. La pagina non mostra il numero. Foto: `pc-03-autopiloti`.
6. **Due strisce impilate sopra il mosaico** (PC), contro la regola «una fascia sola» di DESIGN.md:
   - l'avviso dell'autopilota fermo, con Vedi · Riprendi · Archivia · Chiudi;
   - sotto, la riga Panoramica | Tutte le chat affiancate.
   - Inoltre «Panoramica» compare due volte nella stessa riga: la linguetta a sinistra e l'interruttore a destra. Foto: `pc-01-chat`, `pc-02-panoramica`.
7. **Panoramica (PC), lo stesso stato detto due volte:**
   - «fermo» sotto il titolo e di nuovo «fermo · da 1 g»;
   - «AL LAVORO · 0 — Nessuna chat al lavoro» e subito sotto «ADESSO · 0 — Nessuna chat al lavoro»;
   - accanto a «Manda», due «?» uguali senza etichetta. Foto: `pc-02-panoramica`.

## Cose tagliate o storte
- **PC, fascia:** il workspace attivo è tagliato («SierraDeck-prov…») anche con la fascia mezza vuota; la spia dell'aggiornamento è tagliata («cerco…»).
- **PC, colonna dell'autopilota accanto alle chat:**
  - la linguetta «Criteri» esce dal bordo («Cr»);
  - «Sta facendo 1» va su due righe;
  - il testo d'esempio del campo è tagliato a metà riga («(le sue domande sono nella linguetta»). Foto: `pc-01-chat`.
- **PC, Panoramica:** le linguette delle chat sono tagliate («Sviluppo · Spiega …»); nella colonna Domande stretta la scheda «Revisione di Sviluppo» va su tre righe. Foto: `pc-04-domande`.
- **PC, Salute:** la riga d'errore mostra l'id intero della sessione, tagliato («(11111111-0800-…»). Sulla pagina va su tre righe. Foto: `pc-08-salute`, `pag-08-salute`.
- **PC, Account e Drive:**
  - il riquadro «Account» è più alto degli altri tre della catena, e le frecce non sono centrate;
  - nella stessa schermata ci sono due «Strumenti ▾» (testata e sezione). Foto: `pc-07-drive`.
- **PC, Impostazioni:** il contenuto è largo circa 910 px, e a destra restano 400 px vuoti con la barra di scorrimento in mezzo. Foto: `pc-09-impostazioni`.
- **Pagina, barra in basso:** «Auto-piloti» e «Imposta-zioni» vanno a capo con il trattino. Il trattino morbido è voluto (`­` anche in `App.kt:89/94`), ma su due righe la barra è più alta. Valutare «Lavori» e «Opzioni», solo con il sì di Nicholas, perché è un cambio di nome.
- **Pagina, testi tagliati:**
  - il campo di ricerca dei Progetti («Cerca progetto, PC o cartel»);
  - la riga dei consumi delle chat («5 ore 20% (azzera 15:00…»).

## Testi lunghi senza «?»
- **Impostazioni → Chat e autopiloti (PC e pagina):** «Tutti i workspace di questo PC (0) hanno la Panoramica, ognuno con il suo autopilota fermo finché non gli scrivi. Le chat non sono state toccate.» È un paragrafo fisso, e il **(0)** contraddice la frase.
- **PC, Aggiornamenti:** «Ultimo tentativo: nessuna installazione non riuscita da ricordare.» È una riga sempre a vista che non dice niente: può stare dietro al «?».
- **Pagina, Salute:** «Apri Account → Drive: dal computer» e «Apri la cartella del registro: dal computer» sono righe di testo al posto dei tasti del PC. Andrebbe detto una volta sola, non per riga.
- **Tooltip dei tasti della fascia del PC** (`title` di «Chat e workspace» e «Impostazioni»): due o tre righe ciascuno. Non sono a vista, quindi la regola «niente pappardella» non li tocca; li segno solo per coerenza.

## Differenze PC / pagina / app, schermata per schermata
| Schermata | PC | Pagina | App (Kotlin) |
|---|---|---|---|
| Domande | colonna a destra, testo in carattere mono | prima schermata (Domande), carattere normale | `Domande.kt` |
| Elenco chat | Panoramica / affiancate, con le linguette | Chat: elenco per workspace con «davanti», poi tasti Riprendi · Spazio · Negozio | Chat con tre linguette **Chat / Workspace / Negozio** (`App.kt:648`); la pagina non le ha |
| Negozio | finestra a tutta pagina, gruppi a «pillola» arrotondata e verde (diversi dai tasti squadrati) | si apre **in fondo** alla sezione Chat, fuori vista finché non scorri | linguetta Negozio |
| Progetti | tabella, «Strumenti ▾» chiuso | gli strumenti sono **sempre aperti** (Tutte le chat, Spazio sul Drive) più una seconda fila (Code, Contenuto del Drive, Quaderno) e un «Aggiorna» a sé | — |
| Drive | Impostazioni → «Account e Drive» | Progetti → «Il contenuto del Drive» = «Drive · il magazzino dei tuoi PC», che si apre in fondo, con un secondo «Aggiorna» nella stessa schermata | `PannelloDrive.kt`, Sezione «Drive» in `Computer.kt:531` |
| Salute | tabella con il tasto per riga | elenco con «…: dal computer» al posto dei tasti | — |
| Autopiloti | tabella con una riga, «Riprendi» in riga | scheda con pallino rosso, senza tasto in riga | `Lavori.kt` |
| Stato del collegamento | — | riga «📶 … ms · collegamento ottima» in cima a ogni sezione; nelle Domande lo stesso dato due volte, con due tempi diversi («rete di casa · 173 ms» e «149 ms») | `Linea.kt` |

## Da sapere per chi rifà le foto «dopo»
- **Copia:** `note/prova-080/` della chat c-12, ignorata da git.
  - Si prepara con `prepara.mjs` (porte 47680/47681, chiave del telefono in `chiave.txt`).
  - Il pilota CDP è `cdp.mjs`: `eval` e `foto <file> [larghezza altezza]`.
  - Per i clic: `clic.mjs` per il PC (porta 9373) e `clicp.mjs` per la pagina (Edge, porta 9374).
- **Trappola:** in uno script che costruisce JavaScript dentro un template di Node, `\s` diventa `s`. Scrivere `\\s`, altrimenti il cerca-tasto toglie le «s» dai nomi e non trova «Chat e workspace».
- **Trappola:** alla prima accensione la finestra della copia si è bloccata. `Runtime.evaluate` e perfino `Debugger.enable` non rispondevano, mentre la foto funzionava e la CPU del renderer era ferma. Il ricaricamento non è bastato; riavviando la copia non è più successo. Da tenere d'occhio: potrebbe essere un blocco vero all'avvio.
- **Esc** non chiude la colonna Domande né il pannello «Chat e workspace»: si richiudono con un secondo clic sul loro tasto.

## Dopo (19/10, c-12): voce per voce
Correzioni fatte in quest'ordine, un commit per voce. Le foto stanno in `foto-0-80-0/dopo/`, fuori da git, scattate dalla stessa copia di prova.

**Test:**
- vitest: `tests/main/grafica-0-80-0.test.ts` più i test toccati;
- JUnit: `TonoDalVivoTest`, `ChatGovernataTest`, `AnalisiAppTest`.
- Esito: verdi su `gradle testDebugUnitTest` con i filtri, typecheck pulito. La suite intera non è stata lanciata (la segue un'altra chat).

| # | Prima | Dopo | Dove |
|---|---|---|---|
| 1 | «fermo» grigio nella tabella del PC; rosso nel LED, sulla pagina e nell'app. Nell'app il colore «quieto» finiva nel **blu**. La striscia «si è fermato» aveva l'ambra che lampeggia | rosso dappertutto, come la palette e `ledDi`; «finito» grigio; «quieto» grigio anche nell'app; LED rosso anche nella striscia | `COLORE_DAL_VIVO` (stato-dal-vivo), `vistaAutopilota`, `dalVivoHtml`, `tonoDalVivo` / `coloreVista` (app), campo `led` degli avvisi. Foto `pc-01-chat`, `pc-03-autopiloti` |
| 2 | pagina: «Aspettano te 0 · Niente ti aspetta» e sotto il riquadro «ASPETTANO TE» con due chat, più «2 aspettano te» | una chat a fine turno è «**ferma**», come sul PC (`chat-vista.ts`), e sta fra le «Tutte»; «aspetta te» solo per una scelta aperta; riassunto «2 ferme» | `statoChat` / `riassuntoChat` della pagina, `StatoChat.kt` (tono `FERMA`, il pallino della voce Chat conta solo le scelte). Foto `pag-01-chat`, `pag-02-chat-elenco` |
| 3 | «2 · 1 al lavoro» con l'autopilota fermo; LED verde su «chat 2» | `chatAlLavoro`: una chat è al lavoro solo se il suo autopilota gira. Nell'albero mandato a pagina e app la chat diventa «ferma: l'autopilota è fermo» | `shared/autopilota.ts`, vista, `alberoChat`, linguette, «Sta facendo», `parolaChatGovernata` (app). Foto `pc-03-autopiloti` |
| 4 | pagina: «collegamento ottima / buona» | «linea ottima / buona», come «linea lenta» accanto. PC e app dicevano già «qualità ottima» | `lineaHtml`. Foto `pag-01-chat` |
| 5 | PC «entrato», pagina «fuori · Prossimo passo: Entra» | **solo nella copia di prova**, niente da correggere. La catena è la stessa funzione (`vistaAccount`); cambia l'utente: il PC lo prende da `account:utente`, che solo con `SIERRADECK_PROVA` risponde con l'utente d'esempio (`index.ts`, «Nella copia di prova si entra con un utente d'esempio»), mentre la pagina legge `utenteAccount()`. Sul programma vero la fonte è una | — |
| 6 | PC: nessun «Prossimo passo» per Entra, Crea la passphrase, Sblocca, Prova | una riga «Prossimo passo: …» per i passi senza tasto (`passoSulPc`); i tre tasti di prima restano dov'erano. Nella foto della copia non cambia niente, perché con il Drive non configurato il passo non c'è su nessun lato | `account-vista.ts`, `PannelloAccount.tsx`. Foto `pc-07-drive` |
| 7 | due strisce impilate sopra le chat (avviso dell'autopilota fermo, poi Panoramica \| Tutte le chat affiancate); «Panoramica» due volte nella stessa riga | **non toccate**: unirle o spostarle è uno spostamento, quindi decide Nicholas | vedi la proposta qui sotto |

**Proposta per Nicholas (voce 7, da approvare):**
- **Le due strisce.** L'avviso «L'autopilota … si è fermato» con Vedi · Riprendi · Archivia · Chiudi può stare nella stessa riga di Panoramica | Tutte le chat affiancate, a sinistra, come una pastiglia rossa che si apre al tocco. Si guadagnano circa 45 px di chat, ed è la regola «una fascia sola» di DESIGN.md.
- **«Panoramica» due volte.** Si può togliere la linguetta a sinistra («Panoramica» fra le linguette delle chat) e lasciare l'interruttore a destra. Anche questo è uno spostamento: niente senza il suo sì.

**Rimasto fuori (da mettere nell'elenco):**
- L'app usa ancora «aspetta te» per una chat a fine turno in tre punti che non leggono `StatoChat`:
  - `Computer.kt:263` (le chat degli altri PC);
  - `MandaA.kt:268`;
  - `Avvisi.kt` («N su M chat aspettano te»).
  Vanno allineati alla regola della voce 2 con un test, ma toccano le notifiche, che sono di c-134.
