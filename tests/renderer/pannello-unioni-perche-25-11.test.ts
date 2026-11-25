import { describe, it, expect } from 'vitest'
import type { VistaAttesa } from '../../src/shared/attesa-specialisti'
import { DATI_VECCHI_MS, esitiRecenti, filaUnioni, testoDatiVecchi, MOTIVO_CORTO_MAX } from '../../src/renderer/pannello-agenti-vista'
import { statoUnione } from '../../src/shared/menu-specialisti'
import { campiRigaUnione, MOTIVO_UNIONE_MAX } from '../../src/shared/dati-pannello-agenti'
import { paginaClient } from '../../src/main/client-pagina'

/**
 * 25/11: la fila delle unioni dice per ogni riga da quanto aspetta, perché, i tentativi, se aspetta
 * Nicholas; gli esiti rossi dicono il motivo; i dati di un altro PC fermi si dicono vecchi.
 * Nomi inventati, niente dati veri.
 */
const ORA = Date.parse('2026-11-25T12:00:00Z')
const fa = (min: number): string => new Date(ORA - min * 60_000).toISOString()
const fra = (min: number): string => new Date(ORA + min * 60_000).toISOString()
const WS = 'cartella:C:/Prova/Uno'

describe('statoUnione: ogni caso della riga', () => {
  it('in prova: da quanto, e il tentativo se non è il primo', () => {
    expect(statoUnione({ inCorso: true, dal: fa(20), inProvaDal: fa(12) }, ORA)).toMatchObject({ parole: 'in prova adesso', sotto: 'in prova da 12 min', tono: 'blu' })
    expect(statoUnione({ inCorso: true, dal: fa(20), inProvaDal: fa(12), tentativi: 1 }, ORA).sotto).toBe('in prova da 12 min · tentativo 2')
  })

  it('in fila e pronta: da quanto aspetta', () => {
    expect(statoUnione({ dal: fa(40) }, ORA)).toMatchObject({ parole: 'in fila', sotto: 'in fila da 40 min', tono: 'ambra', aspettaTe: false })
  })

  it('scaduta: quante volte e fra quanto riprova', () => {
    const s = statoUnione({ dal: fa(30), tentativi: 2, riprovaIl: fra(5), motivo: 'la prova ci ha messo più di 10 min' }, ORA)
    expect(s).toMatchObject({ parole: 'riprova da sola', sotto: 'scaduta 2 volte · riprova fra 5 min', motivo: 'la prova ci ha messo più di 10 min' })
    expect(statoUnione({ dal: fa(5), tentativi: 1, riprovaIl: fra(1) }, ORA).sotto).toBe('scaduta 1 volta · riprova fra 1 min')
  })

  it('ferma per file non salvati o per un’operazione a metà', () => {
    expect(statoUnione({ dal: fa(70), ferma: 'file', fermaDal: fa(60) }, ORA)).toMatchObject({ parole: 'ferma', sotto: 'ferma da 1 h: file non salvati nella cartella principale', tono: 'rosso' })
    expect(statoUnione({ dal: fa(10), ferma: 'git', fermaDal: fa(10) }, ORA)).toMatchObject({ sotto: 'ferma da 10 min: un’operazione lasciata a metà nella cartella principale', tono: 'ambra' })
  })

  it('aspetta la risposta di Nicholas: sempre in rosso, anche se è in prova', () => {
    const s = statoUnione({ inCorso: true, dal: fa(30), ferma: 'risposta', fermaDal: fa(20), fileFermi: 3 }, ORA)
    expect(s).toMatchObject({ aspettaTe: true, tono: 'rosso', sotto: 'aspetta te: rispondi a «li salvo?» (3 file) · da 20 min' })
  })

  it('più di un’ora in fila: tono rosso; un servizio di prima senza dati: solo «in fila»', () => {
    expect(statoUnione({ dal: fa(61) }, ORA)).toMatchObject({ tono: 'rosso', lunga: true, sotto: 'in fila da 1 h 1 min' })
    expect(statoUnione({ inCorso: true, dal: fa(8 * 60) }, ORA)).toMatchObject({ tono: 'rosso', sotto: 'in prova da 8 h' })
    expect(statoUnione({}, ORA)).toMatchObject({ parole: 'in fila', sotto: '', tono: 'ambra', motivo: '' })
    expect(statoUnione({ inCorso: true }, ORA)).toMatchObject({ parole: 'in prova adesso', sotto: 'in prova' })
  })

  it('basta a se stessa: va scritta nella pagina del telefono', () => {
    const t = statoUnione.toString()
    expect(t).not.toContain('`')
    expect(t).not.toMatch(/\b(testoDurata|daQuanto|MOTIVO_)/)
  })
})

