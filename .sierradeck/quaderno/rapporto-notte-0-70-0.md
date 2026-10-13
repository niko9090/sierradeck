---
titolo: "Rapporto della notte: 0.70.0, tutte le schermate riprogettate"
quando: 2026-10-13T02:30:00+02:00
tag: ["0.70.0", "rapporto", "interfaccia"]
---

Nicholas, «migliora tutto il programma riprogettando per bene come hai fatto per i progetti».

**Il metodo, per ogni schermata:**
1. La foto «prima», nella copia di prova.
2. La revisione di un agente UI/UX (il progetto è in `riprogettazione-0-70-0.md`).
3. Il PC, poi la pagina e l'app.
4. I test delle funzioni pure.
5. La foto «dopo».

Le foto sono in `note/foto-0-70/`, sul PC fisso (fuori da git: mostrano le cartelle della macchina): `prima-*.png` / `dopo-*.png` per il PC, `pagina-prima-*.png` / `pagina-dopo-*.png` per il telefono. **Nessuna funzione è stata tolta**: per ogni schermata c'è l'elenco delle azioni di prima e di dove sono adesso.

## In breve, per stamattina
- **Fatte tutte e dieci le schermate**, dalla (a) alla (j), ognuna con il suo commit: principale, Autopiloti, Domande, Salute, Impostazioni, File, Negozio, Consumi, Quaderno, Account e Drive.
- **Un difetto vero trovato e corretto** (c): le domande a scelta di Claude Code non arrivavano né nelle Domande né sul telefono quando in fondo allo schermo restava una riga di cornice vecchia.
- **Due difetti piccoli corretti di passaggio**: nella pagina «Aspettano te» ripeteva lo stesso nome tre volte (i); i token nei Consumi erano attaccati («0 in entrata0 in uscita…») e c'era «contesto contesto» (h).
- **Novità per te** (0.70.0): il Drive dice «scade» dal sesto giorno dopo il collegamento, finché l'app OAuth di Google è «in prova» (j). La soluzione vera resta metterla «In produzione» nella console di Google Cloud.
- **Pagina e app allineate** in tutte le schermate in cui il telefono ha qualcosa da mostrare. Le parole e i colori li decide il PC e li manda.
- **Prove**: tutti i test verdi (vitest, typecheck, gradle), il controllo dei dati privati pulito, ogni schermata guardata nella copia di prova. Le chat e gli autopiloti veri non li ho toccati.
- **Pubblicata la 0.70.0** (app 2.70.0) alle 02:54: prima come bozza, poi il programma per Windows con latest.yml, l'APK firmato (verificato «O=Ferrari Consulenze») e app-android.json, poi resa visibile come ultima. **Non l'ho installata**: la installi tu, quando vuoi. Su PC, pagina e app comparirà «Versione pronta — Installa».

**Foto** (in `note/foto-0-70/`):
- PC, `prima-*` e `dopo-*`: principale, autopiloti (+ dettaglio), domande, salute (+ dettaglio), altri-computer, impostazioni, file, negozio, consumi, quaderno (+ personale), account.
- Telefono, `pagina-prima-*` e `pagina-dopo-*`: autopiloti, chat, domande, salute, quaderno, account.

**Punti aperti**, i più utili per primi:
1. Una regola unica dello stato di un altro PC (Salute, Altri computer e mappa a volte non coincidono). Va provata con i PC veri. (d)
2. La colonna dell'autopilota dentro il riquadro della chat non è ridisegnata. (b)
3. Il Negozio: gruppi e tabella con il dettaglio a destra. (g)
4. I File: tasti alla Total Commander e una coda unica. (f)
5. Il numero per workspace sulle linguette. (a)
6. «Avanzate ▸» nelle Impostazioni. (e)
7. La tessera «Telefoni» lenta (~4,5 s). (j)

