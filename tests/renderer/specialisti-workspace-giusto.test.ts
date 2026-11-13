import { describe, it, expect } from 'vitest'
import { specialistiInVista } from '../../src/renderer/components/ChatSpecialisti'
import { creaLettoreAutopilotaRemoto, type Stato } from '../../src/renderer/components/ChatAutopilotaRemota'
import { creaSondaggio, valoreDelSondaggio, type LettoDa, type Sondaggio } from '../../src/renderer/state/sondaggio'
import type { VistaOrchestratore } from '@shared/piano-orchestratore'
import type { EsitoAzione } from '@shared/autopilota-remoto'
import type { AutopilotaRiga } from '@shared/autopiloti-altri'

/**
 * 13/11, Nicholas: «ho aperto una chat remota e nella parte a destra con gli
 * agenti c'era quello giusto e anche uno di un altro workspace». Gli
 * specialisti del workspace B non devono mai comparire nella colonna di A,
 * né qui né da un altro PC.
 */

const ORA = Date.parse('2026-11-13T12:00:00Z')
const vista = (workspace: string, ids: string[]): VistaOrchestratore => ({
  workspace,
  specialisti: ids.map((id) => ({ id, ruolo: 'sviluppatore', compito: `lavoro di ${workspace}`, stato: 'lavoro' }))
} as unknown as VistaOrchestratore)

describe('la colonna degli specialisti di un workspace', () => {
  it('mostra quelli del suo workspace', () => {
    expect(specialistiInVista(vista('Alfa', ['a1']), ORA, 'Alfa').map((s) => s.id)).toEqual(['a1'])
    // Spazi ai lati del nome: il servizio li toglie, la colonna non si confonde.
    expect(specialistiInVista(vista('Alfa', ['a1']), ORA, ' Alfa ').map((s) => s.id)).toEqual(['a1'])
  })
  it('una vista di un altro workspace non dà niente', () => {
    expect(specialistiInVista(vista('Beta', ['b1']), ORA, 'Alfa')).toEqual([])
  })
  it('senza workspace (chi la chiamava prima) resta com’era', () => {
    expect(specialistiInVista(vista('Beta', ['b1']), ORA).map((s) => s.id)).toEqual(['b1'])
  })
})

describe('il valore tenuto quando si cambia workspace (o PC)', () => {
  const sondaggioFisso = <T,>(v: T): Sondaggio<T> => creaSondaggio(() => Promise.resolve(v), 60_000, Infinity)

  it('quello letto per B non vale per A finché A non risponde', () => {
    const b = sondaggioFisso(vista('Beta', ['b1']))
    const a = sondaggioFisso(vista('Alfa', ['a1']))
    const tenuto: LettoDa<VistaOrchestratore> = { da: b, v: vista('Beta', ['b1']) }
    // Prima si vedevano gli specialisti di B nella colonna di A.
    expect(valoreDelSondaggio(tenuto, a)).toBeUndefined()
    expect(specialistiInVista(valoreDelSondaggio(tenuto, a), ORA, 'Alfa')).toEqual([])
    expect(valoreDelSondaggio(tenuto, b)?.workspace).toBe('Beta')
  })

  it('se A ha già un valore, si usa subito quello di A', async () => {
    const a = sondaggioFisso(vista('Alfa', ['a1']))
    const b = sondaggioFisso(vista('Beta', ['b1']))
    const smetti = a.ascolta(() => undefined)
    await new Promise((r) => setTimeout(r, 0))
    smetti()
    const tenuto: LettoDa<VistaOrchestratore> = { da: b, v: vista('Beta', ['b1']) }
    expect(valoreDelSondaggio(tenuto, a)?.workspace).toBe('Alfa')
  })
})

/** Una promessa da chiudere a mano: la rete che risponde quando vogliamo noi. */
function aMano<T>(): { p: Promise<T>; chiudi: (v: T) => void } {
  let chiudi!: (v: T) => void
  const p = new Promise<T>((r) => { chiudi = r })
  return { p, chiudi }
}

describe('la chat remota: una lettura vecchia non scrive il workspace nuovo', () => {
  const righe = [
    { id: 'ap-alfa', workspace: 'Alfa', nome: 'Alfa', stato: 'lavoro' },
    { id: 'ap-beta', workspace: 'Beta', nome: 'Beta', stato: 'lavoro' }
  ] as unknown as AutopilotaRiga[]

  it('cambio da B ad A mentre la lettura di B è in viaggio: resta A', async () => {
    const elenchi: { chiudi: (v: { autopiloti: AutopilotaRiga[] }) => void }[] = []
    const chiesti: string[] = []
    let stato: Stato = { giu: false }
    const lettore = creaLettoreAutopilotaRemoto({
      elenco: () => { const m = aMano<{ autopiloti: AutopilotaRiga[] }>(); elenchi.push(m); return m.p },
      azione: () => async (_percorso, corpo): Promise<EsitoAzione> => {
        const id = String(corpo.autopilota)
        chiesti.push(id)
        return { ok: true, dati: { id, workspace: id === 'ap-alfa' ? 'Alfa' : 'Beta', nome: id } }
      },
      metti: (f) => { stato = f(stato) }
    })
    lettore.punta('pc-1', 'Beta')
    const vecchia = lettore.leggi()
    // Si passa ad A prima che il PC risponda per B.
    lettore.punta('pc-1', 'Alfa')
    const nuova = lettore.leggi()
    // La lettura nuova parte comunque: quella vecchia non la tiene ferma.
    expect(elenchi).toHaveLength(2)
    elenchi[1]!.chiudi({ autopiloti: righe })
    await nuova
    elenchi[0]!.chiudi({ autopiloti: righe })
    await vecchia
    expect(stato.autopilota?.id).toBe('ap-alfa')
    // E al giro dopo si chiede ancora quello di A, mai quello di B.
    await lettore.leggi()
    expect(chiesti).toEqual(['ap-alfa', 'ap-alfa'])
    expect(stato.autopilota?.id).toBe('ap-alfa')
  })

  it('un autopilota tornato con un altro workspace non passa', async () => {
    let stato: Stato = { giu: false }
    const lettore = creaLettoreAutopilotaRemoto({
      elenco: async () => ({ autopiloti: righe }),
      azione: () => async (): Promise<EsitoAzione> => ({ ok: true, dati: { id: 'ap-alfa', workspace: 'Beta', nome: 'x' } }),
      metti: (f) => { stato = f(stato) }
    })
    lettore.punta('pc-1', 'Alfa')
    await lettore.leggi()
    expect(stato.autopilota).toBeUndefined()
  })

  it('dopo la chiusura (punta a niente) una risposta in viaggio non scrive', async () => {
    let stato: Stato = { giu: false }
    const m = aMano<{ autopiloti: AutopilotaRiga[] }>()
    const lettore = creaLettoreAutopilotaRemoto({
      elenco: () => m.p,
      azione: () => async (): Promise<EsitoAzione> => ({ ok: true, dati: { id: 'ap-beta', workspace: 'Beta', nome: 'x' } }),
      metti: (f) => { stato = f(stato) }
    })
    lettore.punta('pc-1', 'Beta')
    const p = lettore.leggi()
    lettore.punta(undefined, '')
    m.chiudi({ autopiloti: righe })
    await p
    expect(stato).toEqual({ giu: false })
  })
})
