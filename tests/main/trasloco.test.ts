import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaTrasloco, type DipendenzeTrasloco } from '../../src/main/trasloco'
import { avanzamento, prossimoPasso } from '@shared/trasloco'
import type { StatoResidenza } from '@shared/residenza'

/**
 * Il trasloco (0.65.0) con un PC finto dall'altra parte: il portatile ha la
 * copia vecchia del progetto «SierraDeck-prova-trasloco», questo PC diventa
 * il residente.
 */
function banco(opz: { portatileSpento?: () => boolean; dati?: string } = {}) {
  const dati = opz.dati ?? mkdtempSync(join(tmpdir(), 'trasloco-'))
  const chiamate: string[] = []
  const righe: string[] = []
  let statiRes: StatoResidenza[] = []
  let togli = 'nessuno'
  let ripristinata = false
  const casa: string[] = []
  const riassunto = {
    nome: 'SierraDeck-prova-trasloco', pcNome: 'PC-ESEMPIO', destinazione: 'C:\\prova', nuova: false, git: false, copie: [],
    file: { uguali: 10, aggiunti: 3, sostituiti: 1, recuperati: 2, note: 0 }, chat: { daSpostare: 0, delProgetto: 5, daAltriPc: 2 },
    workspace: { tiene: 'SierraDeck-prova-trasloco', uniti: [], aperti: [] }, registro: { principale: 'p1', uniti: [] }, recupero: [], inUso: [], recuperati: '.sierradeck/recuperati/x', righe: ['Resta la cartella C:\\prova.']
  }
  const d: DipendenzeTrasloco = {
    dati,
    io: () => ({ id: 'pc-qui', nome: 'PC-ESEMPIO' }),
    progetto: async (id) => (id === 'p1' ? { id: 'p1', nome: 'SierraDeck-prova-trasloco', ids: ['p1'], altrove: [{ pc: 'pc-port', nome: 'PORTATILE-ESEMPIO' }], residente: { pc: 'pc-port', nome: 'PORTATILE-ESEMPIO' } } : undefined),
    residenza: {
      avvia: async (progetto, avanza) => {
        avanza?.('Confronto i file di C:\\prova', 1, 2)
        avanza?.('Confronto i file della copia sul Drive', 2, 2)
        const s: StatoResidenza = { progetto, nome: 'SierraDeck-prova-trasloco', fase: 'attesa-conferma', messaggio: 'riassunto', riassunto, quando: '' }
        statiRes = [s]
        return s
      },
      conferma: async (progetto) => {
        const s: StatoResidenza = { progetto, nome: 'SierraDeck-prova-trasloco', fase: 'fatta', messaggio: 'Unione fatta.', quando: '', unione: 'unione-1' }
        statiRes = [s]
        return s
      },
      stati: () => statiRes,
      annullaUnione: async () => ({ ok: true, messaggio: 'unione annullata' })
    },
    chiamaPc: async (pc, percorso) => {
      chiamate.push(`${pc} ${percorso}`)
      if (opz.portatileSpento?.() === true) throw new Error('PORTATILE-ESEMPIO non risponde')
      if (percorso === '/api/trasloco/salva') return { ok: true }
      if (percorso === '/api/trasloco/togli') { togli = 'analisi'; return { ok: true } }
      if (percorso === '/api/trasloco/togli-stato') {
        if (togli === 'analisi') { togli = 'recupero'; return { fase: 'analisi', messaggio: 'Elenco i file…' } }
        if (togli === 'recupero') { togli = 'spostata'; return { fase: 'recupero', messaggio: 'Copio qui quello che c’è solo là…' } }
        return { fase: 'spostata', messaggio: 'Tolto da questo PC.' }
      }
      if (percorso === '/api/trasloco/ripristina') { ripristinata = true; return { ok: true, messaggio: 'copia rimessa al suo posto' } }
      throw new Error(`rotta inattesa ${percorso}`)
    },
    casaA: async (_p, pc) => { casa.push(pc.nome); return { ok: true, messaggio: `casa a ${pc.nome}` } },
    log: (m) => { righe.push(m) },
    attesa: async () => undefined
  }
  return { d, dati, chiamate, righe, casa, ripristinata: () => ripristinata }
}

