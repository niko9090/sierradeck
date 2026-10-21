---
titolo: "Grafica 0.80.0, il «prima»: differenze PC/pagina/app, testi lunghi, cose tagliate"
quando: 2026-10-20T22:30:00+02:00
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

**Aggiunte del 20/10 (c-32, foto della 0.81.1):** le cartelle `note/prova-080/` e `foto-0-80-0/prima|dopo/` di c-12 non ci sono più. Gli script nuovi stanno in `note/foto-0-81-0/script/` della cartella principale.
- **Trappola: niente di utile fuori da git dentro il worktree di una chat.** Alla chiusura `git worktree remove --force` (`src/autopilot-host/worktree.ts`) cancella tutto, compresi i file ignorati come `note/`. Foto, script e prove da tenere vanno copiati nella cartella principale (`note/…`) prima di dire «finito».
- **La cartella della copia non va fuori dalle cartelle dell'autopilota.** `E:\prova-081` evitava il nome utente nelle foto, ma la guardia delle cancellazioni non lascia toglierla a una chat: è rimasta a Nicholas.
  - Meglio una cartella dentro la copia di lavoro (`note/…`), portata sotto una lettera neutra con `subst P: <cartella>`. Così il percorso nel terminale di Claude Code è `P:\…`.
- **`<CLAUDE_CONFIG_DIR>\projects` deve esistere prima di accendere la copia.** Altrimenti l'indice scrive «radice progetti non leggibile» e Progetti e Riprendi restano vuoti finché non si riavvia. Le sessioni di prova si creano prima (`claude -p "…" --model haiku` nella cartella di prova).
- **«Nuova chat» mostra il percorso vero di Documenti** (`app.getPath('documents')` non segue `SIERRADECK_PROVA`). Per la foto si copre a schermo con `copri.txt`.
- **Il nome del PC** sulla pagina viene da `pc.json` (`nomeScelto`) nella cartella dei dati della copia: scriverlo prima dell'avvio.
- **Prima di scrivere script con percorsi Windows non usare l'heredoc di Bash:** mangia i backslash. Usare lo strumento di scrittura.
- **Controllare le foto «prima» con md5:** il 19/10 sette foto erano lo stesso file, perché il clic non era andato.
- **La pagina in Edge headless:** `localStorage['sierradeck.chiave']` = la chiave del telefono di prova, poi ricaricare.

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

## Revisione delle voci 1-6 e riga della trasformazione (19/10, c-12)
La Revisione l'hanno fatta typescript-reviewer e kotlin-reviewer sul diff `f52c019..f7e134d`. Le correzioni sono nel commit `7b6872f`.

**Corretto:**
- **Albero sul PC** (`AlberoChat.tsx`): non conosceva lo stato nuovo `ferma` e gli dava il LED verde di ripiego. Ora è grigio.
- **Chat degli altri PC**, sulla pagina e nell'app (`Computer.kt`): il LED era grigio ma il testo restava «aspetta te» in ambra. Ora «ferma» in grigio, e il «?» non dice più «pallino ambra = aspetta te».
- **Codice della pagina:**
  - il selettore `.led.ferma` ha preso il posto di `.ferma`, che era nudo;
  - tolto il contatore morto «aspetta te» in `riassuntoChat`.
- **Test e testi superati:**
  - test JUnit aggiunti (`FermaCasiTest`) per `parolaChatGovernata` con tutti gli stati, per `chatCheTiAspettano` e per `parolaPerRiga`;
  - aggiornati il nome di un test e due commenti superati.

**Lasciato, per c-134 (notifiche):** `Avvisi.kt` dell'app manda ancora «"X" aspetta te» e «N su M chat aspettano te» per le chat a fine turno. Il pallino della barra invece conta solo le scelte.

**Impostazioni → Chat e autopiloti, «(0)»:**
- **Prima:** la frase era «Tutti i workspace di questo PC (0) hanno la Panoramica…». Il numero contava gli autopiloti **nuovi**, non i workspace.
- **Dopo:** «Fatta: ogni workspace aveva già il suo autopilota.» oppure «Fatta: N autopiloti nuovi, fermi finché non gli scrivi.», e la spiegazione intera dietro il «?».
- **Dove:** `testoMigrazione` + `AIUTO_MIGRAZIONE` in `shared/migrazione-elenco.ts`, `RigaMigrazione.tsx`, `migrazioneHtml` della pagina, `Migrazione.kt`.
- **Foto:** `dopo/pc-09-impostazioni`, `dopo/pag-09-impostazioni`.

