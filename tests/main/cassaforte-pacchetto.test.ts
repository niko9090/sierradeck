import { describe, it, expect } from 'vitest'
import { gzipSync } from 'node:zlib'
import { componiPacchetto, leggiPacchetto } from '../../src/main/cassaforte/pacchetto'

describe('pacchetto (formato binario)', () => {
  it('fa il giro completo con contenuto anche binario e percorsi unicode', () => {
    const voci = [
      { percorso: 'chat/progetto/sessione.jsonl', contenuto: Buffer.from('{"riga":1}\n', 'utf8') },
      // Byte non-UTF8: il base64 di prima li reggeva, il binario deve reggerli uguale.
      { percorso: 'sierradeck/binario.bin', contenuto: Buffer.from([0, 1, 2, 253, 254, 255, 0, 128]) },
      { percorso: 'sierradeck/accénti.txt', contenuto: Buffer.from('àèìòù — 日本語', 'utf8') }
    ]
    const blocco = componiPacchetto(voci, '2026-08-24T10:00:00.000Z')
    const letto = leggiPacchetto(blocco)
    expect(letto?.creatoIl).toBe('2026-08-24T10:00:00.000Z')
    expect(letto?.voci.length).toBe(3)
    for (let i = 0; i < voci.length; i++) {
      expect(letto?.voci[i]?.percorso).toBe(voci[i]?.percorso)
      expect(letto?.voci[i]?.contenuto.equals(voci[i]!.contenuto)).toBe(true)
    }
  })

  it('regge un contenuto grosso senza «invalid string length»', () => {
    // La prima versione costruiva UNA stringa (JSON + base64) con dentro tutto:
    // oltre ~512 MB JavaScript lancia «Invalid string length» e il salvataggio
    // falliva. Qui bastano pochi MB per esercitare il percorso binario; il tetto
    // vero è quello dei Buffer, non delle stringhe.
    const grosso = Buffer.alloc(8 * 1024 * 1024, 7)
    const blocco = componiPacchetto([{ percorso: 'chat/grande.jsonl', contenuto: grosso }], '2026-08-24T10:00:00.000Z')
    const letto = leggiPacchetto(blocco)
    expect(letto?.voci[0]?.contenuto.length).toBe(grosso.length)
    expect(letto?.voci[0]?.contenuto.equals(grosso)).toBe(true)
  })

  it('un pacchetto vuoto è valido', () => {
    const letto = leggiPacchetto(componiPacchetto([], '2026-08-24T10:00:00.000Z'))
    expect(letto?.voci.length).toBe(0)
    expect(letto?.creatoIl).toBe('2026-08-24T10:00:00.000Z')
  })

  it('un blocco che non è un pacchetto nostro si rifiuta, senza sollevare', () => {
    expect(leggiPacchetto(Buffer.from('non sono gzip'))).toBeUndefined()
    // gzip valido ma contenuto senza il nostro marcatore.
    expect(leggiPacchetto(gzipSync(Buffer.from('ciao')))).toBeUndefined()
  })
})
