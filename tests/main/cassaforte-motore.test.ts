import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { caricaStato, ripristinaStato, CassaforteIlleggibile } from '../../src/main/cassaforte/motore'
import { radiciDaSincronizzare } from '../../src/main/cassaforte/raccolta'
import { magazzinoInMemoria, ConflittoMagazzino } from '../../src/main/cassaforte/magazzino'
import { creaCassaforte } from '../../src/main/cassaforte/cifratura'

let radice: string
const ADESSO = (): string => '2026-08-21T12:00:00.000Z'
beforeEach(() => { radice = mkdtempSync(join(tmpdir(), 'sd-motore-')) })

async function preparaPC(nome: string): Promise<{ dati: string; claude: string }> {
  const dati = join(radice, nome, 'dati')
  const claude = join(radice, nome, 'claude')
  await mkdir(dati, { recursive: true })
  await writeFile(join(dati, 'workspaces.json'), `{"pc":"${nome}"}`)
  const slug = join(claude, 'projects', 'E--Users-nikof-Progetto')
  await mkdir(slug, { recursive: true })
  await writeFile(join(slug, 's.jsonl'), `chat di ${nome}\n`)
  return { dati, claude }
}

describe('il motore di sincronizzazione', () => {
  it('carica su un PC e ritrova tutto identico su un altro', async () => {
    const magazzino = magazzinoInMemoria()
    const { maestra, cassaforte } = creaCassaforte('passphrase')

    // PC A carica.
    const a = await preparaPC('A')
    const esito = await caricaStato({
      radici: radiciDaSincronizzare(a.dati, a.claude), maestra, magazzino, adesso: ADESSO
    })
    expect(esito.voci).toBe(2)

    // PC B: stesso account (stessa maestra dalla passphrase), cartelle vuote, ripristina.
    const { sblocca } = await import('../../src/main/cassaforte/cifratura')
    const maestraB = sblocca(cassaforte, 'passphrase')!
    const b = await preparaPC('B') // ha roba sua, che verrà sovrascritta dal ripristino
    const dopo = await ripristinaStato({
      radici: radiciDaSincronizzare(b.dati, b.claude), maestra: maestraB, magazzino
    })
    expect(dopo.trovato).toBe(true)
    expect(dopo.saltati).toEqual([])
    expect(dopo.creatoIl).toBe('2026-08-21T12:00:00.000Z')
    // Su B ora c'è lo stato di A.
    expect(await readFile(join(b.dati, 'workspaces.json'), 'utf8')).toBe('{"pc":"A"}')
    expect(await readFile(
      join(b.claude, 'projects', 'E--Users-nikof-Progetto', 's.jsonl'), 'utf8'
    )).toBe('chat di A\n')
  })

  it('ripristinare da un account che non ha mai caricato non fa niente', async () => {
    const b = await preparaPC('B')
    const { maestra } = creaCassaforte('p')
    const dopo = await ripristinaStato({
      radici: radiciDaSincronizzare(b.dati, b.claude), maestra, magazzino: magazzinoInMemoria()
    })
    expect(dopo.trovato).toBe(false)
    expect(dopo.scritti).toBe(0)
  })

  it('una chiave sbagliata non decifra: solleva CassaforteIlleggibile', async () => {
    const magazzino = magazzinoInMemoria()
    const a = await preparaPC('A')
    const uno = creaCassaforte('passphrase-di-uno')
    await caricaStato({ radici: radiciDaSincronizzare(a.dati, a.claude), maestra: uno.maestra, magazzino, adesso: ADESSO })

    // Un altro account (altra maestra) prova a ripristinare: i dati non sono suoi.
    const altro = creaCassaforte('passphrase-di-un-altro')
    const b = await preparaPC('B')
    await expect(ripristinaStato({
      radici: radiciDaSincronizzare(b.dati, b.claude), maestra: altro.maestra, magazzino
    })).rejects.toBeInstanceOf(CassaforteIlleggibile)
  })

  it('la versione va tracciata: con quella vista si ricarica, con una vecchia si è in conflitto', async () => {
    const magazzino = magazzinoInMemoria()
    const { maestra } = creaCassaforte('p')
    const a = await preparaPC('A')
    const radici = radiciDaSincronizzare(a.dati, a.claude)

    const primo = await caricaStato({ radici, maestra, magazzino, adesso: ADESSO })
    // Con la versione appena ottenuta, un secondo caricamento passa.
    const secondo = await caricaStato({ radici, maestra, magazzino, adesso: ADESSO, versioneVista: primo.versione })
    expect(secondo.versione).not.toBe(primo.versione)
    // Fermi alla versione vecchia (come farebbe un altro PC rimasto indietro): conflitto.
    await expect(caricaStato({
      radici, maestra, magazzino, adesso: ADESSO, versioneVista: primo.versione
    })).rejects.toBeInstanceOf(ConflittoMagazzino)
  })
})
