import { attesaPerCasaIgnota, decidiApertura, type Apertura, type DatiApertura } from '@shared/apertura-chat'
import type { BattitoPc } from '@shared/posta'
import type { StatoPc } from '@shared/scoperta-pc'

/**
 * Da dove aprire una chat (`chat:daDove`), con le sue dipendenze iniettate
 * perche' si possa provare senza Electron.
 *
 * La regola (k-58): una chat che vive su un altro PC si guarda dal vivo da qui
 * se quel PC e' acceso e raggiungibile. Un guasto nel capire come sta quel PC
 * (il bussare che cade, un battito illeggibile) non butta la chat in «locale»,
 * che per una chat di casa altrove vuol dire un cartello senza uscita: diventa
 * un'attesa che riprova da sola.
 */
export type DipendenzeDaDove = {
  io: () => string
  cartellaQui: (cwd: string) => boolean
  trascrizioneQui: (cwd: string, sessione: string) => boolean
  /** Di chi e' la cartella quando qui non c'e' (battiti, registro, Drive). */
  cartellaDi: (cwd: string) => { id: string; nome: string } | undefined
  /** Il PC che tiene il progetto di questa cartella, se non e' questo. */
  proprietario: (cwd: string) => { id: string; nome: string; progetto: string } | undefined
  /** Il progetto di questa cartella e' di questo PC. */
  casaQui: (cwd: string, io: string) => boolean
  battiti: () => BattitoPc[]
  adesso: () => number
  /** Bussa a quel PC e dice com'e'. */
  statoDi: (pcId: string, nome: string) => Promise<StatoPc>
}

export async function rispondiDaDove(deps: DipendenzeDaDove, p: unknown): Promise<Apertura> {
  const q = (p ?? {}) as { cwd?: unknown; sessionUuid?: unknown }
  if (typeof q.cwd !== 'string' || q.cwd === '') return { tipo: 'locale' }
  const cwd = q.cwd
  const sessione = typeof q.sessionUuid === 'string' && q.sessionUuid !== '' ? q.sessionUuid : undefined
  let casa: { id: string; nome: string; motivo: string } | undefined
  try {
    const io = deps.io()
    const cartellaQui = deps.cartellaQui(cwd)
    const trascrizioneQui = sessione !== undefined && deps.trascrizioneQui(cwd, sessione)
    const di = cartellaQui ? undefined : deps.cartellaDi(cwd)
    // Il PC del progetto prima di tutto (0.88.0): un progetto, un PC.
    const prop = deps.proprietario(cwd)
    casa = prop !== undefined ? { id: prop.id, nome: prop.nome, motivo: `«${prop.progetto}» vive là` } : undefined
    const dati: DatiApertura = {
      ...(sessione !== undefined ? { sessione } : {}),
      ...(casa !== undefined ? { casa } : {}),
      ...(deps.casaQui(cwd, io) ? { casaQui: true } : {}),
      cwd,
      io,
      trascrizioneQui,
      cartellaQui,
      ...(di !== undefined ? { cartellaDi: di } : {}),
      battiti: deps.battiti(),
      adesso: deps.adesso()
    }
    const prima = decidiApertura(dati)
    if (prima.tipo !== 'attesa' || prima.pc.id === '') return prima
    // Il battito e' vecchio (con il Drive scollegato lo e' sempre): prima
    // di dire «in attesa» si bussa direttamente a quel PC (0.39.3). Se
    // risponde e' acceso, e la chat si apre dal vivo.
    const stato = await deps.statoDi(prima.pc.id, prima.pc.nome).catch((): StatoPc => ({
      stato: 'non-so', titolo: `non so se ${prima.pc.nome} è acceso`, cosaFare: 'Riprovo da solo fra poco.'
    }))
    return decidiApertura({
      ...dati,
      rispondono: stato.stato === 'acceso' ? [prima.pc.id] : [],
      statiPc: { [prima.pc.id]: stato }
    })
  } catch {
    // Con la casa su un altro PC «locale» non e' una risposta: si aspetta.
    if (casa !== undefined && sessione !== undefined && casa.id !== '') {
      return attesaPerCasaIgnota({ cwd, pc: { id: casa.id, nome: casa.nome }, sessionUuid: sessione, perche: `la sua casa è ${casa.nome}` })
    }
    return { tipo: 'locale' }
  }
}
