import type { Autopilota } from '@shared/autopilota'

/**
 * Se sta aspettando una risposta *adesso*, mentre si prepara.
 *
 * Durante l'intervista la domanda aperta è scritta nel motivo: finché non c'è,
 * l'autopilota sta guardando il progetto per conto suo e non aspetta nessuno.
 */
function stachiedendo(a: Autopilota): boolean {
  return a.motivoSospensione !== undefined && a.motivoSospensione.trim() !== ''
}

/**
 * Il LED di un autopilota: la sua classe e cosa dice a chi ci passa sopra.
 *
 * Quattro colori e nient'altro, perché a due metri si distinguono quattro
 * colori e non otto sfumature. «Finito» si **spegne** invece di diventare
 * verde: un lavoro concluso non deve chiamare l'attenzione come uno in corso,
 * e verde ovunque significherebbe verde da nessuna parte.
 *
 * Verde vuol dire **una macchina in moto**, ambra **tocca a te**: per questo
 * chi si prepara è verde finché non ha davvero fatto una domanda. Prima era
 * ambra sempre — lampeggiava anche mentre leggeva i file per conto suo — ed è
 * il modo più rapido per insegnare a non guardare più i LED.
 */
export function ledDi(a: Autopilota): { classe: string; titolo: string } {
  const classe =
    a.stato === 'lavoro' || (a.stato === 'intervista' && !stachiedendo(a))
      ? 'led--lavoro'
      : a.stato === 'attesa' || a.stato === 'intervista'
        ? 'led--attesa'
        : a.stato === 'finito'
          ? 'led--finito'
          : 'led--fermo'

  const nome = a.nome.trim() !== '' ? a.nome : a.obiettivo
  const coda = a.motivoSospensione !== undefined && a.stato !== 'finito'
    ? ` — ${a.motivoSospensione}`
    : ''
  return { classe, titolo: `${nome}: ${a.stato}${coda}` }
}

export type Passo = {
  /** Il nome serigrafato del passo: sempre lo stesso, comunque vada. */
  nome: string
  /**
   * Dove si trova l'autopilota rispetto a questo passo.
   *
   * `fatto` è alle spalle, `davanti` non è ancora cominciato; gli altri tre
   * sono il passo che sta vivendo adesso, e dicono in che modo lo sta vivendo.
   */
  stato: 'fatto' | 'corrente' | 'attesa' | 'fermo' | 'davanti'
  /** Cosa sta succedendo qui: solo sul passo corrente, e solo se c'è. */
  nota?: string
}

const NOMI_PASSI = ['Prepara', 'Lavora', 'Fine'] as const

/**
 * Il percorso dell'autopilota, in tre passi, con l'indicazione di dov'è.
 *
 * La macchina a stati ne ha sei, ma il pannello ne raccontava due: una
 * percentuale e una riga di testo. Chi guardava non poteva sapere se «si sta
 * preparando» fosse l'inizio di tutto o l'ultimo respiro prima di finire — né,
 * davanti a un autopilota fermo, se si fosse fermato prima o dopo aver
 * lavorato. I sei stati stanno tutti qui dentro: tre passi che dicono **dove**,
 * e la forma del passo corrente che dice **come**.
 *
 * Il confine fra il primo e il secondo passo sono i criteri: finché non ci
 * sono, l'autopilota non è mai partito, e un guasto va mostrato lì — non sul
 * lavoro, che manderebbe a cercare una chat che non è mai esistita.
 */
export function passaggi(a: Autopilota): Passo[] {
  const preparato = a.criteri.length > 0
  const passi: Passo[] = NOMI_PASSI.map((nome) => ({ nome, stato: 'davanti' }))
  const segna = (i: number, stato: Passo['stato'], nota?: string): void => {
    for (let k = 0; k < i; k += 1) passi[k]!.stato = 'fatto'
    passi[i] = { nome: NOMI_PASSI[i]!, stato, ...(nota !== undefined ? { nota } : {}) }
  }

  const motivo = a.motivoSospensione
  const interventi = `${a.cicli} ${a.cicli === 1 ? 'intervento' : 'interventi'}`

  switch (a.stato) {
    case 'intervista':
      segna(0, motivo !== undefined ? 'attesa' : 'corrente', motivo ?? 'guarda il progetto')
      break
    case 'lavoro':
      segna(1, 'corrente', a.strategia !== undefined
        ? `${interventi} · prova un'altra strada: ${a.strategia}`
        : interventi)
      break
    case 'attesa':
      segna(1, 'attesa', motivo ?? 'aspetta una tua risposta')
      break
    case 'finito':
      segna(2, 'corrente', interventi)
      break
    default:
      // Sospeso o fallito: il passo dove si è fermato, che è il primo finché
      // non si è dato dei criteri.
      segna(preparato ? 1 : 0, 'fermo', motivo ?? 'fermo')
  }
  return passi
}

export type MisuraPasso = {
  /** Da 0 a 100. */
  percento: number
  /** Che cosa sta misurando: è la parola che va scritta accanto al numero. */
  di: 'preparazione' | 'criteri'
  /** Il conto esatto, quando c'è: «1 di 2». */
  dettaglio: string
  /** Il colore del numero e della barra, per stato — non per decorazione. */
  tono: 'preparazione' | 'lavoro' | 'attesa' | 'fermo'
}

