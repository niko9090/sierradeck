import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriChiavi, nuovaChiave, segnoCorrisponde } from '../../src/main/chiavi'

let cartella: string
beforeEach(() => { cartella = mkdtempSync(join(tmpdir(), 'sd-chiavi-')) })

describe('la parola non si conserva', () => {
  it('sul disco finisce il segno, mai la parola', () => {
    const chiavi = apriChiavi(cartella)
    chiavi.impostaAvvio('cavallo-batteria-graffetta')
    const scritto = readFileSync(join(cartella, 'chiavi.json'), 'utf8')
    expect(scritto).not.toContain('cavallo-batteria-graffetta')
    expect(scritto).toContain('segno')
  })

  it('due volte la stessa parola non produce lo stesso segno', () => {
    // Il sale casuale: senza, due utenti con la stessa parola avrebbero lo
    // stesso segno, e un segno riconosciuto ne aprirebbe due.
    expect(nuovaChiave('uguale').segno).not.toBe(nuovaChiave('uguale').segno)
  })
})

describe('verifica', () => {
  it('riconosce la parola giusta e rifiuta le altre', () => {
    const chiavi = apriChiavi(cartella)
    chiavi.impostaAvvio('apriti sesamo')
    expect(chiavi.verifica('apriti sesamo')).toBe(true)
    expect(chiavi.verifica('apriti sesamo ')).toBe(true)
    expect(chiavi.verifica('apriti')).toBe(false)
    expect(chiavi.verifica('')).toBe(false)
  })

  it('senza parola impostata non chiude fuori nessuno', () => {
    // Rispondere «no» chiuderebbe fuori da una porta che non esiste: chi non ha
    // messo nessuna parola non deve incontrare nessuna richiesta.
    expect(apriChiavi(cartella).verifica('qualunque cosa')).toBe(true)
  })

  it('ogni workspace ha la sua', () => {
    const chiavi = apriChiavi(cartella)
    chiavi.impostaWorkspace('lavoro', 'uno')
    chiavi.impostaWorkspace('casa', 'due')
    expect(chiavi.verifica('uno', 'lavoro')).toBe(true)
    expect(chiavi.verifica('uno', 'casa')).toBe(false)
    expect(chiavi.verifica('qualunque', 'ferie')).toBe(true)
  })

  it('confronta in tempo costante', () => {
    // Un `===` impiega piu' tempo quanto piu' i segni si somigliano, e quel
    // tempo si misura: e' cosi' che una parola si indovina un carattere per
    // volta senza mai vederla.
    const sorgente = readFileSync('src/main/chiavi.ts', 'utf8')
    expect(sorgente).toContain('timingSafeEqual')
  })

  it('un segno di lunghezza diversa non fa esplodere il confronto', () => {
    expect(segnoCorrisponde('x', { sale: 'ab', segno: 'ff' })).toBe(false)
  })
})

describe('togliere e cambiare', () => {
  it('una parola vuota toglie la serratura', () => {
    const chiavi = apriChiavi(cartella)
    chiavi.impostaAvvio('temporanea')
    expect(chiavi.stato().allAvvio).toBe(true)
    expect(chiavi.impostaAvvio('   ').allAvvio).toBe(false)
    expect(chiavi.verifica('temporanea')).toBe(true)
  })

  it('cambiare parola invalida la precedente', () => {
    const chiavi = apriChiavi(cartella)
    chiavi.impostaAvvio('vecchia')
    chiavi.impostaAvvio('nuova')
    expect(chiavi.verifica('vecchia')).toBe(false)
    expect(chiavi.verifica('nuova')).toBe(true)
  })

  it('lo stato elenca i workspace chiusi, senza dire altro', () => {
    const chiavi = apriChiavi(cartella)
    chiavi.impostaWorkspace('lavoro', 'uno')
    const stato = chiavi.impostaWorkspace('casa', 'due')
    expect(stato.workspace).toEqual(['casa', 'lavoro'])
    expect(JSON.stringify(stato)).not.toContain('uno')
  })
})

describe('quando il file è rotto', () => {
  it('non chiude fuori il proprietario', () => {
    // La serratura vale finche' funziona: rotta, non deve diventare un muro
    // fra l'utente e il suo lavoro.
    writeFileSync(join(cartella, 'chiavi.json'), '{ questo non e json', 'utf8')
    const chiavi = apriChiavi(cartella)
    expect(chiavi.stato().allAvvio).toBe(false)
    expect(chiavi.verifica('qualunque')).toBe(true)
  })
})
