import { describe, it, expect } from 'vitest'
import { riconsegnaCodaCeduta, consegnaDallaCoda, TENTATIVI_FINESTRA, type CodaCeduta, type ConsegnaDallaCoda } from '../../src/main/coda-ceduta'
import { esitoDaPasso } from '../../src/shared/istruzioni-autopilota'

/**
 * 13/10: una chat dell'autopilota in sottofondo con un'istruzione in coda
 * (c-14) è tornata in un riquadro perché la finestra è tornata nel suo
 * workspace. Il registro diceva «1 testi ancora in coda: restano a te», e
 * nessuno l'ha più scritta. Adesso i testi vanno alla finestra con l'id del
 * servizio, o tornano indietro: mai persi.
 */
const ceduta: CodaCeduta = {
  sessione: '11111111-2222-4333-8444-555555555555', cwd: 'C:\Progetti\Prova', titolo: 'Prova',
  coda: [{ id: 'ap-c-14-mkkvrs', testo: 'Leggi ed esegui le istruzioni in .sierradeck/consegne/c-14.md' }],
  autopilota: { id: 'ap-prova', chat: 'ap-prova' }, workspace: 'Prova'
}

function giro(finestraDopo: number | undefined, sottofondoOk = true) {
  const mandate: ConsegnaDallaCoda[] = []
  const rimesse: string[] = []
  const tornate: string[] = []
  const log: string[] = []
  let tentativi = 0
  const attese: (() => void)[] = []
  riconsegnaCodaCeduta(ceduta, {
    finestraCon: () => {
      tentativi += 1
      return finestraDopo !== undefined && tentativi > finestraDopo ? (c) => { mandate.push(c) } : undefined
    },
    rimettiInSottofondo: (_c, t) => { rimesse.push(t.id); return sottofondoOk },
    nonConsegnata: (id) => { tornate.push(id) },
    log: (m) => { log.push(m) },
    dopo: (_ms, f) => { attese.push(f) }
  })
  while (attese.length > 0) attese.shift()!()
  return { mandate, rimesse, tornate, log, tentativi }
}

describe('i testi in coda quando la chat esce dal sottofondo', () => {
  it('vanno alla finestra che mostra la chat, con l’id della consegna del servizio', () => {
    const r = giro(0)
    expect(r.mandate).toHaveLength(1)
    expect(r.mandate[0]).toMatchObject({ id: 'c-14', cosa: 'scrivi', sessionId: ceduta.sessione, autopilotaId: 'ap-prova', testo: ceduta.coda[0]!.testo, workspace: 'Prova' })
    expect(r.rimesse).toEqual([])
    expect(r.tornate).toEqual([])
  })

  it('il «partita» della finestra arriva al servizio con l’id che il servizio conosce', () => {
    const c = consegnaDallaCoda(ceduta, ceduta.coda[0]!)!
    expect(esitoDaPasso(`consegna ${c.id}: partita`)).toEqual({ consegna: 'c-14', esito: 'partita' })
  })

  it('aspetta la finestra che si riaggancia (fino a un minuto)', () => {
    const r = giro(5)
    expect(r.mandate.map((x) => x.id)).toEqual(['c-14'])
    expect(r.tentativi).toBe(6)
  })

  it('nessuna finestra dopo un minuto: di nuovo in sottofondo', () => {
    const r = giro(undefined)
    expect(r.tentativi).toBe(TENTATIVI_FINESTRA + 1)
    expect(r.mandate).toEqual([])
    expect(r.rimesse).toEqual(['ap-c-14-mkkvrs'])
    expect(r.tornate).toEqual([])
  })

  it('né finestra né sottofondo: torna nella coda dell’autopilota, mai segnata consegnata', () => {
    const r = giro(undefined, false)
    expect(r.tornate).toEqual(['c-14'])
    expect(r.log.join('\n')).toContain('consegna c-14: non consegnata')
  })

  it('una chat senza autopilota o con la coda vuota non fa niente', () => {
    const mandate: unknown[] = []
    riconsegnaCodaCeduta({ ...ceduta, coda: [] }, { finestraCon: () => (c) => { mandate.push(c) }, rimettiInSottofondo: () => true, nonConsegnata: () => {}, log: () => {}, dopo: () => {} })
    const { autopilota: _a, ...senza } = ceduta
    riconsegnaCodaCeduta(senza, { finestraCon: () => (c) => { mandate.push(c) }, rimettiInSottofondo: () => true, nonConsegnata: () => {}, log: () => {}, dopo: () => {} })
    expect(mandate).toEqual([])
  })
})