describe('filaUnioni ed esiti nel pannello', () => {
  const vista: VistaAttesa = {
    posti: { usati: 0, tetto: 4 }, alLavoro: [], inFila: [],
    inUnione: [
      { id: 'u2', workspace: WS, workspaceNome: 'Uno', titolo: 'Seconda', inCorso: false, posizione: 2, dal: fa(90), ferma: 'risposta', motivo: 'file non salvati: a.ts' },
      { id: 'u1', workspace: WS, workspaceNome: 'Uno', titolo: 'Prima', inCorso: true, posizione: 1, dal: fa(15), inProvaDal: fa(3) }
    ],
    esitiUnioni: {
      [WS]: [
        { id: 'e1', titolo: 'Rossa', esito: 'conflitto', motivo: 'conflitto su src/' + 'cartella-lunga/'.repeat(10) + 'a.ts', quando: fa(2) },
        { id: 'e2', titolo: 'Verde', esito: 'verde', verde: true, motivo: 'ignorato', quando: fa(5) }
      ]
    }
  }

  it('ogni riga porta parola, riga sotto, tono e motivo', () => {
    const f = filaUnioni(vista, [WS], ORA)
    expect(f.map((u) => [u.id, u.parole, u.sotto, u.tono])).toEqual([
      ['u1', 'in prova adesso', 'in prova da 3 min', 'blu'],
      ['u2', 'ferma', 'aspetta te: rispondi a «li salvo?» · da 1 h 30 min', 'rosso']
    ])
    expect(f[1]!.aspettaTe).toBe(true)
    expect(f[1]!.motivo).toBe('file non salvati: a.ts')
  })

  it('gli esiti rossi dicono il motivo, accorciato nella riga e intero nel title; i verdi no', () => {
    const e = esitiRecenti(vista, [WS])
    expect(e[0]!.motivo).toContain('conflitto su src/')
    expect(e[0]!.motivoCorto.length).toBeLessThanOrEqual(MOTIVO_CORTO_MAX)
    expect(e[0]!.motivoCorto.endsWith('…')).toBe(true)
    expect(e[1]).toMatchObject({ verde: true, motivo: '', motivoCorto: '' })
  })
})

describe('dati vecchi di un altro PC', () => {
  it('freschi o di questo PC: niente; fermi o senza risposta: lo dice, i dati restano', () => {
    expect(testoDatiVecchi({ pcNome: 'PC-PROVA', lettoIl: ORA - 5_000, nonRisponde: false, adesso: ORA })).toBe('')
    expect(testoDatiVecchi({ lettoIl: ORA - 3_600_000, nonRisponde: true, adesso: ORA })).toBe('')
    expect(testoDatiVecchi({ pcNome: 'PC-PROVA', nonRisponde: true, adesso: ORA })).toBe('')
    expect(testoDatiVecchi({ pcNome: 'PC-PROVA', lettoIl: ORA - 5_000, nonRisponde: true, adesso: ORA })).toBe('Dati di meno di 1 min fa: PC-PROVA non risponde')
    expect(testoDatiVecchi({ pcNome: 'PC-PROVA', lettoIl: ORA - 12 * 60_000, nonRisponde: true, adesso: ORA })).toBe('Dati di 12 min fa: PC-PROVA non risponde')
    expect(testoDatiVecchi({ pcNome: 'PC-PROVA', lettoIl: ORA - DATI_VECCHI_MS - 1, nonRisponde: false, adesso: ORA })).toBe('Dati di meno di 1 min fa: PC-PROVA non si aggiorna')
  })
})

