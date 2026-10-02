import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  ISTRUZIONI_MAX, aggiungiIstruzione, esitoDaPasso, istruzioniRecenti, leggiIstruzioni, notaCorreggi, nuovaIstruzione, percheRecente,
  segnaEsito, testoEsito
} from '@shared/istruzioni-autopilota'
import { apriRegistroIstruzioni } from '../../src/autopilot-host/istruzioni'
import { creaConsegne } from '../../src/autopilot-host/consegne'

/**
 * 0.41.0, la linguetta «Istruzioni». Nicholas (02/10): «nella chat adesso
 * vedo solo: Leggi ed esegui le istruzioni in .sierradeck/consegne/c-5.md».
 * Il testo intero si salva nel servizio quando l'autopilota lo decide, con il
 * perché e l'esito; i file c-N.md si puliscono dopo sette giorni.
 */
const ISTR_LUNGA = '# Tappa 1\n\nFai **prima** i test.\n' + 'riga lunga '.repeat(500)

describe('le istruzioni, pure', () => {
  it('si salva il testo intero, con chat e perché; esito iniziale «in coda»', () => {
    const i = nuovaIstruzione({ consegna: 'c-5', autopilotaId: 'ap', chatId: 'ap', titolo: 'Trading', testo: ISTR_LUNGA, cosa: 'scrivi', perche: ' i test falliscono ' }, '2026-10-02T12:00:00.000Z')
    expect(i.testo).toBe(ISTR_LUNGA)
    expect(i.perche).toBe('i test falliscono')
    expect(i.esito).toBe('in-coda')
    expect(i.id).toBe('c-5@2026-10-02T12:00:00.000Z')
  })
  it('l’esito va avanti e non torna indietro; «non partita» può ancora diventare «partita»', () => {
    let l = [nuovaIstruzione({ consegna: 'c-1', autopilotaId: 'ap', chatId: 'ap', titolo: 't', testo: 'x', cosa: 'scrivi' }, '2026-10-02T12:00:00.000Z')]
    l = segnaEsito(l, 'c-1', 'consegnata', 'a')
    l = segnaEsito(l, 'c-1', 'non-partita', 'b')
    expect(l[0]?.esito).toBe('non-partita')
    l = segnaEsito(l, 'c-1', 'partita', 'c')
    expect(l[0]?.esito).toBe('partita')
    // Una conferma in ritardo non la riporta indietro; «persa» solo da «in coda».
    expect(segnaEsito(l, 'c-1', 'consegnata', 'd')[0]?.esito).toBe('partita')
    expect(segnaEsito(l, 'c-1', 'persa', 'd')[0]?.esito).toBe('partita')
    expect(segnaEsito(l, 'c-9', 'partita', 'd')).toBe(l)
  })
  it('lo stesso id di consegna dopo un riavvio del servizio: l’esito va alla più recente', () => {
    let l = [
      nuovaIstruzione({ consegna: 'c-1', autopilotaId: 'ap', chatId: 'ap', titolo: 't', testo: 'vecchia', cosa: 'scrivi' }, '2026-10-01T12:00:00.000Z'),
      nuovaIstruzione({ consegna: 'c-1', autopilotaId: 'ap', chatId: 'ap', titolo: 't', testo: 'nuova', cosa: 'scrivi' }, '2026-10-02T12:00:00.000Z')
    ]
    l = segnaEsito(l, 'c-1', 'partita', 'x')
    expect(l.map((i) => i.esito)).toEqual(['in-coda', 'partita'])
    expect(istruzioniRecenti(l)[0]?.testo).toBe('nuova')
  })
  it('si tengono le ultime', () => {
    let l: ReturnType<typeof nuovaIstruzione>[] = []
    for (let k = 0; k < ISTRUZIONI_MAX + 5; k += 1) l = aggiungiIstruzione(l, nuovaIstruzione({ consegna: `c-${k}`, autopilotaId: 'ap', chatId: 'ap', titolo: 't', testo: 'x', cosa: 'scrivi' }, `2026-10-02T12:00:${String(k % 60).padStart(2, '0')}.000Z`))
    expect(l).toHaveLength(ISTRUZIONI_MAX)
    expect(l[0]?.consegna).toBe('c-5')
  })
  it('dai passi del PC all’esito: solo «partita» e «non partita»', () => {
    expect(esitoDaPasso('consegna c-12: partita')).toEqual({ consegna: 'c-12', esito: 'partita' })
    expect(esitoDaPasso('consegna c-12: non partita (il testo è ancora nel campo)')).toEqual({ consegna: 'c-12', esito: 'non-partita' })
    expect(esitoDaPasso('consegna c-12: invio 1')).toBeUndefined()
  })
  it('il perché è l’ultima decisione, se è di poco prima', () => {
    const a = { decisioni: [{ quando: '2026-10-02T11:59:00.000Z', cosa: 'supervisore → prosegui: manca il test del login' }] }
    expect(percheRecente(a, '2026-10-02T12:00:00.000Z')).toContain('manca il test del login')
    expect(percheRecente(a, '2026-10-02T12:30:00.000Z')).toBeUndefined()
    expect(percheRecente({ decisioni: [] }, '2026-10-02T12:00:00.000Z')).toBeUndefined()
  })
  it('«Correggi»: la nota dice a quale istruzione si riferisce', () => {
    const i = nuovaIstruzione({ consegna: 'c-5', autopilotaId: 'ap', chatId: 'ap', titolo: 'Trading', testo: ISTR_LUNGA, cosa: 'scrivi' }, '2026-10-02T12:00:00.000Z')
    const n = notaCorreggi(i, '  non toccare il database  ')
    expect(n).toContain('alla chat «Trading»')
    expect(n).toContain('# Tappa 1 Fai **prima** i test.')
    expect(n.endsWith('non toccare il database')).toBe(true)
    expect(n.length).toBeLessThan(400)
  })
  it('l’esito in parole', () => {
    expect(testoEsito('persa').tono).toBe('guasto')
    expect(testoEsito('partita').breve).toBe('partita')
  })
  it('da fuori si tiene solo quello che ha la forma giusta', () => {
    expect(leggiIstruzioni({ istruzioni: [{ id: 'a', quando: 'q', testo: 't', esito: 'boh' }, { id: 3 }] })).toEqual([
      { id: 'a', consegna: '', autopilotaId: '', quando: 'q', chatId: '', chatTitolo: '', testo: 't', esito: 'in-coda', cosa: 'scrivi' }
    ])
  })
})

