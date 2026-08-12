/** Il sottoinsieme di `KeyboardEvent` che serve a decidere: niente DOM nel test. */
export type EventoTasto = {
  type: string
  key: string
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
}

/** `passa` significa: non e' roba nostra, la gestisca il terminale. */
export type AzioneAppunti = 'copia' | 'incolla' | 'passa'

/**
 * Traduce una pressione di tasti in un'operazione sugli appunti.
 *
 * Un terminale non puo' prendersi Ctrl+C senza condizioni: e' l'interruzione
 * del programma in esecuzione, e in un riquadro di Claude Code e' il gesto con
 * cui si ferma una risposta. La regola qui e' quella di Windows Terminal e di
 * VS Code: Ctrl+C copia **solo** se c'e' una selezione, altrimenti scende al
 * terminale. Ctrl+Maiusc+C e Ctrl+Ins non hanno quel conflitto e copiano
 * sempre.
 *
 * Ctrl+V invece non collide con niente: nessuna interfaccia testuale usa \x16
 * (SYN) come comando, quindi l'incolla e' incondizionato. Chi ha bisogno del
 * carattere grezzo lo ottiene ancora con Ctrl+Q, la quotazione letterale di
 * readline.
 *
 * La funzione e' pura perche' la parte difficile e' questa tabella di casi, non
 * l'accesso agli appunti — che sono due chiamate del ponte.
 */
export function decidiAzioneAppunti(e: EventoTasto, haSelezione: boolean): AzioneAppunti {
  // xterm consulta il gestore per keydown, keypress e keyup: agire su piu' di
  // uno duplicherebbe l'operazione.
  if (e.type !== 'keydown') return 'passa'
  if (e.altKey || e.metaKey) return 'passa'

  const tasto = e.key.toLowerCase()

  if (tasto === 'insert') {
    if (e.shiftKey) return 'incolla'
    if (e.ctrlKey) return haSelezione ? 'copia' : 'passa'
    return 'passa'
  }

  if (!e.ctrlKey) return 'passa'
  if (tasto === 'v') return 'incolla'
  if (tasto === 'c') return e.shiftKey || haSelezione ? 'copia' : 'passa'
  return 'passa'
}
