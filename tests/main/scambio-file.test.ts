import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriScambio, nomeSicuro, tipoDi, FILE_MAX_BYTE } from '../../src/main/scambio-file'

let cartella: string
beforeEach(() => { cartella = mkdtempSync(join(tmpdir(), 'sd-scambio-')) })

describe('nomeSicuro', () => {
  it('un nome che risale le cartelle non e un nome', () => {
    // Arriva da un telefono, quindi da fuori: «..\..\Windows\System32\x» e'
    // un nome valido per chi lo scrive, e non deve diventare un percorso qui.
    expect(nomeSicuro('../../fuori.txt')).toBeUndefined()
    expect(nomeSicuro('..\..\fuga.exe')).toBeUndefined()
    expect(nomeSicuro('C:\Windows\note.txt')).toBeUndefined()
  })

  it('scarta i caratteri che su Windows non possono esistere', () => {
    expect(nomeSicuro('con:due.txt')).toBeUndefined()
    expect(nomeSicuro('quale?.txt')).toBeUndefined()
  })

  it('lascia passare un nome normale', () => {
    expect(nomeSicuro('foto.png')).toBe('foto.png')
    expect(nomeSicuro('note_2026.md')).toBe('note_2026.md')
  })

  it('un nome vuoto o senza niente non passa', () => {
    expect(nomeSicuro('   ')).toBeUndefined()
    expect(nomeSicuro('..')).toBeUndefined()
  })
})

describe('tipoDi', () => {
  it('riconosce le immagini e i documenti', () => {
    expect(tipoDi('foto.PNG')).toBe('image/png')
    expect(tipoDi('doc.pdf')).toBe('application/pdf')
  })

  it('quello che non riconosce si scarica invece di aprirsi', () => {
    // Aprire nel browser un file di tipo ignoto e' il modo piu' veloce per
    // farne eseguire uno.
    expect(tipoDi('strano.xyz')).toBe('application/octet-stream')
    expect(tipoDi('script.html')).toBe('application/octet-stream')
  })
})

describe('lo scambio', () => {
  it('scrive e rilegge un file', () => {
    const s = apriScambio(cartella)
    expect(s.scrivi('nota.txt', Buffer.from('ciao'))?.byte).toBe(4)
    expect(s.leggi('nota.txt')?.dati.toString()).toBe('ciao')
  })

  it('il piu recente sta in cima', () => {
    const s = apriScambio(cartella)
    s.scrivi('vecchio.txt', Buffer.from('a'))
    s.scrivi('nuovo.txt', Buffer.from('b'))
    // Due file scritti nello stesso millisecondo hanno la stessa data: si
    // invecchia il primo apposta, altrimenti il test misurerebbe la velocita'
    // del disco invece dell'ordinamento.
    const ieri = new Date(Date.now() - 86_400_000)
    utimesSync(join(cartella, 'vecchio.txt'), ieri, ieri)
    expect(s.elenca()[0]?.nome).toBe('nuovo.txt')
  })

  it('le cartelle non compaiono: non si scaricano', () => {
    mkdirSync(join(cartella, 'dentro'))
    writeFileSync(join(cartella, 'file.txt'), 'x')
    expect(apriScambio(cartella).elenca().map((f) => f.nome)).toEqual(['file.txt'])
  })

  it('un file troppo grande non si scrive', () => {
    // Oltre un certo peso non e' piu' uno scambio: e' un trasferimento, e va
    // fatto in un altro modo.
    const s = apriScambio(cartella)
    expect(s.scrivi('enorme.bin', Buffer.alloc(FILE_MAX_BYTE + 1))).toBeUndefined()
  })

  it('non si legge e non si scrive fuori dalla cartella', () => {
    const s = apriScambio(cartella)
    expect(s.leggi('../fuori.txt')).toBeUndefined()
    expect(s.scrivi('../fuori.txt', Buffer.from('x'))).toBeUndefined()
  })

  it('un file che non c e non fa esplodere niente', () => {
    expect(apriScambio(cartella).leggi('mai-esistito.txt')).toBeUndefined()
  })
})
