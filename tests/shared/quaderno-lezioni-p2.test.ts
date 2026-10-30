import { describe, it, expect } from 'vitest'
import { righeLezioni, LEZIONE_MAX, REGOLA_LEZIONI } from '@shared/lezioni-chat'
import {
  aggiungiVoce, annotaVoci, byteVoci, componiFileQuaderno, fileVuoto, indiceQuaderno, leggiFileQuaderno, potaVoci, rigaVoce,
  BYTE_MAX, INDICE_MAX, TITOLO_REGOLE, VOCI_MAX, type FileQuaderno, type Voce
} from '@shared/quaderno-lezioni'
import { distilla, fraseRiordino, notaDiGiro, regoleDaScheda, RESTANO } from '@shared/quaderno-riordino'
import type { Scheda } from '@shared/quaderno'

describe('le righe LEZIONI: di una chat', () => {
  it('al più tre, con il tag fra quadre, troncate a 200 caratteri', () => {
    const lunga = 'x'.repeat(300)
    const l = righeLezioni([
      'Fatto il lavoro.',
      'LEZIONI: [test] i test con la data di oggi falliscono a mezzanotte',
      '**LEZIONI:** il build di Android vuole Java 17, non 21',
      `LEZIONE: ${lunga}`,
      'LEZIONI: una quarta lezione che non entra mai'
    ].join('\n'))
    expect(l).toHaveLength(3)
    expect(l[0]).toEqual({ tag: 'test', testo: 'i test con la data di oggi falliscono a mezzanotte' })
    expect(l[1]?.tag).toBe('generale')
    expect(l[2]?.testo.length).toBe(LEZIONE_MAX)
    expect(l[2]?.testo.endsWith('…')).toBe(true)
  })

  it('una riga LEZIONI: da sola seguita da punti elenco; doppie e troppo corte fuori', () => {
    const l = righeLezioni('LEZIONI:\n- la cartella dist va pulita prima del build\n- la cartella dist va pulita prima del build\n- corta\n\nAltro testo', 'android')
    expect(l).toEqual([{ tag: 'android', testo: 'la cartella dist va pulita prima del build' }])
  })

  it('niente righe LEZIONI: niente lezioni; la regola le chiede nel testo, mai in un file', () => {
    expect(righeLezioni('RAPPORTO: fatto\nho imparato che…')).toEqual([])
    expect(REGOLA_LEZIONI.join(' ')).toMatch(/LEZIONI:/)
    expect(REGOLA_LEZIONI.join(' ')).toMatch(/mai in un file/)
  })
})

const voce = (testo: string, volte = 1, ultima = '2026-10-01', tag = 'generale'): Voce => ({ tag, testo, volte, ultima })

