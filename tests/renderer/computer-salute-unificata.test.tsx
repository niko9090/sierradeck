import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { computerDa, saluteSenzaPc, CHIAVE_SALUTE_COMPUTER, VISTE_COMPUTER } from '../../src/shared/computer-vista'
import { statoPc } from '../../src/shared/stato-pc'
import { TESTO_IN_AGGIORNAMENTO } from '../../src/shared/aggiornamento-remoto'
import { FUNZIONI } from '../../src/shared/menu-principale'
import type { BattitoPc } from '../../src/shared/posta'
import type { VoceSalute } from '../../src/shared/salute'
import type { AvanzamentoInstallaLa } from '../../src/shared/installa-la'
import { SchedaPcRiga, VistaAlbero, VistaElenco, VistaMappa } from '../../src/renderer/components/PaginaComputer'

const ADESSO = Date.parse('2026-11-20T10:00:00Z')
const fa = (min: number): string => new Date(ADESSO - min * 60_000).toISOString()
const pc = (p: Partial<BattitoPc> & { pcId: string; nome: string }): BattitoPc => ({ versione: '0.110.0', battito: fa(1), cartelle: [], chat: [], ...p })

const battiti: BattitoPc[] = [
  pc({ pcId: 'a', nome: 'Portatile', versione: '0.109.0', chat: [{ titolo: 'Prova uno', cwd: 'x', aspetta: true }] }),
  pc({ pcId: 'b', nome: 'Casa', battito: fa(60 * 24 * 8) }),
  pc({ pcId: 'c', nome: 'Muletto', aiutante: true, versione: '1.2.0' }),
  pc({ pcId: 'd', nome: 'Studio', battito: fa(120) }),
  pc({ pcId: 'io', nome: 'Questo' })
]
const inst: AvanzamentoInstallaLa = { pcId: 'd', da: '0.109.0', a: '0.110.0', fase: 'installo', messaggio: 'installa', aggiornato: fa(1) } as AvanzamentoInstallaLa

const dati = {
  io: { id: 'io', nome: 'Questo', versione: '0.110.0' },
  pc: battiti,
  installazioni: [inst],
  mappa: { nodi: [], linee: [{ a: 'a', strada: 'Tailscale', stato: 'ok' as const, colore: '', testo: '' }] },
  dismettibili: new Set(['b']),
  adesso: ADESSO
}

describe('Computer: una scheda per PC, stato da statoPc', () => {
  const c = computerDa(dati)
  const per = (id: string) => c.altri.find((s) => s.id === id)!

  it('lo stato di ogni scheda è quello di statoPc, con le sue parole', () => {
    expect(per('a').stato).toBe(statoPc(fa(1), ADESSO).stato)
    expect(per('b').stato).toBe('spento')
    expect(per('b').stato).toBe(statoPc(fa(60 * 24 * 8), ADESSO).stato)
    expect(per('c').acceso).toBe(true)
  })

  it('un PC che si aggiorna dice «in aggiornamento, attendere», non spento', () => {
    expect(per('d').stato).toBe('in-aggiornamento')
    expect(per('d').parola).toBe(TESTO_IN_AGGIORNAMENTO)
    expect(per('d').azioni.dismetti).toBe(false)
  })

  it('azioni: guarda dal vivo, cassetta, installa là, dismetti', () => {
    expect(per('a').azioni).toEqual({ guardaDalVivo: true, cassetta: true, installaLa: true, dismetti: false })
    expect(per('b').azioni.dismetti).toBe(true)
    expect(per('b').azioni.guardaDalVivo).toBe(false)
    expect(per('c').azioni.cassetta).toBe(false)
    expect(per('a').strada).toBe('diretto (Tailscale)')
    expect(c.io.stato).toBe('acceso')
  })

  it('solo-aiutante → installaLa: false (là SierraDeck è chiuso, l’Aiutante non serve l’aggiornamento)', () => {
    const s = computerDa({
      ...dati,
      pc: [
        pc({ pcId: 'e', nome: 'Ufficio', host: 'host-x', battito: fa(120) }),
        pc({ pcId: 'e-aiuto', nome: 'Ufficio', host: 'host-x', aiutante: true, battito: fa(1) }),
        pc({ pcId: 'io', nome: 'Questo' })
      ],
      installazioni: []
    }).altri.find((x) => x.id === 'e')!
    expect(s.stato).toBe('solo-aiutante')
    expect(s.azioni.installaLa).toBe(false)
  })

  it('conta accesi e totale (questo PC compreso)', () => {
    expect(c.totale).toBe(5)
    expect(c.accesi).toBe(3)
  })
})

