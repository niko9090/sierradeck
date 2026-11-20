import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { FUNZIONI, MENU_PRINCIPALE, MENU_TELEFONO } from '../../src/shared/menu-principale'
import { SEZIONI } from '../../src/shared/impostazioni-struttura'

/**
 * k-166m1: il menu del PC è unico e ordinato. Una casa per ogni funzione:
 * Quaderno dentro Progetti, Negozio dentro Chat, Computer solo in Computer,
 * Consumi solo in Salute, Account e Drive in un posto solo, Aggiornamenti in
 * un solo pannello (più la finestra in basso a destra).
 */
const leggi = (p: string): string => readFileSync(p, 'utf8')
const conta = (testo: string, pezzo: string): number => testo.split(pezzo).length - 1

describe('menu unico del PC', () => {
  it('ogni funzione ha una sola voce, e ogni voce del PC una sola volta nella barra', () => {
    const nomi = FUNZIONI.map((f) => f.funzione)
    expect(new Set(nomi).size).toBe(nomi.length)
    const idBarra = MENU_PRINCIPALE.filter((v) => v.soloTelefono !== true).map((v) => v.id)
    expect(new Set(idBarra).size).toBe(idBarra.length)
    expect(idBarra).toHaveLength(7)
    // Il telefono contiene ognuna delle voci una volta sola, con gli stessi id.
    const tel = MENU_TELEFONO.flatMap((v) => v.contiene)
    expect(new Set(tel).size).toBe(tel.length)
    // La barra legge il menu così com'è, senza copie né filtri a parte.
    const c = leggi('src/renderer/components/Console.tsx')
    expect(c).not.toContain('vociDellaFascia')
  })

  it('Quaderno e Negozio si raggiungono dal menu', () => {
    expect(FUNZIONI.find((f) => f.funzione === 'Quaderno del progetto')?.dove).toBe('progetti')
    expect(FUNZIONI.find((f) => f.funzione.startsWith('Negozio'))?.dove).toBe('chat')
    expect(leggi('src/renderer/components/VistaProgetti.tsx')).toContain('Quaderno del progetto')
    expect(leggi('src/shared/chat-workspace.ts')).toContain('Negozio…')
    expect(leggi('src/renderer/components/PannelloChat.tsx')).toContain('COMANDI_CHAT_WORKSPACE')
  })

  it('Account e Drive: un solo posto, con un solo nome', () => {
    const imp = leggi('src/renderer/components/PannelloImpostazioni.tsx')
    expect(conta(imp, '>Account e Drive</button>')).toBe(1)
    expect(imp).toContain("'Account e Drive'")
    expect(imp).not.toContain('Vai alla scheda Account')
    // Il nome riservato del quaderno personale non si confonde col Quaderno del progetto.
    expect(leggi('src/renderer/components/SezioneQuadernoPersonale.tsx')).toContain('<h4 className="con-aiuto">Dati riservati')
    expect(leggi('src/renderer/components/PannelloQuaderno.tsx')).not.toContain('🔒 Quaderno personale')
  })

  it('Aggiornamenti: un solo pannello (in cima alle Impostazioni), versione come scorciatoia, niente ⟳', () => {
    expect(SEZIONI.filter((s) => s.id === 'aggiornamenti')).toHaveLength(1)
    expect(SEZIONI[0]?.id).toBe('aggiornamenti')
    const c = leggi('src/renderer/components/Console.tsx')
    expect(c).not.toContain('Cerca ora un aggiornamento')
    expect(c).not.toContain('aggiornamenti.cerca')
    expect(c).toContain('className={`versione')
    // Salute non ha una sezione aggiornamenti sua.
    expect(leggi('src/renderer/components/PannelloSalute.tsx')).not.toContain('Aggiornamenti per esteso')
  })

  it('Computer è l’unica casa dei computer: Salute e Altri PC lasciano solo un link', () => {
    const s = leggi('src/renderer/components/PannelloSalute.tsx')
    expect(s).not.toContain('>Computer</button>')
    expect(conta(s, '>Apri Computer</button>')).toBe(1)
    const a = leggi('src/renderer/components/SezioneAltriPc.tsx')
    expect(a).not.toContain('Rete ad albero')
    expect(a).toContain('Apri Computer')
    expect(a).not.toContain('Salute → «Altri computer»')
  })

  it('Consumi: una sola casa, in Salute', () => {
    const s = leggi('src/renderer/components/PannelloSalute.tsx')
    expect(s).not.toContain('Consumi per esteso')
    expect(FUNZIONI.filter((f) => f.funzione.startsWith('Consumi')).every((f) => f.dove === 'salute')).toBe(true)
    expect(FUNZIONI.filter((f) => f.funzione.startsWith('Consumi'))).toHaveLength(1)
  })
})
