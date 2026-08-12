import { describe, it, expect } from 'vitest'
import { normalizzaTitolo, titoloPericoloso, TITOLO_MAX } from '@shared/titolo'

describe('titoloPericoloso', () => {
  it('riconosce il doppio apice e i caratteri di controllo', () => {
    expect(titoloPericoloso('" --pericoloso "')).toBe(true)
    expect(titoloPericoloso('un "virgolettato" in mezzo')).toBe(true)
    expect(titoloPericoloso(`riga${String.fromCharCode(10)}due`)).toBe(true)
  })

  it('lascia passare un titolo ordinario', () => {
    expect(titoloPericoloso('Rifattorizzazione del parser')).toBe(false)
    expect(titoloPericoloso("Corretto l'apice singolo, che è innocuo")).toBe(false)
  })
})

describe('normalizzaTitolo', () => {
  it('sostituisce il doppio apice invece di toglierlo', () => {
    // Sostituire e non tagliare: un titolo mozzato sarebbe peggio di uno con
    // un apice reso in modo diverso.
    const pulito = normalizzaTitolo('Corretto il bug della " mancante')
    expect(pulito).toBe('Corretto il bug della ” mancante')
    expect(titoloPericoloso(pulito)).toBe(false)
  })

  it('disinnesca la forma che spezzerebbe gli argomenti', () => {
    const pulito = normalizzaTitolo('" --dangerously-skip-permissions "')
    expect(pulito).not.toContain('"')
    expect(titoloPericoloso(pulito)).toBe(false)
  })

  it('trasforma i caratteri di controllo in spazi e raccoglie il risultato', () => {
    const grezzo = `prima${String.fromCharCode(10)}${String.fromCharCode(13)}seconda`
    expect(normalizzaTitolo(grezzo)).toBe('prima seconda')
  })

  it('non tocca un titolo gia sano', () => {
    expect(normalizzaTitolo('Rifattorizzazione del parser'))
      .toBe('Rifattorizzazione del parser')
  })

  it('accorcia solo quando non c e alternativa, e lo dichiara', () => {
    const lungo = 'a'.repeat(500)
    const pulito = normalizzaTitolo(lungo)
    expect(pulito).toHaveLength(TITOLO_MAX)
    expect(pulito.endsWith('…')).toBe(true)
  })

  it('non produce mai un titolo che il Core rifiuterebbe', () => {
    const ostili = [
      '" --flag "',
      `a${String.fromCharCode(0)}b`,
      '"'.repeat(50),
      'x'.repeat(400) + '"'
    ]
    for (const ostile of ostili) {
      const pulito = normalizzaTitolo(ostile)
      expect(titoloPericoloso(pulito)).toBe(false)
      expect(pulito.length).toBeLessThanOrEqual(TITOLO_MAX)
    }
  })
})