/**
 * Quanti giri d'intervista può fare la preparazione prima di dover decidere.
 *
 * Lo sa il servizio (`SCAMBI_MAX` più il giro finale, quello in cui non si
 * chiede più e si conclude); qui serve per misurare, e il numero è quello.
 */
const GIRI_PREPARAZIONE = 3

/**
 * La percentuale del **passo in cui si trova**, non una sola per tutti.
 *
 * Un autopilota che si prepara non ha criteri, e misurarli dava «0%» in cima a
 * un pannello dove non era ancora andato storto niente. Ma un'attesa senza
 * misura è peggio: mentre si prepara qualcosa avanza — i giri dell'intervista —
 * ed è quello il progresso di quel momento. Il tono lo distingue: la
 * percentuale della preparazione non è dello stesso colore di quella dei
 * criteri, perché non misura la stessa cosa.
 */
export function misuraPasso(a: Autopilota): MisuraPasso {
  const tono: MisuraPasso['tono'] =
    a.stato === 'sospeso' || a.stato === 'fallito'
      ? 'fermo'
      : a.stato === 'attesa' || (a.stato === 'intervista' && stachiedendo(a))
        ? 'attesa'
        : a.criteri.length === 0 && a.stato !== 'finito'
          ? 'preparazione'
          : 'lavoro'

  // Senza criteri l'autopilota è ancora dentro la preparazione, comunque sia
  // il suo stato: è quella che va misurata, anche se si è fermata.
  if (a.criteri.length === 0 && a.stato !== 'finito') {
    const giro = Math.min(a.intervista.length + 1, GIRI_PREPARAZIONE)
    return {
      percento: Math.round((giro / GIRI_PREPARAZIONE) * 100),
      di: 'preparazione',
      dettaglio: `giro ${giro} di ${GIRI_PREPARAZIONE}`,
      tono
    }
  }

  const totali = a.criteri.length
  const fatti = a.criteri.filter((c) => c.soddisfatto).length
  if (a.stato === 'finito') {
    return { percento: 100, di: 'criteri', dettaglio: `${totali} di ${totali}`, tono: 'lavoro' }
  }
  return {
    percento: totali === 0 ? 0 : Math.round((fatti / totali) * 100),
    di: 'criteri',
    dettaglio: `${fatti} di ${totali}`,
    tono
  }
}

/**
 * Il testo con cui un autopilota compare nel pannello.
 *
 * Sta fuori dal componente perché l'errore possibile qui non è estetico: dire
 * «al lavoro» a un autopilota fermo, o nascondere il motivo di una sospensione,
 * manderebbe l'utente a cercare un'attività che non c'è.
 */
export function descriviAutopilota(a: Autopilota): {
  titolo: string
  sottotitolo: string
  avanzamento: string
} {
  const soddisfatti = a.criteri.filter((c) => c.soddisfatto).length
  // In intervista i criteri non esistono ancora: «0 su 0» misurerebbe niente.
  const avanzamento = a.criteri.length === 0
    ? '—'
    : `${soddisfatti} ${soddisfatti === 1 ? 'criterio' : 'criteri'} su ${a.criteri.length}`

  // Della flotta si parla solo quando c'è: chi governa una chat sola non deve
  // leggere «1 chat» in ogni riga.
  const attive = a.chats.filter((c) => c.stato === 'lavoro').length
  const coda = a.compitiDaFare.length
  const flotta = attive > 1 || coda > 0
    ? ` · ${attive} chat${coda > 0 ? `, ${coda} in coda` : ''}`
    : ''

  const motivo = a.motivoSospensione
  let sottotitolo: string
  switch (a.stato) {
    case 'intervista':
      sottotitolo = motivo !== undefined
        ? `si prepara — ti sta chiedendo: ${motivo}`
        : 'si prepara — sta guardando il progetto'
      break
    case 'lavoro':
      // Quando sta cercando di uscire da un cerchio va detto: dall'esterno
      // «al lavoro» e «al lavoro ma bloccato» si somigliano troppo, e la
      // differenza e' proprio quella che l'utente vuole vedere.
      sottotitolo = a.strategia !== undefined
        ? `bloccato, provo un'altra strada: ${a.strategia} — ${a.cicli} interventi${flotta}`
        : `al lavoro — ${a.cicli} interventi${flotta}`
      break
    case 'attesa':
      sottotitolo = `in attesa di una risposta${motivo !== undefined ? `: ${motivo}` : ''}`
      break
    case 'sospeso':
      // Il motivo è la parte utile: «sospeso» da solo manda a cercare altrove.
      sottotitolo = `sospeso${motivo !== undefined ? `: ${motivo}` : ''}`
      break
    case 'finito':
      // Niente motivo: quello che c'è è di una sospensione precedente, e
      // appiccicarlo a un lavoro concluso lo farebbe sembrare fallito.
      sottotitolo = `finito — ${a.cicli} interventi`
      break
    default:
      sottotitolo = `fallito${motivo !== undefined ? `: ${motivo}` : ''}`
  }

  return { titolo: a.nome.trim() !== '' ? a.nome : a.obiettivo, sottotitolo, avanzamento }
}
