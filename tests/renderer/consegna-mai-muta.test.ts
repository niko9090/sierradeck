import { describe, it, expect } from 'vitest'
import { eseguiConsegna, TETTO_PRONTEZZA_MS, RIPROVA_MS, RESA_MS, type Consegna, type Ponte, type InvioMancato } from '../../src/renderer/consegne-autopilota'
import { sceltaSulloSchermo } from '../../src/renderer/ultime-righe'

/**
 * La consegna non aspetta mai in silenzio (0.38.2). Caso NexoraOS: dopo
 * l'aggiornamento alla 0.38.1 l'autopilota non scriveva piu' niente nella chat
 * e il registro non diceva niente.
 */
const INVIO = String.fromCharCode(13)
const consegna: Consegna = { id: 'c-1', autopilotaId: 'ap-1', chatId: 'ch-1', cwd: 'C:/p', sessionId: 's-1', titolo: 'NexoraOS', cosa: 'scrivi', testo: 'Leggi ed esegui le istruzioni in .sierradeck/consegne/c-1.md (dal tuo supervisore).', workspace: 'NexoraOS' }

/** Un tempo finto: `dopo` avanza un orologio e si esegue in ordine. */
function banco(p: {
  riquadro: () => { paneId: string; ptyId?: string; remotoSu?: string } | undefined
  pronto?: () => boolean
  scelta?: () => boolean
  parteAlInvio?: boolean
}) {
  const scritti: { t: number; testo: string }[] = []
  const passi: string[] = []
  const segnali: InvioMancato[] = []
  const tornato: Consegna[] = []
  let ora = 0
  let partita = false
  const coda: { quando: number; f: () => void }[] = []
  const ponte: Ponte = {
    riquadroDi: () => p.riquadro(),
    apri: () => 'p-nuovo',
    scrivi: (_id, testo) => { scritti.push({ t: ora, testo }); if (testo === INVIO && p.parteAlInvio !== false) partita = true },
    prontoARicevere: () => !partita && (p.pronto?.() ?? false),
    partita: () => (partita ? true : undefined),
    sceltaAperta: () => p.scelta?.() ?? false,
    segnala: (s) => { segnali.push(s) },
    registra: (x) => { passi.push(x) },
    tornaNelSuoWorkspace: (c) => { tornato.push(c) }
  }
  const dopo = (ms: number, f: () => void): void => { coda.push({ quando: ora + ms, f }) }
  const corri = (fino = 30 * 60_000): void => {
    for (let i = 0; i < 100_000 && coda.length > 0; i++) {
      coda.sort((a, b) => a.quando - b.quando)
      if (coda[0]!.quando > fino) break
      const x = coda.shift()!
      ora = x.quando
      x.f()
    }
  }
  return { ponte, dopo, corri, scritti, passi, segnali, tornato }
}

/**
 * Caso NexoraOS (07/10 16:24 UTC): il riquadro della chat dell'autopilota era
 * diventato remoto (casa su un altro PC) e la consegna aspettava 90 secondi per
 * poi dire «guasto del programma: il terminale non è nato» (0.52.5).
 */
describe('la consegna a una chat diventata remota', () => {
  it('la riporta qui una volta: se il cancello la lascia partire, il compito si scrive', () => {
    let remota = true
    const riportate: string[] = []
    const b = banco({ riquadro: () => remota ? { paneId: 'p', remotoSu: 'DESKTOP' } : { paneId: 'p', ptyId: 'pty-1' }, pronto: () => true })
    b.ponte.riportaQui = (id) => { riportate.push(id); remota = false }
    eseguiConsegna(consegna, b.ponte, b.dopo)
    b.corri()
    expect(riportate).toEqual(['p'])
    expect(b.scritti.some((s) => s.testo === consegna.testo)).toBe(true)
    expect(b.segnali).toHaveLength(0)
  })
  it('se resta remota (scelta di Nicholas) lo dice subito e chiaro, senza chiamarlo guasto', () => {
    const riportate: string[] = []
    const b = banco({ riquadro: () => ({ paneId: 'p', remotoSu: 'DESKTOP' }) })
    b.ponte.riportaQui = (id) => { riportate.push(id) }
    eseguiConsegna(consegna, b.ponte, b.dopo)
    b.corri()
    expect(riportate).toEqual(['p'])
    expect(b.segnali).toHaveLength(1)
    expect(b.segnali[0]!.motivo).toContain('ospitata da DESKTOP')
    expect(b.segnali[0]!.motivo).toContain('Porta qui la chat')
    expect(b.segnali[0]!.motivo).not.toContain('guasto')
    expect(b.scritti).toHaveLength(0)
    expect(b.passi.join(String.fromCharCode(10))).toContain('la riporto qui')
  })
})

