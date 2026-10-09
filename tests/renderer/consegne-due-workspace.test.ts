import { describe, it, expect, beforeEach } from 'vitest'
import { eseguiConsegna, liberaTurno, type Consegna, type Ponte } from '../../src/renderer/consegne-autopilota'

/**
 * 0.56.1, il caso del 09/10 dopo l'aggiornamento alla 0.56.0: al riavvio
 * arrivano insieme due consegne per due chat in workspace diversi, e la
 * finestra è una sola. Prima la seconda riportava via la finestra alla prima,
 * che si arrendeva dopo 90 s («riquadro mai trovato»): la chat di NexoraOS
 * restava ferma. Adesso il cambio di workspace è di una consegna alla volta.
 */
const INVIO = String.fromCharCode(13)
const c1: Consegna = { id: 'c-1', autopilotaId: 'ap-1', chatId: 'ch-1', cwd: 'C:/Progetti/Uno', sessionId: 's-uno', titolo: 'Uno', cosa: 'scrivi', testo: 'Leggi ed esegui le istruzioni in .sierradeck/consegne/c-1.md', workspace: 'Uno' }
const c2: Consegna = { id: 'c-2', autopilotaId: 'ap-2', chatId: 'ch-2', cwd: 'C:/Progetti/Due', sessionId: 's-due', titolo: 'Due', cosa: 'scrivi', testo: 'Leggi ed esegui le istruzioni in .sierradeck/consegne/c-2.md', workspace: 'Due' }

function finestra() {
  // Una finestra sola: si vede un workspace alla volta; il cambio arriva dopo un attimo.
  let attivo = 'Altro'
  let ora = 0
  const coda: { quando: number; f: () => void }[] = []
  const scritti: { chat: string; testo: string }[] = []
  const passi: string[] = []
  const segnali: string[] = []
  const partite = new Set<string>()
  const dove: Record<string, string> = { 's-uno': 'Uno', 's-due': 'Due' }
  const dopo = (ms: number, f: () => void): void => { coda.push({ quando: ora + ms, f }) }
  const ponte: Ponte = {
    riquadroDi: (s) => dove[s] === attivo ? { paneId: 'p-' + s, ptyId: 'pty-' + s } : undefined,
    apri: () => 'p-nuovo',
    scrivi: (pty, testo) => { scritti.push({ chat: pty, testo }); if (testo === INVIO) partite.add(pty) },
    prontoARicevere: (pty) => !partite.has(pty),
    partita: (pty) => (partite.has(pty) ? true : undefined),
    registra: (x) => { passi.push(x) },
    segnala: (s) => { segnali.push(s.motivo) },
    tornaNelSuoWorkspace: (c) => { dopo(1200, () => { attivo = c.workspace ?? attivo }) }
  }
  const corri = (fino = 10 * 60_000): void => {
    for (let i = 0; i < 200_000 && coda.length > 0; i++) {
      coda.sort((a, b) => a.quando - b.quando)
      if (coda[0]!.quando > fino) break
      const x = coda.shift()!
      ora = x.quando
      x.f()
    }
  }
  return { ponte, dopo, corri, scritti, passi, segnali }
}

describe('due consegne, due workspace, una finestra', () => {
  beforeEach(() => liberaTurno())
  it('si danno il turno: tutte e due scrivono il loro compito, nessuna si arrende', () => {
    const f = finestra()
    eseguiConsegna(c1, f.ponte, f.dopo)
    eseguiConsegna(c2, f.ponte, f.dopo)
    f.corri()
    const testi = f.scritti.map((x) => `${x.chat}:${x.testo}`)
    expect(testi.some((t) => t.includes('pty-s-uno') && t.includes('c-1.md'))).toBe(true)
    expect(testi.some((t) => t.includes('pty-s-due') && t.includes('c-2.md'))).toBe(true)
    expect(f.segnali).toEqual([])
    expect(f.passi.join('\n')).not.toContain('resa dopo')
    expect(f.passi.join('\n')).toContain('aspetto che abbia scritto')
  })
  it('tre consegne in tre momenti: anche la terza arriva', () => {
    const f = finestra()
    const c3: Consegna = { ...c1, id: 'c-3', testo: 'terzo compito' }
    eseguiConsegna(c1, f.ponte, f.dopo)
    eseguiConsegna(c2, f.ponte, f.dopo)
    f.dopo(3000, () => eseguiConsegna(c3, f.ponte, f.dopo))
    f.corri()
    expect(f.scritti.filter((x) => x.testo !== INVIO).map((x) => x.testo).sort()).toEqual([c1.testo, c2.testo, 'terzo compito'].sort())
    expect(f.segnali).toEqual([])
  })
})
