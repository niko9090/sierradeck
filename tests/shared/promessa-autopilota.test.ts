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

describe('0.79.0: promessa mantenuta, poi finito', () => {
  it('se dopo la promessa ha aperto chat o un pezzo è finito, finito non è «fermo con una promessa»', () => {
    const dialogo = [{ quando: '2026-10-18T01:41:00.000Z', da: 'lui' as const, testo: 'Riparto. Apro due compiti nuovi.', esito: 'cambio applicato · per la chat, alla ripresa' }]
    const prima = { stato: 'finito' as const, dialogo, decisioni: [] }
    expect(promessaSenzaLavoro(prima)).toBe(true)
    const aperte = { ...prima, decisioni: [{ quando: '2026-10-18T01:42:00.000Z', cosa: 'apro la chat c-5 (Sviluppo): prodotto.js' }] }
    expect(promessaSenzaLavoro(aperte)).toBe(false)
    const traguardo = { ...prima, decisioni: [{ quando: '2026-10-18T01:45:00.000Z', cosa: 'tecnica', traguardo: { chat: 'c-7', esito: 'approvato' as const, di: 'c-5' } }] }
    expect(promessaSenzaLavoro(traguardo)).toBe(false)
    // Un lavoro di PRIMA della promessa non conta; e sospeso resta sospeso.
    expect(promessaSenzaLavoro({ ...prima, decisioni: [{ quando: '2026-10-18T01:00:00.000Z', cosa: 'apro la chat c-1 (Sviluppo): x' }] })).toBe(true)
    expect(promessaSenzaLavoro({ ...aperte, stato: 'sospeso' as const })).toBe(true)
  })
})