describe('il trasloco di un progetto: un passaggio solo, con l’analisi prima e le copie vecchie nel recupero alla fine', () => {
  it('fa tutti i passi in ordine, con il passo descritto, e alla fine il riassunto con «Annulla tutto»', async () => {
    const b = banco()
    const t = creaTrasloco(b.d)
    const avviato = await t.avvia('p1', { da: 'pc-port', come: 'sposta' })
    expect(avviato.ok).toBe(true)
    const id = avviato.trasloco!.id
    await t.inCorso(id)
    const fine = t.stato(id)!
    expect(prossimoPasso(fine)).toBeUndefined()
    expect(fine.altrove).toEqual([{ pc: 'pc-port', nome: 'PORTATILE-ESEMPIO', salvata: true, esito: 'nel-recupero', messaggio: 'Tolto da questo PC.' }])
    // Le copie vecchie nel recupero solo dopo l'unione: l'ordine delle chiamate al portatile.
    expect(b.chiamate.map((c) => c.split(' ')[1])).toEqual(['/api/trasloco/salva', '/api/trasloco/togli', '/api/trasloco/togli-stato', '/api/trasloco/togli-stato', '/api/trasloco/togli-stato'])
    expect(fine.passi.unione.dettaglio).toBe('Unione fatta.')
    expect(fine.passi.analisi.dettaglio).toBe('10 file uguali, 3 da aggiungere, 1 più recenti, 2 nei recuperati')
    expect(fine.unione).toBe('unione-1')
    expect(fine.riassunto?.at(-1)).toContain('«Annulla tutto»')
    expect(avanzamento(fine).percento).toBe(100)
    expect(b.righe.join('\n')).toContain('finito — residente PC-ESEMPIO')
  })

  it('un PC che non risponde ferma il trasloco con il motivo, senza toccare niente; il giro lo riprende da dov’era quando torna', async () => {
    let spento = true
    const b = banco({ portatileSpento: () => spento })
    const t = creaTrasloco(b.d)
    const id = (await t.avvia('p1', { da: 'pc-qui', come: 'residente' })).trasloco!.id
    await t.inCorso(id)
    const fermo = t.stato(id)!
    expect(fermo.fermo).toMatchObject({ passo: 'raccolta', riprovaDaSolo: true })
    expect(fermo.fermo?.motivo).toContain('PORTATILE-ESEMPIO non risponde')
    expect(fermo.passi.analisi.stato).toBe('da-fare')
    expect(fermo.unione).toBeUndefined()
    spento = false
    t.giro()
    await t.inCorso(id)
    expect(prossimoPasso(t.stato(id)!)).toBeUndefined()
    expect(t.stato(id)!.fermo).toBeUndefined()
  })

  it('dopo un riavvio a metà riprende dal passo dove era, leggendo lo stato dal disco', async () => {
    let spento = false
    const b = banco({ portatileSpento: () => spento })
    const t1 = creaTrasloco(b.d)
    const id = (await t1.avvia('p1', { da: 'pc-port', come: 'sposta' })).trasloco!.id
    await t1.inCorso(id)
    // Rifacciamo come se il PC si fosse spento al passo delle copie vecchie: un'istanza nuova sugli stessi dati.
    spento = true
    const b2 = banco({ dati: b.dati, portatileSpento: () => spento })
    const t2 = creaTrasloco(b2.d)
    expect(t2.stato(id)?.finitoIl).toBeDefined()
    // Un trasloco nuovo che si ferma alle copie vecchie.
    spento = false
    const b3 = banco({ portatileSpento: () => spento })
    const t3 = creaTrasloco({ ...b3.d, chiamaPc: async (pc, percorso, corpo) => { if (percorso === '/api/trasloco/togli') throw new Error('PORTATILE-ESEMPIO non risponde'); return b3.d.chiamaPc(pc, percorso, corpo) } })
    const id3 = (await t3.avvia('p1', { da: 'pc-port', come: 'sposta' })).trasloco!.id
    await t3.inCorso(id3)
    expect(t3.stato(id3)!.fermo?.passo).toBe('vecchie')
    expect(t3.stato(id3)!.passi.unione.stato).toBe('fatto')
    // Riavvio: un'istanza nuova riprende dalle copie vecchie, senza rifare l'unione.
    const t4 = creaTrasloco(b3.d)
    t4.giro()
    await t4.inCorso(id3)
    expect(prossimoPasso(t4.stato(id3)!)).toBeUndefined()
    expect(b3.chiamate.filter((c) => c.endsWith('/api/trasloco/salva'))).toHaveLength(1)
  })

  it('«Annulla tutto»: la copia vecchia torna al suo posto sull’altro PC, l’unione si annulla, la casa torna a chi c’era prima', async () => {
    const b = banco()
    const t = creaTrasloco(b.d)
    const id = (await t.avvia('p1', { da: 'pc-port', come: 'sposta' })).trasloco!.id
    await t.inCorso(id)
    const r = await t.annullaTutto(id)
    expect(r.ok).toBe(true)
    expect(b.ripristinata()).toBe(true)
    expect(b.casa).toEqual(['PORTATILE-ESEMPIO'])
    expect(t.stato(id)!.annullatoIl).toBeDefined()
    expect((await t.annullaTutto(id)).ok).toBe(false)
  })

  it('un secondo avvio sullo stesso progetto non ne crea un altro', async () => {
    const b = banco({ portatileSpento: () => true })
    const t = creaTrasloco(b.d)
    const a = await t.avvia('p1', { da: 'pc-qui', come: 'residente' })
    await t.inCorso(a.trasloco!.id)
    const bis = await t.avvia('p1', { da: 'pc-qui', come: 'residente' })
    expect(bis.trasloco?.id).toBe(a.trasloco?.id)
    expect(bis.messaggio).toContain('già in corso')
  })
})