## (a) Schermata principale
**Cosa cambia**
- **Ogni riquadro dice il suo stato in una parola** sulla testata: aspetta te (ambra), errore (rosso), al lavoro (verde), autopilota (blu), ferma, dorme, su <PC>. Nei riquadri stretti resta il pallino colorato.
- **Le chat con lo stesso nome si distinguono**: «Lavoro-esempio», «Lavoro-esempio #2», «#3». Lo stesso sul PC, nella pagina e nell'app. Il nome salvato non cambia.
- **La testata è più pulita**: restano ⏸ e ×, più il nuovo «⋯», che apre i comandi rari.
- **Il modello delle prossime chat va in «Strumenti ▾»** nella seconda barra, con «Usate da altri PC», i workspace, la nuova finestra e il negozio. Se il modello non è quello predefinito, il tasto lo dice.
- **Niente più striscia «Sto guardando se c'è una versione nuova…»** a ogni controllo automatico (ogni 10 minuti). Resta la spia «cerco…» accanto alla versione. La striscia compare solo se la ricerca l'ha chiesta il telefono.
- **Telefono** (pagina e app): i nomi distinti, e sotto il nome non c'è più «Enter to confirm · Esc to cancel». Si legge l'ultima riga vera della chat.

**Azioni di prima → dove sono adesso**

| Prima | Adesso |
|---|---|
| ⇄ Sposta in un'altra finestra o workspace (testata) | testata → «⋯» → ⇄ |
| 🏠 PC ospite (testata) | testata → «⋯» → 🏠 (anche il tasto destro sul titolo, come prima) |
| 🔐 PIN della chat (testata) | testata → «⋯» → 🔐 |
| ⏸ Iberna, × Chiudi | testata, come prima |
| Rinomina (due clic sul titolo) | come prima |
| Modello delle prossime chat (seconda barra) | seconda barra → «Strumenti ▾» |
| Riprendi, + Nuova chat, workspace, Su altri PC, ⋯ workspace, Al lavoro in sottofondo | seconda barra, come prima |
| «Chat e workspace» (menu principale) | come prima, raggiungibile anche da «Strumenti ▾» |

**Funzioni pure e test**: `src/shared/chat-vista.ts` (statoChat, riassuntoWorkspace, nomiDistinti, rigaUtile, statoAggiornamento, gruppoChat) e `src/shared/stato-vista.ts`, provate in `tests/shared/chat-vista.test.ts`; nell'app `nomeChat` con `NomeChatTest`.

**Aperto**: il riassunto per workspace sulle linguette (pallino e numero dello stato peggiore) ha la funzione pronta (`riassuntoWorkspace`). Sulle linguette oggi c'è solo il pallino «qualcuno ti chiama» di prima: per il numero servono gli stati delle chat degli altri workspace, che la finestra non ha.

## (b) Autopiloti
**Cosa cambia**
- **A tutta finestra**, come Progetti. La tabella: Autopilota (con la cartella) · Chat · Criteri «1/2» · Ultima azione · Da · Stato.
- **Gruppi** con i conti: Aspettano te · Al lavoro · Fermi · Finiti · Tutti, più la ricerca per nome, obiettivo o cartella.
- **Lo stato è una parola** (`src/shared/autopiloti-vista.ts`): guasto (rosso), aspetta te, senza segni (ambra), al lavoro (verde), si prepara, pronto (blu), fermo, finito.
  - **Il guasto vince sul verde**: prima la riga diceva «al lavoro» e «guasto del programma» insieme.
- **Un solo verbo per riga**, secondo lo stato: Ferma, Rispondi (apre le Domande), Riprendi.
- **Il dettaglio a destra**: stato e da quanto, il verbo, «riparte dopo un riavvio», Archivia, «Togli…» in rosso con conferma. Sotto, l'obiettivo, i criteri spuntati, dal vivo, i messaggi verso la chat (con «Manda adesso») e le sue chat.
- **Il modulo «Nuovo autopilota»** si apre nel riquadro di destra: stessi campi, stesse spiegazioni dietro il «?».
- **Un PC che non risponde** è una riga sola, «DESK-ESEMPIO · non risponde», con il perché dietro il «?». Prima era un paragrafo arancione di sei righe. Così sul PC e sulla pagina.
- **Telefono**: la parola colorata, «da N min · criteri 1/2» e l'ultima azione. Le decide il PC (`vista` in `/api/stato`), e la pagina e l'app le disegnano. Con un PC più vecchio l'app usa le sue parole come prima.

