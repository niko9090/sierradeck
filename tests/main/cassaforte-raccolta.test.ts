import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  raccogli, ripristina, percorsoSicuro, radiciDaSincronizzare, type Radice
} from '../../src/main/cassaforte/raccolta'
import { componiPacchetto, leggiPacchetto } from '../../src/main/cassaforte/pacchetto'
import { creaCassaforte, cifra, decifra } from '../../src/main/cassaforte/cifratura'

let radice: string
beforeEach(() => { radice = mkdtempSync(join(tmpdir(), 'sd-raccolta-')) })

/** Prepara un finto assetto SierraDeck + una finta radice Claude con una trascrizione. */
async function preparaSorgente(): Promise<{ dati: string; claude: string }> {
  const dati = join(radice, 'dati')
  const claude = join(radice, 'claude')
  await mkdir(dati, { recursive: true })
  await writeFile(join(dati, 'workspaces.json'), '{"attivo":"SierraDeck"}')
  await writeFile(join(dati, 'impostazioni.json'), '{"tema":"scuro"}')
  await writeFile(join(dati, 'index.db'), 'CACHE RIGENERABILE') // NON deve entrare
  await mkdir(join(dati, 'Cache'), { recursive: true })
  await writeFile(join(dati, 'Cache', 'roba'), 'spazzatura di electron') // NON deve entrare
  const slug = join(claude, 'projects', 'E--Users-nikof-Progetto')
  await mkdir(slug, { recursive: true })
  await writeFile(join(slug, 'sessione-1.jsonl'), '{"riga":1}\n{"riga":2}\n')
  await writeFile(join(slug, 'appunti.txt'), 'non è una chat') // NON deve entrare
  return { dati, claude }
}

describe('raccogliere', () => {
  it('prende solo i file dell allowlist e le trascrizioni, non cache e index', async () => {
    const { dati, claude } = await preparaSorgente()
    const voci = await raccogli(radiciDaSincronizzare(dati, claude))
    const percorsi = voci.map((v) => v.percorso).sort()
    expect(percorsi).toEqual([
      'chat/E--Users-nikof-Progetto/sessione-1.jsonl',
      'sierradeck/impostazioni.json',
      'sierradeck/workspaces.json'
    ])
  })
})

describe('ripristinare', () => {
  it('rimette ogni file a casa sua, identico, su una macchina vuota', async () => {
    const { dati, claude } = await preparaSorgente()
    const voci = await raccogli(radiciDaSincronizzare(dati, claude))

    // «Macchina nuova»: cartelle vuote.
    const dati2 = join(radice, 'dati2')
    const claude2 = join(radice, 'claude2')
    const esito = await ripristina(voci, radiciDaSincronizzare(dati2, claude2))
    expect(esito.saltati).toEqual([])
    expect(esito.scritti).toBe(3)

    expect(await readFile(join(dati2, 'workspaces.json'), 'utf8')).toBe('{"attivo":"SierraDeck"}')
    expect(await readFile(
      join(claude2, 'projects', 'E--Users-nikof-Progetto', 'sessione-1.jsonl'), 'utf8'
    )).toBe('{"riga":1}\n{"riga":2}\n')
  })

  it('salta una voce con prefisso sconosciuto o che uscirebbe dalla cartella', async () => {
    const radici: Radice[] = [{ prefisso: 'sierradeck', cartella: join(radice, 'out') }]
    const esito = await ripristina([
      { percorso: 'sierradeck/buono.json', contenuto: Buffer.from('ok') },
      { percorso: 'ignoto/x', contenuto: Buffer.from('boh') },
      { percorso: 'sierradeck/../fuga.txt', contenuto: Buffer.from('via') }
    ], radici)
    expect(esito.scritti).toBe(1)
    expect(esito.saltati.sort()).toEqual(['ignoto/x', 'sierradeck/../fuga.txt'])
  })
})

describe('percorsoSicuro', () => {
  it('rifiuta risalite e percorsi assoluti, accetta i relativi buoni', () => {
    const base = join(radice, 'base')
    expect(percorsoSicuro(base, 'dentro/file.txt')).toBe(join(base, 'dentro', 'file.txt'))
    expect(percorsoSicuro(base, '../fuori.txt')).toBeUndefined()
    expect(percorsoSicuro(base, '..\\fuori.txt')).toBeUndefined()
    expect(percorsoSicuro(base, join(radice, 'assoluto.txt'))).toBeUndefined()
  })
})

describe('il giro completo con cifratura', () => {
  it('raccogli → pacchetto → cifra → decifra → ripristina: tutto torna identico', async () => {
    const { dati, claude } = await preparaSorgente()

    // PC A: raccoglie, impacchetta, cifra.
    const voci = await raccogli(radiciDaSincronizzare(dati, claude))
    const { maestra } = creaCassaforte('passphrase-utente')
    const cifrato = cifra(maestra, await componiPacchetto(voci, '2026-08-21T12:00:00.000Z'))

    // PC B: decifra, rilegge, ripristina in cartelle vuote.
    const pacchetto = await leggiPacchetto(decifra(maestra, cifrato)!)
    const dati2 = join(radice, 'b-dati')
    const claude2 = join(radice, 'b-claude')
    await ripristina(pacchetto!.voci, radiciDaSincronizzare(dati2, claude2))

    expect(await readFile(join(dati2, 'impostazioni.json'), 'utf8')).toBe('{"tema":"scuro"}')
    expect(await readFile(
      join(claude2, 'projects', 'E--Users-nikof-Progetto', 'sessione-1.jsonl'), 'utf8'
    )).toBe('{"riga":1}\n{"riga":2}\n')
  })
})
