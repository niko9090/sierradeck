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