describe('lezioni.md e decisioni.md', () => {
  it('una voce simile (≥ 0.8) non si ripete: si conta, con la data dell’ultima conferma', () => {
    let v: Voce[] = []
    v = aggiungiVoce(v, { tag: 'build', testo: 'il build di Android vuole Java 17 e non 21' }, '2026-10-01T10:00:00Z').voci
    const r = aggiungiVoce(v, { tag: 'altro', testo: 'Il build di Android vuole Java 17, e non 21' }, '2026-10-20T10:00:00Z')
    expect(r.nuova).toBe(false)
    expect(r.voci).toEqual([{ tag: 'build', testo: 'il build di Android vuole Java 17 e non 21', volte: 2, ultima: '2026-10-20' }])
    expect(rigaVoce(r.voci[0] as Voce)).toBe('- il build di Android vuole Java 17 e non 21 _(confermata 2×, ultima 2026-10-20)_')
    expect(aggiungiVoce(r.voci, { testo: 'la finestra delle impostazioni si apre due volte' }, '2026-10-21').nuova).toBe(true)
  })

  it('si rilegge come si è scritto, regole di Nicholas comprese, parola per parola', () => {
    const f: FileQuaderno = {
      voci: [voce('prima voce del quaderno', 3, '2026-10-02', 'build'), voce('seconda voce del quaderno', 1, '2026-10-03', 'test')],
      regole: [{ titolo: 'Pubblicare una release', fonte: 'pubblicare-una-release.md', testo: 'Nicholas ha detto: «mai pubblicare senza la verifica».\n\n- riga **due**\n## un titolo dentro' }]
    }
    const testo = componiFileQuaderno('decisioni', f)
    expect(testo).toContain(`## ${TITOLO_REGOLE}`)
    expect(leggiFileQuaderno(testo)).toEqual(f)
  })

  it('una riga scritta a mano non si perde', () => {
    const f = leggiFileQuaderno('# Lezioni\n\n## build\n\n- scritta a mano senza data\n')
    expect(f.voci).toEqual([{ tag: 'build', testo: 'scritta a mano senza data', volte: 1, ultima: '' }])
  })

  it('il tetto: 200 voci; escono prima le meno confermate, poi le più vecchie', () => {
    const molte = Array.from({ length: VOCI_MAX + 2 }, (_, i) => voce(`voce numero ${i} diversa`, i === 0 || i === 1 ? 1 : 2, i === 0 ? '2026-10-05' : '2026-10-01'))
    const p = potaVoci(molte)
    expect(p).toHaveLength(VOCI_MAX)
    // Le due con una sola conferma escono; fra loro, prima la più vecchia (la 1), poi la 0.
    expect(p.some((v) => v.testo === 'voce numero 0 diversa' || v.testo === 'voce numero 1 diversa')).toBe(false)
    const tre = [voce('a vecchia una volta', 1, '2026-10-01'), voce('b nuova una volta', 1, '2026-10-09'), voce('c tante volte', 5, '2026-09-01')]
    expect(potaVoci(tre, 2).map((v) => v.testo)).toEqual(['b nuova una volta', 'c tante volte'])
  })

  it('il tetto: 32 KB', () => {
    const grosse = Array.from({ length: 190 }, (_, i) => voce(`${i} ${'parola '.repeat(27)}`))
    expect(byteVoci(grosse)).toBeGreaterThan(BYTE_MAX)
    const p = potaVoci(grosse)
    expect(byteVoci(p)).toBeLessThanOrEqual(BYTE_MAX)
    expect(p.length).toBeLessThan(190)
  })

  it('le regole di Nicholas non si potano mai', () => {
    const f: FileQuaderno = { voci: [], regole: [{ titolo: 'R', testo: 'una regola' }] }
    const molte = Array.from({ length: VOCI_MAX + 5 }, (_, i) => ({ testo: `alfa${i} beta${i} gamma${i} delta${i}` }))
    const r = annotaVoci(f, molte, '2026-10-30')
    expect(r.file.voci).toHaveLength(VOCI_MAX)
    expect(r.file.regole).toEqual(f.regole)
  })

  it('l’indice per le chat sta nei ~1.5k token anche con il quaderno pieno', () => {
    const lez: FileQuaderno = { voci: Array.from({ length: 200 }, (_, i) => voce(`lezione ${i} ${'testo '.repeat(25)}`, (i % 5) + 1)), regole: [] }
    const dec: FileQuaderno = {
      voci: Array.from({ length: 50 }, (_, i) => voce(`decisione ${i} ${'testo '.repeat(25)}`, 1, '2026-10-01', 'nicholas')),
      regole: Array.from({ length: 150 }, (_, i) => ({ titolo: `Regola numero ${i}`, testo: 'x'.repeat(2000) }))
    }
    const i = indiceQuaderno(lez, dec)
    expect(i.length).toBeLessThanOrEqual(INDICE_MAX)
    expect(i).toMatch(/Regole di Nicholas/)
    expect(i).toMatch(/Lezioni più confermate/)
    expect(i).not.toContain('x'.repeat(100))
    // Le più confermate prima.
    expect(i.indexOf('(×5)')).toBeGreaterThan(0)
    expect(indiceQuaderno(fileVuoto(), fileVuoto())).toBe('')
  })
})

