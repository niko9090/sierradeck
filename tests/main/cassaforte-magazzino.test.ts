import { describe, it, expect } from 'vitest'
import { componiPacchetto, leggiPacchetto, type Voce } from '../../src/main/cassaforte/pacchetto'
import { magazzinoInMemoria, ConflittoMagazzino } from '../../src/main/cassaforte/magazzino'
import { creaCassaforte, cifra, decifra } from '../../src/main/cassaforte/cifratura'

const VOCI: Voce[] = [
  { percorso: 'workspaces.json', contenuto: Buffer.from('{"attivo":"SierraDeck"}', 'utf8') },
  { percorso: '.sierradeck/quaderno/nota.md', contenuto: Buffer.from('# Nota\ncontenuto', 'utf8') },
  { percorso: 'chat/sessione.jsonl', contenuto: Buffer.from([0, 1, 2, 250, 255]) } // anche byte binari
]

describe('il pacchetto', () => {
  it('impacchetta e rilegge, contenuti identici, byte binari compresi', () => {
    const blocco = componiPacchetto(VOCI, '2026-08-21T10:00:00.000Z')
    const riletto = leggiPacchetto(blocco)
    expect(riletto?.creatoIl).toBe('2026-08-21T10:00:00.000Z')
    expect(riletto?.voci.map((v) => v.percorso)).toEqual(VOCI.map((v) => v.percorso))
    for (let i = 0; i < VOCI.length; i += 1) {
      expect(riletto!.voci[i]!.contenuto.equals(VOCI[i]!.contenuto)).toBe(true)
    }
  })

  it('un blocco corrotto o non nostro non solleva, restituisce undefined', () => {
    expect(leggiPacchetto(Buffer.from('non sono un pacchetto', 'utf8'))).toBeUndefined()
    expect(leggiPacchetto(Buffer.alloc(0))).toBeUndefined()
  })

  it('comprime: testo ripetitivo sta in molto meno del suo grezzo', () => {
    const grosso: Voce[] = [{ percorso: 'log', contenuto: Buffer.from('riga uguale\n'.repeat(1000), 'utf8') }]
    const blocco = componiPacchetto(grosso, '2026-08-21T10:00:00.000Z')
    expect(blocco.length).toBeLessThan(grosso[0]!.contenuto.length / 5)
  })
})

describe('il magazzino in memoria', () => {
  it('vuoto restituisce undefined, poi carica e riscarica lo stesso blocco', async () => {
    const m = magazzinoInMemoria()
    expect(await m.scarica()).toBeUndefined()
    const blocco = Buffer.from('cifrato', 'utf8')
    const { versione } = await m.carica(blocco) // primo caricamento: seVersione assente
    const giu = await m.scarica()
    expect(giu?.versione).toBe(versione)
    expect(giu?.blocco.equals(blocco)).toBe(true)
  })

  it('rifiuta di sovrascrivere se la versione è cambiata (concorrenza ottimista)', async () => {
    const m = magazzinoInMemoria()
    const { versione: v1 } = await m.carica(Buffer.from('uno'))
    // Un altro dispositivo carica una versione nuova.
    const { versione: v2 } = await m.carica(Buffer.from('due'), v1)
    expect(v2).not.toBe(v1)
    // Questo PC, fermo a v1, prova a caricare: rifiutato invece di cancellare «due».
    await expect(m.carica(Buffer.from('mio'), v1)).rejects.toBeInstanceOf(ConflittoMagazzino)
    // Riscarica, riparte da v2, e ora passa.
    await expect(m.carica(Buffer.from('mio'), v2)).resolves.toBeDefined()
  })

  it('un primo caricamento con una versione attesa fallisce se qualcosa c è già', async () => {
    const m = magazzinoInMemoria()
    await m.carica(Buffer.from('primo'))
    // Un altro PC crede di essere il primo (seVersione assente) ma non lo è.
    await expect(m.carica(Buffer.from('secondo'))).rejects.toBeInstanceOf(ConflittoMagazzino)
  })
})

describe('il giro completo: pacchetto → cifra → magazzino → decifra → pacchetto', () => {
  it('quello che carico cifrato su un PC lo ritrovo identico sull altro', async () => {
    // PC A: compone, cifra con la sua maestra, carica nel magazzino (il «Drive»).
    const { maestra, cassaforte } = creaCassaforte('la-mia-passphrase')
    const blocco = componiPacchetto(VOCI, '2026-08-21T10:00:00.000Z')
    const cifrato = cifra(maestra, blocco)

    const magazzino = magazzinoInMemoria()
    await magazzino.carica(cifrato)
    // Nel magazzino c'è solo roba illeggibile: il pacchetto in chiaro non compare.
    const giu = await magazzino.scarica()
    expect(giu!.blocco.includes(Buffer.from('SierraDeck'))).toBe(false)

    // PC B: stesso account, sblocca con la passphrase, scarica, decifra, rilegge.
    const { sblocca } = await import('../../src/main/cassaforte/cifratura')
    const maestraB = sblocca(cassaforte, 'la-mia-passphrase')
    const inChiaro = decifra(maestraB!, giu!.blocco)
    const riletto = leggiPacchetto(inChiaro!)
    expect(riletto?.voci.map((v) => v.percorso)).toEqual(VOCI.map((v) => v.percorso))
    expect(riletto!.voci[0]!.contenuto.toString('utf8')).toContain('SierraDeck')
  })
})
