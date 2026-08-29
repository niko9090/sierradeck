export type Novita = {
  versione: string
  /**
   * Poche righe, scritte per chi usa il programma.
   *
   * Non è l'elenco dei commit: «I workspace si cambiano dalla fascia», non
   * «rifattorizzato il componente Console». Chi apre SierraDeck dopo un
   * aggiornamento vuole sapere cosa può fare oggi che ieri non poteva, e una
   * lista di nomi di file non glielo dice.
   */
  righe: string[]
}

/**
 * Le novità, versione per versione.
 *
 * Vivono qui, nel sorgente, e non in un file di dati o in una pagina remota:
 * si scrivono **quando si fa la cosa**, nello stesso commit, non dopo mentre si
 * cerca di ricordare cos'era cambiato. Le stesse righe finiscono nelle note del
 * Release su GitHub, che così non sono mai una seconda stesura.
 *
 * La più recente in cima, come si legge.
 */
export const NOVITA: Novita[] = [
  {
    versione: '0.12.29',
    righe: [
      '**L’autopilota non chiude più un lavoro di cui non ha potuto controllare una parte.** Se il comando di verifica di un criterio non parte nemmeno — un errore di sintassi, un programma che non c’è — quel criterio non è verde: è ignoto. Prima passava per buono e il lavoro si chiudeva lo stesso. Adesso l’autopilota lo dice e chiede a te se chiudere o correggere il comando: non insiste a vuoto, ma nemmeno dichiara finito quello che non ha visto.',
      '**Un criterio scaduto si porta via anche quello che aveva avviato.** Prima veniva chiuso solo il comando, e quello che aveva lanciato — un server di prova, un bundler — restava acceso: teneva la porta occupata e faceva fallire il tentativo dopo per «indirizzo già in uso».',
      '**Le istruzioni dell’autopilota non si perdono più per strada.** Restano in coda finché non sono davvero finite dentro una chat: prima bastava chiudere SierraDeck nell’istante sbagliato, o non avere nessuna finestra aperta, e l’istruzione spariva — con l’autopilota fermo ad aspettare la risposta a un messaggio che nessuno aveva mai scritto.'
    ]
  },
  {
    versione: '0.12.28',
    righe: [
      '**I file si spostano a gruppi, e le cartelle intere.** Nel pannello «⇅ File» si sceglie con Ctrl e Maiusc come in qualunque elenco, si trascina da una parte all’altra, e si può lasciar cadere roba presa da Esplora risorse. Le cartelle vengono contate prima di partire, così la barra dice davvero quanto manca; un file che non passa segna sé stesso e non ferma gli altri.',
      '**C’è un terminale sul server**, sotto le due colonne: carichi un file e riavvii il servizio che lo legge senza cambiare finestra.',
      '**Si vede cosa è più nuovo di qua e cosa di là.** È la ragione per cui si riapre un programma di trasferimento la seconda volta: senza, si ricarica tutto «per sicurezza», ed è così che si sovrascrive una correzione fatta sul server.'
    ]
  },
  {
    versione: '0.12.27',
    righe: [
      '**C’è un FileZilla dentro SierraDeck, e i server sono del progetto.** Nella fascia c’è «⇅ File»: a sinistra i file di questo computer, a destra il server del progetto che hai davanti. Si sfoglia da tutte e due le parti, si scarica e si carica. I server si aggiungono **per cartella**, non in un elenco unico: apri la chat di un progetto e vedi i suoi, e nessun altro.',
      '**La prima connessione a un server chiede conferma dell’impronta.** Sembra un intoppo ed è l’unica cosa che rende il collegamento davvero sicuro invece che solo cifrato: senza, chi si mette in mezzo riceverebbe la tua password. Dalle volte dopo, un’impronta diversa è un allarme.',
      '**Le password vanno al portachiavi di Windows**, legato al tuo account: copiate su un altro computer non valgono niente. Nel file resta solo il loro segno cifrato.'
    ]
  },
  {
    versione: '0.12.25',
    righe: [
      '**Dal telefono si apre una chat in una cartella qualunque, sfogliando.** Prima si potevano scegliere solo le cartelle già conosciute: un progetto nuovo non c’era modo di aprirlo. E la risposta non poteva essere un campo di testo — nessuno digita un percorso di Windows su una tastiera del telefono. Adesso si sfoglia, partendo dai posti che contano: i dischi, la tua cartella, i progetti già noti.'
    ]
  },
  {
    versione: '0.12.24',
    righe: [
      '**Dal telefono si legge l’installazione con le parole dell’installer, non con parole sue.** Prima l’app raccontava una storia parallela, dedotta dal silenzio: percentuali che non coincidevano con quelle sullo schermo del computer, e nessuna traccia dei passi veri — l’aggiornamento di Claude Code, per esempio. Adesso è **l’installer stesso** a rispondere al telefono: mentre SierraDeck è chiuso la porta è libera, e se la prende lui. Stessa riga, stesso numero, sui due schermi.',
      '**La porta torna a SierraDeck prima che riapra**, perché un aggiornamento che rompe il collegamento col telefono sarebbe il contrario di quello che serve.'
    ]
  },
  {
    versione: '0.12.23',
    righe: [
      '**Dal telefono si passa da un computer all’altro con un tocco.** Chi ne ha più di uno in casa restava legato al primo con cui si era accoppiato: per cambiarlo bisognava buttare via l’accoppiamento e rifarlo col QR. Ora c’è l’elenco delle **postazioni** — in cima a ogni schermata, con il nome del computer che stai guardando — e tornare a uno già visto non chiede nessun codice: la chiave di ognuno era già salvata, mancava solo il modo di sceglierla.',
      '**Le postazioni spuntate non si dimenticano mai**, quelle di passaggio si potano da sole. E ognuna si può rinominare: «studio» si legge, `192.168.1.191` no.',
      '**Il computer dice come si chiama** (dietro la chiave, non a chiunque sia sulla rete), così l’elenco sul telefono porta nomi veri invece di indirizzi.'
    ]
  },
  {
    versione: '0.12.22',
    righe: [
      '**Il negozio, dal telefono, adesso c’è.** Era sempre vuoto, e diceva «questo computer non sa aprire il negozio: aggiornalo» — a un computer che era già all’ultima versione. La risposta arrivava: era il **formato** a non tornare, e bastava a far saltare tutta la lettura, non solo i plugin.',
      '**E quando qualcosa non risponde, adesso si distingue da «non c’è niente».** Se il catalogo dei plugin non parte, skill e agenti restano visibili con una riga che spiega cosa manca, invece di sparire tutti insieme.'
    ]
  },
  {
    versione: '0.12.21',
    righe: [
      '**Dal telefono si guarda il computer che si aggiorna, a tutto schermo.** Premuto «Installa» non si vedeva piu’ niente fino alla fine: un aggiornamento che andava bene e un cavo staccato erano identici. Ora c’è una schermata che racconta il viaggio — il computer risponde ancora, si è chiuso, sta tornando — e finisce con la prova che non si può fingere: la versione nuova che risponde. Vale anche per un aggiornamento avviato dallo schermo del computer.',
      '**E anche sul computer l’installazione adesso si annuncia**, invece di essere l’unica fase muta di sette.',
      '**Un salvataggio che non arriva sul disco lo dice.** Prima l’esito della scrittura veniva buttato via: se non riusciva, l’interfaccia diceva lo stesso «salvato» e sul disco restava quello di prima. Ora si rilegge, e se non c’è si vede un errore.'
    ]
  },
  {
    versione: '0.12.20',
    righe: [
      '**Dal telefono si vedono di nuovo tutte le chat.** Una chat poteva restare per sempre su «Sto leggendo il terminale…» mentre sul computer si vedeva benissimo: succedeva a ogni riquadro che si **riagganciava** a un terminale gia’ vivo — dopo un ricarico della finestra, un cambio di workspace, uno spostamento fra finestre. Il riquadro non diceva a nessuno dove si trovava la sua griglia, e da fuori risultava vuoto.',
      '**E quando davvero non c’è niente da mostrare, l’app lo dice invece di far finta di leggere.**'
    ]
  },
  {
    versione: '0.12.19',
    righe: [
      '**Dal telefono si esce dall\u2019account, e si passa da uno all\u2019altro.** Prima la scheda Account era in sola lettura: si vedeva con quale account stava lavorando il computer e non si poteva fare nient\u2019altro. Chi ne ha due doveva alzarsi e andare al computer per cambiarlo. Ora ci sono «Esci» (con la conferma, perché l’accesso lo perde il computer e non solo il telefono) e «Passa a un altro account», che esce e rientra in un gesto solo.'
    ]
  },
  {
    versione: '0.12.18',
    righe: [
      '**Il telefono non si scollega più da solo.** Bastava un istante sfortunato — il computer che riscriveva l\u2019elenco dei dispositivi proprio mentre arrivava una richiesta — per rispondere «non ti conosco» a un telefono autorizzato, e l\u2019app rispondeva buttando via l\u2019accoppiamento: si tornava al codice QR senza sapere perché. Adesso quell\u2019elenco sta fermo (si riscrive al massimo una volta al minuto invece che a ogni richiesta), e una lettura che non riesce non vale più come una revoca.',
      '**Prima di installare un aggiornamento, i layout si mettono da parte.** Nella cartella dei dati resta una copia di `workspaces.json` chiamata `workspaces.prima-dell-aggiornamento.json`: se dopo un riavvio le chat si ritrovano sotto il workspace sbagliato, c\u2019è da dove tornare indietro.',
      '**E se una chat cambia workspace da sola, adesso lascia una riga nel registro.** Chi, quando, sotto quale nome e cosa è stato tolto a chi: è la traccia che le due volte precedenti mancava del tutto.'
    ]
  },
  {
    versione: '0.12.17',
    righe: [
      '**Dal telefono si vede lo scaricamento davvero.** C’è la barra che avanza accanto alla percentuale, e sotto il nome del computer c’è scritto che versione ha adesso — così si capisce a colpo d’occhio se quella scaricata è più nuova o è ferma lì da ieri.',
      '**Si può cercare una versione più nuova anche quando ce n’è già una scaricata.** Prima il tasto spariva: se nel frattempo ne usciva una migliore, l’unica cosa che potevi fare era installare quella vecchia. E cercare non butta via quello che è già stato scaricato — se non c’è niente di più nuovo, il tasto «Installa» torna dov’era.'
    ]
  },
  {
    versione: '0.12.16',
    righe: [
      '**Adesso si vede cosa sta facendo l’aggiornamento, sempre.** Accanto al numero di versione c’è una spia: «cerco…», «c’è la 0.12.17», «scarico 42%», «pronta da installare». Prima due fasi su sette non comparivano da nessuna parte — chi premeva il tasto restava a guardare uno schermo che non diceva niente.',
      '**Se l’aggiornamento parte dal telefono, il computer lo dice.** Premi «Scarica» in tram e torni alla scrivania mezz’ora dopo: sullo schermo trovi scritto che la richiesta è arrivata dal telefono, invece di un lavoro in corso che nessuno lì ha chiesto. E lo scaricamento ha la sua barra, che si legge con la coda dell’occhio invece di una percentuale da leggere.',
      '**Quando non riesce, lo dice.** L’errore prima era invisibile: restava tutto fermo senza un motivo. Ora c’è scritto cosa è andato storto, con il tasto per riprovare.'
    ]
  },
  {
    versione: '0.12.15',
    righe: [
      '**Il telefono ti avvisa quando una chat ha finito e aspetta te.** Prima avvisava solo per gli autopiloti: una chat che finiva di scrivere non lo diceva a nessuno. Ora il computer dice anche questo, e l’app lo annuncia — una volta sola, al momento in cui succede. Le chat governate da un autopilota tacciono: è lui a parlare per loro.',
      '**Dalla notifica si risponde, senza aprire l’app.** Una domanda si risponde e a una chat che aspetta si scrive, direttamente dal campo dentro la notifica.',
      '**L’aggiornamento del computer visto dal telefono adesso dice la verità.** Due fasi su sette non erano gestite: «sto cercando» e «è andata male» finivano nello stesso silenzio di «non c’è niente», e sembrava che il tasto non facesse nulla. Ora si vede cosa sta succedendo, l’errore quando c’è, e quale versione ha il computer.'
    ]
  },
  {
    versione: '0.12.14',
    righe: [
      '**Il negozio e l’account si vedono dal telefono.** L’app ha una scheda «Negozio» nuova: plugin, skill, agenti e MCP, con l’interruttore per accendere e spegnere e il tasto per installare un plugin. E nella scheda Computer c’è con quale account sta lavorando il PC — in sola lettura, perché entrare e uscire sono cose da fare davanti allo schermo, non in tram.',
      '**Gli autopiloti si leggono meglio.** In elenco: prima chi si è fermato, poi chi aspetta te, poi chi lavora; lo stato scritto a parole («aspetta te», «si è arreso») invece del gergo, e i criteri come barra invece che «3/7». Nel dettaglio il tasto principale resta sotto la testata mentre scorri — prima spariva proprio quando avevi finito di leggere perché si era fermato — e dice cosa succede, non solo un verbo.'
    ]
  },
  {
    versione: '0.12.13',
    righe: [
      '**La chat sul telefono non resta più su «sto leggendo il terminale».** La strada nuova per la cronologia era finita dentro quella vecchia, quindi non ci arrivava nessuno: il telefono chiedeva e riceveva «non trovato», per sempre. Adesso c’è, e l’app ha comunque un ripiego — se il computer è più vecchio mostra lo schermo di adesso e te lo dice, invece di restare appesa.'
    ]
  },
  {
    versione: '0.12.12',
    righe: [
      '**Dal telefono si scorre tutta la conversazione, non più le ultime righe.** Prima arrivavano ventiquattro righe — lo schermo di adesso — e di tutto quello che c’era prima, niente. Ora il computer sa dare qualunque pezzo della cronologia, e sull’app c’è «Mostra quello di prima» per risalire.',
      '**Il computer cerca un aggiornamento anche quando glielo chiedi tu.** Guardava da sé ogni sei ore e basta: dal telefono l’attesa era cieca. Adesso il tasto c’è, e sta nell’app accanto a quello dell’app stessa.'
    ]
  },
  {
    versione: '0.12.11',
    righe: [
      '**Le chat sono tornate a colori.** Erano diventate tutte grigie: il programma, quando lo si avviava da dentro un terminale di Claude Code, si portava dietro il divieto di colorare di quel terminale e lo passava a ogni chat. Adesso non lo eredita più, e dichiara quello che il suo terminale sa davvero fare — i 256 colori e il colore pieno. Nello stesso giro non finiscono più dentro le chat il canale privato e il gettone della sessione che aveva avviato il programma.',
      '**Dal telefono la chat si legge davvero.** Prima arrivava a pezzi sovrapposti, con parole bucate e testo vecchio incollato al nuovo: il computer spezzava alle righe un flusso che invece è un disegno, e Claude Code si riscrive in posizione. Ora il telefono riceve lo **schermo come lo vedi tu**, letto dal riquadro che hai davanti — stesse righe, stessi colori, niente da rimettere insieme. E se ne vede di più: ventiquattro righe invece di quattordici.',
      '**Un messaggio scritto dal telefono adesso parte.** Arrivava nel campo della chat, andava a capo e restava lì: testo e invio viaggiavano in un blocco solo, e Claude Code lo leggeva come un incollato — dove un a capo è una riga nuova, non un invio. Ora l’invio è un tasto premuto dopo, come lo premeresti tu.',
      '**C’è l’app Android nuova, ed è un’app vera.** Non più una pagina dentro un guscio: quattro schermate native — Adesso, Chat, Lavori, Computer — che indossano l’accento e il chiarore scelti sul computer. Si aggiorna da sola, e quando qualcosa va storto adesso te lo dice invece di sparire in silenzio. La prima volta va installata a mano: la trovi dal telefono aprendo l’indirizzo del computer.'
    ]
  },
  {
    versione: '0.12.10',
    righe: [
      '**Le tre impostazioni che non facevano niente adesso fanno quello che dicono.** «Dove mostrare l’autopilota» sposta davvero il diario — a destra, a sinistra, sopra o sotto — e il solco che lo ridimensiona cambia lato e verso insieme a lui. «Mostra l’avanzamento mentre una chat lunga si apre» adesso lo mostra: al posto del riquadro nero c’è una barra che dice quanto pesa la conversazione che sta rileggendo. «Porta degli autopiloti» arriva finalmente al servizio, che è un programma a parte e prima non la vedeva.',
      '**Spostare una chat in un altro workspace non lascia più un processo acceso.** Il suo claude.exe restava vivo e senza padrone: invisibile in ogni finestra, e nessun pulsante poteva chiuderlo. Uno per spostamento. Nello stesso giro: la chat spostata **non perde più il modello** che le avevi scelto, e una che dormiva non si risveglia da sola.',
      '**Gli autopiloti a più chat non si strozzano più.** Se una chat non riusciva a partire, restava registrata come «al lavoro» pur non girando — e teneva quel posto per sempre: tre avvii falliti e l’autopilota non apriva più niente, vivo e fermo. Ora il posto si libera e il compito torna in coda. In più il conto dei giri non torna più indietro e il diario non perde più quello che ha deciso l’altra chat.',
      '**Due file che si potevano rompere restando a metà** — dove stavano le finestre e le schede del quaderno — ora si scrivono per intero o non si scrivono. Quello delle finestre si salva proprio alla chiusura, cioè nel momento in cui un’interruzione è più probabile.'
    ]
  },
  {
    versione: '0.12.9',
    righe: [
      '**I workspace non perdono piu’ le chat.** Creando o cambiando workspace, il programma salvava la disposizione **sotto il nome sbagliato**: quello che si stava lasciando veniva svuotato, oppure si ritrovava dentro le chat dell’altro — e quelle sparivano di la’. Nella stessa sessione il danno restava nascosto (le chat aperte continuavano a vedersi), e riaprendo il programma non c’erano piu’. Adesso il workspace in primo piano viene dichiarato **prima** che la disposizione nuova arrivi a schermo, e il salvataggio finisce sempre dove deve.',
      '**E non spariscono piu’ spostando la finestra.** La disposizione era archiviata per schermo, con una chiave che teneva conto di posizione, risoluzione e scalatura: bastava trascinare la finestra sull’altro monitor o cambiare risoluzione perche’ la stessa finestra cercasse le chat in un posto dove non le aveva mai messe. Ora ogni finestra usa la stessa chiave per tutta la sua vita: le chat restano dove sono, comunque la si sposti.',
      '**Con due finestre aperte, ognuna sa dov’e’.** Creare o eliminare un workspace partiva dal workspace che aveva davanti **l’altra** finestra, e la disposizione di questa finiva sopra le chat di quella. Adesso ogni finestra parte da se’.'
    ]
  },
  {
    versione: '0.12.8',
    righe: [
      '**SierraDeck consuma meno quando è ferma.** A riposo il programma faceva parecchio lavoro inutile in sottofondo: ridisegnava l’interfaccia ogni secondo, rileggeva di continuo file dal disco, e controllava in rete ogni secondo e mezzo anche senza nessun autopilota. Ora tutto questo si accende **solo quando serve** — meno CPU e meno batteria a riposo, con la stessa prontezza quando c’è lavoro in corso (appena arriva qualcosa da fare, torna reattivo all’istante).',
      '**Le chat si aprono un po’ più svelte.** Le impostazioni che ogni nuova chat mette insieme non vengono più rilette e ri-analizzate da capo a ogni apertura: se non sono cambiate, si riusano.'
    ]
  },
  {
    versione: '0.12.7',
    righe: [
      '**Se qualcosa si rompe nell’interfaccia, il programma non si chiude più a schermo vuoto.** Prima un errore in un punto qualunque della plancia poteva far sparire tutto — la barra dei workspace compresa — e sembrava che l’app «si fosse chiusa da sola», senza lasciare traccia. Ora al suo posto compare una schermata di recupero con **«Ricarica»**, che rimette in piedi la plancia **senza chiudere il programma** (le chat aperte tornano dal salvataggio automatico).',
      '**E si capisce cos’è successo.** Il motivo vero dell’errore viene ora scritto nel **registro** (Account → «Apri i log»), sia che nasca nell’interfaccia sia nel motore: prima moriva in silenzio, ed era la ragione per cui certi guasti erano impossibili da spiegare.'
    ]
  },
  {
    versione: '0.12.6',
    righe: [
      '**Tasti del Negozio più chiari e caricamento visibile.** I tasti secondari (Dettagli, Rimuovi…) non sembrano più spenti: si leggono come tasti veri, e «Rimuovi» è ora ben riconoscibile in rosso.',
      '**Ora si vede quando sta lavorando.** Durante installazione, rimozione o attivazione, al posto dei tasti compare uno **spinner che gira** con la scritta di cosa sta facendo («Installazione…»), e sotto una **barra ben visibile**. Niente più dubbi se ha recepito il clic.'
    ]
  },
  {
    versione: '0.12.5',
    righe: [
      '**Installa e disinstalla: niente più «sembra bloccato».** Nel catalogo le righe ora hanno un **ordine stabile**: quando installi o rimuovi, la riga **non salta più di posto** (prima poteva finire fuori dai primi mostrati e sembrare sparita, o dare l’impressione di essere piantata). Cambia solo lo stato, dove sta.',
      'Durante l’operazione il tasto mostra «…» e compare **«un attimo…»** accanto alla barra, così si capisce che sta lavorando e non è bloccato. Gli installati restano raggruppati nella scheda **«In uso»**.'
    ]
  },
  {
    versione: '0.12.4',
    righe: [
      '**Negozio: revisione completa.** Attivare/disattivare **skill e MCP** è ora istantaneo come i plugin; la conferma verde «✓ fatto» sparisce da sola; i messaggi d’errore sono più puliti (solo il motivo, senza rumore); e i «Dettagli» si aggiornano dopo aver installato o rimosso.',
      '**Più facile da usare.** La scheda «Store» ora si chiama **«Fonti»** (da dove arrivano i plugin), per non confonderla col catalogo. Nel catalogo vedi **quanti plugin** ci sono e un tasto **«Mostra tutti»** senza dover per forza cercare. E la casella di ricerca è già pronta appena apri.'
    ]
  },
  {
    versione: '0.12.3',
    righe: [
      '**Installare, attivare e disattivare si vede subito.** Prima la riga cambiava stato solo dopo un paio di secondi (il tempo di ricaricare tutto il catalogo) e sembrava «non succede niente». Ora cambia **al clic** — «attivo/spento», «installato» — con una conferma verde «✓ fatto».',
      '**«Dettagli» anche per i plugin non ancora installati.** Prima era solo per quelli installati: ora anche gli altri mostrano la descrizione dal catalogo. (Il testo dei plugin è quello scritto dai loro autori, quasi sempre in inglese: non è nostro e non lo traduciamo.)'
    ]
  },
  {
    versione: '0.12.2',
    righe: [
      '**Il Negozio si apre sul catalogo.** Prima si apriva su «In uso» e sembrava non ci fosse nessuno store da sfogliare: ora la prima cosa che vedi è l’elenco dei plugin da installare («In uso» resta una scheda a parte).',
      '**Installando, la lista non sparisce più.** Prima, appena installato, tutto l’elenco lampeggiava su «Carico…» e il plugin spariva per un paio di secondi. Ora resta al suo posto e passa a «installato», con un discreto «aggiorno l’elenco».'
    ]
  },
  {
    versione: '0.12.1',
    righe: [
      '**Installare un plugin adesso si vede.** Compare una **barra di caricamento** mentre l’operazione è in corso, e appena finisce la riga passa a «installato». Prima il plugin veniva installato ma la vetrina non se ne accorgeva (sembrava non succedere niente), e se un’installazione falliva poteva persino sembrare riuscita: ora un errore te lo dice chiaramente.'
    ]
  },
  {
    versione: '0.12.0',
    righe: [
      '**Un solo menu Impostazioni, a schede.** Prima in alto c’erano quattro tasti separati (impostazioni, AI, Account, Consumi) che affollavano la barra. Ora è **un menu unico** con l’etichetta «Impostazioni» e dentro le schede **Generali · AI · Account · Consumi**: tutto in un posto, più pulito e comodo. La testa e le schede restano ferme, scorre solo il contenuto.'
    ]
  },
  {
    versione: '0.11.0',
    righe: [
      '**Il Negozio, rifatto e molto più ricco.** Adesso **scorre solo la lista** (prima si muoveva tutta la finestra) e ha una scheda **«In uso»** con tutto ciò che hai installato e attivo a colpo d’occhio. Puoi **aggiungere store di terze parti** (un repo GitHub, un indirizzo, una cartella), sfogliare gli **Agenti**, vedere **cosa contiene e quanto pesa** un plugin, e **cercare in tutto** da una casella sola.',
      '**«Questa chat»: scegli cosa vale solo qui.** Una nuova scheda dove decidi quali plugin, skill e MCP sono attivi **per le chat di questa cartella**, senza toccare le altre. Togli una spunta e quella cosa è spenta solo qui, dalla prossima apertura della chat — comodo per tenere una chat leggera e un’altra con tutto acceso.'
    ]
  },
  {
    versione: '0.10.0',
    righe: [
      '**La finestra si riapre com’era.** SierraDeck torna sullo **stesso schermo** da cui l’hai chiuso, della **stessa dimensione**, e nello stesso stato: se l’avevi ingrandita o a schermo intero, la ritrovi così. Se quel monitor non c’è più (un portatile staccato dal secondo schermo), torna al centro senza sparire nel nulla.',
      '**L’aggiornamento di Claude Code non apre più la sua finestra nera.** Prima, durante un aggiornamento, sfilava accanto una console di terminale. Ora avviene **in silenzio** e il suo stato si legge nella finestra dell’aggiornamento — «Cerco aggiornamenti…», «Aggiornamento alla versione x.x.xxx…», «Aggiornato» — con la sua parte di percentuale.'
    ]
  },
  {
    versione: '0.9.67',
    righe: [
      '**Arriva il Negozio.** Un nuovo tasto «▣ Negozio» nella barra: plugin, skill e MCP di Claude Code gestiti **a clic**, senza più aprire il terminale. Sfoglia il catalogo dei plugin (centinaia, con ricerca), **installa**, **attiva** o **disattiva**; accendi o spegni le tue **skill**; disattiva un **MCP** per la cartella su cui stai lavorando.',
      'I plugin passano dal comando vero di Claude Code, così è esattamente quello che faresti da terminale — solo più comodo. Skill e MCP mostrati sono quelli della **cartella della chat che hai davanti**, dove valgono.'
    ]
  },
  {
    versione: '0.9.66',
    righe: [
      '**Il primo salvataggio (quello che carica tutto una volta) ora è molto più veloce e robusto.** I file vanno sul Drive **in parallelo** (sei alla volta) invece di uno per uno, e se la rete fa i capricci si **riprova da sola** senza far fallire tutto. Dopo quel primo giro, i salvataggi seguenti restano di pochi secondi.'
    ]
  },
  {
    versione: '0.9.65',
    righe: [
      '**Sincronizzazione incrementale: si salva solo ciò che è cambiato.** Prima ogni salvataggio rimandava TUTTO (per chi ha migliaia di chat, un paio di GB ogni volta). Ora ogni trascrizione è un file cifrato a sé, e si caricano **solo quelle nuove o modificate**: dopo il primo salvataggio, i successivi durano **secondi**, non minuti. È il salto che serviva a chi ha tante chat.',
      'Sparisce anche il «conflitto»: con i file separati, «Salva ora» aggiorna e basta.'
    ]
  },
  {
    versione: '0.9.64',
    righe: [
      '**Nuovo menu Account, a cruscotto.** In cima il riepilogo a colpo d’occhio («Tutto al sicuro · ultimo salvataggio»), poi le schede Drive e Cassaforte, e la Sincronizzazione con i suoi pulsanti. Più ordinato e più da prodotto.',
      '**Arriva il salvataggio automatico.** Un interruttore: acceso, ogni 15 minuti salva da solo nel tuo Drive — ma **solo se qualcosa è cambiato** (niente ricarichi a vuoto). Puoi sempre salvare a mano quando vuoi.',
      '**Registro attività** a portata di clic, e «Salva ora» che ti dice «già tutto salvato» quando non c’è nulla di nuovo.'
    ]
  },
  {
    versione: '0.9.63',
    righe: [
      '**«Sovrascrivi col mio» ora è immediato.** Dopo un conflitto, non rifà daccapo compressione e cifratura: riusa il blocco già pronto e passa subito a caricare. E basta farlo **una volta**: da lì in poi questo PC conosce la versione e i salvataggi successivi non danno più conflitto.'
    ]
  },
  {
    versione: '0.9.62',
    righe: [
      '**Salvataggio a memoria bassa: niente più «Non risponde» anche con tantissime chat.** Prima, per salvare, il programma teneva in memoria *tutte* le trascrizioni insieme (per te erano un paio di GB) e il PC andava in affanno. Ora le legge e comprime **una alla volta**, buttando via ogni file appena fatto: la memoria resta bassa, l’app respira, e la barra avanza fino in fondo. Il lavoro resta comunque nel thread separato.'
    ]
  },
  {
    versione: '0.9.61',
    righe: [
      '**Ora c’è un registro delle operazioni, da allegare quando qualcosa non va.** In **Account** trovi «Apri i log»: un file di testo con la versione che sta girando, se la sincronizzazione usa il thread separato, i tempi e gli eventuali errori. Serve a capire i problemi con i fatti, senza tirare a indovinare.'
    ]
  },
  {
    versione: '0.9.60',
    righe: [
      '**Il thread separato ora parte davvero, anche nell’app installata.** Nella versione impacchettata il worker della sincronizzazione non riusciva ad avviarsi (restava nel file compresso dell’app) e si ricadeva sul metodo che bloccava. Ora viene messo su disco e caricato da lì: salva e ripristina restano fluidi per davvero.'
    ]
  },
  {
    versione: '0.9.59',
    righe: [
      '**Salvataggio e ripristino ora girano su un thread separato: l’app non si blocca MAI, per quanti dati tu abbia.** Tutto il lavoro pesante (compressione, cifratura, disco) è fuori dal processo dell’interfaccia — niente più «Non risponde».',
      '**Il menu Account dice anche cosa stai sincronizzando** («417 file · 135 MB») e ha le sezioni con le icone. Altre opzioni in arrivo.'
    ]
  },
  {
    versione: '0.9.58',
    righe: [
      '**Se il salvataggio sul Drive è «sporco» (l’app si era chiusa male), ora puoi sovrascriverlo senza ripristinare.** Quando compare «Sul Drive c’è già un salvataggio che questo PC non conosce», hai due scelte chiare: **«Sovrascrivi col mio»** (carica questo PC, butta quello vecchio) oppure **«Ripristina quello sul Drive»**. Niente più vicolo cieco.'
    ]
  },
  {
    versione: '0.9.57',
    righe: [
      '**Ora anche la cifratura non blocca più l’app.** Era l’ultimo pezzo che girava tutto in un colpo: con tanti dati l’app risultava «Non risponde». Ora cifra e decifra a blocchi, cedendo il controllo, e mostrano «Cifro — 30 / 120 MB». Salvataggio e ripristino restano reattivi dall’inizio alla fine.'
    ]
  },
  {
    versione: '0.9.56',
    righe: [
      '**Il menu Account è nuovo, chiaro e più completo.** Ora è diviso in sezioni — **Google Drive**, **Cassaforte**, **Sincronizzazione** — ognuna con il suo stato a colpo d’occhio. E puoi **cambiare la passphrase** quando vuoi (la chiave di recupero resta valida, i dati non si ricifrano).'
    ]
  },
  {
    versione: '0.9.55',
    righe: [
      '**Anche la compressione non blocca più l’app.** Prima, per preparare il salvataggio, univa tutti i file in un unico blocco enorme in un colpo solo (sincrono) e l’app si piantava. Ora scrive i dati a flusso dentro la compressione, un file alla volta, e mostra «Comprimo — 500/1200» che avanza. Niente più freeze.'
    ]
  },
  {
    versione: '0.9.54',
    righe: [
      '**Il caricamento e il ripristino ora mostrano la percentuale, e non bloccano più l’app.** Il trasferimento sul Google Drive va a pezzi (upload ripristinabile ufficiale): vedi «Carico sul Drive — 12,4 / 48,0 MB (26%)» che sale, invece di un’attesa muta con l’app che sembra non rispondere.'
    ]
  },
  {
    versione: '0.9.53',
    righe: [
      '**Gli errori del Google Drive ora dicono il perché.** Prima leggevi solo «elenco fallito (403)»; adesso c’è anche la spiegazione di Google (API non abilitata, permesso mancante, ecc.), così si capisce al volo cosa sistemare.'
    ]
  },
  {
    versione: '0.9.52',
    righe: [
      '**Salvataggio e ripristino non bloccano più l’app, e mostrano a che punto sono.** Prima la compressione girava in modo sincrono e congelava tutto (chat comprese); ora è asincrona e resta tutto reattivo. In **Account** vedi una **barra di avanzamento a fasi** — raccolgo i file (con «237/1200»), comprimo, cifro, carico sul Drive — così sai che sta lavorando, non che è bloccato.'
    ]
  },
  {
    versione: '0.9.51',
    righe: [
      '**Il salvataggio ora regge anche tante chat.** Con molte trascrizioni il «Salva ora» si fermava con «invalid string length»: il pacchetto costruiva una sola stringa enorme oltre il limite di JavaScript. Ora impacchetta in binario — niente più tetto dei 512 MB, si sale all’ordine dei GB.'
    ]
  },
  {
    versione: '0.9.50',
    righe: [
      '**La sincronizzazione cifrata è viva: salva e ritrova le tue chat su un altro PC.** In **Account**, dopo aver collegato il Drive, scegli una **passphrase di cifratura** (con una chiave di recupero da conservare) e premi **Salva ora**: chat, quaderno e workspace finiscono cifrati nel tuo Drive. Su un altro PC fai accesso, sblocchi con la passphrase e premi **Ripristina** — ritrovi tutto. La cifratura è tua: né noi né Google possiamo leggere quei dati.'
    ]
  },
  {
    versione: '0.9.49',
    righe: [
      '**«Connetti Google Drive» ora funziona su qualsiasi PC.** Le credenziali dell’app viaggiano dentro il programma, così basta installarlo e agganciare il proprio Drive con un clic — non serve nessuna configurazione su nessuna macchina.'
    ]
  },
  {
    versione: '0.9.48',
    righe: [
      '**Primo passo della sincronizzazione: collega il tuo Google Drive.** Da **Account**, un clic su «Connetti Google Drive» apre il consenso nel browser e aggancia il tuo Drive — dove, cifrati, vivranno i tuoi dati per ritrovarli su un altro PC. Per ora si connette e basta: salvataggio e ripristino arrivano subito dopo.'
    ]
  },
  {
    versione: '0.9.47',
    righe: [
      '**Ora le chat scrivono nel quaderno da sole.** Ogni chat aperta in SierraDeck ha l’obbligo di annotare nel quaderno del progetto (in `.sierradeck/quaderno/`) le cose utili che impara — decisioni, vincoli, come funziona una parte, un errore risolto e perché — e di ricontrollare di averlo fatto prima di finire. Il quaderno smette di riempirsi solo a mano: si riempie mentre lavori.'
    ]
  },
  {
    versione: '0.9.46',
    righe: [
      '**Se provi a registrarti con un’email già usata, ora te lo dice.** Prima Supabase rispondeva «ok» in silenzio (per non rivelare che l’email esiste) e restavi ad aspettare una mail col codice che non sarebbe mai arrivata. Adesso l’app te lo scrive chiaro: «Questa email è già registrata: prova a entrare.»'
    ]
  },
  {
    versione: '0.9.45',
    righe: [
      '**All’avvio ora c’è una vera schermata d’ingresso.** Prima del programma parte un’intro con il cristallo e un caricamento al centro, poi — se non sei già entrato — l’accesso. **L’accesso è obbligatorio**: niente più «usa senza account». E se provi a entrare senza aver confermato l’email, l’app ti porta a inserire il codice e te lo rimanda.'
    ]
  },
  {
    versione: '0.9.44',
    righe: [
      '**La conferma della registrazione ora è a codice.** Invece di un link (che su un programma installato non porta da nessuna parte), la mail ti manda un **codice**: lo scrivi nell’app e sei dentro. È la via giusta per un’applicazione desktop.'
    ]
  },
  {
    versione: '0.9.43',
    righe: [
      '**La schermata d’ingresso è nuova.** All’avvio ti accoglie il cristallo di SierraDeck in grande, con un’aurora che scorre piano sullo sfondo e la luce che attraversa il logo — e la scelta chiara: entra, registrati, o usa senza account.',
      '**Registrazione più sicura.** Ora la password si digita due volte (per non sbagliarla) e deve rispettare delle regole — almeno 8 caratteri, una lettera e un numero — che si accendono man mano che scrivi.'
    ]
  },
  {
    versione: '0.9.42',
    righe: [
      '**L’accesso ora compare all’avvio, e funziona.** All’apertura scegli tu: **entra**, **registrati**, oppure **usa senza account** — così l’account non è più una cosa nascosta che nessuno vede, ma una scelta consapevole, e chi ha già fatto l’accesso entra dritto. E soprattutto: prima, nell’app installata, il login dava «errore di rete» — l’accesso ora avviene nel motore del programma (dove non c’è il muro di sicurezza della pagina), quindi va davvero.'
    ]
  },
  {
    versione: '0.9.41',
    righe: [
      '**È arrivato l’Account (primo pezzo).** Nella barra in basso trovi «◍ Account»: da lì puoi **registrarti ed entrare**. Per ora è solo l’accesso — è la chiave su cui costruiamo il recupero fra computer: presto, da entrato, i tuoi dati (chat, quaderno, workspace) si sincronizzeranno **cifrati** nel tuo cloud, così su un altro PC basterà accedere per ritrovare tutto, e la cifratura resta tua (nemmeno noi possiamo leggerli). Non blocca niente: se non ti registri, il programma funziona come prima.'
    ]
  },
  {
    versione: '0.9.40',
    righe: [
      '**Il quaderno è diventato un vero blocco note.** Le schede ora si leggono con il Markdown formattato — titoli, elenchi, codice, grassetto, link — invece che come testo grezzo, e con un interruttore passi da «Leggi» a «Modifica». In modifica puoi cambiare anche il **titolo e i tag** (prima solo il corpo), e si salva **da solo** mentre scrivi. Puoi **eliminare** una scheda (con conferma), e l’elenco mostra a colpo d’occhio titolo, un assaggio del contenuto, la data e i tag, così ritrovi quello che cerchi senza aprirlo. I link si aprono nel browser di sistema, e tutto è reso in modo sicuro: una scheda non può eseguire codice. I file restano Markdown in «.sierradeck/quaderno» dentro il progetto, come prima.'
    ]
  },
  {
    versione: '0.9.39',
    righe: [
      '**Le flotte di autopiloti sono più solide.** Tre cose insieme: se cambi l’obiettivo o i compiti a mano (con «modifica» o «parla») mentre una chat sta chiudendo un turno, la tua modifica non viene più cancellata in silenzio; due chat che finiscono un turno nello stesso istante non si sovrascrivono più a vicenda la conversazione (prima una poteva restare «orfana», senza sessione); e i compiti non finiscono più in una coda che non verrà mai lavorata — le chat di una flotta puntano tutte allo stesso obiettivo, quello misurato dai criteri, e si aprono fino al numero massimo che hai scelto, senza accumulare lavoro che poi si perde.',
      'Nota su come rendono al meglio: più chat sulla **stessa cartella** tendono a pestarsi i piedi sugli stessi file. Una flotta lavora meglio con un tetto basso e compiti che si sovrappongono poco.'
    ]
  },
  {
    versione: '0.9.38',
    righe: [
      '**Una flotta di autopiloti non si ferma più tutta quando una chat fa una domanda.** Se lavori con più chat sotto lo stesso autopilota e una si blocca per chiederti qualcosa, ora si ferma **solo lei**: resta in attesa della tua risposta mentre le altre continuano a lavorare. Prima una singola domanda metteva in pausa l’intera flotta — bastava un bivio per fermare tutto. Quando rispondi, riprende solo la chat che aveva chiesto. Con una chat sola non cambia niente.'
    ]
  },
  {
    versione: '0.9.37',
    righe: [
      '**Dopo un aggiornamento torni sull’ultimo desktop, non su un altro.** Il workspace attivo ora segue la finestra principale: al riavvio — che l’app fa da sola per aggiornarsi — riapre quello che avevi davvero davanti, e la chat su cui lavoravi non resta nascosta in un altro desktop.',
      '**Riprendere un salvataggio non sposta più le chat nel workspace sbagliato.** Prima, caricare un’istantanea mentre eri su un altro workspace poteva trascinare le chat appena ripristinate sotto il nome di prima, disfacendo il ripristino in un lampo. Ora ogni finestra si allinea al workspace giusto prima di rimettere a schermo il layout.',
      '**Un aggiornamento fallito non finge più di essere riuscito.** Se l’installazione non va a buon fine, l’app te lo dice e riapre la versione che hai, invece di dire «Pronto» e riavviarsi con quella vecchia come se niente fosse.',
      '**Sicurezza.** Un nome di workspace non può più essere usato per rubare la chiave del telefono, e le impostazioni che riguardano la rete (chi può collegarsi, le porte) non si cambiano più dal telefono: solo dal computer.',
      '**Meno memoria sprecata, e due interruttori che ora funzionano.** Le chat aperte e chiuse a ripetizione non lasciano più residui che gonfiano la memoria col passare delle ore. E «salva alla chiusura» e «manda a dormire le chat che lasci» ora fanno davvero quello che dicono, comunque tu cambi workspace.'
    ]
  },
  {
    versione: '0.9.36',
    righe: [
      '**Decidi tu se gli aggiornamenti si scaricano da soli.** In Impostazioni → Comportamento c’è un interruttore. Acceso (com’è sempre stato) lo scaricamento parte da solo in secondo piano e l’aggiornamento si installa quando chiudi; spento, non si scarica niente finché non premi «Scarica» nella banda in alto. E quando è acceso, il tasto «Scarica» — che tanto non faceva partire niente, era già partito — non compare più.'
    ]
  },
  {
    versione: '0.9.35',
    righe: [
      '**Niente più chat duplicate, né workspace che tornano da soli.** La stessa conversazione non può più finire in due workspace insieme: a ogni salvataggio resta in quello che hai davanti e sparisce dagli altri. E riprendere un salvataggio vecchio non fa più ricomparire un workspace che avevi cancellato.',
      '**Riprendere un salvataggio non svuota più le altre chat.** Prima, caricare un salvataggio che non conteneva tutte le finestre azzerava quelle scoperte — e una chat aperta spariva, da riaprire a mano. Ora le chat che non sono nel salvataggio restano dov’erano: si toglie solo ciò che il salvataggio rimette altrove.',
      '**Il menu del modello è stato tolto dall’intestazione delle chat.** Il modello si sceglie all’apertura, dalla fascia in alto; lo spazio nella testata di ogni chat serviva a comandi più utili, che arrivano.'
    ]
  },
  {
    versione: '0.9.34',
    righe: [
      '**La chat su cui lavori non sparisce più dopo un aggiornamento.** Quando l’app si chiudeva per aggiornarsi, l’ultimo stato poteva non fare in tempo a salvarsi: alla riapertura la chat su cui stavi lavorando «mancava», e a volte al suo posto compariva quella di un altro workspace. Ora, prima di chiudersi — per un aggiornamento o quando esci — SierraDeck salva il layout di tutte le finestre e aspetta che sia davvero sul disco, poi spegne i terminali. Quello che avevi davanti lo ritrovi identico.'
    ]
  },
  {
    versione: '0.9.33',
    righe: [
      '**I workspace si rinominano.** Nel pannello dei workspace (il ⋯ in alto) c’è «✎ Rinomina»: cambia solo l’etichetta, le chat e i loro terminali restano dov’erano. Serve quando i nomi non dicono più cosa contengono.',
      '**Una chat vive in un solo workspace, sempre.** Era la radice di parecchi guai: la stessa conversazione poteva finire in due workspace insieme — nomi che sembravano incrociati, e un salvataggio che diceva «1 chat, 2 workspace» su una chat sola. Adesso quando una chat entra (o si sposta) in un workspace sparisce da ogni altro, e i salvataggi non contano più due volte la stessa conversazione.',
      '**Il modello di ogni chat si vede, si salva e si riapre uguale.** Nell’intestazione del riquadro il menu del modello ora mostra **quello in uso**, non un generico «modello…»; la scelta viene salvata col riquadro; e al riavvio la chat riprende con lo stesso modello invece che con il predefinito dell’account. Prima quella scelta si perdeva a ogni riavvio — che l’app fa da sola per aggiornarsi.'
    ]
  },
  {
    versione: '0.9.32',
    righe: [
      '**Dopo un aggiornamento il programma si riapre una volta sola.** Si chiudeva e riapriva un paio di volte — la versione di partenza, poi quella nuova — perché sullo stesso momento partivano due installatori: SierraDeck Update e quello di riserva di Electron, che credeva ancora di dover installare da sé alla chiusura. Adesso, quando l’installazione la guida SierraDeck Update, l’altro si tira indietro: un padrone solo.'
    ]
  },
  {
    versione: '0.9.31',
    righe: [
      '**Le chat restano nel loro workspace, anche subito dopo un aggiornamento.** Al riavvio poteva capitare che la chat di un workspace comparisse in un altro, sopra quella che c’era: il salvataggio del layout finiva sotto il workspace **attivo** dell’applicazione, ma le finestre si ricaricano in ordine incerto e una poteva scrivere mentre l’attivo era ancora un altro. Adesso ogni finestra salva sotto il workspace che sta mostrando davvero.'
    ]
  },
  {
    versione: '0.9.30',
    righe: [
      '**L’autopilota non resta più bloccato, e non “resuscita”.** Quando una chat si fermava aspettando una risposta poteva restare in attesa per sempre: ora te la ripropone come domanda — nella modale, sul telefono, su Telegram — e appena rispondi riparte. E se lo fermi o lo elimini proprio mentre sta controllando il lavoro, adesso la tua scelta vince, invece di vederlo ripartire da solo.',
      '**Gli avvisi su Telegram tornano ad arrivare.** Bastava un simbolo come < o & nell’obiettivo perché Telegram rifiutasse il messaggio, e non arrivava niente — nemmeno le domande. Adesso il testo passa intero.',
      '**I tasti dei pannelli si chiudono ripremendoli.** In alto, premere di nuovo «Quaderno» (o un altro pannello) adesso lo chiude, invece di riaprirlo subito.',
      '**I Consumi dal telefono mostrano i numeri veri.** Prima erano tre trattini, e per giunta in dollari: adesso sono i token — oggi, sette giorni, totale — con ingresso, uscita e cache.'
    ]
  },
  {
    versione: '0.9.29',
    righe: [
      '**L’accoppiamento del telefono è più al sicuro.** Dopo qualche codice sbagliato di fila la finestra si chiude da sola, così nessuno può provare i codici a raffica finché indovina; e il computer non lascia più capire da fuori se sta aspettando un dispositivo.',
      '**L’aggiornamento non ti lascia a metà.** Parte solo quando c’è davvero qualcosa di pronto, invece di rischiare di chiudere le chat e fermarsi a metà; e quando c’è, aggiorna Claude Code nello stesso viaggio.',
      '**Gli autopiloti tornano a controllare il proprio lavoro** anche quando Git è installato in una cartella fuori dal solito: prima, in quel caso, i controlli fallivano sempre e l’autopilota girava a vuoto tutta la notte cercando un guasto che non c’era.'
    ]
  },
  {
    versione: '0.9.28',
    righe: [
      '**Gli aggiornamenti non li devi installare tu.** Si scaricano da soli in secondo piano e si installano **quando chiudi SierraDeck**: mai mentre stai lavorando, perche\u0301 quello e\u0300 il momento in cui non c\u2019e\u0300 niente da interrompere. Il tasto \u00abInstalla\u00bb resta, per chi la vuole subito.',
      '**Un salvataggio non torna piu\u0300 vuoto.** Ne e\u0300 stato trovato uno sul disco \u2014 \u00abUltima chiusura\u00bb \u2014 con dentro una finestra senza riquadri: al ricarico non tornava **niente**, mentre le chat erano nello stesso file, nell\u2019archivio dei workspace. Adesso le finestre vuote non si salvano e, se un salvataggio vecchio ne ha una, il ripristino pesca dal workspace che avevi davanti.',
      '**Via i cinque tasti degli ingombri** (1, 2, 2\u00d72, 3\u00d72, 1+L) dalla fascia in alto: occupavano spazio e non servivano.'
    ]
  },
  {
    versione: '0.9.27',
    righe: [
      '**Adesso si capisce che diamine sta combinando un autopilota.** Tre cose che mancavano, e sono quelle che servono per fidarsi.',
      '**Le tue parole restano.** La preparazione riscriveva l\u2019obiettivo con parole sue \u2014 pi\u00f9 precise, e **sue** \u2014 e quello che avevi scritto tu spariva: senza, non c\u2019era modo di accorgersi che stava andando a fare un\u2019altra cosa. Adesso la scheda dice **Gli hai chiesto** e sotto **Ha capito cos\u00ec**, una sopra l\u2019altra.',
      '**I criteri raggiunti sono puntati, con l\u2019ora.** \u00abRaggiunto alle 14:32\u00bb: su un lavoro che dura una notte \u00e8 la differenza fra \u00absta procedendo\u00bb e \u00ab\u00e8 fermo da stamattina\u00bb. E se una cosa torna rossa, la data se ne va.',
      '**Si vedono i suoi ragionamenti**, dove sta guardando invece che sepolti in un pannello: \u00abriprovare lo stesso comando non porta da nessuna parte, isolo auth.spec e lo faccio girare da solo\u00bb. Sul computer e sul telefono.',
      'E due difetti trovati **guardando la pagina**, non da un test: a computer scollegato i LED delle chat restavano verdi \u2014 un verde su dati di mezz\u2019ora prima \u2014 e le decisioni mostravano la sigla interna con cui il servizio se le marca.'
    ]
  },
  {
    versione: '0.9.26',
    righe: [
      '**L\u2019interfaccia del telefono \u00e8 rifatta.** Non ritoccata: era un elenco di cose che il programma sa fare, ordinate come sono state scritte. Adesso risponde a una domanda sola \u2014 *serve qualcosa da me?* \u2014 e tiene tutto il resto a un tocco, sotto il pollice.',
      '**Una fascia fissa in basso, quattro destinazioni**: Adesso, Chat, Lavori, Computer. Il menu di prima era un riquadro alla fine di uno scorrimento infinito che apriva i suoi pannelli ancora pi\u00f9 sotto: con sei chat aperte, \u00abConsumi\u00bb era a dodici schermate dal pollice. E la fascia \u00e8 anche la fila dei LED: sei dentro una chat e vedi lampeggiare in fondo che qualcuno ti aspetta.',
      '**Si pu\u00f2 finalmente leggere una chat.** La pagina si ricostruiva tutta ogni due secondi, e lo scorrimento del terminale tornava a zero due volte al secondo: leggere l\u2019output dal telefono era materialmente impossibile. Adesso si ridisegna solo quando \u00e8 cambiato qualcosa, e lo scorrimento resta dov\u2019era.',
      '**E non pu\u00f2 pi\u00f9 mentire.** Se il computer smette di rispondere lo dice \u2014 \u00abnon parlo con il computer da 40 secondi\u00bb \u2014 e spegne tutti i LED: nessun verde su dati di mezz\u2019ora prima.',
      '**Adesso ha una gerarchia**: una domanda in attesa \u00e8 la schermata, con il suo testo alla misura pi\u00f9 grande della pagina e la risposta dove arriva il pollice; un lavoro fermo \u00e8 rosso e dice **perch\u00e9**; quando non serve niente, domina il vuoto: \u00abTutto in moto. Nessuno ti aspetta.\u00bb',
      '**Ha i materiali del banco**: le misure arrivano dal computer come i colori \u2014 scegliere il Foglio adesso cambia anche il telefono \u2014 i tasti hanno rilievo e si premono, e il raggio degli angoli \u00e8 quello della console. Erano 14 pixel: la ragione singola per cui sembrava un modulo web.',
      '**Un elenco \u00e8 un elenco**: una riga per chat, e chi vuole entrare entra. Prima ogni chat portava sempre sei comandi \u2014 con sei chat, trenta bersagli in colonna. E il tasto indietro di Android non esce più dall’app: torna dove eri.',
      'La stessa pagina aperta da un computer mette la fascia a sinistra e ferma la colonna dove finisce la lettura comoda: stessa struttura, seduta invece che in piedi.'
    ]
  },
  {
    versione: '0.9.25',
    righe: [
      '**Adesso si capisce cosa sta facendo un autopilota, e glielo si può dire.** Di ognuno si vedeva un LED, uno stato e «3 criteri su 5»: quali fossero quei cinque, come venissero misurati e come cambiarli non si sapeva — si poteva solo fermarlo e rifarlo da capo.',
      '**Accanto alla chat che governa c’è la sua scheda**: cosa deve ottenere, come lo misura — il comando, e com’è andato l’ultima volta — e cosa farà dopo. È leggendo `npm test` accanto a «i test passano tutti» che si capisce cos’è un criterio, molto meglio che leggendone la spiegazione.',
      '**Ogni riga si può riscrivere**: cambiare un criterio, correggerne il comando, aggiungerne uno, togliere un compito dalla coda.',
      '**Oppure glielo dici a parole.** «Lascia stare i test, pensa all’installer»: traduce lui in criteri e compiti, lo applica subito, e scrive cosa ha capito. Se non ha capito non tocca niente e te lo dice, e in ogni caso c’è **Disfa**, che rimette esattamente com’era.',
      '**Non parte più da solo appena si è preparato**: si mette in «pronto» e aspetta il tuo via — dieci secondi di lettura prima di ore di lavoro. Se sei fuori te lo dice, e il via si dà anche dal telefono.',
      '**Una chat che sta lavorando non sembra più ferma**: un punto pulsa nella sua testata finché da lì arriva qualcosa.',
      'E due rifiniture della console: il fuoco della tastiera adesso si vede — chi lavora con Tab sa dov’è — e i numeri dei consumi non ballano più.'
    ]
  },
  {
    versione: '0.9.24',
    righe: [
      '**Gli autopiloti lavorano.** Il legame fra un autopilota e la sua chat non veniva salvato: al riavvio il riquadro tornava senza padrone e la chat rinasceva **senza gli agganci** — cioè un autopilota fermo a zero interventi per sempre. E siccome il programma si riavvia da solo per aggiornarsi, il guasto si ricreava da sé.',
      '**Le chat nascono nel workspace del loro autopilota**, deciso da lui, non in quello che stai guardando.',
      '**Un comando di verifica che lascia qualcosa acceso non blocca più il giro per dieci minuti**: si aspetta l’uscita del comando, non la chiusura delle sue scie. E le cartelle temporanee dei controlli adesso si cancellano — se ne erano contate 637 in una sera.',
      '**Il numero degli interventi si vede appena arriva**, non dopo le verifiche: per tutto quel tempo l’autopilota diceva «al lavoro, 0 interventi» mentre stava lavorando.',
      '**Una chat che non chiude più un turno viene segnalata.** Prima non c’era nessuno che guardasse: una chat rimasta appesa a un comando in background è stata muta 34 minuti senza che niente lo dicesse.',
      '**App Android 1.3.1**: l’app si dichiara alla pagina, così non ti propone più di scaricare l’app che stai usando — e il tasto per scaricarla adesso scarica davvero, invece di non fare niente in silenzio.'
    ]
  },
  {
    versione: '0.9.23',
    righe: [
      '**La chat di un autopilota torna dov’era, non dove sei tu.** Riprendendone uno mentre guardavi un altro workspace, la sua conversazione nasceva lì: due chat per la stessa cosa, e quella con dentro il lavoro ferma in un posto che non stavi guardando. Adesso la finestra va nel workspace dove quella conversazione è salvata, e consegna lì.',
      'Una chat che non esiste ancora continua a nascere dove sei: è solo quando ha già una casa che ci si va.'
    ]
  },
  {
    versione: '0.9.22',
    righe: [
      '**La chat presa in prestito adesso rinasce davvero.** Veniva spenta e riaccesa nello stesso istante: il riquadro non se ne accorgeva e restava con un terminale morto in mano, dove il compito finiva perduto — «terminale inesistente: 10965 caratteri non consegnati». Adesso fra lo spegnere e il riaccendere passa un disegno, che è quanto basta perché il riquadro rifaccia il suo terminale.',
      'E un terminale finito non è più considerato pronto a ricevere: prima sembrava il più pronto di tutti, perché aveva visto il prompt e da allora taceva.',
      '**L’app Android 1.3.0 è pubblicata**, con la firma automatica: da adesso ogni versione esce già firmata. Attenzione: la chiave è nuova, quindi va disinstallata la 1.2.0 prima di installarla — una volta sola.'
    ]
  },
  {
    versione: '0.9.21',
    righe: [
      '**L’autopilota restava a zero cicli nella chat che aveva preso in prestito.** Prendersi una chat già aperta non bastava: l’aggancio che le fa dire «ho finito di rispondere» si mette **quando il terminale nasce**, e quella era nata prima. Il compito arrivava, la chat lavorava, e l’autopilota aspettava un segnale che non sarebbe mai arrivato — fermo per sempre, con l’aria di stare lavorando.',
      'Adesso adottare una chat la fa rinascere con i suoi agganci, riprendendo la conversazione da dove stava: quella è su disco e non si perde niente.'
    ]
  },
  {
    versione: '0.9.20',
    righe: [
      '**Dal telefono si vede e si governa anche il resto**: i consumi di oggi, della settimana e del mese; il quaderno con le schede che l’autopilota lascia accanto al codice; lo stile della console e il chiarore, che cambiano il computer **e** il telefono nello stesso istante; e l’aggiornamento del computer — a che punto è, scaricarlo, installarlo.',
      'Installare da fuori chiude il programma con le chat aperte dentro: per questo lo chiede due volte, come ogni cosa che si disfa.'
    ]
  },
  {
    versione: '0.9.19',
    righe: [
      '**Dal telefono si riprende una conversazione**, invece di aprirne una nuova nella stessa cartella e lasciare tutto quello che c’era dentro da un’altra parte. Le ultime trenta, con il loro titolo, come dal tasto «Riprendi» del computer.',
      '**E si governano i workspace e i salvataggi**: crearne uno, eliminarlo, rimettere in piedi un insieme di chat salvato. Le cose che sostituiscono quello che hai davanti chiedono conferma.',
      '**L’app Android avvisa anche quando un autopilota si ferma** — non solo per le domande e i lavori finiti. Finché non lo guardi quel lavoro non prosegue, e prima lo scoprivi la mattina dopo.',
      '**E l’app si aggiorna da sé**: il file arriva dentro l’app con la percentuale che avanza, poi si apre la schermata di installazione di Android. Prima apriva il browser e ti lasciava cercare il file scaricato.'
    ]
  },
  {
    versione: '0.9.18',
    righe: [
      '**Dal telefono si vede l’autopilota come lo vedi qui.** Il suo percorso con i LED, la percentuale del passo in cui si trova, i criteri che si è dato con le spunte, le ultime cose che ha deciso: prima erano un nome e due numeri. E i colori non sono una copia somigliante — arrivano dal computer, con il chiarore e lo stile che hai scelto nelle impostazioni.',
      '**E si fa tutto**: eliminare un autopilota, decidere se riparte da solo dopo un riavvio, chiudere una chat, darle un nome. Le cose che si disfano le chiede due volte, con il tasto che cambia parola: il muro sta nel gesto, non nell’assenza del comando — un telefono da cui non si può togliere niente è mezzo strumento.',
      '**Il telefono avvisa anche dal browser**, quando una domanda aspetta o un autopilota si è fermato. Ad app chiusa continua a pensarci la guardia dell’app Android, che è la ragione per cui l’app esiste.',
      'La pagina, sullo schermo di un telefono, usciva di quarantatré pixel: bastava una riga di terminale che non andava a capo perché **tutte** le piastrelle diventassero più larghe dello schermo.'
    ]
  },
  {
    versione: '0.9.17',
    righe: [
      '**L’autopilota lavora nella chat che hai già aperto.** Ne apriva una sua accanto, e ti lasciava due conversazioni da seguire per un lavoro solo — con quella che stavi guardando ferma. Adesso, se sulla cartella c’è già una chat e non è di un altro autopilota, prende quella: chi attiva un autopilota smette di operare lui, ed è sua.'
    ]
  },
  {
    versione: '0.9.16',
    righe: [
      '**Il compito adesso parte, e se non parte si riprova.** Restava nel campo della chat, con l’autopilota ad aspettare una risposta che nessuno stava scrivendo. Tre precauzioni, ognuna provata su un terminale vero: il testo si dichiara come incollato — così i suoi a capo restano a capo e l’invio non diventa l’ennesima riga; l’invio aspetta che il terminale abbia finito di disegnare, invece di un decimo di secondo fisso; e dopo l’invio si guarda se la chat è partita davvero, premendo di nuovo se è rimasta ferma.',
      '**La fascia dei comandi non esce più dalla finestra.** Misurata: a schermo intero occupava 1996 pixel contro i 1904 disponibili, e «Autopiloti» restava oltre il bordo; stringendo la finestra restavano fuori quattordici comandi su ventiquattro, irraggiungibili. Adesso è la sezione dei workspace a cedere — sono tanti e si raggiungono scorrendo — mentre gli altri comandi restano dove la mano li cerca.'
    ]
  },
  {
    versione: '0.9.15',
    righe: [
      '**Il compito non partiva perché veniva scritto un decimo di secondo troppo presto.** L’app aspettava quattro secondi fissi che la chat nascesse, e su questo progetto Claude Code è pronto dopo quattro secondi e un decimo: il testo entrava nel campo e l’invio si perdeva. Adesso non si contano i secondi — si aspetta che il terminale abbia disegnato il suo prompt e abbia smesso di scrivere, quanto tempo ci voglia lo dice lui. Provato su un terminale vero: a due secondi il messaggio non parte, a sei sì, e il numero giusto non esiste.',
      '**Il pannello dell’autopilota torna sulla chat principale.** Sceglieva per ordine di identificativo del riquadro — un ordine che non vuol dire niente per chi guarda — e saltava via dalla chat principale per comparire in un’altra. Adesso segue l’ordine dell’autopilota: la prima delle sue chat.',
      '**Una chat sola è il caso normale.** L’autopilota spezzava il lavoro perché gli era stato chiesto di spezzarlo: il tetto che gli dai è un permesso, non un traguardo. Dentro una conversazione può già lanciare i suoi agenti, e ne apre un’altra solo quando il lavoro ha parti che devono procedere per strade separate. Nel dubbio, una.'
    ]
  },
  {
    versione: '0.9.14',
    righe: [
      '**Una flotta ripresa dopo un riavvio tornava sbagliata.** L’autopilota riprendeva come se avesse una chat sola: quelle vere restavano vive nel mosaico ma senza nessuno che le governasse, e se ne apriva un’altra con l’obiettivo intero — lo stesso lavoro, già diviso in due, rifatto da capo in parallelo. Ora riprendono tutte le sue chat, e quelle che avevano finito il loro pezzo non tornano.'
    ]
  },
  {
    versione: '0.9.13',
    righe: [
      '**Gli autopiloti scrivevano il compito nella chat senza mandarlo.** Il testo compariva per intero nel campo, la chat restava ferma e l’autopilota aspettava una risposta che nessuno stava scrivendo. Per Claude Code un testo che arriva tutto insieme è un incollaggio, e dentro un incollaggio l’invio finale conta come un altro a capo: adesso il messaggio e il suo invio sono due gesti separati.',
      '**Un solo pannello dell’autopilota, anche quando le sue chat sono tante.** Il diario si trova per cartella, e una flotta ne apre più d’una lì dentro: compariva accanto a ognuna, identico, con la stessa percentuale — e sembravano tre autopiloti diversi. Ora sta accanto alla prima, e se quella chat si chiude passa alla successiva.',
      '**La finestra torna sul monitor dove l’avevi lasciata.** Quella memoria la teneva l’archivio dei layout, che archiviava le chat per monitor; da quando i layout sono uno solo per workspace — era il difetto per cui le chat sparivano — nessuno sapeva più dov’era la finestra, e all’avvio finiva sul primo schermo libero: su due monitor, quello che capitava. Ora se lo ricorda, e se quel monitor non c’è più non ci prova nemmeno.',
      '**La preparazione non esegue più la suite di test.** Su un progetto vero ha speso 188 secondi dei suoi 265 dentro un comando solo: i test, che su quel progetto non finivano affatto. Le basta sapere che il comando esiste — a vederlo passare ci pensa l’autopilota mentre lavora, ed è il suo mestiere.'
    ]
  },
  {
    versione: '0.9.11',
    righe: [
      '**«La preparazione si è guastata» non era un guasto: era il tempo.** Ogni giro di preparazione veniva ucciso dopo cinque minuti — il tempo di un giudizio, dove però c’è una chat ferma che aspetta la risposta. Qui invece l’autopilota deve leggersi un progetto che non ha mai visto per capire quando il lavoro sarà finito, e nessuno lo sta aspettando: adesso ha venti minuti, e l’errore dice sempre quanti ne ha avuti.',
      'E ogni interrogazione perdeva tre secondi ad aspettare qualcosa che nessuno le avrebbe mai scritto: adesso le si chiude l’ingresso invece di lasciarla in attesa.'
    ]
  },
  {
    versione: '0.9.10',
    righe: [
      '**Dal telefono si affida un lavoro.** Si dice cosa si vuole, si sceglie la cartella, e l’autopilota parte: le domande che gli servono arrivano sulla stessa pagina, dove c’è già il campo per rispondere. Era la cosa che aveva più senso poter fare da fermi, in piedi, con una mano sola — e mancava.',
      '**E il terminale si guarda con i suoi colori.** Le righe arrivavano sbiancate: il testo giusto, senza il verde di un test passato o il rosso di uno fallito, che sono metà di quello che dice come sta andando.',
      '**Lo stile Foglio è diventato uno stile vero**, invece di un Banco addolcito. Sotto c’è il lavoro che lo rende possibile: il foglio di stile aveva 51 colori scritti a mano, 11 dimensioni di testo e 23 spaziature decise una per una, e adesso ha cinque misure, quattro passi di spazio e i colori della sola tavolozza. Trentadue di quei grigi non seguivano nemmeno il cursore del chiarore.'
    ]
  },
  {
    versione: '0.9.9',
    righe: [
      '**Gli aggiornamenti arrivavano a metà.** Il servizio degli autopiloti vive fuori dall’applicazione e sopravvive alla sua chiusura — è tutto il suo mestiere, così il lavoro prosegue mentre non ci sei. Ma l’app lo riavviava solo se la porta era libera: dopo un aggiornamento restava in memoria quello vecchio, per giorni, e le correzioni appena installate non entravano mai in funzione. Si aggiornava per riparare l’autopilota, e l’autopilota continuava a comportarsi come prima.',
      'Adesso il servizio dice con quale versione è nato, e chi ne trova uno rimasto indietro lo congeda e ne fa uno nuovo. Gli autopiloti al lavoro riprendono da soli, come dopo qualunque riavvio.'
    ]
  },
  {
    versione: '0.9.8',
    righe: [
      '**Un autopilota che si stava preparando non resta più fermo per sempre.** Se il servizio si riavviava durante la preparazione — un aggiornamento, uno spegnimento — sul disco restava scritto «si prepara», ma nessuno la stava più conducendo: niente domande a cui rispondere, niente da premere, e l’autopilota lì per ore. Adesso le preparazioni interrotte ripartono insieme al lavoro; e se la preparazione si guasta lo dice, invece di tacere.',
      '**Si vede a che punto è.** Il pannello mostrava una percentuale e due schede su sei stati possibili: ora c’è il percorso intero — prepara, lavora, fine — e la forma del passo in cui si trova dice come lo sta vivendo. Davanti a uno fermo si capisce subito se si è fermato prima o dopo essersi messo al lavoro.',
      '**E si vede cosa sta facendo mentre si prepara**, con i file che apre e i comandi che prova: prima erano minuti di silenzio. La percentuale è quella del passo in cui si trova — i giri della preparazione o i criteri del lavoro — con un colore diverso per ciascuno, perché non misurano la stessa cosa.',
      'I LED dicevano «tocca a te» anche quando l’autopilota stava solo leggendo il progetto. Adesso lampeggiano solo se c’è davvero una domanda, e smettono appena si risponde. Alle domande della preparazione si risponde dal pannello, dov’è già lo sguardo.',
      'La larghezza del pannello si trascina dal suo bordo — e il cursore nelle impostazioni, che finora non muoveva niente, adesso la muove davvero.'
    ]
  },
  {
    versione: '0.9.7',
    righe: [
      '**Gli autopiloti ripartono.** Si fermavano subito con «interrogazione del supervisore fallita: Command failed», prima ancora di aprire la loro chat. Il servizio nasce con una variabile che lo fa girare come Node, e quella variabile proseguiva fino a Claude Code facendolo partire nel modo sbagliato: usciva con un errore, e da fuori si vedeva solo una frase generica. Le chat non ne soffrivano perché quel percorso la ripuliva già — la regola c’era, non era applicata qui.',
      'E quando qualcosa va storto, adesso l’errore dice **cosa**: prima si teneva solo «Command failed», che è la stessa frase per una cartella che non esiste, un accesso scaduto o un comando andato in timeout. Il motivo lo scriveva Claude Code, e lo buttavamo via.',
      'Lo stile della console si sceglie nelle impostazioni: **Banco** (metallo, solchi, densa) o **Foglio** (piatta, arieggiata, morbida).'
    ]
  },
  {
    versione: '0.9.6',
    righe: [
      '**Un workspace, una disposizione.** Il layout era archiviato per monitor, e da lì venivano quasi tutti i guasti di questi giorni: chat che non tornavano perché archiviate sotto uno schermo che nessuna finestra chiedeva, la stessa chat mostrata da due finestre, un salvataggio che ne cancellava un altro. Ogni rattoppo ne apriva uno nuovo, perché il modello chiedeva di sapere **sotto quale monitor** vive una chat — una domanda che nessuno dovrebbe doversi porre.',
      'Al primo avvio le chat di ogni workspace si uniscono in un posto solo. Si perde la disposizione separata per schermo; si guadagna che le chat ci sono sempre tutte, e chiunque le cerchi le trova.',
      'Via l’avviso «una chat è su un altro monitor» e il tasto che apriva una finestra: mostrava la stessa chat che avevi già davanti e continuava a insistere. Era il rattoppo di un difetto che adesso non c’è più.',
      'Le finestre in più restano finestre in più: si aprono vuote, e ci si portano dentro le chat con il comando ⇄ del riquadro.'
    ]
  },
  {
    versione: '0.9.5',
    righe: [
      '**Spostare una chat in un altro workspace non la perde più.** Il Core la scriveva sul disco, ma ogni finestra tiene in memoria i workspace che ha visitato — e la memoria vince sul disco. Tornando lì, la copia in memoria non sapeva dell’arrivo: la chat non compariva, e il primo salvataggio la cancellava anche dal file. Non «spostata male»: persa.',
      'Adesso lo spostamento entra nella memoria della finestra che l’ha fatto, e viene annunciato a tutte le altre — che hanno la stessa copia, e lo stesso potere di cancellarla.'
    ]
  },
  {
    versione: '0.9.4',
    righe: [
      '**L’app si ricorda le credenziali, e una per indirizzo.** Il computer di casa e quello in VPN sono due accoppiamenti diversi: adesso tornare dall’uno all’altro non costa più sei cifre ogni volta.',
      '**La guardia dell’app non aveva mai avvisato nessuno.** La chiave nasceva dentro la pagina e finiva solo nel suo archivio: l’app, che è un programma diverso, non la vedeva e mandava le sue richieste con una chiave vuota. Riceveva 401 e taceva — il servizio che esiste per avvisarti quando una chat ha bisogno di te non ha mai funzionato, e non c’era modo di accorgersene.',
      'Il logo c’è anche nella schermata del codice: si arrivava da un QR e la prima cosa che si vedeva era un campo con sei puntini, senza un segno che dicesse dove si era finiti.'
    ]
  },
  {
    versione: '0.9.3',
    righe: [
      '**Il programma non apre più finestre da solo all’avvio.** Nella 0.9.2 ne apriva una per ogni monitor con delle chat: faceva vedere tutto, ma chi ne aveva lasciata una se ne ritrovava due. Adesso lo **dice** — una riga in cima con scritto quante chat sono su un altro monitor, e un tasto per aprire la finestra che le mostra.',
      '**La ricerca degli aggiornamenti di Claude Code si vede.** Prima si chiedeva prima di chiudere il programma e, quando non c’era niente da fare, la finestra nera passava oltre in silenzio: un controllo che non si vede, per chi guarda, non è avvenuto. Adesso la ricerca la fa l’updater a programma chiuso, con la sua console in vista: si legge cosa scarica e cosa installa, riga per riga, e al termine l’aggiornamento riprende da solo.'
    ]
  },
  {
    versione: '0.9.2',
    righe: [
      '**Le chat dei salvataggi tornano tutte.** Il layout è archiviato per monitor e una finestra ne mostra uno: chi lavorava su due schermi e riapriva con una finestra sola vedeva metà del suo workspace e credeva di aver perso l’altra metà. Adesso all’avvio si apre una finestra per ogni monitor che ha delle chat, e una finestra senza niente da mostrare prende quelle rimaste senza casa.',
      '**Recuperate le chat rimaste su postazioni che non esistono più.** La chiave di un monitor cambia se lo sposti, se ne cambi la scala, o perché una versione precedente la scriveva diversamente: quei layout non li chiedeva più nessuno e le loro chat erano invisibili per sempre. Al primo avvio tornano su uno schermo vero.',
      'Ricaricando un salvataggio, le chat tornano nel workspace da cui vengono anche quando il salvataggio è vecchio e non lo dice: si deduce da dove stanno. Senza, il primo salvataggio automatico le scriveva nel workspace sbagliato, sopra le sue.'
    ]
  },
  {
    versione: '0.9.1',
    righe: [
      '**Le chat si possono mettere a dormire.** Il tasto ⏸ nella testata del riquadro chiude il suo claude.exe e conserva la conversazione: al risveglio riprende da dove era. Il riquadro resta al suo posto — sparire sarebbe indistinguibile dall’averlo chiuso, e la differenza è tutto il punto.',
      'Nelle impostazioni si può chiedere che le chat vadano a dormire quando cambi workspace. Spento resta il comportamento di sempre, con il ritorno istantaneo; acceso, si smette di tenere accesi dieci processi per guardarne due.',
      'Una chat messa a dormire resta a dormire anche dopo aver riaperto il programma.',
      '**L’app Android non riusciva ad aprire nessun indirizzo, né di casa né in VPN**: le eccezioni per l’HTTP erano scritte come nomi di dominio e non corrispondevano a nessuna rete vera. Ora il muro sta nel codice, accetta solo indirizzi privati (Tailscale compreso), e quando qualcosa non va dice il motivo invece di indovinare.'
    ]
  },
  {
    versione: '0.9.0',
    righe: [
      '**L’autopilota non lavora più al posto delle chat: le coordina.** Le istruzioni le scrive dentro una chat vera, quella che vedi nel mosaico, e la risposta si legge mentre arriva — invece di sparire dentro un processo di cui restava una riga di riassunto.',
      'Puoi intervenire mentre lavora: scrivi nella chat come faresti sempre. Per la conversazione il tuo messaggio e il suo sono indistinguibili, e la chat sa che quello che aggiungi vale più delle istruzioni che ha ricevuto.',
      'Ogni chat governata nasce con la sua conversazione, e la ritrova al giro dopo: il lavoro fatto non si butta via a ogni istruzione.',
      'Con una flotta, ogni chat ha il suo pezzo di lavoro — e adesso lo riceve davvero: il compito si perdeva per strada e ognuna leggeva l’obiettivo intero.'
    ]
  },
  {
    versione: '0.8.5',
    righe: [
      'I salvataggi non perdono più i workspace: il campo veniva scritto sul disco e non lo rileggeva nessuno, così chi ne salvava tre ne ritrovava uno appena riaperto il programma — ed è anche il motivo per cui il conteggio diceva sempre «1».',
      'Ricaricare un salvataggio **riempie le finestre che ci sono** invece di affiancarne di nuove: prima quelle di prima restavano aperte con dentro le loro chat, e le stesse chat comparivano due volte in due finestre. E ogni chat torna nel workspace da cui viene, non in quello che avevi davanti.',

      'Ogni finestra si riapre sullo schermo dove l’avevi lasciata, invece che sempre sul primo: là dove ci sono le sue chat.',
      'La barra dell’aggiornamento non salta più: ogni fase attraversa il suo tratto misurando il **proprio** tempo, e l’attesa lunga sta al 99, non al 65.',
      'Prima di riaprire il programma si vede il controllo di Claude Code, anche quando è già aggiornato: un controllo che non si vede, per chi guarda non è avvenuto.',
      'Ogni autopilota ha la sua spunta «riparti all’avvio», oltre a quella generale che li cambia tutti insieme.',
      'Dal telefono si può guardare dentro una chat — le sue ultime righe, non solo l’ultima — e aprirne una nuova scegliendo fra le cartelle già conosciute. E cambiando workspace, anche le finestre del computer mostrano quello giusto.'
    ]
  },
  {
    versione: '0.8.3',
    righe: [
      'Il tasto per scaricare l’app dice quale versione è, e **scarica**: prima apriva GitHub e ti lasciava davanti a un elenco di file da capire — da un telefono è il momento in cui si rinuncia.'
    ]
  },
  {
    versione: '0.8.2',
    righe: [
      'Il testo mandato dal telefono arriva davvero alla chat: si scriveva usando l’identificatore del riquadro invece di quello del terminale, e non succedeva niente — in silenzio, da entrambe le parti.',
      'Nel Client ogni chat mostra la sua ultima riga: dal telefono era l’unica cosa che mancava per sapere se quello che hai mandato ha prodotto qualcosa.',
      'L’app Android non va più in errore quando inquadri il QR: la libreria di scansione era ferma al 2021 e Android 14 non la accetta più. Ora la schermata è quella di Google Play Services — e non serve nemmeno il permesso della fotocamera.'
    ]
  },
  {
    versione: '0.8.1',
    righe: [
      'Dal telefono si può scrivere davvero: la pagina si rifaceva da capo ogni due secondi e portava via quello che stavi scrivendo. Ora, mentre hai un campo sotto le dita, il ridisegno aspetta — e quello che avevi scritto torna comunque al suo posto.',
      'In cima c’è la panoramica: quante chat, quanti autopiloti al lavoro, quanti ti stanno aspettando, e a che punto sono nel complesso.',
      'L’app Android ha una versione sua (1.0.0) che non insegue quella del computer: sono due programmi, e si aggiornano quando hanno qualcosa di nuovo da dare.'
    ]
  },
  {
    versione: '0.8.0',
    righe: [
      'La barra dell’aggiornamento non salta più da 65 a 100: avanza piano dentro ogni fase, rallentando verso la fine, e durante le attese lunghe dice da quanti secondi sta aspettando — un numero fermo si legge come un blocco.',
      'L’updater ha la sua icona nella barra delle applicazioni, invece del rettangolo bianco di Windows.',
      'L’app Android ha una schermata di ingresso fatta come si deve, e soprattutto **inquadra il QR con la fotocamera**: niente più indirizzi da digitare.'
    ]
  },
  {
    versione: '0.7.6',
    righe: [
      'La pagina del Client non resta più nera: un errore di sintassi nascosto la lasciava vuota, senza un messaggio e senza niente da premere. Adesso un test verifica che lo script sia valido, e qualunque errore lascia comunque una schermata con scritto cosa non va.',
      'Il QR ora accoppia davvero: la ricerca del codice cercava la lettera «d» invece delle sei cifre.',
      'L’app Android non va più in errore quando inserisci l’indirizzo, e si aggiorna da sola — finché non sarà sul Play Store, ti propone la versione nuova quando c’è.',
      'Scambio file fra computer e telefono: quello che metti da una parte lo trovi dall’altra.'
    ]
  },
  {
    versione: '0.7.5',
    righe: [
      'Tailscale, ZeroTier e le VPN a maglia funzionano: i loro indirizzi (100.64–100.127) erano trattati come Internet, quindi non solo non comparivano — chi arrivava da lì veniva **respinto**. Adesso l’indirizzo Tailscale è in evidenza accanto a quello di casa.',
      'Le impostazioni non bloccano più il programma: cercare le reti chiede mezzo secondo a Windows, e prima quel mezzo secondo era di silenzio totale. Ora si chiede senza fermare niente, e mentre cerca lo dice.'
    ]
  },
  {
    versione: '0.7.4',
    righe: [
      'Gli indirizzi in evidenza sono due: la rete di casa e la VPN. Sono due risposte diverse alla stessa domanda — «da dove mi collego?» — ed entrambe giuste a seconda di dove sei.',
      'La VPN non è più trattata come una scheda virtuale da nascondere: era un errore, e chi lavora in VPN se ne accorgeva subito.'
    ]
  },
  {
    versione: '0.7.3',
    righe: [
      'Il QR mostrato è quello **giusto**: l’indirizzo da cui il computer esce davvero, chiesto a Windows. Gli altri — VirtualBox, WSL, una VPN — restano lì sotto in una lista a scomparsa, perché a volte servono, ma non ti fanno più indovinare.',
      'Un salvataggio dice quante chat contiene in tutti i workspace: chi ne aveva sei divise in tre leggeva «2 chat».',
      'L’app Android è compilata e firmata: si scarica dai Release.'
    ]
  },
  {
    versione: '0.7.2',
    righe: [
      'Un salvataggio dice quante chat contiene **in tutti i workspace**: chi ne aveva sei divise in tre leggeva «2 chat» e pensava, giustamente, che le altre fossero andate perse. La stessa chat su due monitor si conta una volta sola.',
      'L’app Android è compilata e firmata: si scarica dai Release e si installa sul telefono.'
    ]
  },
  {
    versione: '0.7.1',
    righe: [
      'Alle domande dell’autopilota si risponde **dentro il suo diario**, dove stai già guardando: prima bisognava aprire il pannello e cercarla mentre la chat restava ferma ad aspettare.',
      'I consumi si leggono: una barra dice quanta parte è cache — quella che costa meno — e il titolo dice se oggi stai consumando più del solito. «847k» non dice a nessuno se è tanto o poco; «più del solito» sì.',
      'Chi apre il Client da un telefono Android si vede proporre l’app, una volta sola.'
    ]
  },
  {
    versione: '0.7.0',
    righe: [
      'Il telefono si collega **inquadrando un QR**: niente più sei cifre da ribattere. La fotocamera di sistema basta — nessuna app da installare per leggerlo — e la pagina si accoppia da sola.',
      'Un salvataggio si può **aggiornare**: hai aggiunto una chat a «desk_1» e volevi salvarla lì dentro? Adesso c’è il tasto. Prima si poteva solo riprenderlo o buttarlo.',
      'C’è l’app Android, nella cartella `android` del progetto: mostra la stessa pagina del Client e, con una notifica fissa, resta in ascolto **anche quando la chiudi** — cosa che nessuna pagina web può fare su una rete di casa.'
    ]
  },
  {
    versione: '0.6.0',
    righe: [
      'L’aggiornamento aggiorna anche **Claude Code**, se è indietro: nello stesso viaggio, con la stessa finestra nera. È l’unico momento in cui si può fare, perché nessuna chat lo tiene aperto.',
      'La barra arriva davvero al 100%: si fermava all’82 dicendo «Pronto» — l’ultimo disegno restava quello del giro prima, perché la finestra usciva prima di aggiornarlo.',
      'E dice «Pronto» solo quando la nuova versione è davvero a schermo, non mentre sta ancora nascendo.'
    ]
  },
  {
    versione: '0.5.8',
    righe: [
      'Dal telefono si vedono **tutte** le chat, anche quelle di altre finestre: prima l’ultima finestra che si annunciava copriva le altre, e se ne vedeva una sola.',
      'Dal telefono si possono anche fermare e riprendere gli autopiloti — gesti reversibili, quindi ammessi. Chiudere ed eliminare restano fuori.',
      'I modelli specifici (Opus 5, Opus 4.8, Fable 5…) ora ci sono anche nel menu dentro la chat: erano due elenchi diversi, e quello dei riquadri era rimasto indietro.',
      'I menu a discesa si leggono: le voci le disegna Windows, e con il fondo chiaro ereditato dal sistema il testo spariva.',
      'Il quaderno elenca tutte le chat aperte, non solo le cartelle diverse.'
    ]
  },
  {
    versione: '0.5.7',
    righe: [
      'Un salvataggio contiene **tutti** i workspace, non solo quello che avevi davanti: le finestre raccontano l’attivo, ed era l’unica cosa che finiva nel file — chi ne aveva tre se ne ritrovava uno.',
      'Per il workspace attivo vale quello che hai davanti, per gli altri quello che era stato lasciato: così il salvataggio contiene insieme il lavoro di là e quello di qua.',
      'Ricaricando, i workspace tornano al loro posto — e quelli creati dopo il salvataggio non vengono cancellati.'
    ]
  },
  {
    versione: '0.5.6',
    righe: [
      'L’aggiornamento adesso arriva in fondo. L’updater moriva insieme a SierraDeck: essendo un processo figlio ereditava il contenitore di Electron, e quando l’ultima finestra si chiudeva veniva portato via anche lui — il suo diario si interrompeva sempre a metà frase.',
      'Ora lo fa nascere Explorer, così di noi non gli resta niente da ereditare, e i suoi parametri viaggiano in un file invece che sulla riga di comando.',
      'E il programma non si chiude più finché l’updater non dice di esserci: se non parte, non si chiude niente e te lo dice, invece di lasciarti senza programma e senza aggiornamento.'
    ]
  },
  {
    versione: '0.5.5',
    righe: [
      'Il Client si apre davvero: la pagina era finita dietro la chiave, e per accoppiarsi bisognava essere già accoppiati. Chi apriva l’indirizzo leggeva soltanto «dispositivo non riconosciuto», senza un modo per diventarlo.',
      'I dati restano protetti come prima: la pagina è un’interfaccia vuota, chat e autopiloti escono solo a chi si è fatto riconoscere.'
    ]
  },
  {
    versione: '0.5.4',
    righe: [
      'SierraDeck Update chiude **tutte** le istanze aperte prima di installare: con una seconda finestra su un altro monitor, o una lasciata aperta per sbaglio, l’installer trovava i file in uso e si fermava.',
      'Chiede prima con garbo — le finestre fanno in tempo a salvare — e insiste a ogni giro; solo dopo cinque secondi chiude d’autorità chi non se n’è andato.',
      'E se non riesce a contare le istanze aspetta invece di procedere: «non lo so» deve fermare, non far partire.'
    ]
  },
  {
    versione: '0.5.3',
    righe: [
      'Il diario dell’autopilota si legge: i tentativi identici sono uniti in una riga sola con il numero delle volte, e ogni tipo di mossa ha il suo colore — le decisioni del supervisore, le verifiche corrette, le tue risposte, la preparazione.',
      'Adesso si vede anche **perché** ha deciso quello che ha deciso: prima quella riga finiva nel mucchio insieme a tutto il resto.',
      'Nelle impostazioni scegli dove mettere l’autopilota — a destra, a sinistra, sopra, sotto o in una finestra a parte — e quanto spazio prende.'
    ]
  },
  {
    versione: '0.5.2',
    righe: [
      'La fascia in alto non esce più dalla finestra: il tentativo precedente l’aveva ingrandita troppo, e i comandi finivano oltre il bordo. Ora quando lo spazio non basta scorre di lato invece di sfondare.',
      'Premendo il numero di versione tornano le novità: la finestrella che compare da sé si vede una volta, e chi la chiude per fretta non deve restare senza.',
      'Il Client si può usare anche da fuori la rete locale — una VPN, un’altra sede — con una spunta nelle impostazioni. Resta spenta di suo: con quella accesa a difendere il programma c’è solo la chiave del dispositivo.'
    ]
  },
  {
    versione: '0.5.1',
    righe: [
      'Il Client funziona: apri **Impostazioni → Client**, premi «Collega un dispositivo», e digita sul telefono le sei cifre che compaiono. Poi «Aggiungi alla schermata Home» e hai un’app — senza APK, quindi senza l’avviso di Android.',
      'Dal telefono vedi le chat aperte e gli autopiloti con il loro avanzamento, **rispondi alle domande che li tengono fermi**, mandi due parole a una chat e cambi workspace.',
      'Non può distruggere niente: non chiude chat, non elimina, non cambia cartelle. Un tocco sbagliato in tram non deve poter buttare via il lavoro della notte.',
      'Risponde solo dalla rete locale, e solo a dispositivi accoppiati. Ogni dispositivo si revoca da solo, dalle impostazioni.'
    ]
  },
  {
    versione: '0.5.0',
    righe: [
      'Gli aggiornamenti li fa **SierraDeck Update**, un programma a sé: aspetta che SierraDeck sia uscito, installa, riapre il programma e si toglie. La finestra con il logo e la percentuale adesso c’è perché a mostrarla è un eseguibile vero, non uno script lanciato da chi stava per chiudersi.',
      'L’updater si aggiorna da solo: quando cambia, viene ricostruito al primo avvio successivo — mai mentre sta lavorando.',
      'La fascia in alto è stata rifatta: comandi più grandi e leggibili, il tasto del pannello aperto si riconosce, i workspace sono diventati linguette. Stessa disposizione di prima — un’interfaccia che si riorganizza sotto le mani costringe a reimparare dove sono le cose.'
    ]
  },
  {
    versione: '0.4.5',
    righe: [
      'Il menu per spostare una chat si riempie prima di aprirsi: serviva premerlo due volte perché la richiesta partiva al clic e arrivava a menu già aperto.',
      'Le finestre si chiudono premendo fuori, tutte allo stesso modo — e si allargano tirando il bordo destro.',
      'I modelli si scelgono per nome intero: Fable 5, Opus 5, Opus 5 con contesto da 1M, Opus 4.8, Sonnet 5 e gli altri. Gli alias di famiglia restano per chi non vuole pensarci.',
      '«Riparti dopo un riavvio» è diventata una scelta del singolo autopilota, non del programma: uno che lavora tutta la notte riparte da solo, un altro che stava provando qualcosa no.',
      'Il quaderno si può guardare per la chat che scegli, senza cambiare riquadro.'
    ]
  },
  {
    versione: '0.4.4',
    righe: [
      'Le impostazioni ci sono: colore dell’interfaccia, chiarore del fondo, porte del Client e degli autopiloti, e cosa fare alla chiusura. I cambiamenti si vedono mentre li fai — scegliere un colore dovendo premere «Salva» per vederlo significa sceglierlo alla cieca.',
      'Alla chiusura non nascono più doppioni: se quelle chat, in quella disposizione, sono già salvate sotto un nome tuo, il salvataggio automatico non ne fa una copia. Il confronto guarda cosa c’è dentro, non come si chiama.',
      'Una chat con molto storico adesso mostra a che punto è mentre si apre, e dice quanto pesa la conversazione: un riquadro nero per otto secondi non si legge come «sto caricando», si legge come «è rotto».'
    ]
  },
  {
    versione: '0.4.3',
    righe: [
      'La finestra dell’aggiornamento adesso compare davvero, e resta finché serve. Non nasceva per una sola parola nel codice — `detached` —, che su Windows crea il processo senza console e fa morire PowerShell all’istante, in silenzio.',
      'E non si dà più per scontato che sia comparsa: la finestra scrive di esserci, e l’installazione parte solo dopo. Se qualcosa va storto, resta un piccolo diario da leggere invece di un’ipotesi da fare.'
    ]
  },
  {
    versione: '0.4.2',
    righe: [
      'Ogni cartella di lavoro ha il suo quaderno: schede in Markdown dentro `.sierradeck/quaderno`, una per argomento, con la più recente in cima. Si leggono e si correggono dal pannello «Quaderno», o con qualunque altro editor — restano tue anche senza SierraDeck.',
      'Quando un autopilota finisce lascia la sua scheda: obiettivo, criteri raggiunti, le mosse che contano. Domani ritrovi cosa aveva deciso senza riaprire la chat, e senza ripagare in token un contesto che si legge in dieci righe.'
    ]
  },
  {
    versione: '0.4.1',
    righe: [
      'La finestra dell’aggiornamento adesso si vede davvero, con il logo, la barra e la percentuale: veniva avviata cercando PowerShell sul PATH, che dentro l’applicazione impacchettata non è quello del terminale — e quando non partiva non lo diceva nemmeno.',
      'Una parola d’ordine, per chi la vuole: si può chiudere a chiave l’apertura del programma. Chi non la imposta non incontra nessuna richiesta. Chiude l’accesso all’interfaccia, non cifra i file, e il programma lo dice invece di lasciartelo credere.'
    ]
  },
  {
    versione: '0.4.0',
    righe: [
      'A guidare gli autopiloti adesso c’è Claude, non più un semaforo. Il supervisore è una sessione viva che a ogni giro vede il quadro intero — obiettivo, criteri, storia, uscite dei comandi, il progetto — e decide lui la mossa: proseguire con istruzioni concrete, correggere un criterio che misura la cosa sbagliata, chiedere a te, o chiudere.',
      'Le vecchie regole restano sotto come rete di sicurezza: un criterio verificabile che fallisce batte qualunque «ho finito», e senza il supervisore il lavoro non si chiude da solo in silenzio.',
      'Il supervisore ricorda: la sua sessione si riusa giro dopo giro, invece di ricostruire il compito da capo a ogni fermata.',
      'Il workspace da cui qualcuno ti sta chiedendo una risposta si accende nella fascia: prima un autopilota in attesa in un altro workspace era invisibile.'
    ]
  },
  {
    versione: '0.3.8',
    righe: [
      'L’aggiornamento andava in errore («Impossibile disinstallare i vecchi file») e l’icona riapriva la versione vecchia: da quando il programma resta acceso nell’area di notifica, i suoi file erano ancora in uso quando partiva l’installer. Ora si chiude tutto prima di installare.',
      'Gli autopiloti verificano davvero: i comandi di controllo passavano da una shell che spezzava le pipe, e criteri già soddisfatti risultavano falliti per sempre. Ora un comando che non parte viene riconosciuto per quello che è — e riparato — invece di mandare la chat a cercare un difetto che non c’è.',
      'I pannelli sono diventati finestre: compaiono al centro, si spostano prendendole per la testa, e non coprono più le chat con una banda a tutta larghezza.',
      'La barra del titolo dice versione e workspace: con più finestre aperte si capisce al volo quale è quale.',
      'Il workspace evidenziato è quello in cui ti trovi davvero: cambiandolo dalla fascia restava acceso il precedente.',
      'La fila di lampadine degli autopiloti non occupa più spazio in alto: lo stesso stato si legge di fianco e nel pannello.'
    ]
  },
  {
    versione: '0.3.7',
    righe: [
      'Gli autopiloti non hanno più un tetto di tempo: prima si spegnevano dopo sei ore anche a lavoro avviato. Un limite si può ancora mettere, ma è una scelta tua.',
      'Quando un autopilota gira a vuoto non si ferma: se ne accorge e cambia strada, provando un approccio diverso a ogni tentativo — capire l’errore, dubitare del comando di verifica, cambiare metodo, tornare a uno stato che funziona. Solo se le strade finiscono chiede a te, e riparte con la tua risposta.',
      'Nel pannello si legge quando un autopilota è bloccato e quale strada sta provando, invece di un generico «al lavoro».',
      'La finestra dell’aggiornamento non sparisce più a metà: vive per conto suo, segue davvero chiusura, installazione e riavvio, e si toglie quando la versione nuova è partita.'
    ]
  },
  {
    versione: '0.3.6',
    righe: [
      'Cambiare workspace non spegne più le chat: passare da «lavoro» a «casa» cambia cosa guardi, mentre di là gli autopiloti continuano a lavorare. Per liberare davvero le risorse c’è «Spegni», nel pannello dei workspace.',
      'I workspace ritrovano le chat che avevi lasciato: prima tornavano vuoti.',
      'Tutto viene salvato nell’istante in cui lo fai. Prima si aspettava mezzo secondo, e un blackout in quel mezzo secondo portava via l’ultima cosa fatta.',
      'Al primo avvio SierraDeck cerca Claude Code da solo, e se non c’è si offre di installarlo. Prima chi lo aveva fuori dal PATH vedeva i riquadri aprirsi vuoti, senza una spiegazione.',
      'Chiudendo la finestra il programma resta acceso in basso a destra, accanto all’orologio: gli autopiloti stanno girando, e chiudere una finestra non è dire «smetti». Dal tasto destro sull’icona si esce davvero.',
      'Aprendo una chat nuova ti si chiede dove lavorare e come chiamarla, prima di aprirla: la cartella resta legata alla chat.'
    ]
  }
]

export function novitaDi(versione: string): Novita | undefined {
  return NOVITA.find((n) => n.versione === versione)
}

/**
 * Le novità da mostrare adesso, se ce ne sono.
 *
 * Due condizioni, entrambe necessarie: che per questa versione qualcosa sia
 * stato scritto, e che non sia già stato letto. Una finestra che ricompare a
 * ogni avvio diventa un ostacolo fra l'utente e la prima chat, ed è il motivo
 * per cui si smette di leggere anche quella che conta.
 *
 * Una versione senza righe scritte non mostra niente: meglio il silenzio di una
 * finestra vuota che si apre per dire che non ha niente da dire.
 */
export function novitaDaMostrare(
  versione: string,
  ultimaVista: string | undefined
): Novita | undefined {
  if (versione === ultimaVista) return undefined
  return novitaDi(versione)
}
