---
titolo: "0.83.0: mappa dell'app Android, prima (7 voci) e dopo (Adesso, Chat, Progetti, Altro)"
quando: 2026-10-21T11:20:00+02:00
tag: ["0.83.0", "app", "android", "pagina", "mappa", "navigazione", "indietro", "misure", "polling", "decisione di Nicholas"]
---

Analisi di c-45 (consegna c-503), **senza cambiare codice**, sull'app 2.82.0 (main 95ece421). Parte da `inventario-app-0-83-0.md` (c-10), ricontrollato sul Kotlin riga per riga, più un secondo inventario completo fatto in questa chat. Percorsi relativi a `android/app/src/main/java/it/ferrariconsulenze/sierradeck/`. Prosegue `menu-rifatti-0-61-0-inventario.md` (la mappa della 0.61.0).

**Come si contano i tocchi.** Da qualunque schermata: la voce della barra in basso = 1; una linguetta, un elemento di un elenco o un «⋯» = +1. Scorrere, scrivere in un campo e confermare un dialogo («Sei sicuro?») non contano. «Si raggiunge» = il tasto della funzione è a schermo; premerlo è usarla. Oggi l'app si apre su **Chat → Chat** (App.kt:228).

## 1. Oggi: sette voci in basso

Progetti · Autopiloti · Domande · Chat · File · Salute · Impostazioni (`enum Scheda`, App.kt:87; nomi da `src/shared/menu-principale.ts` via `assets/menu.json`, controllati da `MenuPrincipaleTest.kt`). Dentro Chat le linguette Chat / Workspace / Negozio (App.kt:650), dentro Progetti «Progetti e chat» / «Drive e code» (App.kt:635). Etichette a 10 sp su due righe («Autopilo-ti», «Domand-e», «Imposta-zioni»).

## 2. Dopo: quattro voci fisse

> Fatto sul ramo c-46 (21/10): come è stato costruito e le trappole in `app-android-navigazione-0-83-0.md`.