**Azioni di prima → dove sono adesso**

| Prima | Adesso |
|---|---|
| + Nuovo autopilota | in alto, come prima; il modulo si apre a destra |
| Aggiorna | Strumenti ▾ → Aggiorna |
| Riparti al login (spunta in alto) | Strumenti ▾ → Riparti al login |
| Ferma / Riprendi / Riprendi le domande (in riga) | il verbo in riga, e lo stesso nel dettaglio |
| Archivia / Archiviato · togli | dettaglio |
| spunta «avvio» per autopilota | dettaglio → «riparte dopo un riavvio» |
| × elimina | dettaglio → «Togli…» con conferma |
| Su altri PC (i loro autopiloti, le azioni) | sotto la tabella, come prima |
| La scheda accanto alla chat (dialogo, diario, istruzioni, file) | invariata |

**Test**: `tests/shared/autopiloti-vista.test.ts` (8) e, nell'app, `VistaAutopilotaTest`.

**Aperto**: la scheda dell'autopilota accanto alla chat (la colonna stretta nel riquadro) non è stata ridisegnata stanotte. Toccarla vuol dire toccare il ridimensionamento del terminale, e va provata con calma.

## (c) Domande
**Cosa cambia**
- **Di partenza «Aspettano te»**: le chat che hanno solo finito il turno stanno in «Tutte». Prima tre «aspettano» si perdevano fra cinque righe uguali.
- **Il tipo in una parola**, deciso dal PC (`src/shared/domande-vista.ts`): permesso (rosso), scelta e domanda (ambra), autopilota (blu), ha finito. Prima i permessi, le finite in fondo.
- **Dopo una risposta si passa da soli alla prossima** che aspetta te.
- **Nella conversazione si vedono gli ultimi 4 messaggi**; quelli di prima si aprono con «N messaggi prima ▾». La riga fissa «Ctrl+Invio manda…» sta dietro il «?».
- **Telefono** (pagina e app): gli stessi «Aspettano te N · Tutte M» e la parola colorata del tipo.

**Difetto trovato e corretto stanotte**
- **Il sintomo**: una domanda di Claude Code con le opzioni (AskUserQuestion) in cima a un riquadro alto non arrivava né alle Domande né al telefono. Il riquadro diceva «ferma» e le Domande «0».
- **La causa**: al telefono e alle Domande vanno le ultime 24 righe dello schermo, togliendo le vuote in fondo. Sotto la domanda però c'erano trenta righe vuote e poi una cornice rimasta da un vecchio disegno («──── Lavoro-esempio ─»), che fermava il taglio delle vuote. Così le 24 righe erano solo vuoto e cornice.
- **La correzione**: una cornice sola in fondo, dopo righe vuote, si toglie (`eCorniceSola` in `schermo-terminale.ts`, con test). Provato dal vero nella copia di prova: «Aspettano te 1», tipo «scelta», le opzioni toccabili, e il riquadro dice «aspetta te».

**Azioni di prima → dove sono adesso**

| Prima | Adesso |
|---|---|
| Elenco di tutte le conversazioni | «Tutte»; di partenza «Aspettano te» |
| Opzioni da toccare, testo libero, Manda/Rispondi, PIN | come prima |
| Rimando alla linguetta «Domande» di un autopilota | come prima |
| Tutta la storia della conversazione | gli ultimi 4 messaggi + «N messaggi prima ▾» |
| Riga fissa «Ctrl+Invio manda…» | dietro il «?» |
| Larghezza trascinabile, × chiudi | come prima |

