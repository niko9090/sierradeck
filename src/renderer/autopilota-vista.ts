import type { Autopilota } from '@shared/autopilota'

/**
 * Il LED di un autopilota: la sua classe e cosa dice a chi ci passa sopra.
 *
 * Quattro colori e nient'altro, perché a due metri si distinguono quattro
 * colori e non otto sfumature. «Finito» si **spegne** invece di diventare
 * verde: un lavoro concluso non deve chiamare l'attenzione come uno in corso,
 * e verde ovunque significherebbe verde da nessuna parte.
 */
export function ledDi(a: Autopilota): { classe: string; titolo: string } {
  const classe =
    a.stato === 'lavoro'
      ? 'led--lavoro'
      // Chi si prepara sta aspettando una risposta come chi e' in attesa: e'
      // la stessa cosa per l'utente, e il colore deve dire quella.
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