describe('la consegna con un prompt mai riconosciuto', () => {
  it('scrive lo stesso entro il tetto, poi Invio, e registra ogni passo', () => {
    const b = banco({ riquadro: () => ({ paneId: 'p', ptyId: 'pty-1' }), pronto: () => false })
    eseguiConsegna(consegna, b.ponte, b.dopo)
    b.corri()
    const riga = b.scritti.find((s) => s.testo === consegna.testo)
    expect(riga).toBeDefined()
    expect(riga!.t).toBeLessThanOrEqual(TETTO_PRONTEZZA_MS + 2 * RIPROVA_MS)
    expect(b.scritti.some((s) => s.testo === INVIO)).toBe(true)
    const tutti = b.passi.join('\n')
    for (const p of ['ritirata', 'riquadro trovato', 'tetto di', 'scritta', 'invio 1', 'partita']) expect(tutti).toContain(p)
  })

  it('pronta subito: scrive subito, senza aspettare il tetto', () => {
    const b = banco({ riquadro: () => ({ paneId: 'p', ptyId: 'pty-1' }), pronto: () => true })
    eseguiConsegna(consegna, b.ponte, b.dopo)
    b.corri()
    expect(b.scritti[0]?.t).toBeLessThan(1000)
    expect(b.passi.join('\n')).toContain('pronta dopo')
  })
})

describe('una scelta sullo schermo non si scrive alla cieca', () => {
  it('lo dice una volta come domanda della chat e non scrive; quando la scelta è fatta, consegna', () => {
    let scelta = true
    const b = banco({ riquadro: () => ({ paneId: 'p', ptyId: 'pty-1' }), pronto: () => !scelta, scelta: () => scelta })
    eseguiConsegna(consegna, b.ponte, b.dopo)
    b.corri(60_000)
    expect(b.scritti).toEqual([])
    expect(b.segnali).toHaveLength(1)
    expect(b.segnali[0]?.motivo).toContain('domanda della chat')
    scelta = false
    b.corri()
    expect(b.scritti[0]?.testo).toBe(consegna.testo)
  })
  it('riconosce le scelte vere di Claude Code', () => {
    expect(sceltaSulloSchermo([' Quick safety check: Is this a project you created or one you trust?', ' ❯ No, exit', '   Yes, I trust this folder', ' Enter to confirm · Esc to cancel'])).toBe(true)
    expect(sceltaSulloSchermo(['Do you want to proceed?', '❯ 1. Yes', '  2. No'])).toBe(true)
    expect(sceltaSulloSchermo(['────', '❯', '────', '  ⏵⏵ bypass permissions on (shift+tab to cycle)'])).toBe(false)
  })
})

describe('mai un attesa senza fine e muta', () => {
  it('il riquadro sparisce (workspace cambiato all avvio): torna nel suo workspace, una volta, e poi consegna', () => {
    let dove: { paneId: string; ptyId?: string } | undefined
    const b = banco({ riquadro: () => dove, pronto: () => true })
    b.ponte.tornaNelSuoWorkspace = (c) => { b.tornato.push(c); dove = { paneId: 'p', ptyId: 'pty-1' } }
    eseguiConsegna(consegna, b.ponte, b.dopo)
    b.corri()
    expect(b.tornato).toHaveLength(1)
    expect(b.scritti[0]?.testo).toBe(consegna.testo)
  })
  it('il riquadro non compare mai: alla resa lo dice nel registro e nel diario', () => {
    const b = banco({ riquadro: () => undefined })
    eseguiConsegna(consegna, b.ponte, b.dopo)
    b.corri()
    expect(b.scritti).toEqual([])
    expect(b.segnali).toHaveLength(1)
    expect(b.segnali[0]?.motivo).toContain('guasto del programma')
    expect(b.passi.join('\n')).toContain('resa dopo')
    expect(b.passi.join('\n')).toMatch(new RegExp(`resa dopo ${Math.round(RESA_MS / 1000)} s`))
  })
})

describe('il testo digitato mentre Claude Code carica non si perde in silenzio', () => {
  it('campo vuoto senza il messaggio fra quelli mandati: non è «partita», è perso', async () => {
    const { consegnaPartita, testoPerso } = await import('../../src/renderer/ultime-righe')
    const vuoto = ['● risposta vecchia', '────', '❯', '────', '  ⏵⏵ bypass permissions on (shift+tab to cycle)']
    expect(consegnaPartita(vuoto, consegna.testo)).toBeUndefined()
    expect(testoPerso(vuoto, consegna.testo)).toBe(true)
    const mandato = [`❯ ${consegna.testo}`, '● Fatto.', '────', '❯', '────']
    expect(consegnaPartita(mandato, consegna.testo)).toBe(true)
    expect(testoPerso(mandato, consegna.testo)).toBe(false)
  })
  it('con il ponte: il testo perso viene riscritto prima del nuovo Invio', () => {
    let invii = 0
    let campo = ''
    let mandato = false
    const b = banco({ riquadro: () => ({ paneId: 'p', ptyId: 'pty-1' }), pronto: () => true, parteAlInvio: false })
    const scriviVero = b.ponte.scrivi
    b.ponte.scrivi = (id, t) => {
      scriviVero(id, t)
      if (t === INVIO) { invii++; if (invii >= 2 && campo !== '') mandato = true; campo = '' }
      else if (invii >= 1) campo += t // il primo testo si perde: Claude Code non ascoltava
    }
    b.ponte.prontoARicevere = () => !mandato
    b.ponte.partita = () => (mandato ? true : undefined)
    b.ponte.perso = () => !mandato && campo === ''
    eseguiConsegna(consegna, b.ponte, b.dopo)
    b.corri()
    expect(b.scritti.filter((s) => s.testo === consegna.testo).length).toBe(2)
    expect(mandato).toBe(true)
    expect(b.passi.join('\n')).toContain('lo riscrivo')
  })
})