**Test**: `tests/shared/domande-vista.test.ts` (5), una prova della cornice in `tests/renderer/schermo-terminale.test.ts`, e nell'app `AspettaTeTest`.

## (d) Salute e Altri computer
**Cosa cambia**
- **A tutta finestra.** In cima il riassunto («1 cosa da sistemare · 2 da guardare») e i gruppi con i conti: Da sistemare · Computer · Drive · Errori · Tutto. Si apre su «Da sistemare» se c'è qualcosa, se no su «Computer».
- **Una riga per voce**: la parola con il colore (collegato, scollegato, da guardare, errore, non installato, non partita, ferma…), il titolo corto e il tasto dell'azione. Prima ogni voce portava sempre il suo paragrafo e il suo «Cosa fare».
- **Il dettaglio a destra**: il titolo intero, il perché, cosa fare, le azioni e l'avanzamento di «Installa là».
- **In «Strumenti ▾»**: Gli altri computer, la Mappa dei PC, Consumi per esteso, la colonna Consumi e limiti, la cartella del registro. Gli altri computer e i consumi si aprono nel riquadro di destra, largo.
- **Telefono**: gli stessi gruppi; ogni voce con parola e titolo corto, il perché e cosa fare dietro il «?», la mappa in fondo a richiesta. Parola e titolo corto li mette il PC (`conVistaSalute`).

**Azioni di prima → dove sono adesso**

| Prima | Adesso |
|---|---|
| Gli altri computer (tasto in cima) | Strumenti ▾ → Gli altri computer (riquadro a destra) |
| Consumi e limiti (colonna) | Strumenti ▾ |
| Consumi per esteso | Strumenti ▾ (riquadro a destra) |
| Mappa dei PC (sempre in cima) | Strumenti ▾ → Mappa dei PC |
| Le azioni di ogni voce (Ricollega, Riprova, Installa, Installa là, Apri autopilota, registro…) | in riga e nel dettaglio |
| Aggiorna, Chiudi | in alto (Chiudi = ×, anche Esc) |

**Test**: `tests/shared/salute-vista.test.ts` (5) e, nell'app, `SaluteVistaTest`.

**Aperto**: secondo la revisione, tre fonti dicono lo stato di un altro PC in modi che possono non coincidere: la Salute («non so se è acceso»), «Altri computer» (acceso, dal battito) e la mappa («giù»). La regola unica (`statoComputer`) non l'ho fatta stanotte: tocca il collegamento fra PC, e va provata con i PC veri, non nella copia.

## (e) Impostazioni
**Cosa cambia**
- **A tutta finestra**, con la navigazione a sinistra: le sette sezioni (un clic porta lì), poi «AI» e «Account e Drive». Accanto ad Aggiornamenti e a Drive c'è il pallino del loro stato.
- **In cima quattro riquadri**, ognuno con la sua parola: Versione (aggiornato, nuova, pronta, errore), Drive (collegato, scollegato, non configurato), Cassaforte (aperta, chiusa, da creare, diversa), Telefoni (N accoppiati, nessuno). Un clic porta alla sezione. Le stesse regole servono ad Account e Drive (`src/shared/stato-sistema.ts`).
- **«Torna ai valori di fabbrica»** non è più il primo tasto: sta in «Strumenti ▾» e chiede conferma, con «Annulla» già scelto.
- **Il contenuto delle sezioni** (le voci, la ricerca, i «?») resta com'era, solo più largo.
- **Telefono**: le impostazioni erano già un elenco di sezioni, come chiedeva la revisione. Non le ho toccate, e le quattro tessere stanno solo sul PC.

**Azioni di prima → dove sono adesso**

| Prima | Adesso |
|---|---|
| Linguette Generali / AI / Account | navigazione a sinistra (Generali = le sezioni; AI; Account e Drive) |
| Torna ai valori di fabbrica (primo tasto) | Strumenti ▾ → Torna ai valori di fabbrica… con conferma |
| Apri il registro, Copia i dettagli | in «Info e aiuto», come prima; il registro anche in Strumenti ▾ |
| Ricerca nelle impostazioni | in Generali, come prima |
| Tutte le voci (aggiornamenti, porte, PIN, quaderno personale, aspetto, notifiche…) | invariate |

