import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseArchivio, quanteFinestre, layoutPerFinestraViva, ordineDeiMonitor,
  type Archivio
} from '@shared/workspace'

/**
 * **Tutti i workspace e le loro chat tornano come sono stati salvati.**
 *
 * Non una proprietà da controllare a mano riaprendo il programma: il giro
 * intero — leggo il file, decido quante finestre aprire, ogni finestra chiede il
 * suo layout, poi passo per tutti i workspace — fatto qui, dove si può ripetere
 * a ogni modifica.
 *
 * Il difetto è tornato quattro volte, e tutte le volte era una chat che restava
 * nel file senza che nessuno la chiedesse. Questa è la prova che quel caso non
 * esiste più: si confronta l'insieme delle conversazioni **salvate** con quello
 * delle conversazioni **consegnate a una finestra**, workspace per workspace.
 * Se non coincidono, qualcosa è rimasto indietro.
 */

/** Chi c'è nel file, workspace per workspace. */
function salvate(a: Archivio): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const w of a.workspace) {
    const u = new Set<string>()
    for (const l of Object.values(w.perSlot)) for (const p of l.panes) u.add(p.sessionUuid)
    m.set(w.nome, [...u].sort())
  }
  return m
}

/**
 * Chi arriva davvero a schermo: si aprono `quanteFinestre` finestre, e per ogni
 * workspace ognuna chiede il proprio layout — esattamente come fa il Core.
 */
function consegnate(a: Archivio): Map<string, string[]> {
  const quante = quanteFinestre(a.workspace)
  const slotVivi = Array.from({ length: quante }, (_, i) => String(i + 1))
  const m = new Map<string, string[]>()
  for (const w of a.workspace) {
    const viste: string[] = []
    for (const slot of slotVivi) {
      const l = layoutPerFinestraViva(w.perSlot, slot, slotVivi)
      for (const p of l.panes) viste.push(p.sessionUuid)
    }
    // Nessuna conversazione deve arrivare a due finestre: sarebbe la stessa chat
    // aperta due volte, con due processi sullo stesso lavoro.
    expect(new Set(viste).size, `«${w.nome}»: una chat consegnata a due finestre`)
      .toBe(viste.length)
    m.set(w.nome, viste.sort())
  }
  return m
}

function giro(raw: unknown): { prima: Archivio; dopo: Map<string, string[]> } {
  const prima = parseArchivio(raw).archivio
  return { prima, dopo: consegnate(prima) }
}

describe('riaprendo, torna tutto', () => {
  it('due monitor restano due finestre, ognuna con le sue chat', () => {
    // Il caso vero di chi lavora su due schermi. La prima stesura della
    // migrazione schiacciava tutto in una finestra sola: due finestre
    // diventavano una e le chat dei due monitor finivano ammucchiate. Tornare a
    // metà non è tornare.
    const A = '1920x1080@0,0@1'
    const B = '1920x1080@1920,0@1'
    const chat = (id: string): unknown => ({
      root: { type: 'pane', id },
      panes: [{ id, sessionUuid: 'u-' + id, cwd: 'C:/p', title: id }]
    })
    const a = parseArchivio({
      versione: 1, attivo: 'Wdeck',
      workspace: [
        { nome: 'Wdeck', perMonitor: { [A]: chat('sinistra'), [B]: chat('destra') } },
        { nome: 'HA', perMonitor: { [A]: chat('ha'), [B]: { root: undefined, panes: [] } } }
      ]
    }).archivio

    expect(quanteFinestre(a.workspace)).toBe(2)
    // Il monitor di sinistra è lo slot 1 **in tutti i workspace**: la finestra
    // numero 1 lo ritrova ovunque, invece di cambiare posto secondo dove sei.
    expect(a.workspace[0]?.perSlot['1']?.panes[0]?.sessionUuid).toBe('u-sinistra')
    expect(a.workspace[0]?.perSlot['2']?.panes[0]?.sessionUuid).toBe('u-destra')
    expect(a.workspace[1]?.perSlot['1']?.panes[0]?.sessionUuid).toBe('u-ha')
    expect(salvate(a)).toEqual(consegnate(a))
  })

  it('e chi apre le finestre usa lo stesso ordine dei monitor', () => {
    // È l'unica cosa che tiene insieme «slot 1» e «prima finestra». Ordinando in
    // due modi diversi, la finestra di destra si aprirebbe con le chat di quella
    // di sinistra: di nuovo «le chat non sono dove le avevo lasciate».
    expect(ordineDeiMonitor(['1920x1080@1920,0@1', '1920x1080@0,0@1']))
      .toEqual(['1920x1080@0,0@1', '1920x1080@1920,0@1'])
  })

  it('un archivio gia a slot torna identico', () => {
    const chat = (id: string): unknown => ({
      root: { type: 'pane', id },
      panes: [{ id, sessionUuid: 'u-' + id, cwd: 'C:/p', title: id }]
    })
    const { prima, dopo } = giro({
      versione: 1, attivo: 'Uno',
      workspace: [
        { nome: 'Uno', perSlot: { '1': chat('a'), '2': chat('b') } },
        { nome: 'Due', perSlot: { '1': chat('c') } }
      ]
    })
    expect(dopo).toEqual(salvate(prima))
  })

  it('anche con i buchi e con piu slot delle finestre che si aprono', () => {
    const chat = (id: string): unknown => ({
      root: { type: 'pane', id },
      panes: [{ id, sessionUuid: 'u-' + id, cwd: 'C:/p', title: id }]
    })
    const perSlot: Record<string, unknown> = {}
    for (const k of ['1', '3', '7', '9', '11', '12']) perSlot[k] = chat('p' + k)
    const { prima, dopo } = giro({
      versione: 1, attivo: 'Uno', workspace: [{ nome: 'Uno', perSlot }]
    })
    expect(dopo).toEqual(salvate(prima))
    expect(salvate(prima).get('Uno')).toHaveLength(6)
  })

  /**
   * E infine il file **vero** di questa macchina, se c'è.
   *
   * Un caso costruito a tavolino dimostra quello che chi lo scrive ha pensato;
   * il file di chi usa davvero il programma contiene anche quello a cui non ha
   * pensato nessuno — ed è lì che questo difetto si è nascosto quattro volte.
   * Si salta senza rumore dove quel file non esiste (un'altra macchina, la CI).
   */
  it('il file di questa macchina: nessuna chat resta indietro', () => {
    const dati = process.env.APPDATA
    if (dati === undefined) return
    const percorso = join(dati, 'sierradeck', 'workspaces.json')
    if (!existsSync(percorso)) return

    const { prima, dopo } = giro(JSON.parse(readFileSync(percorso, 'utf8')))
    const attese = salvate(prima)
    expect(attese.size).toBeGreaterThan(0)
    expect(dopo).toEqual(attese)
  })
})
