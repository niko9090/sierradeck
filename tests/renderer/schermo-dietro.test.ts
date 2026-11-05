import { describe, it, expect } from 'vitest'
import { Terminal } from '@xterm/headless'
import type { HostToCore } from '@shared/protocol'
import { quantiDietro, tieniSchermiDietro, type TerminaleDietro } from '../../src/renderer/schermo-dietro'
import { finestraDiPty, haSchermo, registraSchermo } from '../../src/renderer/schermo-terminale'

/**
 * 0.92.1, Nicholas 05/11: la chat «è aperta e sta andando ma non la sto
 * visualizzando … perché c'è aperto un altro workspace». Da un altro PC ne
 * arrivava una riga sola: senza riquadro non c'era uno schermo da leggere.
 */
describe('lo schermo delle chat dei workspace di dietro (0.92.1)', () => {
  it('nasce dalla cronologia, segue il flusso, e lascia il posto al riquadro quando torna', async () => {
    const ascoltatori = new Map<string, (m: HostToCore) => void>()
    const agganciati: string[] = []
    const crea = (cols: number, rows: number): TerminaleDietro => new Terminal({ cols, rows, allowProposedApi: true }) as unknown as TerminaleDietro
    const d = { ascolta: (id: string, cb: (m: HostToCore) => void) => { ascoltatori.set(id, cb) }, attach: (id: string) => { agganciati.push(id) }, crea }
    tieniSchermiDietro(['pty-b'], d)
    expect(agganciati).toEqual(['pty-b'])
    expect(haSchermo('pty-b')).toBe(true)
    ascoltatori.get('pty-b')!({ id: 'pty-b', kind: 'scrollback', data: 'riga uno\r\nriga due\r\n' })
    ascoltatori.get('pty-b')!({ id: 'pty-b', kind: 'data', data: 'riga tre' })
    await new Promise((r) => setTimeout(r, 50))
    const f = finestraDiPty('pty-b', -1, 50)
    expect(f?.pulite.filter((x) => x.trim() !== '')).toEqual(['riga uno', 'riga due', 'riga tre'])
    expect(f?.colonne).toBe(120)
    // Un secondo giro non ne crea un altro.
    tieniSchermiDietro(['pty-b'], d)
    expect(agganciati).toHaveLength(1)
    // Il riquadro torna a schermo: il suo xterm prende il posto, questo si spegne.
    registraSchermo('pty-b', () => ({ baseY: 0, length: 0, getLine: () => undefined }) as never, () => 30, () => 100)
    expect(quantiDietro()).toBe(0)
    // Chiusa: niente più schermo di dietro.
    tieniSchermiDietro(['pty-c'], d)
    tieniSchermiDietro([], d)
    expect(haSchermo('pty-c')).toBe(false)
  })
})