**Esito:** vitest sui file toccati (643 test), typecheck pulito, JUnit verdi (FermaCasi 3, ChatGovernata 1, TonoDalVivo 1, Migrazione 1, AnalisiApp 18).

## Voci aperte, fatte per la 0.81.0 (commit 012c441, 3c8c3b8, 25ed806)
Nessuna funzione tolta o spostata. Foto in `foto-0-80-0/dopo/*-081.png`, fuori da git.

| Voce | Prima | Dopo | Dove |
|---|---|---|---|
| Salute, riga d'errore | «(11111111-0800-…» tagliato a metà, su PC/pagina/app | la parentesi «(id, cartella)» sparisce dal titolo: ««Media con i test» non si apre — lenta…»; un id da solo resta con 8 cifre; il messaggio intero resta nella spiegazione | `titoloErrore` in `shared/salute.ts` (vale per i tre lati: il titolo lo compone il PC). Trappola: `breve()` taglia a 80 su una parola, e con l'id corto veniva «11111111…,…»: per questo la parentesi va tolta, non solo accorciata |
| Linguette dell'autopilota | «Sta / facendo» su due righe, «Cr» fuori dal bordo | vanno a capo intere (`flex-wrap` + `nowrap`) | `.diario__schede` in `console.css` |
| Testo d'esempio del campo | «…(le sue domande sono nella linguetta» tagliato | solo la prima parte; dove stanno le domande lo dice già il «?» | `ChatAutopilota.tsx` |
| Impostazioni del PC | contenitore che scorre largo 960 px, barra in mezzo e 400 px vuoti | scorre a tutta larghezza; è il contenuto che resta a 960 px | `.impostazioni__corpo > *` |
| Account e Drive | «Account» più alto, frecce storte | anelli alti uguali, frecce a metà | `.account__anello-e-freccia` |
| Due «Strumenti ▾» | testata e sezione | il menu della sezione si chiama «Account ▾» (stesse voci): **rinominato, si rimette se Nicholas preferisce**; aggiornato anche l'aiuto del Drive «Ricollegalo (Account ▾ → Scollega…)» | `PannelloAccount.tsx`, `account-vista.ts` |
| Workspace attivo nella fascia | «SierraDeck-prov…» a 120 px | quello attivo arriva a 240 px, gli altri restano a 120 | `.ws__voce--attivo` |
| Ricerca dei Progetti (pagina, app) | «Cerca progetto, PC o cartel» | «Cerca progetto o PC» (la frase intera nel `title`); il PC, largo, tiene la frase lunga | `client-pagina.ts`, `PannelloDrive.kt` |

**Revisione:** un revisore TypeScript; difetto trovato e corretto: l'aiuto del Drive nominava ancora «Strumenti ▾».
**Esito:** vitest sui file toccati verdi, typecheck pulito, gradle (compila + MigrazioneTest) verde, guardia delle cancellazioni OK.

**Spia dell'aggiornamento «cerco…»:** non è tagliata, il testo finisce proprio con «…». Niente da fare.

## Ultimo giro di c-12, 0.81.0 (commit 1760402, 6ce2326, d7427cc, e9a9fd3, 4894115)
Nessuna funzione tolta o spostata. Foto in `foto-0-80-0/dopo/*-081.png`, fuori da git.

