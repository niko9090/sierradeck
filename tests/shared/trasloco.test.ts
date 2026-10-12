import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { annullabile, avanzamento, ferma, motivoPassaggero, nuovoTrasloco, prossimoPasso, segna, type Trasloco } from '@shared/trasloco'

const ORA = '2026-10-12T10:00:00.000Z'
const base = (): Trasloco => nuovoTrasloco({
  id: 'trasloco-1', progetto: 'p1', nome: 'SierraDeck-prova-trasloco', verso: { pc: 'pc-qui', nome: 'PC-ESEMPIO' },
  chiesto: { da: 'pc-port', come: 'sposta' }, altrove: [{ pc: 'pc-port', nome: 'PORTATILE-ESEMPIO' }], adesso: ORA
})

/** Due traslochi d'esempio fatti dalle funzioni vere: uno fermo, uno finito. L'app li legge in TraslocoTest. */
function esempi(): Trasloco[] {
  let fermo = segna(base(), 'raccolta', { stato: 'fatto', dettaglio: '1 copia salvata sul Drive' }, ORA)
  fermo = segna(fermo, 'analisi', { stato: 'in-corso', dettaglio: 'Confronto i file di C:\\prova… 1/2', fatto: 1, totale: 2 }, ORA)
  fermo = ferma(fermo, 'analisi', 'PORTATILE-ESEMPIO non risponde', true, ORA)
  let fatto: Trasloco = { ...base(), id: 'trasloco-2' }
  for (const p of ['raccolta', 'analisi', 'unione', 'vecchie', 'fine'] as const) fatto = segna(fatto, p, { stato: 'fatto', dettaglio: `fatto ${p}` }, ORA)
  fatto = { ...fatto, unione: 'unione-1', altrove: [{ pc: 'pc-port', nome: 'PORTATILE-ESEMPIO', salvata: true, esito: 'nel-recupero' }], riassunto: ['Resta la cartella C:\\prova.', '«Annulla tutto» rimette com’era per 30 giorni.'], finitoIl: ORA, scadeIl: '2026-11-11T10:00:00.000Z' }
  return [fermo, fatto]
}

describe('le regole del trasloco', () => {
  it('i passi in ordine: il prossimo è il primo non fatto; l’avanzamento conta i fatti e la frazione di quello in corso', () => {
    let t = base()
    expect(prossimoPasso(t)).toBe('raccolta')
    t = segna(t, 'raccolta', { stato: 'fatto' }, ORA)
    t = segna(t, 'analisi', { stato: 'in-corso', fatto: 1, totale: 2, dettaglio: 'Confronto i file… 1/2' }, ORA)
    expect(prossimoPasso(t)).toBe('analisi')
    const a = avanzamento(t)
    expect(a).toMatchObject({ fatti: 1, totale: 5, percento: 30, attuale: { id: 'analisi', titolo: 'Confronto i file', dettaglio: 'Confronto i file… 1/2' } })
  })

  it('fermo con il motivo: il passo resta da rifare; un passo che riparte toglie il fermo', () => {
    const f = ferma(base(), 'raccolta', 'PORTATILE-ESEMPIO non risponde', true, ORA)
    expect(f.fermo).toMatchObject({ passo: 'raccolta', riprovaDaSolo: true })
    expect(prossimoPasso(f)).toBe('raccolta')
    expect(segna(f, 'raccolta', { stato: 'in-corso' }, ORA).fermo).toBeUndefined()
  })

  it('i motivi che passano da soli: un PC che non risponde, un lavoro del Drive in corso, una cartella in uso', () => {
    expect(motivoPassaggero('PORTATILE-ESEMPIO non risponde (timeout)')).toBe(true)
    expect(motivoPassaggero('LAVORO_IN_CORSO: sul Drive sta gia\' girando «Salvo sul Drive»')).toBe(true)
    expect(motivoPassaggero('Non la tolgo adesso: la chat «x» è aperta su questa cartella. Aspetto che finisca.')).toBe(true)
    expect(motivoPassaggero('ha più di 50000 file: non lo confronto')).toBe(false)
  })

  it('«Annulla tutto» solo se c’è qualcosa da rimettere, finché non è annullato, entro i 30 giorni', () => {
    const [fermo, fatto] = esempi() as [Trasloco, Trasloco]
    expect(annullabile(fermo, Date.parse(ORA))).toBe(false)
    expect(annullabile(fatto, Date.parse(ORA))).toBe(true)
    expect(annullabile(fatto, Date.parse('2026-12-01T00:00:00Z'))).toBe(false)
    expect(annullabile({ ...fatto, annullatoIl: ORA }, Date.parse(ORA))).toBe(false)
  })

  it('gli esempi sono quelli che l’app legge nei suoi test', () => {
    const file = join(__dirname, '..', '..', 'android', 'app', 'src', 'test', 'resources', 'trasloco', 'trasloco-0.65.json')
    const atteso = `${JSON.stringify(esempi(), null, 2)}\n`
    if (process.env.AGGIORNA === '1' || !existsSync(file)) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, atteso) }
    expect(readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).toBe(atteso)
    // Le percentuali che l'app deve ritrovare.
    expect(esempi().map((t) => avanzamento(t).percento)).toEqual([20, 100])
  })
})