describe('Computer: tre viste, un componente per la scheda', () => {
  const c = computerDa(dati)
  const nomi = ['Portatile', 'Casa', 'Muletto', 'Studio', 'Questo']

  it('le viste sono albero, elenco, mappa', () => {
    expect(VISTE_COMPUTER.map((v) => v.id)).toEqual(['albero', 'elenco', 'mappa'])
  })

  it('albero, elenco e mappa mostrano tutti i PC con la stessa scheda', () => {
    const viste = [
      renderToStaticMarkup(<VistaAlbero c={c} />),
      renderToStaticMarkup(<VistaElenco c={c} />),
      renderToStaticMarkup(<VistaMappa c={c} mappa={undefined} />)
    ]
    for (const html of viste) {
      for (const n of nomi) expect(html).toContain(n)
      expect(html).toContain(TESTO_IN_AGGIORNAMENTO)
      expect(html).toContain('stato-pc--spento')
      expect(html).toContain('data-stato="acceso"')
    }
    expect(viste[0]).toContain('PC con SierraDeck')
    expect(viste[0]).toContain('Aiutanti')
  })

  it('la scheda ha cassetta, installa là e dismetti dove servono', () => {
    const portatile = renderToStaticMarkup(<SchedaPcRiga s={c.altri.find((s) => s.id === 'a')!} />)
    expect(portatile).toContain('Cassetta…')
    expect(portatile).toContain('Installa là')
    expect(portatile).toContain('Chat aperte')
    const casa = renderToStaticMarkup(<SchedaPcRiga s={c.altri.find((s) => s.id === 'b')!} />)
    expect(casa).toContain('Dismetti')
    expect(casa).not.toContain('Installa là')
    const qui = renderToStaticMarkup(<SchedaPcRiga s={c.io} />)
    expect(qui).not.toContain('Cassetta')
  })

  it('con la lista chat aperta c’è «Guarda dal vivo»', () => {
    const s = c.altri.find((x) => x.id === 'a')!
    const html = renderToStaticMarkup(<SchedaPcRiga s={s} azioni={{ espanse: new Set(['a']) }} />)
    expect(html).toContain('Guarda dal vivo')
    expect(html).toContain('Prova uno')
  })
})

describe('Salute: niente elenco dei PC', () => {
  const v = (chiave: string, tono: VoceSalute['tono'], gruppo: VoceSalute['gruppo'] = 'pc'): VoceSalute => ({ chiave, gruppo, tono, titolo: chiave, spiegazione: '', azioni: [] })

  it('le voci pc:… escono e ne resta una che rimanda a Computer', () => {
    const r = saluteSenzaPc([v('drive', 'ok', 'drive'), v('pc:a', 'attenzione'), v('pc:b', 'guasto'), v('pc:c', 'ok'), v('gpu:qui', 'ok'), v('errori', 'ok', 'errori')])
    expect(r.voci.map((x) => x.chiave)).toEqual(['drive', 'gpu:qui', 'errori', CHIAVE_SALUTE_COMPUTER])
    expect(r.daGuardare).toBe(2)
    const rimando = r.voci.at(-1)!
    expect(rimando.titolo).toBe('2 computer da guardare')
    expect(rimando.tono).toBe('guasto')
  })

  it('tutti a posto: nessuna voce sui PC, nemmeno «Nessun altro PC»', () => {
    const r = saluteSenzaPc([v('pc', 'ok'), v('pc:a', 'ok'), v('drive', 'ok', 'drive')])
    expect(r.voci.map((x) => x.chiave)).toEqual(['drive'])
    expect(r.daGuardare).toBe(0)
  })

  it('il pannello Salute non porta più l’elenco dei PC né la rete ad albero', () => {
    const src = readFileSync('src/renderer/components/PannelloSalute.tsx', 'utf8')
    expect(src).not.toContain('AltriComputer')
    expect(src).not.toContain('Gli altri computer')
    expect(src).not.toContain('Rete dei PC')
    expect(src).toContain('saluteSenzaPc')
    const acc = readFileSync('src/renderer/components/PannelloAccount.tsx', 'utf8')
    expect(acc).not.toContain('export function AltriComputer')
  })

  it('la pagina Computer ha già tutto quello che aveva la lista dei PC in Salute', () => {
    const src = readFileSync('src/renderer/components/PaginaComputer.tsx', 'utf8')
    for (const x of ['Guarda dal vivo', 'Cassetta', 'Installa là', 'dismettiPc', 'ModalePosta', 'MappaPc']) expect(src).toContain(x)
  })
})

describe('FUNZIONI: niente sparisce', () => {
  it('computer e salute hanno ancora le loro funzioni', () => {
    const di = (id: string) => FUNZIONI.filter((f) => f.dove === id).length
    expect(di('computer')).toBeGreaterThan(0)
    expect(di('salute')).toBeGreaterThanOrEqual(3)
  })
})
