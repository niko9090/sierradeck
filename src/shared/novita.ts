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
    versione: '0.9.12',
    righe: [
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
