import { describe, it, expect } from 'vitest'
import { menuSpecialisti, type VistaMenu } from '../../src/shared/menu-specialisti'

/** k-54: il menu Specialisti nella chat dell'autopilota, le righe pronte da disegnare. */
const vista: VistaMenu = {
  alLavoro: [
    { id: 'a1', workspace: 'C:\\Lavori\\Altro', workspaceNome: 'Altro', compito: 'k-9', descrizione: 'k-9: prova', titolo: 'Prova di lettura', cosaFa: 'Legge i file', percentuale: 40, minutiStimati: 12 },
    { id: 'a2', workspace: 'C:\\Lavori\\Mio', workspaceNome: 'Mio', descrizione: 'tabella', percentuale: 99, minutiStimati: 90, inRitardo: true, fermaRichiesta: true }
  ],
  inFila: [
    { id: 'f1', workspace: 'cartella:c:\\lavori\\mio', descrizione: 'ultima', posizione: 1, prenotata: true, minutiStimati: 20 },
    { id: 'f2', workspace: 'C:\\Lavori\\Altro', descrizione: 'ricerca', posizione: 2, parcheggiata: true }
  ],
  totale: { minuti: 75, compiti: 4 }
}

describe('menuSpecialisti', () => {
  const m = menuSpecialisti(vista, ['cartella:c:\\lavori\\mio', 'C:\\Lavori\\Mio'])

  it('il tasto dice quanti lavorano e quanti sono in fila', () => {
    expect(m.etichetta).toBe('Specialisti 2 · 2 in fila')
    expect(menuSpecialisti({ alLavoro: [vista.alLavoro[0]!], inFila: [] }, []).etichetta).toBe('Specialisti 1')
    expect(menuSpecialisti({ alLavoro: [], inFila: [] }, []).etichetta).toBe('Specialisti · nessuno')
  })

  it('chi lavora nel workspace della chat sta in testa, in evidenza, senza nome del workspace', () => {
    expect(m.lavorano.map((r) => r.id)).toEqual(['a2', 'a1'])
    expect(m.lavorano[0]).toMatchObject({ corrente: true, altroWorkspace: '' })
    expect(m.lavorano[1]).toMatchObject({ corrente: false, altroWorkspace: 'Altro' })
  })

  it('titolo, percentuale (tetto 95), cosa fa e minuti che mancano', () => {
    const a1 = m.lavorano[1]!
    expect(a1).toMatchObject({ titolo: 'Prova di lettura', percentuale: 40, cosaFa: 'Legge i file', manca: 'mancano circa 12 min', inRitardo: false })
    const a2 = m.lavorano[0]!
    expect(a2).toMatchObject({ titolo: 'tabella', percentuale: 95, manca: 'mancano circa 1 h 30 min', inRitardo: true, fermaRichiesta: true })
  })

  it('la fila resta nell’ordine del posto, con l’attesa stimata; senza stima niente testo', () => {
    expect(m.inFila.map((r) => [r.id, r.posizione])).toEqual([['f1', 1], ['f2', 2]])
    expect(m.inFila[0]).toMatchObject({ manca: 'attesa circa 20 min', prenotata: true, corrente: true })
    expect(m.inFila[1]).toMatchObject({ manca: '', parcheggiata: true, altroWorkspace: 'Altro' })
    expect(m.inFila[0]!.percentuale).toBeUndefined()
  })

  it('il totale, e niente totale se non ci sono compiti', () => {
    expect(m.totale).toBe('circa 1 h 15 min per finire tutto')
    expect(menuSpecialisti({ ...vista, totale: { minuti: 0, compiti: 0 } }, []).totale).toBe('')
    expect(menuSpecialisti({ alLavoro: [], inFila: [] }, []).totale).toBe('')
  })

  it('un titolo lungo si accorcia', () => {
    const r = menuSpecialisti({ alLavoro: [{ id: 'x', workspace: 'W', descrizione: 'a'.repeat(200) }], inFila: [] }, []).lavorano[0]!
    expect(r.titolo.length).toBeLessThanOrEqual(60)
  })
})
