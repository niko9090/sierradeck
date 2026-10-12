import { describe, it, expect } from 'vitest'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { cercaAutopiloti, contaGruppiAp, ordinaAutopiloti, rigaPcMuto, vistaAutopilota } from '@shared/autopiloti-vista'

/** Gli autopiloti riprogettati (0.70.0): lo stato in una parola, un verbo per riga. */
const ORA = Date.parse('2026-10-13T02:00:00Z')
function ap(over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-1', nome: 'Riordina', obiettivo: 'Riordina il leggimi', cwd: 'C:/prova',
      criteri: [{ descrizione: 'a', soddisfatto: true }, { descrizione: 'b', soddisfatto: false }],
      iniziatoIl: '2026-10-13T01:00:00.000Z'
    }),
    ultimoEvento: '2026-10-13T01:58:00.000Z',
    ...over
  }
}

describe('lo stato in una parola', () => {
  it('ogni stato con il suo colore e il suo verbo', () => {
    expect(vistaAutopilota(ap({ stato: 'lavoro' }), ORA)).toMatchObject({ stato: { parola: 'al lavoro', colore: 'verde' }, azione: 'ferma', criteri: { testo: '1/2' } })
    expect(vistaAutopilota(ap({ stato: 'attesa' }), ORA)).toMatchObject({ stato: { parola: 'aspetta te', colore: 'ambra' }, azione: 'rispondi' })
    expect(vistaAutopilota(ap({ stato: 'pronto' }), ORA).stato.parola).toBe('pronto')
    expect(vistaAutopilota(ap({ stato: 'sospeso', motivoSospensione: 'fermato da te' }), ORA)).toMatchObject({ stato: { parola: 'fermo', ragione: 'fermato da te' }, azione: 'riprendi' })
    expect(vistaAutopilota(ap({ stato: 'finito' }), ORA).stato.parola).toBe('finito')
    expect(vistaAutopilota(ap({ stato: 'intervista' }), ORA).stato.parola).toBe('si prepara')
  })
  it('il guasto vince sul verde: prima la riga diceva «al lavoro» e «guasto» insieme', () => {
    expect(vistaAutopilota(ap({ stato: 'fallito', motivoSospensione: 'guasto del programma' }), ORA)).toMatchObject({ stato: { id: 'guasto', colore: 'rosso' } })
  })
  it('al lavoro senza segni da 10 minuti: «senza segni», ambra', () => {
    expect(vistaAutopilota(ap({ stato: 'lavoro' }), ORA, ORA - 11 * 60_000).stato).toMatchObject({ parola: 'senza segni', colore: 'ambra' })
  })
  it('una domanda aperta mentre lavora: aspetta te', () => {
    expect(vistaAutopilota({ ...ap({ stato: 'lavoro' }), domanda: 'quale cartella?' }, ORA).stato.parola).toBe('aspetta te')
  })
})

describe('gruppi, ordine, ricerca', () => {
  const righe = [ap({ id: 'a', nome: 'Finito', stato: 'finito' }), ap({ id: 'b', nome: 'Rotto', stato: 'fallito' }), ap({ id: 'c', nome: 'Va', stato: 'lavoro' })]
    .map((a) => ({ ...a, vista: vistaAutopilota(a, ORA) }))
  it('i conti dei gruppi', () => {
    expect(contaGruppiAp(righe.map((r) => r.vista))).toEqual({ lavoro: 1, aspettano: 1, fermi: 1, finiti: 1, tutti: 3 })
  })
  it('prima il guasto, poi chi lavora, poi chi ha finito', () => {
    expect(ordinaAutopiloti(righe).map((r) => r.nome)).toEqual(['Rotto', 'Va', 'Finito'])
  })
  it('la ricerca guarda nome, obiettivo e cartella', () => {
    expect(cercaAutopiloti(righe, 'rotto').map((r) => r.id)).toEqual(['b'])
    expect(cercaAutopiloti(righe, 'leggimi')).toHaveLength(3)
  })
  it('un PC che non risponde è una riga sola', () => {
    expect(rigaPcMuto('La cassaforte è chiusa')).toMatchObject({ parola: 'non risponde', colore: 'ambra', ragione: 'La cassaforte è chiusa' })
  })
})
