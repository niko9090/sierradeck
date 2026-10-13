import type { Autopilota } from '@shared/autopilota'
import type { EsitoVerifica } from './decisione'
import type { Git } from './worktree'

/**
 * I fatti che il programma verifica prima che il supervisore decida (0.71.0).
 *
 * Il supervisore leggeva soprattutto quello che la chat diceva di aver fatto.
 * Adesso riceve, in una sezione sua e prima di tutto il resto, quello che il
 * programma ha controllato da solo: lo stato git della cartella della chat, gli
 * ultimi commit, gli esiti dei criteri con l'ora della misura, le ultime mosse
 * del registro. Con l'istruzione esplicita: questi valgono più delle parole.
 * Tutto in pochi KB, per non gonfiare il prompt.
 */

const RIGHE_STATO = 15
const FATTI_MAX = 2500

export function fattiVerificati(p: {
  git: Git | undefined
  cartella: string
  esiti: EsitoVerifica[]
  decisioni: Autopilota['decisioni']
  adesso: string
}): string {
  const righe: string[] = ['## Fatti verificati dal programma adesso (valgono più di quello che scrive la chat)']
  if (p.git !== undefined) {
    const stato = p.git(['status', '--porcelain'], p.cartella)
    if (stato.codice === 0) {
      const cambiati = stato.uscita.split(/\r?\n/).filter((r) => r.trim() !== '')
      righe.push(cambiati.length === 0
        ? `- git: nessun file cambiato e non salvato in ${p.cartella}`
        : `- git: ${cambiati.length} file cambiati e non salvati: ${cambiati.slice(0, RIGHE_STATO).map((r) => r.trim()).join('; ')}${cambiati.length > RIGHE_STATO ? ' …' : ''}`)
      const log = p.git(['log', '-5', '--oneline'], p.cartella)
      if (log.codice === 0 && log.uscita !== '') righe.push(`- ultimi commit: ${log.uscita.split(/\r?\n/).slice(0, 5).join(' | ')}`)
    } else {
      righe.push('- git: la cartella non è un repository git (niente commit da verificare)')
    }
  }
  if (p.esiti.length > 0) {
    const ora = p.adesso.slice(11, 16)
    righe.push(`- criteri misurati (${ora} UTC): ${p.esiti.map((e) => `«${e.descrizione}» ${e.passato ? 'passa' : e.misurato === false ? 'non misurabile' : 'non passa'}${e.rimandatoDal !== undefined ? ` (esito delle ${e.rimandatoDal.slice(11, 16)})` : ''}`).join('; ')}`)
  }
  const ultime = p.decisioni.slice(-5)
  if (ultime.length > 0) righe.push(`- registro, ultime mosse: ${ultime.map((d) => `${d.quando.slice(11, 16)} ${d.cosa.slice(0, 120)}`).join(' | ')}`)
  righe.push('Se la chat dice di aver fatto una cosa che qui non risulta (nessun commit, file non cambiati, criteri rossi), credi a questi fatti e diglielo.')
  const testo = righe.join('\n')
  return testo.length > FATTI_MAX ? `${testo.slice(0, FATTI_MAX)}…` : testo
}
