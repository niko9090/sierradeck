import { describe, it, expect } from 'vitest'
import { azioniProgetto, costruisciPannello, filtraChat, filtraProgetti, ASSENTE_DOPO_MS, type ChatIngresso, type ProgettoIngresso } from '../../src/shared/pannello-drive'

// 0.88.0: un PC per progetto. Le chat sono del proprietario del loro progetto. Nomi e id d'esempio.
const ORA = Date.parse('2026-10-10T18:00:00Z')
const IO = { id: 'pc-qui', nome: 'PC-ESEMPIO', battito: new Date(ORA).toISOString() }
const PORTATILE = { id: 'pc-port', nome: 'PORTATILE-ESEMPIO', battito: new Date(ORA - 60_000).toISOString() }
const VECCHIO = { id: 'pc-vecchio', nome: 'PC-VECCHIO', battito: new Date(ORA - ASSENTE_DOPO_MS - 86_400_000).toISOString() }

const PROGETTI: ProgettoIngresso[] = [
  { id: 'prog-port', nome: 'Gestionale', proprietario: 'pc-port', percorso: 'C:\\Progetti\\Gestionale' },
  { id: 'prog-qui', nome: 'Sito', proprietario: 'pc-qui', percorso: 'E:\\Lavoro\\Sito' },
  { id: 'prog-vecchio', nome: 'Archivio', proprietario: 'pc-vecchio', percorso: 'D:\\Archivio' }
]
function pannello(chat: ChatIngresso[], progetti = PROGETTI) {
  return costruisciPannello({ io: IO, pc: [PORTATILE, VECCHIO], chat, adesso: ORA, progetti })
}
const riga = (p: ReturnType<typeof pannello>, s: string) => p.chat.find((x) => x.sessione === s)!
const progetto = (p: ReturnType<typeof pannello>, id: string) => p.progetti.find((x) => x.id === id)!

describe('le chat: del proprietario del loro progetto', () => {
  it('una chat nella cartella del progetto del portatile è sua, anche se c’è una copia qui', () => {
    const p = pannello([{ sessione: 's1', titolo: 'Uno', cwd: 'C:\\Progetti\\Gestionale\\src', copie: [{ pc: 'pc-port', dove: 'drive', mtime: 1 }, { pc: 'pc-qui', dove: 'qui', mtime: 2 }] }])
    expect(riga(p, 's1').residente).toEqual({ pc: 'pc-port', nome: 'PORTATILE-ESEMPIO', qui: false })
    expect(riga(p, 's1').progetto).toBe('prog-port')
    expect(riga(p, 's1').stato).toBe('residente')
  })

  it('fuori dai progetti: del PC dove sta sul disco', () => {
    const p = pannello([{ sessione: 's2', titolo: 'Due', cwd: 'F:\\Sparsa', copie: [{ pc: 'pc-qui', dove: 'qui', mtime: 1 }] }])
    expect(riga(p, 's2').residente?.qui).toBe(true)
    expect(riga(p, 's2').progetto).toBeUndefined()
  })

  it('il proprietario senza una copia della chat: «solo cloud»', () => {
    const p = pannello([{ sessione: 's3', titolo: 'Tre', cwd: 'C:\\Progetti\\Gestionale', copie: [{ pc: 'pc-qui', dove: 'drive', mtime: 1 }] }])
    expect(riga(p, 's3').stato).toBe('solo-cloud')
  })
})

describe('i progetti', () => {
  it('il proprietario, la sua cartella, acceso o no, e le azioni da qui', () => {
    const p = pannello([])
    const port = progetto(p, 'prog-port')
    expect(port.residente).toEqual({ pc: 'pc-port', nome: 'PORTATILE-ESEMPIO', qui: false })
    expect(port.cartelle).toEqual([{ pc: 'pc-port', nome: 'PORTATILE-ESEMPIO', percorso: 'C:\\Progetti\\Gestionale' }])
    expect(port.cartellaQui).toBe(false)
    expect(port.proprietarioAcceso).toBe(true)
    expect(port.azioni.map((a) => a.id)).toEqual(['apri-remoto', 'sposta-qui'])
    expect(port.azioni[1]?.conferma).toBe('Sposta su PC-ESEMPIO')
    const qui = progetto(p, 'prog-qui')
    expect(qui.cartellaQui).toBe(true)
    expect(qui.azioni.map((a) => a.id)).toEqual(['apri'])
  })

  it('proprietario assente da più di 30 giorni: da sistemare, con il perché', () => {
    const p = pannello([])
    const v = progetto(p, 'prog-vecchio')
    expect(v.proprietarioAcceso).toBe(false)
    expect(v.problemi.map((x) => x.tipo)).toEqual(['casa-assente'])
    expect(v.problemi[0]?.titolo).toContain('31 giorni')
  })

  it('senza proprietario: niente azioni, e lo dice', () => {
    const p = pannello([], [{ id: 'x', nome: 'Orfano' }])
    expect(p.progetti[0]?.problemi.map((x) => x.tipo)).toEqual(['progetto-senza-casa'])
    expect(azioniProgetto(p.progetti[0]!, IO)).toEqual([])
  })
})

describe('i filtri e la ricerca', () => {
  const p = pannello([
    { sessione: 'qui', titolo: 'Fatture', cwd: 'E:\\Lavoro\\Sito', copie: [{ pc: 'pc-qui', dove: 'qui', mtime: 1 }] },
    { sessione: 'la', titolo: 'Note', cwd: 'C:\\Progetti\\Gestionale', copie: [{ pc: 'pc-port', dove: 'drive', mtime: 1 }] }
  ])
  it('di questo PC, solo cloud, da sistemare, e la ricerca', () => {
    expect(filtraChat(p.chat, 'questo-pc').map((x) => x.sessione)).toEqual(['qui'])
    expect(filtraChat(p.chat, 'solo-cloud').map((x) => x.sessione)).toEqual(['la'])
    expect(filtraChat(p.chat, 'tutti', 'portatile note').map((x) => x.sessione)).toEqual(['la'])
    expect(filtraProgetti(p.progetti, 'questo-pc').map((x) => x.id)).toEqual(['prog-qui'])
    expect(filtraProgetti(p.progetti, 'sbagliati').map((x) => x.id)).toEqual(['prog-vecchio'])
  })
})
