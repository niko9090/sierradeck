import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriDispositivi, DURATA_CODICE_MS, nuovoCodice } from '../../src/main/dispositivi'

let cartella: string
let ora = 1_000_000
const adesso = (): number => ora

beforeEach(() => {
  cartella = mkdtempSync(join(tmpdir(), 'sd-disp-'))
  ora = 1_000_000
})

const apri = (): ReturnType<typeof apriDispositivi> => apriDispositivi(cartella, adesso)

describe('il codice di accoppiamento', () => {
  it('e di sei cifre, leggibile ad alta voce', () => {
    expect(nuovoCodice()).toMatch(/^\d{6}$/)
  })

  it('senza accoppiamento aperto non entra nessuno', () => {
    // La porta e' chiusa finche' non la apri tu: e' l'unico momento in cui un
    // dispositivo nuovo puo' presentarsi.
    expect(apri().accoppia('123456', 'telefono')).toBeUndefined()
  })

  it('un codice sbagliato non apre', () => {
    const d = apri()
    const { codice } = d.apriAccoppiamento()
    const sbagliato = codice === '000000' ? '111111' : '000000'
    expect(d.accoppia(sbagliato, 'telefono')).toBeUndefined()
  })

  it('scaduto vale come chiuso', () => {
    const d = apri()
    const { codice } = d.apriAccoppiamento()
    ora += DURATA_CODICE_MS + 1
    expect(d.accoppia(codice, 'telefono')).toBeUndefined()
    expect(d.accoppiamentoAperto()).toBeUndefined()
  })

  it('vale per un dispositivo solo', () => {
    // Se restasse valido, chi ha visto il codice sullo schermo potrebbe
    // collegare altri dispositivi quando gli pare.
    const d = apri()
    const { codice } = d.apriAccoppiamento()
    expect(d.accoppia(codice, 'primo')).toBeDefined()
    expect(d.accoppia(codice, 'secondo')).toBeUndefined()
  })
})

describe('la chiave di un dispositivo', () => {
  it('si vede una volta sola: sul disco resta il segno', () => {
    const d = apri()
    const { codice } = d.apriAccoppiamento()
    const esito = d.accoppia(codice, 'telefono')
    const scritto = readFileSync(join(cartella, 'dispositivi.json'), 'utf8')
    expect(esito?.chiave).toBeDefined()
    expect(scritto).not.toContain(esito?.chiave ?? 'x')
    expect(scritto).toContain('segno')
  })

  it('riconosce il dispositivo e rifiuta le chiavi inventate', () => {
    const d = apri()
    const { codice } = d.apriAccoppiamento()
    const esito = d.accoppia(codice, 'telefono')
    expect(d.riconosci(esito?.chiave ?? '')?.nome).toBe('telefono')
    expect(d.riconosci('chiave-inventata')).toBeUndefined()
    expect(d.riconosci('')).toBeUndefined()
  })

  it('segna quando un dispositivo si e fatto vivo', () => {
    const d = apri()
    const { codice } = d.apriAccoppiamento()
    const esito = d.accoppia(codice, 'tablet')
    ora += 60_000
    d.riconosci(esito?.chiave ?? '')
    expect(d.elenca()[0]?.ultimoAccesso).toBeDefined()
  })

  it('due dispositivi hanno chiavi diverse', () => {
    const d = apri()
    const uno = d.accoppia(d.apriAccoppiamento().codice, 'uno')
    const due = d.accoppia(d.apriAccoppiamento().codice, 'due')
    expect(uno?.chiave).not.toBe(due?.chiave)
  })
})

describe('revocare', () => {
  it('spegne un dispositivo senza toccare gli altri', () => {
    // Il telefono perso si spegne, il tablet in mensola continua a funzionare.
    const d = apri()
    const telefono = d.accoppia(d.apriAccoppiamento().codice, 'telefono')
    const tablet = d.accoppia(d.apriAccoppiamento().codice, 'tablet')
    d.revoca(telefono?.id ?? '')
    expect(d.riconosci(telefono?.chiave ?? '')).toBeUndefined()
    expect(d.riconosci(tablet?.chiave ?? '')?.nome).toBe('tablet')
  })

  it('un id inventato non fa danni', () => {
    const d = apri()
    d.accoppia(d.apriAccoppiamento().codice, 'telefono')
    d.revoca('../../qualcosa')
    expect(d.elenca()).toHaveLength(1)
  })
})

describe('l elenco', () => {
  it('non contiene mai i segni delle chiavi', () => {
    const d = apri()
    d.accoppia(d.apriAccoppiamento().codice, 'telefono')
    expect(JSON.stringify(d.elenca())).not.toContain('segno')
  })
})
