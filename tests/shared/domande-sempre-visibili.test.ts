import { describe, expect, it } from 'vitest'
import { domandaInFondo, raccogliDomande, vociPerLeApp } from '../../src/shared/domande-telefono'
import { conversazioniDomande, quanteAspettano } from '../../src/shared/domande-conversazioni'
import { aspettaTe, prossimaDomanda, tipoDomanda } from '../../src/shared/domande-vista'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * Nicholas (13/10, sulla 0.71.0): «le domande spariscono e rimangono solo nella
 * chat». Una domanda di una chat deve stare nelle Domande finché ha risposta;
 * se risponde l'autopilota, resta visibile con «risposta dall'autopilota».
 */
describe('domandaInFondo', () => {
  it('riconosce una domanda nell’ultimo paragrafo', () => {
    expect(domandaInFondo('Ho finito la parte A.\n\nProcedo con la B o preferisci aspettare?')).toBe('Procedo con la B o preferisci aspettare?')
    expect(domandaInFondo('Fatto.\n\n**Vuoi che pubblichi adesso?**')).toBe('**Vuoi che pubblichi adesso?**')
  })
  it('riconosce un elenco di scelte sotto una domanda', () => {
    expect(domandaInFondo('Ho due strade. Quale preferisci?\n\n1. Rifare il menu\n2. Correggere solo il colore')).toBe('Ho due strade. Quale preferisci?\n1. Rifare il menu\n2. Correggere solo il colore')
  })
  it('un turno finito senza domanda non è una domanda', () => {
    expect(domandaInFondo('Ho corretto il difetto e i test passano.')).toBeUndefined()
    expect(domandaInFondo('Perché succedeva? Il menu si chiudeva.\n\nOra è corretto.')).toBeUndefined()
    expect(domandaInFondo(undefined)).toBeUndefined()
    expect(domandaInFondo('')).toBeUndefined()
  })
})

const nessunaScelta = (): undefined => undefined

describe('una domanda di una chat sta nelle Domande, non fra le «ha finito»', () => {
  it('domanda scritta a fine turno: aspetta te, conta nel numero, è in «Aspettano te»', () => {
    const voci = raccogliDomande({
      domande: [], autopiloti: [], scelteDi: nessunaScelta,
      chat: [{ id: 'r1', titolo: 'NexoraOS', cwd: 'E:\\Prova\\nexora', aspetta: true, domanda: 'Procedo con la B?', coda: ['vecchie righe'] }]
    })
    const conv = conversazioniDomande({ voci, autopiloti: [] })
    expect(conv).toHaveLength(1)
    expect(conv[0]!.chiede).toBe(true)
    expect(conv[0]!.messaggi.at(-1)!.testo).toBe('Procedo con la B?')
    expect(tipoDomanda(conv[0]!).id).toBe('domanda')
    expect(aspettaTe(conv[0]!)).toBe(true)
    expect(quanteAspettano(conv)).toBe(1)
  })

  it('un dialogo che i segnali vedono e lo schermo no: c’è anche se la chat è governata', () => {
    const voci = raccogliDomande({
      domande: [], autopiloti: [], scelteDi: nessunaScelta,
      chat: [{ id: 'r2', titolo: 'Governata', cwd: 'E:\\Prova\\g', aspetta: true, governata: true, chiedeSegnale: true, coda: ['Quale database usiamo?', '❯ 1. Postgres', '  2. SQLite'] }]
    })
    const conv = conversazioniDomande({ voci, autopiloti: [] })
    expect(conv[0]?.chiede).toBe(true)
    expect(quanteAspettano(conv)).toBe(1)
  })

  it('una chat che ha solo finito resta «ha finito»', () => {
    const voci = raccogliDomande({ domande: [], autopiloti: [], scelteDi: nessunaScelta, chat: [{ id: 'r3', titolo: 'X', cwd: 'E:\\x', aspetta: true, coda: ['Fatto.'] }] })
    const conv = conversazioniDomande({ voci, autopiloti: [] })
    expect(tipoDomanda(conv[0]!).id).toBe('finito')
    expect(aspettaTe(conv[0]!)).toBe(false)
  })

  it('la domanda scritta di una chat di un altro PC arriva dal suo battito', () => {
    const voci = raccogliDomande({
      domande: [], autopiloti: [], chat: [], scelteDi: nessunaScelta,
      altriPc: [{ pcId: 'pc-b', nome: 'PC-B', vivo: true, chat: [{ sessione: 's1', titolo: 'Sito', cwd: 'E:\\sito', aspetta: true, domanda: 'Lo pubblico?' }] }]
    })
    const conv = conversazioniDomande({ voci, autopiloti: [] })
    expect(conv[0]).toMatchObject({ chiede: true, suPc: 'PC-B' })
    expect(conv[0]!.messaggi.at(-1)!.testo).toBe('Lo pubblico?')
  })
})

