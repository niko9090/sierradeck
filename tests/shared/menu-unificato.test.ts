import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { FUNZIONI, MENU_PRINCIPALE, MENU_TELEFONO } from '../../src/shared/menu-principale'
import * as menu from '../../src/shared/menu-principale'
import { SEZIONI_ALTRO, postoIniziale, versoDestinazione } from '../../src/shared/navigazione-telefono'

/**
 * k-u0: il menu unificato. Barra PC: Progetti · Autopiloti · Domande · Chat e
 * workspace · Computer · Salute · Impostazioni (File solo sul telefono). Gli
 * specialisti stanno dentro Autopiloti; «Computer» è la vecchia «Rete dei PC».
 */
const leggi = (p: string): string => readFileSync(p, 'utf8')
const VECCHI = ['Rete dei PC', 'Gli altri computer', 'Rete ad albero']

describe('il menu unificato', () => {
  it('la barra del PC: voci e ordine', () => {
    const barra = MENU_PRINCIPALE.filter((v) => v.soloTelefono !== true).map((v) => v.nome)
    expect(barra).toEqual(['Progetti', 'Autopiloti', 'Domande', 'Chat e workspace', 'Computer', 'Salute', 'Correzioni', 'Impostazioni'])
    expect(MENU_PRINCIPALE.filter((v) => v.soloTelefono === true).map((v) => v.nome)).toEqual(['File'])
  })

  it('niente voce Specialisti, voce Computer presente', () => {
    expect(MENU_PRINCIPALE.some((v) => (v.id as string) === 'specialisti' || v.nome === 'Specialisti')).toBe(false)
    expect('VOCE_SPECIALISTI' in menu).toBe(false)
    expect(MENU_PRINCIPALE.find((v) => v.id === 'computer')?.nome).toBe('Computer')
    // Gli specialisti si trovano dentro Autopiloti.
    expect(MENU_PRINCIPALE.find((v) => v.id === 'autopiloti')?.spiega).toContain('specialisti')
    expect(FUNZIONI.filter((f) => f.funzione.startsWith('Specialisti')).every((f) => f.dove === 'autopiloti')).toBe(true)
  })

  it('niente nomi vecchi nei testi del menu', () => {
    const testi = [
      ...MENU_PRINCIPALE.flatMap((v) => [v.nome, v.breve, v.spiega]),
      ...FUNZIONI.map((f) => f.funzione),
      ...MENU_TELEFONO.map((v) => v.nome),
      ...SEZIONI_ALTRO.flatMap((s) => [s.titolo, s.sotto])
    ]
    for (const t of testi) for (const vecchio of VECCHI) expect(t, vecchio).not.toContain(vecchio)
  })

  it('il menu del telefono è coerente: ogni voce una volta sola, Computer in Altro', () => {
    const tutte = MENU_TELEFONO.flatMap((v) => v.contiene)
    expect([...tutte].sort()).toEqual(MENU_PRINCIPALE.filter((v) => v.soloPc !== true).map((v) => v.id).sort())
    expect(MENU_TELEFONO.find((v) => v.contiene.includes('computer'))?.id).toBe('altro')
    const dest = versoDestinazione(postoIniziale(), 'computer')
    expect(dest).toMatchObject({ voce: 'altro', sezione: 'pc' })
    expect(SEZIONI_ALTRO.find((s) => s.id === 'pc')?.titolo).toBe('Computer')
  })

  it('la fascia del PC: solo le voci del menu, Nuova chat unica scorciatoia, niente doppioni', () => {
    const c = leggi('src/renderer/components/Console.tsx')
    expect(c).not.toContain('VOCE_SPECIALISTI')
    expect(c).not.toContain("'specialisti' |")
    expect(c).toMatch(/PannelloAperto = [^\n]*'computer'/)
    // Nella fascia restano «+ Nuova chat» e il modello; il resto è in «Chat e workspace».
    expect(c).toContain('+ Nuova chat')
    for (const t of ['↺ Riprendi', 'Usate da altri PC…', 'finestre.nuova', 'Negozio…', 'Panoramica di questo workspace', 'Strumenti ▾']) expect(c, t).not.toContain(t)
    const pc = leggi('src/renderer/components/PannelloChat.tsx') + leggi('src/shared/chat-workspace.ts')
    for (const t of ['↺ Riprendi una conversazione', 'Nuova finestra', 'Negozio…', 'Panoramica di questo workspace']) expect(pc, t).toContain(t)
  })
})
