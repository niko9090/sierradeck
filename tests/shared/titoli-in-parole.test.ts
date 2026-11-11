import { describe, it, expect } from 'vitest'
import { haSigle, inParole, TITOLO_PAROLE_MAX } from '@shared/titoli-in-parole'

describe('i titoli in parole: niente sigle sul telefono', () => {
  it('la sigla davanti se ne va, con il suo segno', () => {
    expect(inParole('k-48: lista d’attesa degli specialisti')).toBe('Lista d’attesa degli specialisti')
    expect(inParole('[r-12] Rifare le notifiche')).toBe('Rifare le notifiche')
    expect(inParole('k-48 descrizione del compito')).toBe('Descrizione del compito')
    expect(inParole('r-12 · in corso')).toBe('In corso')
    expect(inParole('k3 — la pagina')).toBe('La pagina')
    expect(inParole('k-48: r-12 · sistemare il polso')).toBe('Sistemare il polso')
  })
  it('la sigla in mezzo se ne va con la sua preposizione o le sue parentesi', () => {
    expect(inParole('aggiunti 2 punti a r-12')).toBe('Aggiunti 2 punti')
    expect(inParole('compito nuovo per r-3 e r-4')).toBe('Compito nuovo')
    expect(inParole('Rifare il polso (k-48)')).toBe('Rifare il polso')
    expect(inParole('Unite le richieste (r-12, r-14) in una')).toBe('Unite le richieste in una')
    expect(inParole('p-7 superato da p-9: non serve più')).toBe('Superato: non serve più')
  })
  it('il nome comune resta, la sigla no', () => {
    expect(inParole('la richiesta r-12 è fatta')).toBe('La richiesta è fatta')
    expect(inParole('la chat c-241 ha finito')).toBe('La chat ha finito')
    expect(inParole('i compiti k-6, k-7 e k-8 sono chiusi')).toBe('I compiti sono chiusi')
  })
  it('un id scelto dall’autopilota sparisce se chi chiama lo conosce', () => {
    expect(inParole('ui-coda: la coda in parole', { sigle: ['ui-coda'] })).toBe('La coda in parole')
    expect(inParole('La coda in parole (ui-coda)', { sigle: ['ui-coda', undefined, ''] })).toBe('La coda in parole')
    // Senza saperlo resta com’è: non si indovina.
    expect(inParole('ui-coda: la coda in parole')).toBe('Ui-coda: la coda in parole')
  })
  it('non tocca quello che una sigla non è', () => {
    expect(inParole('aggiornare k8s nel cluster')).toBe('Aggiornare k8s nel cluster')
    expect(inParole('il file src/k-12/indice.ts')).toBe('Il file src/k-12/indice.ts')
    expect(inParole('pre-12 e post-3')).toBe('Pre-12 e post-3')
    expect(inParole('Sistemare la pagina')).toBe('Sistemare la pagina')
  })
  it('solo sigle, niente o spazi: vuoto', () => {
    expect(inParole('k-48')).toBe('')
    expect(inParole('  ')).toBe('')
    expect(inParole(undefined)).toBe('')
    expect(inParole('(r-12)')).toBe('')
  })
  it('un titolo lungo si taglia su una parola', () => {
    const lungo = `k-1: ${'parola '.repeat(40)}`
    const t = inParole(lungo)
    expect(t.length).toBeLessThanOrEqual(TITOLO_PAROLE_MAX)
    expect(t.endsWith('…')).toBe(true)
    expect(t).not.toMatch(/parol…$/u)
    expect(inParole('una frase abbastanza lunga da tagliare', { max: 20 })).toBe('Una frase…')
  })
  it('haSigle riconosce le sigle e solo quelle', () => {
    for (const t of ['r-12 · in corso', 'vedi k-48', '(p-3)', 'la chat c-9.', 'k12: titolo']) expect(haSigle(t), t).toBe(true)
    for (const t of ['Sistemare la pagina', 'k8s', 'src/k-12/x', 'pre-12', 'ottobre-2026']) expect(haSigle(t), t).toBe(false)
  })
  it('quello che esce non ha più sigle', () => {
    for (const t of ['k-48: aggiunti 2 punti a r-12 (p-3, p-4)', 'r-1: la chat c-2 e la chat c-3', '[k7] vedi r-9.']) expect(haSigle(inParole(t)), t).toBe(false)
  })
})