describe('se risponde l’autopilota, la domanda resta visibile', () => {
  const ap = { id: 'ap-1', nome: 'Rifare il menu', obiettivo: 'o', stato: 'lavoro' }
  const risolta = { autopilotaId: 'ap-1', chatTitolo: 'Sviluppo: menu', domanda: 'Uso npm o pnpm?', risposta: 'npm: c’è già il package-lock', quando: '2026-10-13T15:20:00.000Z' }

  it('senza domande aperte: una conversazione che non aspetta te, con domanda e risposta', () => {
    const voci = raccogliDomande({ domande: [], autopiloti: [ap], chat: [], scelteDi: nessunaScelta, risolte: [risolta] })
    const conv = conversazioniDomande({ voci, autopiloti: [] })
    expect(conv).toHaveLength(1)
    const c = conv[0]!
    expect(c).toMatchObject({ chiave: 'ap:ap-1', tipo: 'autopilota', chiede: false, titolo: 'Rifare il menu' })
    expect(c.messaggi.map((m) => m.testo)).toEqual(['La chat «Sviluppo: menu» ha chiesto: Uso npm o pnpm?', 'risposta dall’autopilota: npm: c’è già il package-lock'])
    expect(tipoDomanda(c)).toMatchObject({ id: 'risposta', parola: 'risposta dall’autopilota' })
    // Si vede in «Aspettano te», ma non conta nel numero e non è «la prossima».
    expect(aspettaTe(c)).toBe(true)
    expect(quanteAspettano(conv)).toBe(0)
    expect(prossimaDomanda(conv, 'altro')).toBeUndefined()
    // Le app vecchie leggono `voci`: il tipo nuovo non ci arriva.
    expect(vociPerLeApp(voci)).toHaveLength(0)
  })

  it('con una domanda aperta: la risposta di prima sta sopra, la domanda aperta resta in fondo', () => {
    const voci = raccogliDomande({ domande: [{ id: 'd-1', autopilotaId: 'ap-1', testo: 'Pubblico adesso?' }], autopiloti: [ap], chat: [], scelteDi: nessunaScelta, risolte: [risolta] })
    const conv = conversazioniDomande({ voci, autopiloti: [] })
    expect(conv).toHaveLength(1)
    expect(conv[0]!.chiede).toBe(true)
    expect(conv[0]!.messaggi.at(-1)!.testo).toBe('Pubblico adesso?')
    expect(conv[0]!.messaggi.some((m) => m.testo.startsWith('risposta dall’autopilota'))).toBe(true)
  })
})

describe('il registro delle domande tiene le risposte dell’autopilota', () => {
  it('le ricorda dopo un riavvio, e dopo 12 ore le lascia andare', () => {
    const cartella = mkdtempSync(join(tmpdir(), 'risolte-'))
    try {
      let ora = Date.parse('2026-10-13T10:00:00.000Z')
      const file = join(cartella, 'domande-aperte.json')
      const r = creaRegistroDomande({ adesso: () => ora, file })
      r.risolta({ autopilotaId: 'ap-1', chatId: 'c-1', domanda: 'Uso npm o pnpm?', risposta: 'npm' })
      r.risolta({ autopilotaId: 'ap-1', domanda: '  ', risposta: 'vuota: non si tiene' })
      const dopo = creaRegistroDomande({ adesso: () => ora, file })
      expect(dopo.risolte()).toEqual([{ autopilotaId: 'ap-1', chatId: 'c-1', domanda: 'Uso npm o pnpm?', risposta: 'npm', quando: '2026-10-13T10:00:00.000Z' }])
      expect(dopo.risolte('ap-2')).toEqual([])
      ora += 13 * 3_600_000
      expect(dopo.risolte()).toEqual([])
    } finally {
      rmSync(cartella, { recursive: true, force: true })
    }
  })
})
