import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { leggiElencoRecupero, progettiInRecupero, ripristinaDaRecupero, spostaCartellaInRecupero } from '../../src/main/rimozione-sicura'
import { pianoAllineamento, sceltaProgetto } from '../../src/shared/allineamento'
import { leggiCase } from '../../src/shared/una-casa'

/**
 * Collaudo dell'11/10: la copia del residente messa nella cartella di recupero
 * è tornata due minuti dopo, perché il giro di allineamento vedeva «residente
 * qui, cartella sparita» e la riscaricava da solo. Una cartella in recupero
 * vuol dire «qui no» finché non si ripristina; «Ripristina» rimette la
 * cartella e lo stato di prima.
 */
let radice: string
beforeEach(() => { radice = mkdtempSync(join(tmpdir(), 'allinea-recupero-')) })
afterEach(() => { rmSync(radice, { recursive: true, force: true }) })

describe('un progetto tolto e messo in recupero non torna da solo (0.60.7)', () => {
  it('togli → giro di allineamento: niente «porta qui» automatico; ripristina → la cartella c’è e il piano non fa niente', () => {
    const dati = join(radice, 'dati')
    const cartella = join(radice, 'Progetti', 'Prova')
    mkdirSync(cartella, { recursive: true })
    writeFileSync(join(cartella, 'LEGGIMI.md'), 'prova')
    const progetti = [{ id: 'p-prova', nome: 'Prova', percorsi: { 'pc-qui': cartella } }]
    const casa = leggiCase({ versione: 1, case: sceltaProgetto({ id: 'p-prova', nome: 'Prova', pc: { id: 'pc-qui', nome: 'PC-ESEMPIO' }, chi: { id: 'pc-qui', nome: 'PC-ESEMPIO' }, quando: '2026-10-11T09:00:00Z' }) })
    const giro = () => pianoAllineamento({
      io: 'pc-qui', case: casa, progetti, esiste: existsSync, home: join(radice, 'home'),
      inRecupero: progettiInRecupero(dati)
    })

    // Togli: la cartella va nel recupero (mai cancellata).
    const tolta = spostaCartellaInRecupero(dati, cartella, { progetto: 'p-prova', nome: 'Prova', motivo: 'prova', quando: '2026-10-11T09:28:00.000Z' })
    expect(tolta.ok).toBe(true)
    expect(existsSync(cartella)).toBe(false)

    // Il giro di allineamento: la propone, non la riscarica da solo.
    const dopo = giro()
    const porta = dopo.azioni.find((a) => a.tipo === 'porta-qui' && a.progetto === 'p-prova')
    expect(porta?.tipo === 'porta-qui' && porta.automatica).toBe(false)
    expect(porta?.perche).toContain('cartella di recupero')

    // Senza la voce nel recupero sarebbe partito da solo: è il caso del collaudo.
    const senza = pianoAllineamento({ io: 'pc-qui', case: casa, progetti, esiste: existsSync, home: join(radice, 'home') })
    const auto = senza.azioni.find((a) => a.tipo === 'porta-qui')
    expect(auto?.tipo === 'porta-qui' && auto.automatica).toBe(true)

    // Ripristina: la cartella torna dov'era e il piano non ha più niente da fare.
    const r = ripristinaDaRecupero(dati, (tolta as { id: string }).id, '2026-10-11T09:40:00.000Z')
    expect(r.ok).toBe(true)
    expect(existsSync(join(cartella, 'LEGGIMI.md'))).toBe(true)
    // La voce resta nell'elenco (si vede che è stata rimessa), ma non conta più.
    expect(leggiElencoRecupero(dati)[0]?.ripristinataIl).toBeDefined()
    expect(progettiInRecupero(dati).size).toBe(0)
    expect(giro().azioni.filter((a) => a.progetto === 'p-prova')).toEqual([])
  })
})
