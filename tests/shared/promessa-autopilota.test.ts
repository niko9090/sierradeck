import { describe, it, expect } from 'vitest'
import { promessaSenzaLavoro } from '@shared/promessa-autopilota'
import { paginaClient } from '../../src/main/client-pagina'

/**
 * 0.75.4, «L'autopilota è fermo: Riprendi» (Nicholas, 16/10: «scrivo
 * all'autopilota, lui mi dice che procede, ma la chat continua a rimanere
 * ferma»). Se l'ultima parola è sua, promette lavoro e lui è fermo, la scheda
 * lo dice con il tasto, su PC, pagina e app.
 */
const lui = (testo: string, esito?: string) => ({ quando: '2026-10-16T08:14:23.000Z', da: 'lui' as const, testo, ...(esito !== undefined ? { esito } : {}) })

describe('la promessa senza lavoro', () => {
  it('fermo e la sua ultima risposta promette lavoro: la riga c’è', () => {
    expect(promessaSenzaLavoro({ stato: 'finito', dialogo: [lui('Va bene, procedo con il resto.')] })).toBe(true)
    expect(promessaSenzaLavoro({ stato: 'sospeso', dialogo: [lui('Hai ragione, le tolgo.')] })).toBe(true)
    expect(promessaSenzaLavoro({ stato: 'finito', dialogo: [lui('Quasi tutto, ma non tutto.', 'cambio applicato')] })).toBe(true)
  })

  it('al lavoro, senza promessa o con l’ultima parola tua: niente riga', () => {
    expect(promessaSenzaLavoro({ stato: 'lavoro', dialogo: [lui('Procedo.')] })).toBe(false)
    expect(promessaSenzaLavoro({ stato: 'finito', dialogo: [lui('Sì, ho finito: i criteri passano.', 'nessun cambio')] })).toBe(false)
    expect(promessaSenzaLavoro({ stato: 'finito', dialogo: [lui('Procedo.'), { quando: 'x', da: 'tu', testo: 'grazie' }] })).toBe(false)
    expect(promessaSenzaLavoro({ stato: 'finito', dialogo: [] })).toBe(false)
  })

  it('la pagina del telefono mostra la riga con «Riprendi»', () => {
    const html = paginaClient()
    expect(html).toContain('a.fermoConPromessa')
    expect(html).toContain('L’autopilota è fermo (')
    expect(html).toContain('onclick="riprendiAp(this.dataset.ap)">Riprendi</button>')
  })
})