**Test**: `tests/shared/stato-sistema.test.ts` (4).

**Aperto**: dalla revisione, «Avanzate ▸» chiuso per le porte e per «fuori dalla rete». Le voci sono rimaste dove erano: spostarle cambia la ricerca e le prove della pagina, e non volevo romperle stanotte.

## (f) File e Trasferimenti
**Cosa cambia**
- **A tutta finestra.** In testata il nome del progetto («progetti › Lavoro-esempio»), non tutto il percorso.
- **Senza server c'è un lato solo, a tutta larghezza**. Prima metà finestra era vuota e diceva «Aggiungi un server con «+ Server»». Con un server tornano i due lati affiancati, con «→ Carica» / «← Scarica» e la colonna del confronto (uguale, più nuovo qui, più nuovo di là, diverso; già colorati).
- **«+ Server» e «Modifica il server» in «Strumenti ▾»**. I server del progetto, Collega, Scollega e Terminale restano nella fila sotto la testata, che compare solo se ci sono server.
- **Il piede si legge**: «1 elemento · +1 nascosti», e un clic su «+1 nascosti» li mostra. Prima c'era «(di 2)» senza dire perché.
- **Telefono**: la pagina e l'app non hanno il sfoglia-server. Le schede File restano com'erano.

**Azioni di prima → dove sono adesso**

| Prima | Adesso |
|---|---|
| + Server (fila dei server) | Strumenti ▾ → + Server… |
| Modifica (server scelto) | Strumenti ▾ → Modifica il server… |
| Server, Collega, Scollega, >_ Terminale | fila sotto la testata, come prima |
| ← → ↑, percorso, filtro, nascosti, + Cartella, Rinomina, Elimina, 📱 Manda al telefono, Apri fuori, Carica/Scarica, trascinamento | invariati |
| Coda dei trasferimenti, file in modifica | invariati |

**Test**: `tests/shared/file-vista.test.ts` (3).

**Aperto**: la revisione proponeva i tasti come in Total Commander (F5, F2, F7), una barra unica per la coda del server e per gli invii al telefono, e una pagina File del telefono a tre schede (Progetti · In arrivo · Mandati). Non fatti stanotte.

## (g) Negozio
**Cosa cambia**
- **A tutta finestra**, con la ricerca in testata.
- **Lo stato di ogni voce è una parola con il colore**: attivo (verde), spento, disponibile (grigio), aggiorna, approva, accedi (ambra), guasto (rosso), in corso (blu). Prima c'erano etichette lunghe e quasi tutte grigie. La sfumatura di prima («solo il nome», «rifiutato», «dal plugin») resta nel suggerimento della parola.
- **La spiegazione** che ogni scheda ripeteva a vista («Non è installato. «Installa» lo scarica…») **sta dietro il «?»** accanto alla parola: su schermo ci stanno circa 12 plugin invece di 5.
- **Telefono**: la parola e il colore arrivano dal PC (`parola`, `colore` in ogni stato); la pagina e l'app li mostrano. Con un PC di prima resta l'etichetta.

**Azioni di prima → dove sono adesso**

| Prima | Adesso |
|---|---|
| Linguette In uso · Questa chat · Plugin · Skill · Agenti · MCP · Fonti, Ricarica | invariate |
| Dettagli, Installa, Aggiorna, Disattiva, Rimuovi, spunte per chat, Variabili | invariate, sulla scheda di ogni voce |
| Spiegazione a vista su ogni scheda | dietro il «?» accanto alla parola |
| Chiudi | × (anche Esc) |

**Test**: `tests/shared/negozio-vista.test.ts` (2) e la risposta d'esempio `api-negozio-0.70.json`, con il nuovo test in `NegozioVistaTest`.