const scheda = (file: string, titolo: string, corpo: string, tag: string[] = [], quando = '2026-10-10T10:00:00.000Z'): Scheda => ({ file, titolo, corpo, tag, quando })

describe('riordina il quaderno (distilla)', () => {
  it('le note quasi uguali diventano una voce confermata; quelle che restano non si spostano', () => {
    const schede = [
      ...Array.from({ length: 5 }, (_, i) => scheda(`app-android-analisi-${i}.md`, 'App Android: il build', 'Il build di Android vuole Java 17 e non funziona con la 21.', ['android'], `2026-10-1${i}T10:00:00.000Z`)),
      scheda('lezioni.md', 'Lezioni', ''), scheda('lista-lavori.md', 'Lista', '- [ ] x'),
      scheda('altra.md', 'La finestra', 'La finestra delle impostazioni si apriva due volte per un doppio clic.', ['interfaccia'])
    ]
    const e = distilla(schede, { lezioni: fileVuoto(), decisioni: fileVuoto() }, '2026-10-30')
    expect(e.note).toBe(6)
    expect(e.daSpostare).not.toContain('lezioni.md')
    expect(e.daSpostare).not.toContain('lista-lavori.md')
    for (const f of RESTANO) expect(e.daSpostare).not.toContain(f)
    expect(e.lezioni.voci).toHaveLength(2)
    expect(e.lezioni.voci.find((v) => v.tag === 'android')).toMatchObject({ volte: 5, ultima: '2026-10-14' })
    expect(fraseRiordino(e)).toBe('6 note diventano 2 voci.')
  })

  it('le regole di Nicholas restano parola per parola, anche dentro una nota di giro', () => {
    const regola = scheda('pubblicare-una-release.md', 'Pubblicare una release — regola di Nicholas',
      '## Come\n\n1. Prima la verifica completa.\n2. Poi il tag.\n\n«Non voglio più release rotte»: lo ha scritto lui.', ['release'])
    const giro = scheda('storico-2026-10-20.md', 'Storico del 20/10', 'Giro normale.\n\nNicholas ha detto che la coda deve restare visibile sempre.\n\nAltro.', ['storico'])
    expect(notaDiGiro(giro)).toBe(true)
    expect(regoleDaScheda(regola)[0]?.testo).toBe(regola.corpo.trim())
    const e = distilla([regola, giro], { lezioni: fileVuoto(), decisioni: fileVuoto() }, '2026-10-30')
    expect(e.decisioni.regole.map((r) => r.testo)).toEqual([regola.corpo.trim(), 'Nicholas ha detto che la coda deve restare visibile sempre.'])
    // Rilette dal file, uguali.
    expect(leggiFileQuaderno(componiFileQuaderno('decisioni', e.decisioni)).regole).toEqual(e.decisioni.regole)
    // La nota di giro non dà lezioni.
    expect(e.lezioni.voci.some((v) => /Storico/.test(v.testo))).toBe(false)
  })

  it('le regole già nel file non si perdono rifacendo il riordino', () => {
    const gia = { lezioni: fileVuoto(), decisioni: { voci: [], regole: [{ titolo: 'Vecchia', testo: 'una regola di prima, scritta da lui' }] } }
    const e = distilla([scheda('x.md', 'Una nota', 'Una cosa qualunque da ricordare per dopo.')], gia, '2026-10-30')
    expect(e.decisioni.regole).toEqual(gia.decisioni.regole)
  })

  it('una nota di decisione va in decisioni.md', () => {
    const e = distilla([scheda('decisione-x.md', 'Decisione sul tema scuro', 'Il tema scuro resta quello di serie per tutti.', ['decisione'])], { lezioni: fileVuoto(), decisioni: fileVuoto() }, '2026-10-30')
    expect(e.decisioni.voci).toHaveLength(1)
    expect(e.lezioni.voci).toHaveLength(0)
  })
})
