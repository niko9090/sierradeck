---
titolo: "Inventario dell'app Android prima della 0.83.0: schermate, funzioni, indietro, colori, misure"
quando: 2026-10-21T08:00:00Z
tag: ["0.83.0", "app", "inventario", "mappa", "navigazione"]
---

Letto dal Kotlin di main al 21/10 (app 2.82.0), file per file. Serve a chi fa la mappa (c-10) e lo spostamento delle schermate (c-11, c-439): nessuna funzione deve restare senza casa. I percorsi sono relativi a `android/app/src/main/java/it/ferrariconsulenze/sierradeck/`. «Tocchi» si contano dall'avvio, che oggi apre su **Chat → «Chat»** (App.kt:228).

## Oggi: sette voci in basso
`enum class Scheda` (App.kt:87): Progetti, Autopiloti, Domande, Chat, File, Salute, Impostazioni. I nomi e l'ordine vengono da `src/shared/menu-principale.ts` (`MENU_PRINCIPALE`), che vale anche per il PC e la pagina, attraverso `assets/menu.json`; li controllano `MenuPrincipaleTest.kt` e `tests/shared/menu-principale.test.ts`. `FUNZIONI` nello stesso file è l'inventario della 0.61.0, con il test «nessuna funzione senza casa».

## Fuori dalle schede (sempre o prima della barra)
- **Ingresso** (Ingresso.kt:42): QR «Inquadra il codice», indirizzo, codice a sei cifre, nome del dispositivo, «Collega».
- **SchermoInstallazione** (SchermoInstallazione.kt:68): «Torna alle chat», «Lascia perdere e torna indietro».
- **NonRiconosciuto** (App.kt:869): «Riprova», «Rifai l'accoppiamento».
- **DialogoGuasto** (DialogoGuasto.kt:33): «Copia e chiudi», «Chiudi».
- In alto su ogni scheda (App.kt:559-631):
  - **PillolaComputer**: apre il **SelettoreComputer** (passa a un PC, «tienila», ✎ Rinomina, 🗑 Dimentica, «Aggiungi un computer»).
  - **IndicatoreLinea**: dialogo «Collegamento con NOME».
  - **SchermataViaggio**: «Riprova», «Torna a NOME», «Copia i dettagli», «Annulla».
  - **SchedaCollegamento**: «Riprova».
  - **NotaGlobale**: «Ok».
  - **BandaNonCollego**: «Apri Tailscale», «Riprova».
  - **BandaDriveScollegato**: «Perché?», «×».
  - **BandaUrgenze**: «Vedi» porta a Domande, «Riprendi», «Vai».
  - **BandaAggiornamentoApp** e il suo dialogo «C'è SierraDeck X».
- **Manda a…** (MandaA.kt:127), dalla condivisione Android: chat o autopilota, nota, PIN, «Manda», «Riprova».
- **Notifiche** (MainActivity.kt:129-146):
  - una domanda o una chat porta a Domande, non alla chat;
  - un autopilota porta ad Autopiloti;
  - «Rispondi» e «Scrivi» in linea non aprono niente;
  - l'app nuova apre il dialogo dell'aggiornamento;
  - un file ricevuto ha «Apri», «Salva», «Condividi».

## Chat (0 tocchi; linguette «Chat», «Workspace», «Negozio»)
- **Elenco** (Chat.kt:223): «+ Nuova» apre SceltaCartella, «Riprendi» apre SceltaSessione (con «⋯ Chiudi, archivia, elimina» e «Spazio delle chat»), «Workspace» apre GestioneWorkspace (cerca, cambia, «⋯» con Apri, Rinomina, Apri cartella, Elimina, Porta qui; Eliminati con Ripristina; Crea).
- **Dettaglio della chat** (Chat.kt:409, 1 tocco):
  - il menu «⋯ Altro» (2 tocchi): Rinomina, Metti a dormire o Svegliala, Sposta in un altro workspace, PIN, Ospitata da…, Chiudi la chat, Apri cartella (porta a File), Archivia o elimina;
  - Griglia o Adatta, A− e A+;
  - la domanda breve in cima;
  - le scelte «STA ASPETTANDO CHE TU SCELGA»;
  - 📎 Allega, scrivi e manda.
