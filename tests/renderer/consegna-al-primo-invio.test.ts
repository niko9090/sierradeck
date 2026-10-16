import { describe, it, expect } from 'vitest'
import { eseguiConsegna, type Consegna, type Ponte } from '../../src/renderer/consegne-autopilota'
import { consegnaPartita, contaMandati, testoNelCampo, testoPerso } from '../../src/renderer/ultime-righe'

/**
 * 0.75.4, la consegna c-26 del 16/10 (07:27-07:28 UTC): otto invii e il testo
 * arrivato cinque volte nello stesso messaggio. La finestra era appena stata
 * portata nel workspace della chat: il riquadro si rimontava e Claude Code
 * ridisegnava una conversazione lunga, leggendo l'input in ritardo. Il segnale
 * «aspetta» diceva «pronta» subito; il testo (84 caratteri) e l'Invio, scritti a
 * 200 ms l'uno dall'altro, gli arrivavano nello stesso pezzo. Provato con
 * Claude Code 2.1.301: un pezzo con un testo da 70 caratteri in su vale come
 * incollato e l'Invio dentro non manda, e il primo Invio da solo dopo nemmeno.
 *
 * Qui un Claude Code finto che fa esattamente così.
 */
const INVIO = String.fromCharCode(13)
const TESTO = 'Leggi ed esegui le istruzioni in .sierradeck/consegne/c-26.md (dal tuo supervisore).'

function orologio() {
  let ora = 0
  const coda: Array<{ quando: number; cosa: () => void }> = []
  const dopo = (ms: number, cosa: () => void): void => { coda.push({ quando: ora + ms, cosa }) }
  const corri = (fino = 10 * 60_000): void => {
    for (let i = 0; i < 100_000 && coda.length > 0; i += 1) {
      coda.sort((a, b) => a.quando - b.quando)
      const p = coda.shift()!
      if (p.quando > fino) { coda.unshift(p); return }
      ora = p.quando
      p.cosa()
    }
  }
  return { dopo, corri, adesso: () => ora }
}

/**
 * Claude Code finto: occupato fino a `occupatoFino` (ridisegna e scrive sullo
 * schermo), e intanto quello che gli si scrive si accumula e lo legge tutto
 * insieme. Un pezzo lungo con dentro l'Invio: il testo resta nel campo, e il
 * primo Invio da solo dopo non basta (come la 2.1.301).
 */
function claudeFinto(t: ReturnType<typeof orologio>, occupatoFino: number) {
  let campo = ''
  const mandati: string[] = []
  let inAttesa = ''
  let invioDaIgnorare = false
  let lavoraDa: number | undefined
  const leggi = (): void => {
    if (inAttesa === '') return
    const pezzo = inAttesa
    inAttesa = ''
    const testo = pezzo.split(INVIO).join('')
    const conInvio = pezzo.includes(INVIO)
    if (testo !== '' && conInvio && testo.length >= 70) { campo += testo; invioDaIgnorare = true; return }
    campo += testo
    if (!conInvio) return
    if (invioDaIgnorare) { invioDaIgnorare = false; return }
    if (campo !== '') { mandati.push(campo); campo = ''; lavoraDa = t.adesso() }
  }
  const occupato = (): boolean => t.adesso() < occupatoFino
  const righe = (): string[] => {
    if (!occupato()) leggi()
    const lavora = lavoraDa !== undefined && t.adesso() - lavoraDa < 5_000
    return [
      ...mandati.map((m) => `❯ ${m}`),
      ...(lavora ? ['✻ Lavoro… (2s · thinking)'] : []),
      '────', `❯ ${campo}`, '────', '  ⏵⏵ bypass permissions on'
    ]
  }
  return {
    scrivi: (testo: string) => { inAttesa += testo; if (!occupato()) leggi() },
    righe, occupato, mandati: () => mandati
  }
}

function ponteSu(t: ReturnType<typeof orologio>, cc: ReturnType<typeof claudeFinto>, passi: string[], invii: { n: number }): Ponte {
  return {
    riquadroDi: () => ({ paneId: 'p-1', ptyId: 'pty-1' }),
    apri: () => 'p-1',
    scrivi: (_p, testo) => { if (testo === INVIO) invii.n += 1; cc.scrivi(testo) },
    // Il segnale «aspetta» del turno: pronta sempre, anche mentre ridisegna.
    prontoARicevere: () => true,
    partita: (_p, scritto, prima) => consegnaPartita(cc.righe(), scritto, prima),
    perso: (_p, scritto, prima) => testoPerso(cc.righe(), scritto ?? '', prima),
    mandati: (_p, scritto) => contaMandati(cc.righe(), scritto),
    natoDa: () => 600_000,
    registra: (p) => { passi.push(p) },
    nelCampo: (_p, scritto) => testoNelCampo(cc.righe(), scritto),
    // Mentre ridisegna il terminale scrive: non tace.
    quieto: () => !cc.occupato()
  }
}

describe('la consegna parte al primo Invio anche con una chat che ridisegna (0.75.4)', () => {
  it('il caso della c-26: un Invio solo, il testo una volta sola', () => {
    const t = orologio()
    const cc = claudeFinto(t, 1_500)
    const passi: string[] = []
    const invii = { n: 0 }
    const c: Consegna = { id: 'c-26', autopilotaId: 'ap-1', chatId: 'ap-1', cwd: 'C:\\P', sessionId: 's-1', titolo: 'Esempio', cosa: 'scrivi', testo: TESTO }
    eseguiConsegna(c, ponteSu(t, cc, passi, invii), t.dopo)
    t.corri()
    expect(cc.mandati()).toEqual([TESTO])
    expect(invii.n).toBe(1)
    expect(passi.some((p) => p.includes('lo riscrivo'))).toBe(false)
    expect(passi.at(-1)).toContain('partita')
  })

  it('senza aspettare la quiete e l’eco (come fino alla 0.75.3) il Claude Code finto rifà il difetto', () => {
    const t = orologio()
    const cc = claudeFinto(t, 1_500)
    const passi: string[] = []
    const invii = { n: 0 }
    const { nelCampo: _n, quieto: _q, ...vecchio } = ponteSu(t, cc, passi, invii)
    eseguiConsegna({ id: 'c-26', autopilotaId: 'ap-1', chatId: 'ap-1', cwd: 'C:\\P', sessionId: 's-1', titolo: 'Esempio', cosa: 'scrivi', testo: TESTO }, vecchio, t.dopo)
    t.corri()
    expect(invii.n).toBeGreaterThan(1)
  })

  it('a chat quieta resta un Invio solo, come sempre', () => {
    const t = orologio()
    const cc = claudeFinto(t, 0)
    const invii = { n: 0 }
    eseguiConsegna({ id: 'c-1', autopilotaId: 'ap-1', chatId: 'ap-1', cwd: 'C:\\P', sessionId: 's-1', titolo: 'Esempio', cosa: 'scrivi', testo: TESTO }, ponteSu(t, cc, [], invii), t.dopo)
    t.corri()
    expect(cc.mandati()).toEqual([TESTO])
    expect(invii.n).toBe(1)
  })
})

describe('0.76.0: una chat ferma su una sua domanda non è un guasto', () => {
  it('niente banda «non risulta partito» con il tasto Invio: solo una nota nel diario', async () => {
    const { readFileSync } = await import('node:fs')
    const app = readFileSync('src/renderer/App.tsx', 'utf8')
    expect(app).toContain("if (s.motivo.startsWith('domanda della chat')) {")
  })
})
