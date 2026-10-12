import { describe, it, expect } from 'vitest'
import { esclusaDallUnione, idsDaConfrontareSulDrive, pianoUnione, scegliDestinazione, testoRiassunto } from '../../src/shared/residenza'
import type { VoceFile } from '../../src/shared/rimozione-sicura'

// 0.66.1, visto dal vero nel trasloco del progetto di prova: la cartella di qui
// registrata ma nel recupero faceva ignorare la copia sul Drive, e la cartella
// nuova restava vuota (i file arrivavano solo nei recuperati).
describe('quali copie sul Drive si confrontano', () => {
  it('una cartella di qui che c’è davvero è il salvataggio del suo id; una registrata ma sparita no', () => {
    const registrate = [{ id: 'p1', percorso: 'C:\\Progetti\\prova' }, { id: 'p2', percorso: 'C:\\Progetti\\altro' }]
    expect(idsDaConfrontareSulDrive(['p1', 'p2', 'p3'], registrate, (p) => p.endsWith('altro'))).toEqual(['p1', 'p3'])
    expect(idsDaConfrontareSulDrive(['p1'], registrate, () => true)).toEqual([])
  })
})

// 0.60.0: «Rendi residente» con analisi e unione, le regole pure.
const f = (percorso: string, sha: string, mtime: number): VoceFile => ({ percorso, size: 1, mtime, sha })

describe('la cartella che resta', () => {
  it('quella con la chat più recente, poi una registrata, poi la più piena', () => {
    expect(scegliDestinazione([
      { percorso: 'A', registrata: true, file: 100 },
      { percorso: 'B', registrata: false, ultimaChat: 5, file: 1 }
    ])?.percorso).toBe('B')
    expect(scegliDestinazione([
      { percorso: 'A', registrata: false, file: 100 },
      { percorso: 'B', registrata: true, file: 1 }
    ])?.percorso).toBe('B')
    expect(scegliDestinazione([])).toBeUndefined()
  })
})

describe('il piano dell’unione', () => {
  const dest = { git: false, file: [f('a.txt', 'A', 10), f('b.txt', 'B', 10), f('c.txt', 'C', 10)] }
  it('uguali (anche spostati), aggiunti, sostituiti col più recente, il resto nei recuperati', () => {
    const p = pianoUnione(dest, [
      { chiave: 'k1', tipo: 'cartella', etichetta: 'K1', file: [f('a.txt', 'A', 1), f('spostato/b.txt', 'B', 1), f('nuovo.txt', 'N', 1), f('c.txt', 'C2', 20), f('b.txt', 'B0', 5)] },
      { chiave: 'k2', tipo: 'drive', etichetta: 'K2', file: [f('nuovo.txt', 'N2', 3), f('c.txt', 'C3', 15), f('node_modules/x.js', 'X', 1), f('.git/HEAD', 'H', 1)] }
    ])
    expect(p.uguali).toBe(2)
    expect(p.aggiungi.map((o) => `${o.copia}:${o.voce.percorso}`)).toEqual(['k2:nuovo.txt'])
    expect(p.sostituisci.map((o) => `${o.copia}:${o.voce.sha}`)).toEqual(['k1:C2'])
    expect(p.recupera.map((o) => `${o.voce.sha}:${o.motivo}`).sort()).toEqual(['B0:piu-vecchio', 'C3:diverso', 'N:diverso'])
    expect(p.perCopia.k2?.esclusi).toBe(2)
  })
  it('in un repository git la destinazione non si tocca: il più recente va nei recuperati', () => {
    const p = pianoUnione({ ...dest, git: true }, [{ chiave: 'k1', tipo: 'cartella', etichetta: 'K1', file: [f('c.txt', 'C2', 20)] }])
    expect(p.sostituisci).toEqual([])
    expect(p.recupera.map((o) => o.motivo)).toEqual(['piu-recente-git'])
  })
  it('.git e node_modules non si uniscono mai file per file', () => {
    expect(esclusaDallUnione('.git/objects/ab/cd')).toBe(true)
    expect(esclusaDallUnione('sotto/.git/config')).toBe(true)
    expect(esclusaDallUnione('node_modules/a')).toBe(true)
    expect(esclusaDallUnione('src/git.ts')).toBe(false)
  })
})

describe('il riassunto', () => {
  it('dice cosa unisce, cosa tiene, cosa va in recupero, cosa non succede, e che si annulla', () => {
    const r = testoRiassunto({
      nome: 'Sito', pcNome: 'PC-ESEMPIO', destinazione: 'C:\\Progetti\\Sito', nuova: false, git: false,
      copie: [{ chiave: 'cartella:C:\\Copie\\Sito', tipo: 'cartella', etichetta: 'C:\\Copie\\Sito', uguali: 3, aggiunti: 1, sostituiti: 0, recuperati: 2, esclusi: 0, vaInRecupero: true }],
      file: { uguali: 3, aggiunti: 1, sostituiti: 0, recuperati: 2, note: 1 },
      chat: { daSpostare: 1, delProgetto: 4, daAltriPc: 2 },
      workspace: { tiene: 'Sito', uniti: ['sito (2)'], aperti: [] },
      registro: { principale: 'p1', uniti: ['p2'] },
      recupero: ['C:\\Copie\\Sito'], inUso: [], recuperati: '.sierradeck/recuperati/unione-x'
    }).join(' ')
    for (const t of ['Resta la cartella C:\\Progetti\\Sito', 'cartella di recupero per 30 giorni', '1 aggiunto', '2 versioni nei recuperati', 'quaderno', '«sito (2)» entra in «Sito»', '1 doppione unito', 'nessun file cancellato', '«Conferma e unisci»', '«Annulla l’unione»']) expect(r).toContain(t)
  })
})