- **Chat di un altro PC** (Chat.kt:135): si apre da Salute, «Altri computer», «Chat di X dal vivo» (2 tocchi), con la fascia viola «SU X» e «Torna».
- **Workspace** (Computer.kt:356): cambia, crea, «Rinomina o elimina…». È un doppione: GestioneWorkspace si apre in tre modi.
- **Negozio** (Negozio.kt:70): Plugin, Skill, MCP, Agenti, con Installa, Aggiorna, Attiva, Approva, «Mi fido…».

## Progetti (1 tocco; linguette «Progetti e chat», «Drive e code»)
- **Progetti e chat** (PannelloDrive.kt:323): gruppi, cerca, ordina. Il dettaglio del progetto (2 tocchi) ha Sposta su, le azioni dal PC con «?», il trasloco, Apri, Guarda su X e Annulla l'unione. In «Strumenti»: tutte le chat, spazio sul Drive, recupero, spostamenti, unioni, piano.
- **Drive e code** (2 tocchi): le code dei progetti e `SezioneDrive` (Porta qui, Aggiorna, Crea qui, per progetto o per workspace).

## Autopiloti (1 tocco, `Lavori` Lavori.kt:115)
- **Elenco**: «+ Affida» (Delega, 2 tocchi), «Chat al lavoro insieme» con «?», gli autopiloti «SU ALTRI PC».
- **Dettaglio** (2 tocchi):
  - i comandi Vai, Ferma, Riprendi, Archivia, Sposta in un altro workspace;
  - al lavoro e Panoramica: un tocco su una chat porta a Chat;
  - scrivigli, 🎤, Allega;
  - le linguette, chiuse all'apertura (3 tocchi): Domande, Istruzioni (Correggi), File, Obiettivo, Criteri, Compiti, Ha deciso, Altro (Riparte al riavvio, Lavora in sottofondo, Quaderno a 4 tocchi, Elimina).

## Domande (1 tocco, Domande.kt:66)
- Le conversazioni dal PC (Conversazioni.kt:79): «Aspettano te N», «Tutte M»; si risponde con le scelte, il testo o 🎤; «Apri la sua linguetta Domande» porta all'autopilota.
- Per un PC vecchio: le schede SchedaAutopilota, SchedaScelta e SchedaChatFerma, con «Apri la chat».

## File (1 tocco, SezioneFile.kt:79)
- «Progetti» e «Ricevuti · N», con le pillole dei PC.
- Una cartella è a 2-3 tocchi: Carica qui, Guarda, Scarica, Condividi, il PIN.
- L'anteprima è a 4 tocchi.
- Ricevuti: Apri, Salva, Condividi, Togli.

## Salute (1 tocco)
- **Altri computer** (Computer.kt:210): Installa là, «Chat di X dal vivo» che porta a Chat, Manda a X, Pulisci le chiuse.
- **SezioneSalute** (Salute.kt:95): Da sistemare, Computer, Drive, Errori; le azioni dal PC; Mappa dei PC.
- **Consumi**: solo lettura.

## Impostazioni (1 tocco)
- Cerca nelle impostazioni.
- **Aggiornamenti** dell'app e del PC (Scarica, Installa e riavvia).
- **Chat**: la migrazione.
- **Quaderno personale**.
- **Account**: Esci, Entra, Passa a un altro.
- **Aspetto**: Banco o Foglio, chiarore.
- **Avvisi**: controllo continuo, batteria, interruttori.
- **Info**: Copia i dettagli; gli errori dell'app con Copia e «Manda al PC di sviluppo».

## Dove si cambia scheda da codice
- **`Apertura`** (App.kt:104-118): `apriChat` porta a Chat, `apriCartella` a File.
- **Notifiche:** MainActivity.kt:134-145.
- **Chiamate dalle schermate:**
  - `onApriDomande` (App.kt:624, Urgenze.kt:123);
  - `onApriAutopilota` (App.kt:649, Conversazioni.kt:156);
  - `apriChat` (Domande.kt:370, Lavori.kt:373/387/592);
  - Computer.kt:247 (`SuPc` e poi Chat);
  - Salute.kt:141 (Autopiloti);
  - SezioneFile.kt:351 `apriCartellaDa` (da Chat.kt:605 e Gestione.kt:165).

Chi rinomina o raggruppa le schede deve tenere vive tutte queste strade.