**Aperto**: dalla revisione restano i gruppi In uso · Da sistemare · Catalogo · Questa cartella, la tabella con il dettaglio a destra e Fonti/Ricarica in «Strumenti ▾». Il negozio ha già linguette sue, che chiamano il CLI di Claude Code, e rifarle stanotte voleva dire riprovare a mano ogni installazione. La parte fatta (una parola, niente spiegazioni ripetute, tutta la larghezza) è quella che si vede di più.

## (h) Consumi
**Cosa cambia**
- **La finestra di 5 ore e la settimana** hanno la percentuale grande e una parola: libero (verde, sotto l'80%), attento (ambra, 80–94%), pieno (rosso, dal 95%), vecchia (lettura di più di 20 minuti), azzerata o attesa (grigio). La frase lunga («letto 70 minuti fa · lettura vecchia…») va sotto la barra.
- **Il contesto di ogni chat aperta** ha la sua parola: libera (<70%), piena (<90%), riassumi (rosso, ≥90%), «—» se non ancora letto. Prima diceva «contesto contesto non ancora letto».
- **I token si leggono**: «↑20 in entrata · ↓2k in uscita · cache 100% · 3 chat». Prima era «0 in entrata0 in uscita0 dalla cache (0%)0 chat», tutto attaccato.
- **Le chat con lo stesso nome si distinguono** (#2, #3).
- **Telefono**: le parole delle finestre e dei contesti le mette il PC in `/api/consumi`, e la pagina e l'app le mostrano prima della frase.

**Azioni di prima → dove sono adesso**: niente spostato. I Consumi si aprono da Salute → Strumenti ▾ → «Consumi per esteso» (riquadro a destra) o dalla colonna «Consumi e limiti».

**Test**: `tests/shared/consumi-vista.test.ts` (4: le soglie 79/80/94/95, la lettura vecchia, l'azzeramento, il contesto, i token in una riga) e, nell'app, `ConsumiVistaTest`.

## (i) Quaderno e quaderno personale
**Cosa cambia**
- **A tutta finestra in tre colonne**: a sinistra i *Progetti* delle chat aperte con quante schede ha ognuno, i *Tag* del quaderno scelto con il loro numero («Tutte 4 · esempio 3 · autopilota 1…») e *🔒 Personale*; in mezzo l'elenco con la ricerca e l'ordine (Recenti / A–Z); a destra la scheda. Prima era una finestra con una tendina per la cartella e l'elenco senza tag cliccabili.
- **Nessuna colonna vuota**: all'apertura si apre da sola la scheda più recente.
- **Data corta** dappertutto: «oggi 01:07», «ieri», «3 giorni fa», «12/09».
- **Il quaderno personale si raggiunge da qui** (🔒 Personale, o Strumenti ▾), oltre che dalle Impostazioni.
- **Telefono, pagina**: ricerca (nasconde le righe senza ridisegnare), tag con il numero, su ogni riga l'assaggio, la data corta e i tag; la scheda aperta ha data e tag. Il PC ora manda in `/api/quaderno` anche `tag` e `assaggio` (non il corpo intero).
- **Telefono, app**: stessa ricerca, stessi tag (FilterChip), assaggio, data e tag su ogni riga.
- **Corretto di passaggio**: nella pagina, il riquadro «Aspettano te» mostrava tre volte «Lavoro-esempio»; ora i nomi distinti (#2, #3) come nel resto.

**Azioni di prima → dove sono adesso**

| Prima | Adesso |
|---|---|
| Tendina della cartella | Colonna *Progetti* a sinistra, con il numero di schede |
| Cerca | In testata |
| + Scheda | In testata |
| Apri cartella | Strumenti ▾ → «Apri la cartella del quaderno» |
| Elimina (sulla scheda) | Strumenti ▾ → «Elimina la scheda…», con la striscia di conferma |
| Modifica / Fatto | Sulla scheda, come prima |
| — | Nuovo: Strumenti ▾ → «Copia il percorso della scheda» |
| Quaderno personale (solo in Impostazioni) | Anche qui: *🔒 Personale* a sinistra e Strumenti ▾ |

**Test**: `tests/shared/quaderno-vista.test.ts` (6: tag contati, filtro tag+ricerca, ordine, data corta, assaggio, cartelle uniche), `tests/main/quaderno-pagina.test.ts` (4: la pagina dà le stesse date del PC, tag, ordine, escape) e, nell'app, `QuadernoVistaTest` (4, compreso un PC di prima senza tag).

**Foto**: `dopo-quaderno.png`, `dopo-quaderno-personale.png`, `pagina-dopo-quaderno.png`.

**Aperto**: la ricerca nel corpo intero c'è solo sul PC (pagina e app cercano titolo, tag e assaggio); il quaderno personale sul telefono resta in Impostazioni.

## (j) Account e Drive
**Cosa cambia**
- **Una catena di quattro anelli**: Account → Drive → Cassaforte → Salvataggio, ognuno con la sua parola e il colore (entrato/fuori · collegato/scollegato/**scade** · aperta/chiusa/da creare/diversa · al sicuro/vecchio/mai). Prima: due schede «Drive / Cassaforte» con «collegato ✓», «da creare» in grigio e un riquadro diverso per ogni caso.
- **Un solo prossimo passo**: il primo anello non a posto dice cosa fare (Collega il Drive · Crea la passphrase · Sblocca · Prova la passphrase su questo Drive · Salva ora · Apri Progetti). I moduli per la passphrase restano sotto, come prima.
- **I sette giorni di Google si vedono prima**: dal sesto giorno dopo il collegamento il Drive dice «scade» in ambra, con il perché (finché l'app OAuth è «in prova», al settimo giorno Google toglie il permesso). Il PC ora sa `collegatoIl` e lo mette nello stato del Drive.
- **Le azioni rare in Strumenti ▾**: Cambia passphrase, Blocca la cassaforte, Scollega il Drive, Esci dall'account.
- **Coerente con le tessere in cima alle Impostazioni**: la cassaforte dice la stessa parola in tutti e due i posti.
- **Telefono**: `/api/account` ora manda anche la `catena` (decisa dal PC); la pagina (Impostazioni → Drive e salvataggi) e l'app (sezione Account del computer) mostrano i quattro anelli, l'avviso «scade» e «Prossimo passo, sul computer: …». Un PC di prima, senza catena, si legge come prima.

**Azioni di prima → dove sono adesso**

| Prima | Adesso |
|---|---|
| «Entrato come …» in testa | Primo anello «Account: entrato» con l'email |
| Connetti (scheda Drive) | «Prossimo passo: Collega il Drive» |
| Scollega (scheda Drive) | Strumenti ▾ → «Scollega il Drive» |
| Cambia passphrase, Blocca (scheda Cassaforte) | Strumenti ▾ |
| Esci (in fondo) | Strumenti ▾ → «Esci dall'account» |
| «È tutto pronto» + Apri Progetti | «Prossimo passo: Apri Progetti» (o «Salva ora» se non hai mai salvato) |
| «Collega il tuo Google Drive qui sopra…» | Tolto il testo: lo dice il prossimo passo |
| Riconoscimento del Drive, cassaforte diversa, crea/sblocca/cambia passphrase, chiave di recupero | Invariati, sotto la catena |

**Test**: `tests/shared/account-vista.test.ts` (4: sette giorni, salvataggio, catena e prossimo passo, «scade»), `tests/main/account-pagina.test.ts` (3) e, nell'app, `AccountCatenaTest` (2, compreso un PC di prima).

**Foto**: `dopo-account.png`, `pagina-dopo-account.png`.

**Aperto**: nella copia di prova la pagina dice «Account: fuori» perché la finestra usa un utente d'esempio e la rotta l'account vero (nella copia non c'è): sui PC veri leggono lo stesso. La tessera «Telefoni» in cima alle Impostazioni arriva dopo ~4,5 s (`client.stato` è lento): da rendere più veloce.
