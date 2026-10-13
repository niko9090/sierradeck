import type { StatoVoce } from './negozio'
import { stato, type StatoVista } from './stato-vista'

/**
 * Il Negozio riprogettato (0.70.0): ogni voce con UNA parola e un colore.
 * Prima le etichette erano lunghe e quasi tutte grigie («aggiornamento
 * disponibile», «da installare», «solo a mano»), e ogni scheda ripeteva la sua
 * spiegazione: su tremila plugin, cinque voci per schermo. La spiegazione resta,
 * dietro il «?»; la sfumatura va in `ragione`.
 */
export function parolaNegozio(s: StatoVoce | undefined, inCorso = false): StatoVista | undefined {
  if (inCorso) return stato('in-corso', 'in corso', 'blu')
  if (s === undefined) return undefined
  const e = s.etichetta
  if (s.tono === 'errore' || e === 'errore') return stato('guasto', 'guasto', 'rosso', e)
  if (e === 'da approvare') return stato('approva', 'approva', 'ambra', e)
  if (e === 'da autenticare') return stato('accedi', 'accedi', 'ambra', e)
  if (e === 'aggiornamento disponibile') return stato('aggiorna', 'aggiorna', 'ambra', e)
  if (e === 'da installare') return stato('disponibile', 'disponibile', 'quieto', e)
  if (s.tono === 'ok' || s.tono === 'attesa') return stato('attivo', 'attivo', 'verde', e)
  return stato('spento', 'spento', 'quieto', e)
}

/** Va guardato: guasto, da approvare, da autenticare, da aggiornare. */
export function daSistemare(s: StatoVoce | undefined): boolean {
  const p = parolaNegozio(s)
  return p !== undefined && (p.colore === 'rosso' || p.colore === 'ambra')
}