describe('campiRigaUnione: dalla fila del servizio alla vista', () => {
  const ms = (min: number): number => ORA - min * 60_000

  it('in fila da poco: solo da quando', () => {
    expect(campiRigaUnione({ inCorso: false, entrataIl: ms(40), tentativi: 0 }, ORA)).toEqual({ dal: fa(40) })
  })

  it('senza entrataIl vale la partenza del tentativo; in corso porta da quando prova', () => {
    expect(campiRigaUnione({ inCorso: true, partitaIl: ms(12), tentativi: 1 }, ORA)).toEqual({ dal: fa(12), inProvaDal: fa(12), tentativi: 1 })
  })

  it('scaduta: tentativi, quando riprova e il motivo (accorciato)', () => {
    const c = campiRigaUnione({ inCorso: false, entrataIl: ms(30), tentativi: 2, nonPrima: ORA + 5 * 60_000, ultimoMotivo: ' x'.repeat(500) }, ORA)
    expect(c).toMatchObject({ tentativi: 2, riprovaIl: fra(5) })
    expect(c.motivo!.length).toBe(MOTIVO_UNIONE_MAX)
    // Un nonPrima già passato non è un'attesa.
    expect(campiRigaUnione({ inCorso: false, tentativi: 1, nonPrima: ORA - 1 }, ORA).riprovaIl).toBeUndefined()
  })

  it('ferma: per i file, per git a metà, o per la risposta di Nicholas (coi file chiesti)', () => {
    expect(campiRigaUnione({ inCorso: false, tentativi: 0, sporcaDal: ms(60) }, ORA)).toMatchObject({ ferma: 'file', fermaDal: fa(60) })
    expect(campiRigaUnione({ inCorso: false, tentativi: 0, sporcaDal: ms(60), avvisatoSenzaFile: true }, ORA).ferma).toBe('git')
    expect(campiRigaUnione({ inCorso: false, tentativi: 0, sporcaDal: ms(60), domandaSalva: 'd-1', fileChiesti: ['a.ts', 'b.ts'] }, ORA)).toMatchObject({ ferma: 'risposta', fileFermi: 2 })
  })
})

describe('la pagina del telefono: stessa riga', () => {
  const html = paginaClient()
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
  const estrai = (nome: string): string => {
    const inizio = script.indexOf(`function ${nome}(`)
    expect(inizio, `${nome} non è nella pagina`).toBeGreaterThan(-1)
    let p = 0
    for (let i = script.indexOf('{', inizio); i < script.length; i++) {
      if (script[i] === '{') p++
      else if (script[i] === '}' && --p === 0) return script.slice(inizio, i + 1)
    }
    throw new Error(`${nome} non si chiude`)
  }
  const esc = script.split('\n').find((r) => r.startsWith('const esc =')) ?? ''

  it('lo script resta valido e la riga dice stato, da quanto e perché (protetto)', () => {
    expect(() => new Function(script)).not.toThrow()
    const f = new Function('u', `${esc}\n${estrai('statoUnione')}\n${estrai('rigaStatoUnione')}\nreturn rigaStatoUnione(u)`)
    const h = f({ inCorso: false, voce: { dal: new Date(Date.now() - 2 * 3_600_000).toISOString(), ferma: 'file', motivo: 'file <a.ts>' } }) as string
    expect(h).toContain('<b>ferma</b>')
    expect(h).toContain('ferma da 2 h: file non salvati nella cartella principale')
    expect(h).toContain('title="file &lt;a.ts&gt;"')
    expect(h).toContain('color:var(--rosso')
    // Un servizio di prima: solo lo stato.
    expect(f({ inCorso: true }) as string).toContain('<b>in prova adesso</b>')
  })
})
