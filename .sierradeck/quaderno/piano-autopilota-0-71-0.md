---
titolo: "Piano dell'autopilota 0.71.0: agenti specializzati, più chat, domande chiare, supervisore che verifica, giri più veloci"
quando: 2026-10-13T13:25:00+02:00
tag: ["autopilota", "piano", "multi-agente", "0.71.0", "decisione di Nicholas"]
---

# La richiesta

Nicholas, 13/10: «migliora tutta la parte dell'autopilota per far in modo che sia più performante, più intelligente, che le domande siano poste chiare e che riesca sempre a scrivere e gestire le chat con l'uso di più chat se ci sono più agenti attivi, e soprattutto li voglio specializzati».

# Da dove si parte (misurato, 9–13/10, sul PC vero, sola lettura)

| Cosa | Mediana | Note |
|---|---|---|
| Fine turno della chat → istruzione dentro la chat (consegna) | **76 s** | n=24. Esclusi i giri sotto 20 s (riprese) e sopra 300 s (attese di Nicholas) |
| Fine turno → risposta dell'hook Stop (la chat aspetta ferma) | **155 s** | n=23 |
| Decisione del supervisore (`claude -p --resume`) | **17 s** | p90 45 s, n=88. Il prompt è di circa 10 000 caratteri |
| Risposta al dialogo | 42 s | n=104 |
| Consegna: ritiro → «partita» | 3–15 s | 2,5 s fra Invio e controllo; fino a 14 s di «pronta dopo» quando la chat è appena ripresa |

**Dove va il tempo.** Il supervisore pesa 17 s su 76–155: il resto sono i **criteri rimisurati a ogni fermata**, in fila, anche quando dall'ultimo giro non è cambiato niente (npm test, typecheck, gradle, gh…).

# Cosa c'è già (non si rifà)

- Il supervisore è uno per chat (0.13).
- Flotta fino a 8 chat, ognuna con il suo worktree e ramo `ap/<ap>/<chat>` (0.36).
- Freno sui limiti del piano: 60/80/95 %.
- Divieti applicati dal programma (hook PreToolUse, mosse giudicate).
- Domande in cinque parti con riscrittura (0.41).
- Domande gemelle.
- Strategie di uscita dal cerchio (`strategie.ts`, dopo `stalloMax` esiti uguali).
- Consegne in sottofondo che non cambiano lo schermo (0.60.8).
- Messaggi `inVolo` rimessi in coda al riavvio (0.56.4).
- Turno fra workspace (0.56.1).

# Difetti veri da chiudere

1. **La domanda aperta si perde al riavvio del servizio.** Il registro delle domande sta solo in memoria (`domande.ts`). Al riavvio `riportaChiAspettava` rimette l'autopilota al lavoro e la domanda si rifà: «Il servizio è ripartito e la domanda aperta è andata perduta», più volte il 12/10.
2. **La coda delle consegne sta solo in memoria** (`consegne.ts`). Una consegna messa e non ancora ritirata sparisce con il servizio. Oggi la salvano solo i messaggi del dialogo (`inVolo`), non le istruzioni del supervisore.
3. **Testi in coda nel sottofondo persi al riaggancio della finestra.** Corretto il 13/10 (`coda-ceduta.ts`, commit f443bd9).

# Il piano, per parti (ognuna con i suoi test, un commit per pezzo verde)

## 1. Agenti specializzati

- **Ruoli** in `src/shared/ruoli-agenti.ts`, ognuno con istruzioni proprie, parola e colore:
  - **Sviluppo**: scrive il codice nel suo worktree.
  - **Collaudo**: scrive ed esegue i test, prova dal vero, non corregge il codice di prodotto.
  - **Interfaccia**: PC, pagina e app allineati, testi corti con «?».
  - **Revisione**: legge il diff di un ramo e dà un verdetto in una forma fissa; non scrive codice.
  - **Rilascio**: versione, novità, pubblicazione secondo la regola del progetto; mai installare.
- **Il coordinatore**: il supervisore dell'autopilota scompone l'obiettivo in compiti `{compito, ruolo, dipendeDa?}`.
  - Se il modello non dà il ruolo, si ricava dal testo (`ruoloDaTesto`).
  - Si riusa una chat ferma dello stesso ruolo prima di aprirne una nuova.
  - Il freno sui limiti decide quante chat stanno aperte insieme.