| Voce | Cosa c'è | Linguette in cima | Voci del PC che contiene |
|---|---|---|---|
| **Adesso** (si apre qui) | **in cima le domande per Nicholas**, ognuna con le scelte come tasti grandi (un tocco risponde) e il campo per scrivere; sotto gli autopiloti (questo PC e altri PC), «+ Affida», le chat al lavoro insieme | nessuna: una sola pagina che scorre | Domande, Autopiloti |
| **Chat** | elenco per workspace (con «⋯» su ogni riga e sull'intestazione di ogni workspace), chat di altri PC, Negozio | Chat · Workspace · Negozio | Chat e workspace |
| **Progetti** | progetti e chat su tutti i PC, file, Drive e code | Progetti · File · Drive | Progetti, File |
| **Altro** | un elenco: Salute, Altri computer, Consumi, poi le Impostazioni a gruppi (Aggiornamenti, Chat, Quaderno personale, Account, Aspetto, Avvisi, Info ed errori), con «Cerca» in cima | nessuna: elenco → sezione | Salute, Impostazioni |

Ogni voce del PC finisce in **un solo** gruppo: `FUNZIONI` e il suo test restano validi. Basta un elenco nuovo in `menu-principale.ts` (es. `MENU_TELEFONO` con `voceTelefonoDi(id)`) usato da app (`assets/menu.json`) e pagina; il PC tiene le sue sette voci. `Scheda` può restare come «destinazione» interna: `Apertura`, notifiche e salti da codice (App.kt:104-118, MainActivity.kt:129-146, Domande.kt:370, Lavori.kt:373/387/592, Computer.kt:247, Salute.kt:141, SezioneFile.kt:351) continuano a funzionare, e la barra accende la voce che contiene la destinazione.

**Pallini sulla barra:** Adesso = numero delle domande (ambra «aspetta te»), rosso se un autopilota è fermo; Chat = chat ferme su una scelta (ambra). Colori dalla tabella del PC (§ 7).

## 3. «Indietro», uguale in tutte e quattro le voci (app e pagina)

1. chiude il dialogo o il menu aperto («⋯», selettore, Manda a…);
2. chiude il dettaglio aperto (chat, autopilota, progetto, cartella, conversazione, cassetta, coda, sezione di Altro);
3. torna alla **prima linguetta** della voce;
4. torna ad **Adesso**;
5. da Adesso esce dall'app.

**Oggi** ci sono 5 BackHandler (Chat.kt:118, Chat.kt:174, Lavori.kt:153, Lavori.kt:163, SezioneFile.kt:186) e nessuno in App.kt. Indietro **chiude l'app** da: qualunque voce che non sia una chat, un autopilota o una cartella aperti; il dettaglio del progetto (PannelloDrive.kt:436) e gli Strumenti del pannello; le linguette Workspace, Negozio, «Drive e code»; una conversazione aperta in Domande (Conversazioni.kt:79); la cassetta di un PC e la coda di un progetto (Computer.kt:116-131); il Drive aperto; Autopiloti di un altro PC (resta acceso `SuPc`); la schermata dell'installazione; «Non riconosciuto». Le linguette dell'autopilota non tornano alla precedente: chiudono tutto il dettaglio. I dialoghi (SceltaCartella, SceltaSessione, GestioneWorkspace, Spazio delle chat, Quaderno, SchermataViaggio) si chiudono bene con `onDismissRequest`.

La pagina (client-pagina.ts:5718) chiude ciò che è aperto e poi torna alla destinazione precedente nella cronologia: va portata alla stessa regola (passi 3-5).

## 4. Mappa funzione per funzione (app)

Colonne: **oggi** = tocchi oggi (dall'avvio, che è su Chat: lì le funzioni di Chat costano 1 in meno); **dopo** = tocchi nella mappa nuova, al massimo 2.

### Fuori dalle schede

| # | Schermata o funzione di oggi | File:riga | Oggi | Posto nuovo | Dopo |
|---|---|---|---|---|---|
| 1 | Ingresso: QR, indirizzo, codice a 6 cifre, nome, «Collega» | Ingresso.kt:42 | prima di tutto | uguale, prima della barra | 0 |
| 2 | Schermata dell'installazione del PC («Torna alle chat», «Lascia perdere») | SchermoInstallazione.kt:68 | sopra tutto | uguale; «Torna alle chat» → «Torna ad Adesso» | 0 |
| 3 | Non riconosciuto («Riprova», «Rifai l'accoppiamento») | App.kt:869 | sopra tutto | uguale | 0 |
| 4 | Dialogo del guasto («Copia e chiudi») | DialogoGuasto.kt:33 | dopo un crash | uguale | 0 |
| 5 | Pillola del computer → SelettoreComputer (passa a, tienila, ✎ Rinomina, 🗑 Dimentica, Aggiungi un computer) | SelettoreComputer.kt:57/116 | 1-2 | uguale, in cima a ogni voce | 1-2 |
| 6 | Indicatore della linea → dialogo «Collegamento con…» | Linea.kt:288 | 1 | uguale, nella pillola | 1 |
| 7 | SchermataViaggio (Riprova, Torna a…, Copia i dettagli, Annulla) | App.kt:581 | al cambio PC | uguale | 0 |
| 8 | Scheda dei tentativi «Mi collego a…» («Riprova») | Tentativi.kt:148, App.kt:595 | da sola | uguale, **senza spostare il contenuto** | 0 |
| 9 | Nota globale d'errore («Ok») | App.kt:607/818 | da sola | uguale | 0 |
| 10 | Banda «non mi collego» (Apri Tailscale, Riprova) | PercheNonCollego.kt:136 | da sola | uguale | 0 |
| 11 | Banda «Drive scollegato» (Perché?, ×) | DriveScollegato.kt:82 | da sola | uguale | 0 |
| 12 | Banda delle urgenze (Vedi, Riprendi, Vai) | Urgenze.kt:113 | da sola | **nascosta in Adesso** (lì le domande sono già in cima); nelle altre voci resta, «Vedi» porta ad Adesso | 0 |
| 13 | Banda e dialogo «C'è SierraDeck X» (app nuova) | AggiornamentoApp.kt:42/103 | da sola | uguale | 0 |
| 14 | Manda a… (condivisione Android: chat o autopilota, nota, PIN, Manda) | MandaA.kt:127 | dalla condivisione | uguale | 0 |
| 15 | Notifica di una domanda o di una chat ferma | MainActivity.kt:134 | porta a Domande | porta ad **Adesso**, con la domanda in cima | 1 |
| 16 | Notifica di un autopilota | MainActivity.kt:134 | porta ad Autopiloti | porta ad **Adesso** → dettaglio dell'autopilota | 1 |
| 17 | «Rispondi» e «Scrivi» dentro la notifica | RispostaVeloce.kt | senza aprire | uguale | 0 |
| 18 | Notifica dell'app nuova | MainActivity.kt | dialogo | uguale | 0 |
| 19 | Notifica di un file ricevuto (Apri, Salva, Condividi) | FileTelefono.kt | azioni nella notifica | uguale; il tocco porta a Progetti › File (Ricevuti in cima) | 2 |
| 20 | `Apertura.apriChat` (da Domande, Autopiloti, Salute) | App.kt:110 | Chat, dentro la chat | uguale (voce Chat) | — |
| 21 | `Apertura.apriCartella` («Apri cartella») | App.kt:113 | File | Progetti › File | — |

### Adesso (oggi Domande + Autopiloti)

| # | Funzione di oggi | File:riga | Oggi | Posto nuovo | Dopo |
|---|---|---|---|---|---|
| 22 | Domande in attesa: «Aspettano te N», risposta con scelte, testo, 🎤 | Domande.kt:66, Conversazioni.kt:79 | 1 (+1 per aprire la conversazione) | **in cima ad Adesso**, scelte già aperte come tasti: un tocco risponde | 1 |
| 23 | «Tutte M» (anche quelle finite) | Conversazioni.kt | 2 | Adesso, sotto le domande | 1 |
| 24 | «Apri la sua linguetta Domande» → autopilota | Conversazioni.kt:156 | 3 | dalla domanda → dettaglio dell'autopilota | 2 |
| 25 | Schede per PC vecchi (SchedaAutopilota, SchedaScelta, SchedaChatFerma, «Apri la chat») | Domande.kt | 1 | Adesso, stesso posto delle domande | 1 |
| 26 | Elenco degli autopiloti di questo PC, posti delle chat | Lavori.kt:115 | 1 | Adesso, sotto le domande | 1 |
| 27 | Autopiloti «SU ALTRI PC», «Installa là» se il PC è indietro | Lavori.kt:208, Gestione.kt:315 | 1 | Adesso, sotto quelli di questo PC | 1 |
| 28 | «+ Affida» (Delega: PC, cartella, workspace, nome, pubblicazione, partenza, criteri, Prepara) | Lavori.kt:1009 | 2 | Adesso, «+ Affida» | 2 |
| 29 | «Chat al lavoro insieme» con «?» | Lavori.kt | 1 | Adesso | 1 |
| 30 | Dettaglio dell'autopilota: Vai, Ferma, Riprendi, Archivia, Sposta in un altro workspace, Manda adesso | Lavori.kt:245/704 | 3 | Adesso → autopilota | 2 |
| 31 | Al lavoro e Panoramica (un tocco su una chat → Chat) | Lavori.kt, Panoramica.kt | 3 | Adesso → autopilota | 2 |
| 32 | Scrivigli, 🎤, Allega | Lavori.kt | 3 | Adesso → autopilota (campo in fondo) | 2 |
| 33 | Linguetta Domande dell'autopilota (‹ prima / dopo ›, risposta) | Lavori.kt:1420 | 3 | autopilota, **sezioni tutte in vista in una pagina che scorre** (non più linguette chiuse) | 2 |
| 34 | Istruzioni (espandi, Correggi) | Istruzioni.kt:106 | 3 | come 33 — **dietro «⋯» da c-38: da decidere da Nicholas** | 2 |
| 35 | File dell'autopilota (e differenze) | Lavori.kt:1489 | 3 | come 33 — **«⋯» di c-38: da decidere da Nicholas** | 2 |
| 36 | Obiettivo (Specialisti, «Guarda») | SchedaDomandaVista.kt:199 | 3 | come 33 | 2 |
| 37 | Criteri | Lavori.kt | 3 | come 33 | 2 |
| 38 | Compiti | Lavori.kt | 3 | come 33 | 2 |
| 39 | Ha deciso | Lavori.kt | 3 | come 33 — **«⋯» di c-38: da decidere da Nicholas** | 2 |
| 40 | Altro: Riparte al riavvio, Lavora in sottofondo | Lavori.kt | 4 | come 33, sezione «Altro» | 2 |
| 41 | Altro: Elimina | Lavori.kt | 4 | come 33, sezione «Altro» | 2 |
| 42 | Quaderno (cerca, tag, scheda) | Lavori.kt:1177 | **4** | tasto «Quaderno» in testa al dettaglio | 2 |
| 43 | Autopilota di un altro PC (dettaglio) | Lavori.kt:153 | 2 | Adesso → autopilota | 2 |

**Indietro in Adesso:** dettaglio dell'autopilota → Adesso → esce.

### Chat

| # | Funzione di oggi | File:riga | Oggi | Posto nuovo | Dopo |
|---|---|---|---|---|---|
| 44 | Elenco delle chat per workspace; chat salvate; avviso «chiusa» | Chat.kt:223 | 0 (apertura) | Chat › Chat | 1 |
| 45 | «+ Nuova» (SceltaCartella: workspace, nome, modello, cartelle, Apri qui) | Chat.kt:901 | 1 | Chat › Chat, in cima | 2 |
| 46 | «Riprendi» (SceltaSessione) con «⋯ Chiudi, archivia, elimina»; sessione di un altro PC → DialogoSottofondo | Chat.kt:1019, Sottofondo.kt:105 | 1-3 | Chat › Chat, in cima; «⋯» per riga | 2 |
| 47 | Spazio delle chat (Spazio, Archiviate, Recupero 30 giorni, Svuota) | GestioneChat.kt:323 | 2 | dentro «Riprendi» | 2 |
| 48 | Gestione dei workspace (cerca, cambia, «⋯» Apri, Rinomina, Apri cartella, Elimina, Porta qui; Eliminati e Ripristina; Crea) | Gestione.kt:82 | 1-3 | Chat › Workspace; **in più «⋯» sull'intestazione di ogni workspace nell'elenco delle chat**. Il «⋯» per riga è di c-36: **da decidere da Nicholas** | 2 |
| 49 | Linguetta «Workspace» (Computer, parte CHAT: cambia, crea, «Rinomina o elimina…») | Computer.kt:356 | 2 | **doppione** di 48 (GestioneWorkspace si apre in tre modi): resta una sola, Chat › Workspace | 2 |
| 50 | Dettaglio della chat: terminale, «↑ Mostra quello di prima», coda d'invio, scrivi e manda, 📎 Allega, PIN «Apri» | Chat.kt:409, Terminale.kt:250, PinChat.kt:65 | 1 | Chat › chat | 2 |
| 51 | Domanda breve in cima e scelte «STA ASPETTANDO CHE TU SCELGA» | Chat.kt, DomandeALato.kt:49 | 1 | Chat › chat (e in Adesso, § 22) | 2 |
| 52 | Griglia o Adatta, A− e A+ | Chat.kt | 1 | Chat › chat | 2 |
| 53 | «⋯ Altro» della chat: Rinomina, Dormi o Svegliala, Sposta, PIN, Ospitata da…, Chiudi, Apri cartella, Archivia o elimina | Chat.kt | **2-3** | **«⋯» su ogni riga dell'elenco**; resta anche dentro la chat | 2 |
| 54 | Chat di un altro PC (fascia viola «SU X», «Torna») | Chat.kt:135 | 2 (da Salute) | Chat › Chat, gruppo «Su altri PC»; anche da Altro › Altri computer | 2 |
| 55 | Negozio: Plugin, Skill, MCP, Agenti (Cerca, Installa, Aggiorna, Attiva, Approva, «Mi fido…») | Negozio.kt:70 | 2-3 | Chat › Negozio, **i quattro tipi in una pagina che scorre** | 2 |

**Indietro in Chat:** chat aperta → elenco; linguetta Workspace o Negozio → linguetta Chat; poi Adesso.

### Progetti (oggi Progetti + File)

| # | Funzione di oggi | File:riga | Oggi | Posto nuovo | Dopo |
|---|---|---|---|---|---|
| 56 | Progetti e chat: gruppi, cerca, ordina, Aggiorna | PannelloDrive.kt:323 | 1-3 | Progetti › Progetti (l'ordine in vista, non in un menu) | 1 |
| 57 | Dettaglio del progetto: Sposta su, azioni dal PC con «?», Togli da questo PC, trasloco, Apri, Guarda su X, Annulla l'unione | PannelloDrive.kt:436 | 2 (Sposta su 3) | Progetti → progetto | 2 |
| 58 | Strumenti: tutte le chat (Residente: X), spazio sul Drive (Pulisci, Svuota, Misura), recupero (Ripristina), spostamenti, unioni, piano | PannelloDrive.kt | 2 | Progetti › Progetti, in fondo, ognuno si apre al posto dell'elenco | 2 |
| 59 | Quaderno del progetto | — (oggi solo dall'autopilota, § 42) | 4 | Progetti → progetto, «Quaderno» | 2 |
| 60 | Code dei progetti (Coda, Togli, Pulisci, Metti in coda) | Computer.kt:439 | 3 | Progetti › Drive | 2 |
| 61 | Drive: Per progetto o per workspace, Porta qui, Aggiorna, Crea qui, Annulla, Riavvia SierraDeck sul computer | Drive.kt | 3 | Progetti › Drive, **già aperto** (oggi dietro «Apri») | 2 |
| 62 | File: progetti dei PC, pillole dei PC, Ricarica | SezioneFile.kt:79 | 1 | Progetti › File | 2 |
| 63 | Cartella: Carica qui, Guarda, Scarica, Condividi, PIN | SezioneFile.kt | 2 | Progetti › File, la cartella si apre al posto dell'elenco (sfogliare non è una funzione nuova) | 2 + cartelle |
| 64 | Anteprima di un file (Condividi, Apri con un'altra app) | SezioneFile.kt | **3** | dentro la cartella | 2 + cartelle |
| 65 | Ricevuti · N (Controlla adesso, Apri, Salva, Condividi, Togli) | SezioneFile.kt, FileTelefono.kt | 2 | Progetti › File, **in cima quando ce ne sono** | 2 |

**Indietro in Progetti:** anteprima → cartella → cartella sopra → elenco (come SezioneFile.kt:186 oggi); dettaglio del progetto o strumento → elenco; linguetta File o Drive → Progetti; poi Adesso.

### Altro (oggi Salute + Impostazioni)

| # | Funzione di oggi | File:riga | Oggi | Posto nuovo | Dopo |
|---|---|---|---|---|---|
| 66 | Salute del sistema: Da sistemare, Computer, Drive, Errori, azioni dal PC, Mappa dei PC | Salute.kt:95 | 1-2 | Altro › Salute | 2 |
| 67 | Altri computer: Installa là, Chat di X dal vivo, cassetta (Togli, Pulisci le chiuse, Manda a X) | Computer.kt:210 | 1-2 | Altro › Altri computer | 2 |
| 68 | Consumi (sola lettura) | Computer.kt:679 | 1 | Altro › Consumi | 2 |
| 69 | Cerca nelle impostazioni | Computer.kt:166 | 1 | Altro, in cima | 1 |
| 70 | Aggiornamenti dell'app e del PC (Cerca ora, Scarica, Installa e riavvia, note) | Computer.kt:766/952 | 1 | Altro › Aggiornamenti | 2 |
| 71 | Chat: la migrazione (Torna come prima, Trasforma tutti) | Migrazione.kt:59 | 1 | Altro › Chat | 2 |
| 72 | Quaderno personale | QuadernoPersonale.kt:92 | 1 | Altro › Quaderno personale | 2 |
| 73 | Account (Esci, Entra, Passa a un altro) | Computer.kt:548 | 1 | Altro › Account | 2 |
| 74 | Aspetto (Banco o Foglio, chiarore) | Computer.kt:562 | 1 | Altro › Aspetto | 2 |
| 75 | Avvisi (controllo continuo, notifiche di Android, risparmio batteria, quali notifiche) | Computer.kt:594 | 1 | Altro › Avvisi | 2 |
| 76 | Info: Copia i dettagli; errori dell'app (Vedi, Copia, «Manda al PC di sviluppo») | Computer.kt:737, ErroriApp.kt:118 | 1-2 | Altro › Info ed errori | 2 |

**Indietro in Altro:** sezione → elenco di Altro → Adesso.

**Funzioni prima 76 = funzioni dopo 76, nessuna persa.** Una sola cambia forma: la linguetta «Workspace» doppia (49) si unisce a 48. Nessuna oltre i 2 tocchi; oggi ce ne sono 18 a 3-4 (24, 30-42, 53, 60, 61, 64). Il quaderno del progetto (59) oggi si apre solo dall'autopilota.

## 5. Pagina servita dal PC: la stessa mappa

> Fatto sul ramo c-50 (c-516, 21/10): come è costruita e le trappole in `pagina-telefono-quattro-voci-0-83-0.md`. Unica differenza dall'app: in Altro «Chat» e «Quaderno personale» sono una sezione sola, come nelle Impostazioni del PC.

Oggi la fascia ha le sette voci di `MENU_PRINCIPALE` (client-pagina.ts:1883), si apre su **Domande** (client-pagina.ts:1419), indietro come sopra (client-pagina.ts:5718). Dopo: le stesse quattro voci dell'app dallo stesso `MENU_TELEFONO`, apertura su Adesso, indietro come § 3, pallini e colori come § 7.

| Voce del PC (`MENU_PRINCIPALE`) | Funzioni di `FUNZIONI` | Voce sul telefono (app e pagina) |
|---|---|---|
| Domande | Domande in attesa; Quello che è in moto adesso | **Adesso** (in cima) |
| Autopiloti | Autopiloti di questo PC e degli altri PC | **Adesso** (sotto) |
| Chat e workspace | Nuova chat; Riprendi; Spazio delle chat; Cambia, crea, rinomina ed elimina i workspace; Usate da altri PC; Nuova finestra (solo PC); Negozio | **Chat** |
| Progetti | Pannello Progetti; Contenuto del Drive; Porta qui; Sposta progetto; Riordina le chat; Dove vive ogni chat; Togli e rimetti un workspace; Salva ora e Ripristina; Salvataggio automatico; Fondi con il Drive; Stato della sincronizzazione; Progetti sul Drive; Code dei progetti; Quaderno del progetto | **Progetti** |
| File | File del progetto e del suo server; File da mandare al telefono | **Progetti** › File |
| Salute | Salute del sistema; Altri computer; Consumi | **Altro** |
| Impostazioni | Aggiornamenti; Nome del computer, porte, accoppiamento; Account Google e cassaforte; AI; Aspetto, scorciatoie, notifiche; Registro e Copia i dettagli | **Altro** |

**Funzioni di `FUNZIONI` prima 37 = dopo 37, nessuna persa** (il test «nessuna funzione senza casa» resta com'è: il raggruppamento è per voce del PC).

## 6. Da sistemare, visto facendo la mappa

- **Avvio** (visto da c-11 sulla 2.82.0): per circa 1,3 s compare «Nessuna chat sul computer» anche se le chat ci sono, poi l'elenco salta due volte (si apre e si chiude la scheda «Collegato a…», App.kt:595 con i `delay(1200)`/`delay(1300)` di App.kt:317-320). Adesso deve mostrare «Leggo…» finché non arriva il primo stato, e la scheda del collegamento non deve spostare il contenuto.
- In cima a ogni voce si impilano fino a otto strisce (pillola, viaggio, tentativi, nota, non collego, Drive, urgenze, app nuova): vanno tenute ma più basse; in Adesso la banda delle urgenze non serve.
- Etichette della barra a 10 sp su due righe e pallino a 9 sp (App.kt:733/740): con quattro voci il nome sta su una riga a 12 sp o più.
- Le anteprime delle chat in elenco mostrano pezzi di terminale («▘▝ ▖▗ 1 more notice hidden», «medium · /effort1 more»): illeggibili.
- Gli stati delle linguette di Chat e Progetti si azzerano a ogni cambio di voce (`remember` dentro il `when`, App.kt:638/653).

## 7. Colori delle attività (stessa tabella del PC)

Dalla tabella unica `src/shared/colori-attivita.ts` (app: `ColoriAttivita.kt`, generato dal test; pagina: `var ATT`): sviluppo ✎ blu `#4aa3ff`, interfaccia ◧ viola `#b48cff`, collaudo ◎ acqua `#3cc8c0`, revisione ◈ rosa `#f283c0`, rilascio ▲ lime `#b4d454`, **aspetta te ◆ ambra `#e0a33c`**, **ferma o errore ■ rosso `#f2857c`**, finita ✓ grigio `#9aa1a9`. Sempre con simbolo o parola, mai solo colore; contrasto ≥ 4,5:1 già provato dal test del PC.

Nella mappa nuova le righe di chat e autopiloti in Adesso e in Chat usano simbolo e colore della tabella; il pallino di Adesso è ambra (domande) o rosso (fermo), quello di Chat ambra. Da portare sulla tabella le mappe locali che oggi la duplicano: `coloreStato`/`coloreLed` (Lavori.kt:78/92), `coloreTono` (Chat.kt:1160), `coloreVista` (PannelloDrive.kt:303), Panoramica.kt:295, Drive.kt:297/311, Negozio.kt:418, Salute.kt:87, `coloreAdesso`/`tonoDalVivo` (Modelli.kt:485/519), i viola scritti a mano (Ponte.kt:96, DriveScollegato.kt:64).

## 8. Misure «prima» (2.82.0)

Le fa **c-11** (sua scheda «0.83.0: velocità dell'app e file Kotlin…»), con lo stesso emulatore e la stessa copia di prova per prima e dopo; questa chat non le ripete per non caricare il PC con un secondo emulatore mentre misura. Emulatore `sd11` (Android 11, 1080×2400, 420 dpi), app 2.82.0 accoppiata a una **copia di prova** (`SIERRADECK_PROVA`, porte 47760/47761) attraverso un contatore delle chiamate su 47770. Script: `note/prova-083/misura.py` nella copia di c-11.

| Misura | Metodo | Prima (2.82.0) |
|---|---|---|
| Avvio a freddo | `am start -W` a processo spento, TotalTime, 8 volte, mediana | **1358 ms** (1283-1490) |
| Primo contenuto visibile | registrazione dello schermo dall'avvio; primo fotogramma uguale al finale nella zona dei contenuti | **7,8 s** (7,2-9,3 s; 4 prove) |
| Schermata ferma (finiti i salti) | come sopra | **9,6 s** (9,1-11,3 s) |
| Cambio schermata | tocco su ogni voce 3 volte, dal primo fotogramma che cambia a quello fermo | in corso (c-11) |
| Scorrimento di una lista lunga | `dumpsys gfxinfo`, 10 passate su «Riprendi» con 120 conversazioni, frame lenti | in corso (c-11) |
| Chiamate al PC per minuto | righe del contatore: 3 min con l'app davanti e ferma, 2 min dietro | in corso (c-11). Dal registro, nei minuti senza tocchi: **circa 29-30 al minuto, quasi tutte `/api/stato` ogni 2 s** |

**Chiamate per schermata, dal codice** (app davanti, polso compreso; da confermare con il contatore):

| Schermata | Chiamate/min | Perché |
|---|---|---|
| Chat, elenco | ~30 | `/api/stato` ogni 2 s (App.kt:432) |
| Chat, dettaglio | ~60 (~84 se chiede) | + `/api/storia` ogni 2 s (Chat.kt:497), + `/api/domande` ogni 2,5 s (DomandeALato.kt:49) |
| Domande | ~60 | + `/api/domande` ogni 2 s (Domande.kt:75), **doppione dello stato** |
| Autopiloti, elenco | ~34 | + `/api/autopiloti/altri` ogni 15 s |
| Autopilota, dettaglio | ~90 (~105 con Istruzioni o File) | + `/api/autopilota` e `/api/panoramica` ogni 2 s (Lavori.kt:278) |
| Workspace, Drive e code, Salute, Impostazioni | ~66 | `Computer()` (Computer.kt:110-154) chiede `/api/aggiornamento` **ogni 2 s**, `/api/pc` ogni 15 s, `/api/consumi` ogni 30 s **in tutte e quattro le parti**, anche dove non si vedono |
| Drive aperto mentre legge il catalogo | ~216 | `/api/drive/catalogoStato` ogni 500 ms (Drive.kt:77) |
| Installazione del PC | ~100 | SchermoInstallazione.kt:89, ogni 1,2 s |

**Continuano con l'app dietro** (`delay` semplice invece di `Davanti.pausa`): Istruzioni (Istruzioni.kt:116), Drive (Drive.kt:77-101), PannelloDrive (:348-350), Sottofondo (Sottofondo.kt:129), SchermoInstallazione. Il polso principale dietro scende a ogni 15 s (corretto).

Il dato che pesa: il primo fotogramma arriva in 1,4 s, ma il **primo contenuto vero dopo 7,8 s** e lo schermo smette di saltare a 9,6 s. È lì che la 0.83.0 deve guadagnare; sulle chiamate, il doppione `/api/aggiornamento` ogni 2 s in Computer() e `/api/domande` accanto allo stato.

## 9. Foto «prima»

In `note/prova-083/prima/` (fuori da git). Dati finti della copia di prova («PC di prova», progetti «Prova …»): niente nomi, indirizzi o percorsi veri. Finché c-11 misura l'emulatore non si tocca; le sue foto delle voci sono in `note/prova-083/misure/prima/` della sua copia (`ap-f1e631f5-c-11-android`).

## Trappole

- **Un solo emulatore e un solo Gradle per volta.** Un secondo emulatore (swiftshader, senza GPU) o una compilazione mentre c-11 misura falsano le misure «prima». L'APK sull'emulatore (2.82.0) è lo stesso che uscirebbe da questo ramo (dopo la 0.82.0 solo quaderno): non serve ricompilarlo.
- **Sull'emulatore di prova non premere il «Riprendi» rosso in alto:** fa ripartire 12 autopiloti finti della copia di prova, che lanciano Claude. Non rifare l'accoppiamento: passa dal contatore 10.0.2.2:47770.
- «Adesso» era stata **tolta** nella 0.61.0 (App.kt:80) perché era vuota nove volte su dieci. La nuova è un'altra cosa: contiene Domande e Autopiloti.
- **Un file del quaderno lasciato non tracciato nella cartella principale blocca l'unione** di un ramo che porta un file con lo stesso nome, anche se il contenuto è identico: git dice «Please move or remove them before you merge. Aborting» (provato il 21/10 in un repository di prova). Per questo `inventario-app-0-83-0.md` di c-10, che è solo nella cartella principale e non in git, **non** è stato copiato in questo ramo con lo stesso nome: il suo contenuto è dentro questa mappa. Va committato da lì o tolto, non duplicato da un ramo.
- Chi sposta le schermate deve tenere vive tutte le strade di § 2 (`Apertura`, notifiche, salti da codice), o una notifica porta nel posto sbagliato.
