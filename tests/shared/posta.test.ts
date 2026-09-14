import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pcVivo, PC_SPENTO_DOPO_MS, nomeBattitoPc, nomePosta, type BattitoPc } from '../../src/shared/posta'

// Il pannello del PC (`PannelloAccount`, `ModalePosta`) e il preload importano
// da qui: se questo file tirasse dentro `node:fs` la build del renderer
// (electron-vite) fallirebbe con «randomUUID is not exported by
// __vite-browser-external», come alla 0.27.0 prima della pubblicazione.
describe('shared/posta', () => {
  it('non importa niente di Node: lo legge anche il renderer', () => {
    const sorgente = readFileSync(join(__dirname, '../../src/shared/posta.ts'), 'utf8')
    expect(sorgente).not.toMatch(/from 'node:/)
    expect(sorgente).not.toMatch(/from '\.\.\/main/)
  })

  it('pcVivo: acceso entro cinque minuti dal battito, spento dopo o senza battito', () => {
    const t = Date.parse('2026-09-14T10:00:00Z')
    const b: BattitoPc = { pcId: 'a', nome: 'torre', versione: '0.27.0', battito: new Date(t).toISOString(), cartelle: [], chat: [] }
    expect(pcVivo(b, t + 60_000)).toBe(true)
    expect(pcVivo(b, t + PC_SPENTO_DOPO_MS + 1)).toBe(false)
    expect(pcVivo({ ...b, battito: 'boh' }, t)).toBe(false)
    expect(pcVivo(undefined, t)).toBe(false)
  })

  it('i nomi sul Drive hanno il prefisso del tipo', () => {
    expect(nomeBattitoPc('x1')).toBe('pc-x1')
    expect(nomePosta('x1')).toBe('posta-x1')
  })
})