- **Si unisce solo dopo l'ok della Revisione.** Oggi il ramo di una chat si unisce a ogni fine turno. Adesso:
  - un compito finito del ruolo Sviluppo, Collaudo o Interfaccia crea un compito di Revisione su quel ramo;
  - il ramo si unisce solo con il verdetto `REVISIONE: OK <ramo>`;
  - con `REVISIONE: DA RIFARE <ramo>: …` le note tornano alla chat autrice;
  - dopo **2 giri di revisione** senza ok la cosa va a Nicholas: niente ping-pong infinito.
  - Una chat singola, senza worktree, resta com'è: la Revisione si fa prima del «finito».
- **Il ruolo si vede** sul PC (albero e testata del riquadro), nella pagina e nell'app.

## 2. Più chat insieme

- **La coda delle consegne su disco** (`autopiloti/servizio/coda-consegne.json`, fuori dalla cartella degli autopiloti per non farla leggere ad `archivio.elenca`). Si riprende al riavvio. L'id resta stabile e il Gestore scarta quelli già scritti.
- **Coda e stato per chat**, con questi stati per messaggio: in coda → consegnato → partito, oppure perso. Sono visibili nella scheda.
- **Mai una consegna che ruba la finestra a un'altra**: ci sono già il turno e il sottofondo; qui si aggiunge il test.
- **Test con 3 chat in parallelo**:
  - tre fermate insieme;
  - ognuna riceve solo le sue istruzioni;
  - riavvio del servizio a metà, senza ordini persi.

## 3. Domande chiare

- **Il registro delle domande su disco** (`domande-aperte.json`): al riavvio si ricaricano, e una risposta arrivata dopo prende la strada della risposta tardiva. `riportaChiAspettava` resta solo per chi non ha una domanda salvata.
- **Una alla volta per autopilota.** Le altre aspettano in fila e partono quando la prima ha risposta; le domande gemelle restano agganciate.
- **Validazione** (`validaDomanda`). Respinge e fa riscrivere:
  - domanda oltre 200 caratteri;
  - più di un «?» nella domanda;
  - parole vaghe («qualcosa», «eccetera», «ecc.», «varie cose»);
  - riferimenti senza contesto («come prima», «quella cosa»);
  - meno di 2 scelte, oppure una scelta senza conseguenza.
- **Scelta consigliata segnata** (`consigliata: true`, al massimo una) e conseguenze brevi, fino a 120 caratteri l'una.
- **Le risposte già date non si richiedono.** C'è una memoria delle risposte per autopilota: una domanda uguale (somiglianza ≥ 0,8 sulle parole normalizzate) riceve la risposta di prima, e nel diario c'è scritto.

## 4. Più intelligente

- **Fatti verificati prima di decidere** (`fattiVerificati`), messi nel prompt come «fatti: valgono più di quello che dice la chat»:
  - `git status --porcelain`, l'ultimo commit e i file cambiati dal giro prima;
  - i criteri misurati;
  - le ultime righe del registro di quell'autopilota.
- **La memoria delle decisioni di Nicholas** (`memoria-decisioni.json`, per progetto), letta a ogni giro. Si riempie:
  - dalle sue risposte alle domande;
  - dal dialogo («decisione», «da ora in poi», «mai», «sempre»).
- **Antiloop.** Se la stessa mossa (tipo + istruzioni normalizzate) si ripete **3 volte di fila** con criteri invariati, l'autopilota si ferma e lo spiega: «stessa istruzione tre volte, criteri fermi: mi fermo».
- **Criteri ricontrollati da soli**: ogni 10 minuti per chi è finito o in attesa. Un criterio tornato rosso dopo un «finito» si vede.

## 5. Più veloce

- **Criteri in cache sull'impronta git.** Se HEAD, `status` e `diff` non sono cambiati, si riusa l'esito, per al massimo 10 minuti. I comandi che guardano fuori dal progetto (`gh`, la rete) non si mettono in cache.
- **Criteri indipendenti in parallelo**, al massimo 3.
- **La consegna parte appena la chat può leggere**: niente attese fisse quando il campo è già pronto.
- **I tempi di ogni giro misurati e salvati** (`tempi` per autopilota): fermata → criteri → supervisore → consegna messa → ritirata → partita. Si mostrano nella scheda, e il rapporto li confronta con la tabella qui sopra.

## 6. Quaderno e rapporto

Una scheda per parte e il rapporto finale per Nicholas, con i numeri prima e dopo.

# Cosa non si fa (e perché)

- **Nessun «Porta qui»** e nessuna azione sulle chat e sugli autopiloti veri. Le prove si fanno solo con autopiloti «SierraDeck-prova-…» nella copia di prova.
- **Nessuna pubblicazione automatica senza la regola del progetto.** La regola «stabile» chiede sempre.

# Revisione dell'esperto di sistemi multi-agente (13/10) e cosa cambia nel piano

L'agente ha letto il codice in sola lettura. I punti principali:

