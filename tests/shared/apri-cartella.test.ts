import { describe, it, expect } from 'vitest'
import { cartellaDiUnaChat, cartellaDiUnWorkspace, testoCartellaNonQui, voceFileDi } from '@shared/apri-cartella'

/**
 * «Apri cartella» (0.82.0): la cartella viene dai dati del workspace o della
 * chat, mai dal codice. Solo percorsi d'esempio.
 */
const ci = (...c: string[]) => (p: string): boolean => c.includes(p)
const vietata = (c: string): boolean => c === 'C:\\Users\\Esempio' || c === 'C:\\Users\\Esempio\\Documents' || /^[a-z]:\\?$/i.test(c)

describe('la cartella di una chat', () => {
  it('la sua cartella se lavora qui; il PC se lavora altrove; il perché se non c’è', () => {
    expect(cartellaDiUnaChat({ cwd: 'D:\\Lavori\\Alfa' }, ci('D:\\Lavori\\Alfa'))).toEqual({ tipo: 'qui', cartella: 'D:\\Lavori\\Alfa' })
    expect(cartellaDiUnaChat({ cwd: 'D:\\Lavori\\Alfa', remoto: { pcNome: 'Portatile' } }, ci('D:\\Lavori\\Alfa'))).toEqual({ tipo: 'altrove', pcNome: 'Portatile' })
    expect(cartellaDiUnaChat({ cwd: 'D:\\Lavori\\Sparita' }, ci())).toMatchObject({ tipo: 'niente' })
    expect(cartellaDiUnaChat({ cwd: '  ' }, ci('  '))).toMatchObject({ tipo: 'niente' })
    expect(cartellaDiUnaChat(undefined, ci())).toMatchObject({ tipo: 'niente' })
  })
})

describe('la cartella di un workspace', () => {
  it('prima il progetto del workspace, se c’è su questo PC', () => {
    expect(cartellaDiUnWorkspace({ progetto: 'D:\\Progetti\\Beta', riquadri: [{ cwd: 'D:\\Altro' }], vietata, esiste: ci('D:\\Progetti\\Beta', 'D:\\Altro') }))
      .toEqual({ tipo: 'qui', cartella: 'D:\\Progetti\\Beta' })
  })
  it('senza progetto, la cartella dove lavorano più chat; mai la cartella utente o Documenti', () => {
    const riquadri = [
      { cwd: 'C:\\Users\\Esempio' }, { cwd: 'C:\\Users\\Esempio' }, { cwd: 'C:\\Users\\Esempio' },
      { cwd: 'D:\\Lavori\\Uno' }, { cwd: 'd:/lavori/due' }, { cwd: 'D:\\Lavori\\Due' }
    ]
    expect(cartellaDiUnWorkspace({ riquadri, vietata, esiste: ci('D:\\Lavori\\Uno', 'd:/lavori/due') }))
      .toEqual({ tipo: 'qui', cartella: 'd:/lavori/due' })
  })
  it('a parità vince il primo riquadro; un progetto che non c’è più non vale', () => {
    expect(cartellaDiUnWorkspace({ progetto: 'D:\\Sparito', riquadri: [{ cwd: 'D:\\Uno' }, { cwd: 'D:\\Due' }], vietata, esiste: ci('D:\\Uno', 'D:\\Due') }))
      .toEqual({ tipo: 'qui', cartella: 'D:\\Uno' })
  })
  it('chat tutte su un altro PC: si dice quale; nessuna chat utile: il perché', () => {
    expect(cartellaDiUnWorkspace({ riquadri: [{ cwd: 'D:\\Uno', remoto: { pcNome: 'Fisso' } }], vietata, esiste: ci('D:\\Uno') }))
      .toEqual({ tipo: 'altrove', pcNome: 'Fisso' })
    expect(cartellaDiUnWorkspace({ riquadri: [{ cwd: 'C:\\Users\\Esempio' }], vietata, esiste: ci('C:\\Users\\Esempio') })).toMatchObject({ tipo: 'niente' })
  })
})

describe('dalla cartella alla sezione File', () => {
  const progetti = [{ percorso: 'D:\\Progetti\\Sito' }, { percorso: 'D:\\Progetti\\Sito\\.wt\\ramo' }, { percorso: 'D:\\Progetti\\Altro' }]
  it('il progetto che la contiene, il più interno, e il percorso dentro con le barre', () => {
    expect(voceFileDi('D:\\Progetti\\Sito', progetti)).toEqual({ progetto: 'D:\\Progetti\\Sito', percorso: '' })
    expect(voceFileDi('d:\\progetti\\sito\\src\\main\\', progetti)).toEqual({ progetto: 'D:\\Progetti\\Sito', percorso: 'src/main' })
    expect(voceFileDi('D:\\Progetti\\Sito\\.wt\\ramo\\docs', progetti)).toEqual({ progetto: 'D:\\Progetti\\Sito\\.wt\\ramo', percorso: 'docs' })
  })
  it('fuori dai progetti, o con un nome che solo comincia uguale: niente', () => {
    expect(voceFileDi('D:\\Progetti\\SitoVecchio', progetti)).toBeUndefined()
    expect(voceFileDi('E:\\Altrove', progetti)).toBeUndefined()
  })
  it('su Linux e macOS le maiuscole contano', () => {
    expect(voceFileDi('/home/esempio/Sito/src', [{ percorso: '/home/esempio/Sito' }], false)).toEqual({ progetto: '/home/esempio/Sito', percorso: 'src' })
    expect(voceFileDi('/home/esempio/sito/src', [{ percorso: '/home/esempio/Sito' }], false)).toBeUndefined()
  })
})

it('la riga corta quando non si apre niente', () => {
  expect(testoCartellaNonQui({ tipo: 'altrove', pcNome: 'Fisso' })).toBe('La cartella è su Fisso: aprila da lì.')
  expect(testoCartellaNonQui({ tipo: 'niente', perche: 'questa chat non c’è più' })).toBe('Nessuna cartella da aprire: questa chat non c’è più.')
})