| Voce | Prima | Dopo | Dove |
|---|---|---|---|
| Linguette delle chat nella Panoramica (solo PC: pagina e app non le hanno) | «Sviluppo · Spiega …» tagliato a metà dal CSS, dopo un `slice(0, 18)` | «Sviluppo · Spiega…»: il nome si taglia su una parola intera, la linguetta è larga 190 (il conto delle linguette visibili usa la stessa costante) | `nomeLinguetta` + `LARGHEZZA_LINGUETTA` in `shared/panoramica.ts`. Foto `pc-02-panoramica-081` |
| I due «?» accanto a «Manda» | sul PC «questa chat» e «il microfono»; sulla pagina ogni «?» si chiamava solo «Spiegazione», e quello del dialogo era uno `span` senza nome | «come parlare all’autopilota» e «la dettatura con il microfono» (anche nell'app); `aiuto(id, testo, di)` della pagina porta il nome nell'`aria-label`; lo `span` del dialogo ha nome e `tabindex` | `ChatAutopilota.tsx`, `TastoMicrofono.tsx/.kt`, `client-pagina.ts`. L'app non ha «?» accanto a «Manda» |
| «Ultimo tentativo: nessuna installazione non riuscita da ricordare.» | sempre a vista su PC e pagina | la riga c'è solo quando c'è un tentativo non riuscito; l'informazione resta | `tentativoDaRicordare` in `shared/stato-sistema.ts`, `fallitoHtml` della pagina. L'app lo faceva già così (`Computer.kt`). Foto `pc-09-aggiornamenti-081`, `pag-09-aggiornamenti-081` |
| Salute sulla pagina, «…: dal computer» | ripetuto riga per riga | una riga in cima: «Dal computer: «Apri Account → Drive», «Apri la cartella del registro».»; i tasti del telefono restano tasti | `azioniSoloDalComputer` + `AZIONI_DAL_TELEFONO` in `client-pagina.ts`. L'app salta già quelle azioni. Foto `pag-08-salute-081` |

**Revisione:**
- **TypeScript:** un difetto vero, corretto. Una cartella con le parentesi, come «(…, C:/Program Files (x86)/x)», lasciava pezzi di percorso nel titolo d'errore; ora c'è il test. Sistemati anche due punti minori: lo `span` del «?» si raggiunge da tastiera, e la regola del PC è nominata nella pagina.
- **Kotlin:** nessun difetto. Ho reso uguali i nomi del microfono nell'app.

**Verifiche finali (una volta, alla fine):**
- `npm run typecheck`: uscita 0.
- `npm test`: uscita 0, 419 file passati e 1 saltato; 4277 test passati e 2 saltati.
- `cd android && gradle testDebugUnitTest assembleDebug --no-daemon`: uscita 0, BUILD SUCCESSFUL. JUnit: 365 test, 0 falliti, 1 saltato.
- La guardia delle cancellazioni è OK.

## Proposta per Nicholas (rapporto 0.81.0): la barra in basso della pagina
«Auto-piloti» e «Imposta-zioni» vanno a capo con il trattino, e la barra diventa alta due righe. Lasciata com'è. Due strade, a scelta di Nicholas:
1. **Nomi più corti:** «Lavori» al posto di «Autopiloti» e «Opzioni» al posto di «Impostazioni». È un cambio di nome, su pagina e app (`App.kt`).
2. **Carattere più piccolo solo nella barra** (per esempio 10 px invece di 11), con gli stessi nomi. Su schermi stretti potrebbe non bastare.

## Ancora aperte (per l'elenco)
- nella colonna Domande stretta, la scheda «Revisione di Sviluppo» va su tre righe;
- barra in basso della pagina: aspetta la scelta di Nicholas (sopra);
- nell'app, diversi «?» senza `di` lontani da «Manda» (`Salute.kt`, `PannelloDrive.kt`, `Lavori.kt`…), dalla Revisione Kotlin: il lettore dello schermo dice solo «Spiegazione».

## Trappole viste rifacendo le foto (21/10, c-39, 0.82.0)
- **Lettere di `subst`, porte e DevTools si condividono fra le chat.** Le copie di altre chat erano già su `P:`/`Q:`, 47720/47721 e 9393/9394. Prima di accendere: `subst` e `Get-NetTCPConnection -State Listen` sulle porte scelte.
- **Autopilota finto senza `iniziatoIl`/`ultimoEvento`:** riceve il 1970, risulta «fermo da 29875820 minuti», e la chiusura da sola della 0.82.0 gli chiude le chat al primo giro. Metterli sempre in `prepara.mjs`.
- **Un fumetto «?» dentro una barra `.console` non si vedeva** (la barra ha `overflow-x: auto`, che taglia anche in basso). Dalla 0.82.0 lì si apre `fixed` (`posizioneFissa`). Nelle foto, un fumetto ridotto a una striscia grigia è questo.
- **Esc mandato con `dispatchEvent` sul documento non chiude il menu dei workspace:** chiuderlo cliccando di nuovo il suo pulsante, se no copre le foto seguenti.
- **Le foto vanno nella cartella principale** (`note/foto-0-82-0/…`), non nel worktree: alla chiusura della chat il worktree si cancella con tutto `note/`.