1. **Le istruzioni fra un turno e l'altro non passano dalla coda delle consegne.**
   - Fra due turni l'istruzione è la risposta sincrona dell'hook Stop: `suStop` restituisce `{decision:'block', reason}` ed è la strada dei 155 s.
   - Le consegne servono ad avviare o riprendere una chat e a portare le risposte tardive.
   - → I tempi si misurano in `suStop` passo per passo: unione, ogni criterio, supervisore, risposta.
2. **L'unione a ogni turno è incompatibile con la revisione.**
   - Oggi `suStop` fa `salvaLavoro` + `unisciRamo` in main a ogni fermata.
   - I criteri girano nella cartella principale, non nel worktree.
   - → Niente unione per turno. I criteri si misurano nel worktree della chat. Si unisce solo con l'ok della Revisione, oppure alla fine per le chat senza revisione.
3. **Il tempo va soprattutto nei criteri**, rimisurati in fila a ogni Stop.
   - → Cache sull'impronta git.
   - → Criteri «pesanti» (gradle, suite intere) solo quando si sta per dire «finito» o ogni 3 turni.
   - → Al massimo 2 criteri in parallelo.
4. **Ruoli: l'esperto ne consiglia 3** (Sviluppo, Revisione, Collaudo) **e niente Rilascio.** Nicholas ne ha chiesti cinque, quindi restano tutti e cinque, con i limiti che l'esperto chiede:
   - **Revisione in sola lettura**, imposta dal programma: l'hook PreToolUse nega Edit/Write e i comandi git che scrivono.
   - **Rilascio** non pubblica e non installa mai fuori dalla regola del progetto («stabile» chiede). L'installazione è sempre vietata: è un divieto del programma.
   - **Interfaccia** ha istruzioni proprie: PC, pagina e app allineati, testi corti con «?».
5. **I compiti stanno in un grafo nel programma, non nel modello**: `Compito {id, testo, ruolo, dipendeDa[], stato, tentativi, chat?}`, con ordinamento topologico e i cicli rifiutati. I supervisori *propongono*, il programma assegna. Il vecchio `compitiDaFare: string[]` si migra nel parser.
6. **La Revisione non timbra a occhi chiusi.**
   - Riceve dal programma il diff `base...ramo` e i criteri misurati nel worktree.
   - Un `OK` con criteri rossi, o senza nominare almeno un file, vale «DA RIFARE».
   - Al massimo 2 rifacimenti, poi una domanda a Nicholas.
   - Il revisore non apre compiti, così non c'è un blocco circolare.
7. **Idempotenza.**
   - Una chiave per turno (sessione + giro della chat): uno Stop ripetuto riceve la stessa risposta.
   - Un lock per autopilota sul tratto leggi-modifica-salva di `suStop`.
   - La coda delle consegne e la memoria dei testi già scritti sopravvivono al riavvio, senza doppioni.
8. **Cerchi.** Si aggancia alle strategie a gradini che esistono già. Conta come cerchio solo «stessa mossa + stessa impronta del codice» per 3 turni, così un lavoro che avanza con istruzioni simili non scatta. Funziona anche senza criteri rossi.
9. **Domande.**
   - Il registro va su disco: al riavvio si riallaccia la domanda, non la si rifà.
   - `consigliata` nelle scelte.
   - Una sola domanda visibile per autopilota.
   - Limite di 6 domande nuove all'ora.
   - **Le risposte passate non si applicano da sole**: si propongono come scelta consigliata («come il 12/10»). Fa eccezione la stessa domanda esatta.
10. **Fatti verificati** nel prompt, circa 2 KB:
    - `git status -s` e `git log -5` del worktree;
    - gli esiti dei criteri con la loro data;
    - le ultime righe del registro di quell'autopilota.

    Più la memoria delle decisioni di Nicholas: le 30 righe più recenti, ricavate dalle sue risposte e dal dialogo.

**Ordine di lavoro**: P0 = tempi, cache dei criteri, domande e coda persistenti. P1 = chiave di turno e lock, grafo dei compiti con ruoli, cancello di revisione, cerchi. P2 = domande (consigliata, una alla volta, limite orario, risposte passate), fatti, memoria. Poi la vista su PC, pagina e app.

**Rischi da provare con test**:
- riavvio durante una domanda, a metà dei criteri, a consegna presa;
- due Stop insieme;
- un revisore che boccia due volte;
- un OK con criteri rossi;
- un ciclo nelle dipendenze;
- domande quasi gemelle («cancello X?» e «cancello Y?»);
- un lavoro che avanza senza far scattare il cerchio;
- la cache dopo un file cambiato;
- il freno al 95 % con il revisore in coda.