## «Indietro» oggi: cinque BackHandler
1. Chat.kt:118: dal dettaglio all'elenco.
2. Chat.kt:174: chat di un altro PC, e poi via da quel PC.
3. Lavori.kt:153: autopilota di un altro PC.
4. Lavori.kt:163: dal dettaglio dell'autopilota all'elenco.
5. SezioneFile.kt:186: anteprima, PIN, cartella sopra, elenco.

**Non c'è** un «indietro» per il cambio di scheda, il dettaglio del progetto, le linguette, le linguette dell'autopilota e la SchermataViaggio: lì «indietro» chiude l'app. I dialoghi si chiudono con `onDismissRequest`.

## Colori
- La tabella condivisa con il PC è `TabellaAttivita` (ColoriAttivita.kt, generata da `src/shared/colori-attivita.ts`), letta da `Attivita` (Attivita.kt:35).
- Altre copie del PC: `coloreAdesso` (Modelli.kt:485) e `tonoDalVivo` (Modelli.kt:519).
- Mappe di colori locali, da portare sulla tabella:
  - `coloreStato` e `coloreLed` (Lavori.kt:78/92);
  - `coloreTono` (Chat.kt:1160);
  - `coloreVista` (PannelloDrive.kt:303);
  - Panoramica.kt:295, Drive.kt:297/311, Negozio.kt:418, Salute.kt:87.
- Colori scritti a mano: `VIOLA_ALTRO_PC` (Ponte.kt:96) e `ColoreRemoto` (DriveScollegato.kt:64), lo stesso valore; Ronda.kt:176; PannelloDrive.kt:505; Linea.kt:397.

## Caratteri e tasti
- **Caratteri:** ci sono 610 `fontSize = N.sp` (soprattutto 11, 12 e 13 sp). Seguono già la dimensione del telefono, perché nessuno la blocca.
- **Dove si rompe a caratteri grandi:**
  - le etichette della barra: 10 sp con lineHeight 11 sp e due righe, il pallino a 9 sp (App.kt:733/740);
  - il «?» a 12 sp in un cerchio di 20 dp (Aiuto.kt:66);
  - i dialoghi ad altezza fissa: Delega 560 dp (Lavori.kt:1045), SceltaCartella 380 dp, SceltaSessione 320 dp, Quaderno 380 dp.
- **Il terminale** usa `dimensione.sp`: la scala del telefono moltiplica quella di A− e A+.
- **Tasti sotto i 48 dp:**
  - IconButton a 36 dp: Chat.kt:565/588, Lavori.kt:314, SelettoreComputer.kt:192/195, AggiornamentoApp.kt:117;
  - il «?» a 32 dp, usato 64 volte (Aiuto.kt:60);
  - 📎 a 40 dp (Chat.kt:755) e Manda a 44 dp (Chat.kt:779);
  - righe cliccabili con poco margine: SchedaDomandaVista.kt:76/125, Linea.kt:300, la pillola del computer (~32 dp), le pillole delle Conversazioni (~34 dp), Lavori.kt:1168/1521, Istruzioni.kt:135, Gestione.kt:259, Chat.kt:1194.
- **Da misurare sul telefono:** `Voce` (48 usi) e `TastoContorno` sono `Surface` cliccabili alte circa 33 dp. Material 3 dovrebbe allargare l'area del tocco a 48 dp.

## Idea per le quattro voci, senza perdere la casa delle funzioni
Il PC tiene le sue sette voci. Il telefono, cioè app e pagina, le raggruppa in quattro con un elenco in `menu-principale.ts`, e dentro una voce con più parti mette una fila di linguette:

| Voce | Parti |
|---|---|
| Adesso | domande in cima, poi autopiloti |
| Chat | chat, con Workspace e Negozio come oggi |
| Progetti | progetti e file |
| Altro | salute e impostazioni |

Ogni voce del PC sta in un solo gruppo, quindi `FUNZIONI` e il suo test continuano a valere così come sono. `Scheda` può restare come «destinazione»: `Apertura`, le notifiche e i salti da codice continuano a funzionare, e la fascia mostra la voce che contiene quella destinazione.

Proposta per «indietro»: torna alla prima linguetta della voce, poi ad Adesso, e da Adesso esce dall'app. I BackHandler più interni, come chat aperta, autopilota e cartella, hanno la precedenza.

Una bozza di codice (`MENU_TELEFONO`, `voceTelefonoDi`) l'ha scritta c-12 e poi l'ha lasciata, perché l'app è di c-11 e c-439. Si rifà in pochi minuti da questa descrizione.