describe('il servizio le salva al momento della consegna', () => {
  it('la coda delle consegne avvisa il registro: messa, confermata, persa', () => {
    let ora = '2026-10-02T12:00:00.000Z'
    const registro = apriRegistroIstruzioni(mkdtempSync(join(tmpdir(), 'istr-')), () => ora)
    const coda = creaConsegne({ messa: (c) => registro.registra(c), confermata: (id) => registro.esito(id, 'consegnata'), persa: (id) => registro.esito(id, 'persa') })
    const c = coda.metti({ autopilotaId: 'ap1', chatId: 'ap1', cwd: 'C:\\p', sessionId: 's', titolo: 'Trading', cosa: 'scrivi', testo: ISTR_LUNGA, perche: 'la chat ha chiesto quale database' })
    expect(registro.elenca('ap1')).toMatchObject([{ testo: ISTR_LUNGA, esito: 'in-coda', perche: 'la chat ha chiesto quale database', chatTitolo: 'Trading' }])
    coda.ritira()
    ora = '2026-10-02T12:00:05.000Z'
    coda.conferma([c.id])
    expect(registro.elenca('ap1')[0]?.esito).toBe('consegnata')
    registro.esito(c.id, 'partita')
    expect(registro.elenca('ap1')[0]).toMatchObject({ esito: 'partita', esitoIl: '2026-10-02T12:00:05.000Z' })
    // Un id non valido non diventa un percorso.
    expect(registro.elenca('../x')).toEqual([])
  })
})
