import { describe, it, expect } from 'vitest'
import {
  creaCassaforte, sblocca, sbloccaConRecupero, cambiaPassphrase, cifra, decifra, stessaMaestra
} from '../../src/main/cassaforte/cifratura'

const SEGRETO = Buffer.from('chat, quaderno, e una chiave API: dati che non devono uscire', 'utf8')

describe('la cassaforte end-to-end', () => {
  it('cifra e decifra un giro completo con la chiave-maestra', async () => {
    const { maestra } = creaCassaforte('una-passphrase-robusta')
    const blocco = await cifra(maestra, SEGRETO)
    // Il cifrato non contiene il testo in chiaro.
    expect(blocco.includes(Buffer.from('chiave API'))).toBe(false)
    expect((await decifra(maestra, blocco))?.toString('utf8')).toBe(SEGRETO.toString('utf8'))
  })

  it('la passphrase giusta ritrova la stessa chiave-maestra, quella sbagliata no', async () => {
    const { cassaforte, maestra } = creaCassaforte('parola-corretta-cavallo-batteria')
    const riaperta = sblocca(cassaforte, 'parola-corretta-cavallo-batteria')
    expect(riaperta).toBeDefined()
    expect(stessaMaestra(riaperta!, maestra)).toBe(true)
    // E i dati cifrati con la maestra originale si decifrano con quella riaperta.
    expect((await decifra(riaperta!, await cifra(maestra, SEGRETO)))?.toString('utf8')).toBe(SEGRETO.toString('utf8'))

    expect(sblocca(cassaforte, 'parola-sbagliata')).toBeUndefined()
  })

  it('la chiave di recupero sblocca quando la passphrase è persa', () => {
    const { cassaforte, chiaveRecupero, maestra } = creaCassaforte('la-dimentico')
    const conRecupero = sbloccaConRecupero(cassaforte, chiaveRecupero)
    expect(conRecupero).toBeDefined()
    expect(stessaMaestra(conRecupero!, maestra)).toBe(true)
  })

  it('la chiave di recupero si accetta come la si è salvata: minuscole, spazi, senza trattini', () => {
    const { cassaforte, chiaveRecupero, maestra } = creaCassaforte('x')
    const sciatta = chiaveRecupero.toLowerCase().replace(/-/g, ' ')
    const con = sbloccaConRecupero(cassaforte, sciatta)
    expect(con).toBeDefined()
    expect(stessaMaestra(con!, maestra)).toBe(true)
    // Un codice inventato non apre.
    expect(sbloccaConRecupero(cassaforte, 'ZZZZ-ZZZZ-ZZZZ')).toBeUndefined()
  })

  it('cambiare passphrase ri-avvolge la stessa maestra: i dati restano, il recupero pure', async () => {
    const nuova = creaCassaforte('vecchia-parola')
    const blocco = await cifra(nuova.maestra, SEGRETO)

    const dopo = cambiaPassphrase(nuova.cassaforte, nuova.maestra, 'parola-nuova-di-zecca')

    // La nuova apre, la vecchia no.
    const conNuova = sblocca(dopo, 'parola-nuova-di-zecca')
    expect(conNuova).toBeDefined()
    expect(sblocca(dopo, 'vecchia-parola')).toBeUndefined()
    // I dati di prima si decifrano ancora: la maestra non è cambiata.
    expect((await decifra(conNuova!, blocco))?.toString('utf8')).toBe(SEGRETO.toString('utf8'))
    // E il recupero resta valido.
    expect(stessaMaestra(sbloccaConRecupero(dopo, nuova.chiaveRecupero)!, nuova.maestra)).toBe(true)
  })

  it('un blocco manomesso non si decifra: GCM lo rifiuta invece di indovinare', async () => {
    const { maestra } = creaCassaforte('p')
    const blocco = await cifra(maestra, SEGRETO)
    // Si gira un byte nel cifrato.
    const rovinato = Buffer.from(blocco)
    rovinato[rovinato.length - 1] = (rovinato.at(-1) ?? 0) ^ 0x01
    expect(await decifra(maestra, rovinato)).toBeUndefined()
  })

  it('nella cassaforte da custodire non c è nessun segreto in chiaro', () => {
    const passphrase = 'PASSPHRASE-DISTINTIVA-Zqx-9182'
    const { cassaforte, maestra } = creaCassaforte(passphrase)
    const testo = JSON.stringify(cassaforte)
    // Solo sali e chiavi avvolte: niente passphrase, niente maestra leggibile.
    expect(Object.keys(cassaforte).sort()).toEqual(
      ['maestraDaPassphrase', 'maestraDaRecupero', 'sale', 'saleRecupero', 'versione']
    )
    expect(testo).not.toContain(passphrase)
    // La chiave-maestra è custodita solo AVVOLTA: in chiaro non compare mai.
    expect(testo).not.toContain(maestra.toString('base64'))
  })
})
