import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriSincronia, FILE_MAESTRA_RICORDATA, type Portachiavi } from '../../src/main/cassaforte/sincronia'
import { magazzinoInMemoria, type Magazzino } from '../../src/main/cassaforte/magazzino'
import { archivioInMemoria, type Archivio } from '../../src/main/cassaforte/archivio'
import { preparaBlocco } from '../../src/main/cassaforte/lavoro'
import { sblocca, type Cassaforte } from '../../src/main/cassaforte/cifratura'
import { apriRegistroProgetti, aggiungiProgetto } from '../../src/main/progetti/registro'
import { creaProgettiSync } from '../../src/main/progetti/sincronia-progetti'

/**
 * Un «Drive» condiviso fra PC finti: il magazzino a blocco unico (per le chiavi)
 * e l'archivio a più file (per i dati incrementali), le stesse istanze per tutti.
 * È ciò che simula «lo stesso account Google visto da più macchine».
 */
function driveCondiviso(): { magazzino: (nome?: string) => Magazzino; archivio: () => Archivio } {
  const mags = new Map<string, Magazzino>()
  const arch = archivioInMemoria()
  return {
    magazzino: (nome = 'sierradeck.cassaforte') => {
      let m = mags.get(nome)
      if (m === undefined) { m = magazzinoInMemoria(); mags.set(nome, m) }
      return m
    },
    archivio: () => arch
  }
}

/** Prepara le cartelle di un «PC»: dati SierraDeck + root di Claude Code. */
function pc(nome: string): { dati: string; claude: string } {
  const radice = mkdtempSync(join(tmpdir(), `sd-sync-${nome}-`))
  const dati = join(radice, 'dati')
  const claude = join(radice, 'claude')
  mkdirSync(dati, { recursive: true })
  mkdirSync(join(claude, 'projects', 'progetto'), { recursive: true })
  return { dati, claude }
}

function apri(p: { dati: string; claude: string }, drive: ReturnType<typeof driveCondiviso>): ReturnType<typeof apriSincronia> {
  return apriSincronia({
    dati: p.dati, radiceClaude: p.claude,
    driveConnesso: () => true, magazzino: drive.magazzino, archivio: drive.archivio
  })
}

describe('sincronia incrementale: giro completo fra due PC', () => {
  let temp: string[] = []
  const traccia = (p: { dati: string }): void => { temp.push(join(p.dati, '..')) }
  beforeEach(() => { temp = [] })
  afterEach(() => { for (const t of temp) rmSync(t, { recursive: true, force: true }) })

  it('crea la passphrase e salva su un PC, sblocca e ripristina sull’altro', async () => {
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    writeFileSync(join(a.dati, 'workspaces.json'), '{"ciao":"da A"}', 'utf8')
    writeFileSync(join(a.claude, 'projects', 'progetto', 'sessione.jsonl'), '{"riga":1}\n', 'utf8')

    const syncA = apri(a, drive)
    const creata = await syncA.creaPassphrase('passphrase-robusta-1')
    expect(creata.ok).toBe(true)
    expect(creata.chiaveRecupero).toBeTruthy()

    const salvato = await syncA.salva()
    expect(salvato.ok).toBe(true)
    expect(salvato.voci ?? 0).toBeGreaterThanOrEqual(2) // due file caricati

    const b = pc('B'); traccia(b)
    const syncB = apri(b, drive)
    const st = await syncB.stato()
    expect(st.haCassaforte).toBe(true)
    expect(st.sbloccato).toBe(false)

    expect((await syncB.sblocca('sbagliata')).ok).toBe(false)
    expect((await syncB.sblocca('passphrase-robusta-1')).ok).toBe(true)

    const ripristinato = await syncB.ripristina()
    expect(ripristinato.ok).toBe(true)
    expect(ripristinato.scritti ?? 0).toBeGreaterThanOrEqual(2)

    expect(readFileSync(join(b.dati, 'workspaces.json'), 'utf8')).toBe('{"ciao":"da A"}')
    expect(existsSync(join(b.claude, 'projects', 'progetto', 'sessione.jsonl'))).toBe(true)
  })

  it('incrementale: al secondo salvataggio manda SOLO il file cambiato', async () => {
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    writeFileSync(join(a.dati, 'workspaces.json'), '{"x":1}', 'utf8')
    writeFileSync(join(a.claude, 'projects', 'progetto', 's.jsonl'), '{"r":1}\n', 'utf8')
    const syncA = apri(a, drive)
    await syncA.creaPassphrase('pw-incrementale')

    const primo = await syncA.salva()
    expect(primo.voci).toBe(2) // due file la prima volta

    // Niente cambia → salvataggio a costo zero.
    const secondo = await syncA.salva()
    expect(secondo.ok).toBe(true)
    expect(secondo.invariato).toBe(true)

    // Cambia UN file (contenuto più lungo → la firma cambia) → solo quello riparte.
    writeFileSync(join(a.claude, 'projects', 'progetto', 's.jsonl'), '{"r":1}\n{"r":2}\n{"r":3}\n', 'utf8')
    const terzo = await syncA.salva()
    expect(terzo.ok).toBe(true)
    expect(terzo.voci).toBe(1) // UN solo file caricato, non due
  })

  it('sblocca con la chiave di recupero quando la passphrase è persa', async () => {
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    writeFileSync(join(a.dati, 'workspaces.json'), '{"x":1}', 'utf8')
    const syncA = apri(a, drive)
    const { chiaveRecupero } = await syncA.creaPassphrase('la-mia-passphrase-2')
    await syncA.salva()

    const b = pc('B'); traccia(b)
    const syncB = apri(b, drive)
    expect((await syncB.sbloccaConRecupero('codice-storto')).ok).toBe(false)
    expect((await syncB.sbloccaConRecupero(chiaveRecupero!)).ok).toBe(true)
    expect((await syncB.ripristina()).ok).toBe(true)
    expect(readFileSync(join(b.dati, 'workspaces.json'), 'utf8')).toBe('{"x":1}')
  })

  it('cambia la passphrase: la nuova apre, la vecchia no, il recupero resta valido', async () => {
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    const syncA = apri(a, drive)
    const { chiaveRecupero } = await syncA.creaPassphrase('vecchia-passphrase-x')
    expect((await syncA.cambiaPassphrase('non-e-questa', 'nuova-passphrase-y')).ok).toBe(false)
    expect((await syncA.cambiaPassphrase('vecchia-passphrase-x', 'nuova-passphrase-y')).ok).toBe(true)

    const b = pc('B'); traccia(b)
    const syncB = apri(b, drive)
    expect((await syncB.sblocca('vecchia-passphrase-x')).ok).toBe(false)
    expect((await syncB.sblocca('nuova-passphrase-y')).ok).toBe(true)

    const c = pc('C'); traccia(c)
    const syncC = apri(c, drive)
    expect((await syncC.sbloccaConRecupero(chiaveRecupero!)).ok).toBe(true)
  })

  it('non si crea una seconda cassaforte se ne esiste già una', async () => {
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    const syncA = apri(a, drive)
    expect((await syncA.creaPassphrase('prima-passphrase-3')).ok).toBe(true)

    const b = pc('B'); traccia(b)
    const syncB = apri(b, drive)
    const secondo = await syncB.creaPassphrase('altra-passphrase-3')
    expect(secondo.ok).toBe(false)
    expect(secondo.messaggio).toMatch(/esiste già/i)
  })

  it('con il portachiavi, la maestra torna da sola al riavvio e l automatico puo partire', async () => {
    // Fino alla 0.12.54 a ogni riavvio serviva la passphrase, e finche' nessuno
    // la inseriva l'automatico restava fermo in silenzio.
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    const portachiavi: Portachiavi = {
      disponibile: () => true,
      cifra: (chiaro) => `dpapi:${chiaro.toString('base64')}`,
      decifra: (cifrato) => Buffer.from(cifrato.slice('dpapi:'.length), 'base64')
    }
    const prima = apriSincronia({
      dati: a.dati, radiceClaude: a.claude,
      driveConnesso: () => true, magazzino: drive.magazzino, archivio: drive.archivio, portachiavi
    })
    expect((await prima.creaPassphrase('segreta')).ok).toBe(true)
    expect(existsSync(join(a.dati, FILE_MAESTRA_RICORDATA))).toBe(true)
    // Il file non contiene la maestra in chiaro.
    expect(readFileSync(join(a.dati, FILE_MAESTRA_RICORDATA), 'utf8')).toContain('dpapi:')

    // «Riavvio»: una sincronia nuova sugli stessi dati, senza passphrase.
    const dopo = apriSincronia({
      dati: a.dati, radiceClaude: a.claude,
      driveConnesso: () => true, magazzino: drive.magazzino, archivio: drive.archivio, portachiavi
    })
    expect((await dopo.stato()).sbloccato).toBe(true)
    writeFileSync(join(a.claude, 'projects', 'progetto', 'chat.jsonl'), '{"a":1}\n')
    expect((await dopo.salva()).ok).toBe(true)

    // Bloccare e' una scelta: vale anche per la sessione dopo.
    dopo.blocca()
    expect(existsSync(join(a.dati, FILE_MAESTRA_RICORDATA))).toBe(false)
    const bloccata = apriSincronia({
      dati: a.dati, radiceClaude: a.claude,
      driveConnesso: () => true, magazzino: drive.magazzino, archivio: drive.archivio, portachiavi
    })
    expect((await bloccata.stato()).sbloccato).toBe(false)
  })

  it('un portachiavi che non riapre il file lo butta, e si resta bloccati', async () => {
    // Il file di un altro account Windows, o copiato da un altro PC: non vale
    // niente e non deve restare li' a fallire a ogni avvio.
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    writeFileSync(join(a.dati, FILE_MAESTRA_RICORDATA), JSON.stringify({ maestra: 'di-un-altro' }))
    const sync = apriSincronia({
      dati: a.dati, radiceClaude: a.claude,
      driveConnesso: () => true, magazzino: drive.magazzino, archivio: drive.archivio,
      portachiavi: { disponibile: () => true, cifra: (b) => b.toString('base64'), decifra: () => { throw new Error('non mio') } }
    })
    expect((await sync.stato()).sbloccato).toBe(false)
    expect(existsSync(join(a.dati, FILE_MAESTRA_RICORDATA))).toBe(false)
  })

  it('senza portachiavi, o con il portachiavi non disponibile, si lavora come prima', async () => {
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    const sync = apriSincronia({
      dati: a.dati, radiceClaude: a.claude,
      driveConnesso: () => true, magazzino: drive.magazzino, archivio: drive.archivio,
      portachiavi: { disponibile: () => false, cifra: (b) => b.toString('base64'), decifra: (s) => Buffer.from(s, 'base64') }
    })
    expect((await sync.creaPassphrase('segreta')).ok).toBe(true)
    expect(existsSync(join(a.dati, FILE_MAESTRA_RICORDATA))).toBe(false)
  })

  it('un progetto sul Drive arriva sull altro PC nella sua cartella dei progetti, con .git e senza node_modules', async () => {
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    const b = pc('B'); traccia(b)
    // Il progetto di A, con un .gitignore, node_modules e la storia git.
    const progettoA = join(a.dati, '..', 'SierraDeck')
    for (const [rel, testo] of [
      ['.gitignore', 'dist/\n'], ['src/main.ts', 'export {}'], ['dist/bundle.js', 'x'],
      ['node_modules/lib/i.js', 'x'], ['.git/HEAD', 'ref: refs/heads/main']
    ] as [string, string][]) {
      mkdirSync(join(progettoA, ...rel.split('/').slice(0, -1)), { recursive: true })
      writeFileSync(join(progettoA, ...rel.split('/')), testo)
    }
    const registroA = apriRegistroProgetti(a.dati)
    registroA.scrivi(aggiungiProgetto(registroA.leggi(), { pcId: 'pc-A', percorso: progettoA, adesso: 'oggi', id: 'p1' }).registro)
    const progettiA = creaProgettiSync({ registro: registroA, pcId: () => 'pc-A', cartellaProgetti: () => join(a.dati, '..', 'Progetti') })
    const syncA = apriSincronia({
      dati: a.dati, radiceClaude: a.claude, driveConnesso: () => true,
      magazzino: drive.magazzino, archivio: drive.archivio, progetti: progettiA
    })
    expect((await syncA.creaPassphrase('segreta')).ok).toBe(true)
    const salvato = await syncA.salva()
    expect(salvato.ok).toBe(true)
    // Il peso conta anche il progetto.
    expect((await syncA.info()).file).toBeGreaterThanOrEqual(4)

    // PC B: registro vuoto (arriva con l'assetto), cartella dei progetti sua.
    const cartellaB = join(b.dati, '..', 'Progetti')
    const registroB = apriRegistroProgetti(b.dati)
    const progettiB = creaProgettiSync({ registro: registroB, pcId: () => 'pc-B', cartellaProgetti: () => cartellaB })
    const syncB = apriSincronia({
      dati: b.dati, radiceClaude: b.claude, driveConnesso: () => true,
      magazzino: drive.magazzino, archivio: drive.archivio, progetti: progettiB
    })
    expect((await syncB.sblocca('segreta')).ok).toBe(true)
    const r = await syncB.ripristina()
    expect(r.ok).toBe(true)
    const progettoB = join(cartellaB, 'SierraDeck')
    expect(readFileSync(join(progettoB, 'src', 'main.ts'), 'utf8')).toBe('export {}')
    expect(readFileSync(join(progettoB, '.git', 'HEAD'), 'utf8')).toBe('ref: refs/heads/main')
    expect(existsSync(join(progettoB, 'dist'))).toBe(false)
    expect(existsSync(join(progettoB, 'node_modules'))).toBe(false)
    // E il registro di B sa dove sta il progetto qui.
    expect(registroB.leggi().progetti[0]?.percorsi).toEqual({ 'pc-A': progettoA, 'pc-B': progettoB })

    // B lavora e salva: il file nuovo torna su A, e niente di A sparisce.
    writeFileSync(join(progettoB, 'src', 'nuovo.ts'), 'export const x = 1')
    expect((await syncB.salva()).ok).toBe(true)
    expect((await syncA.ripristina()).ok).toBe(true)
    expect(readFileSync(join(progettoA, 'src', 'nuovo.ts'), 'utf8')).toBe('export const x = 1')
    expect(existsSync(join(progettoA, 'src', 'main.ts'))).toBe(true)
  })

  it('ripristinaProgetto porta solo quel progetto, e la scatola tiene presenze cifrate', async () => {
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    const b = pc('B'); traccia(b)
    const progettoA = join(a.dati, '..', 'Prog')
    mkdirSync(join(progettoA, 'src'), { recursive: true })
    writeFileSync(join(progettoA, 'src', 'a.ts'), 'uno')
    const registroA = apriRegistroProgetti(a.dati)
    registroA.scrivi(aggiungiProgetto(registroA.leggi(), { pcId: 'pc-A', percorso: progettoA, adesso: 'oggi', id: 'p1' }).registro)
    const syncA = apriSincronia({
      dati: a.dati, radiceClaude: a.claude, driveConnesso: () => true, magazzino: drive.magazzino, archivio: drive.archivio,
      progetti: creaProgettiSync({ registro: registroA, pcId: () => 'pc-A', cartellaProgetti: () => join(a.dati, '..', 'P') })
    })
    expect((await syncA.creaPassphrase('segreta')).ok).toBe(true)
    expect((await syncA.salva()).ok).toBe(true)

    const cartellaB = join(b.dati, '..', 'Progetti')
    const registroB = apriRegistroProgetti(b.dati)
    const syncB = apriSincronia({
      dati: b.dati, radiceClaude: b.claude, driveConnesso: () => true, magazzino: drive.magazzino, archivio: drive.archivio,
      progetti: creaProgettiSync({ registro: registroB, pcId: () => 'pc-B', cartellaProgetti: () => cartellaB })
    })
    expect((await syncB.sblocca('segreta')).ok).toBe(true)
    // Prima di sapere del progetto, la cassaforte chiusa non ha scatola; sbloccata si'.
    const scatolaB = syncB.scatola()
    expect(scatolaB).toBeDefined()
    await scatolaB!.scrivi('presenza-p1', { pcId: 'pc-A', pcNome: 'Torre', da: 'x', battito: 'y' })
    expect(await scatolaB!.leggi<{ pcId: string }>('presenza-p1')).toEqual({ pcId: 'pc-A', pcNome: 'Torre', da: 'x', battito: 'y' })
    // La presenza sul Drive non e' in chiaro.
    const grezza = await drive.archivio().scarica('presenza-p1')
    expect(grezza?.toString('utf8')).not.toContain('Torre')
    await scatolaB!.cancella('presenza-p1')
    expect(await scatolaB!.leggi('presenza-p1')).toBeUndefined()

    // B ripristina tutto una volta (arriva il registro), poi A cambia e B prende solo il progetto.
    expect((await syncB.ripristina()).ok).toBe(true)
    const progettoB = join(cartellaB, 'Prog')
    expect(readFileSync(join(progettoB, 'src', 'a.ts'), 'utf8')).toBe('uno')
    writeFileSync(join(progettoA, 'src', 'a.ts'), 'due')
    writeFileSync(join(progettoA, 'src', 'b.ts'), 'nuovo')
    expect((await syncA.salva()).ok).toBe(true)
    // Nel frattempo B ha una chat sua: il ripristino del solo progetto non la tocca.
    writeFileSync(join(b.claude, 'projects', 'progetto', 'mia.jsonl'), '{"b":1}\n')
    const r = await syncB.ripristinaProgetto('p1')
    expect(r.ok).toBe(true)
    expect(r.scritti).toBe(2)
    expect(readFileSync(join(progettoB, 'src', 'a.ts'), 'utf8')).toBe('due')
    expect(readFileSync(join(progettoB, 'src', 'b.ts'), 'utf8')).toBe('nuovo')
    expect(existsSync(join(b.claude, 'projects', 'progetto', 'mia.jsonl'))).toBe(true)
    // Un secondo giro senza cambi non riscrive niente.
    expect((await syncB.ripristinaProgetto('p1')).scritti).toBe(0)
  })

  it('togliProgettoDalDrive cancella i file del progetto lassu, non le cartelle qui', async () => {
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    const progettoA = join(a.dati, '..', 'Prog')
    mkdirSync(join(progettoA, 'src'), { recursive: true })
    writeFileSync(join(progettoA, 'src', 'a.ts'), 'uno')
    writeFileSync(join(a.claude, 'projects', 'progetto', 'chat.jsonl'), '{"a":1}')
    const registroA = apriRegistroProgetti(a.dati)
    registroA.scrivi(aggiungiProgetto(registroA.leggi(), { pcId: 'pc-A', percorso: progettoA, adesso: 'oggi', id: 'p1' }).registro)
    const syncA = apriSincronia({
      dati: a.dati, radiceClaude: a.claude, driveConnesso: () => true, magazzino: drive.magazzino, archivio: drive.archivio,
      progetti: creaProgettiSync({ registro: registroA, pcId: () => 'pc-A', cartellaProgetti: () => join(a.dati, '..', 'P') })
    })
    expect((await syncA.creaPassphrase('segreta')).ok).toBe(true)
    expect((await syncA.salva()).ok).toBe(true)
    await syncA.scatola()!.scrivi('presenza-p1', { pcId: 'pc-A' })
    const prima = await drive.archivio().elenca()
    expect([...prima.keys()].some((n) => n.startsWith('presenza-'))).toBe(true)

    const esito = await syncA.togliProgettoDalDrive('p1')
    expect(esito).toEqual({ ok: true, tolti: 1 })
    const dopo = await drive.archivio().elenca()
    expect([...dopo.keys()].some((n) => n.startsWith('presenza-'))).toBe(false)
    // La cartella qui resta; la chat e il manifesto restano sul Drive.
    expect(readFileSync(join(progettoA, 'src', 'a.ts'), 'utf8')).toBe('uno')
    const b = pc('B'); traccia(b)
    const syncB = apri(b, drive)
    expect((await syncB.sblocca('segreta')).ok).toBe(true)
    expect((await syncB.ripristina()).ok).toBe(true)
    expect(existsSync(join(b.claude, 'projects', 'progetto', 'chat.jsonl'))).toBe(true)
    expect(existsSync(join(b.dati, '..', 'Progetti'))).toBe(false)
    // Tolto dal registro (lo fa chi chiama, come il programma), un nuovo
    // salvataggio da A carica il registro cambiato e basta: il manifesto
    // locale ha dimenticato il progetto e la cartella non e' piu' una radice.
    registroA.scrivi({ versione: 1, progetti: [] })
    const r = await syncA.salva()
    expect(r.ok).toBe(true)
    expect(r.voci).toBe(1)
  })

  it('un PC con una cassaforte sua che si collega al Drive di un altro: lo vede, la adotta, e sale tutto', async () => {
    // Il caso di piu' PC con account e cassaforti diverse: senza questo, il
    // secondo PC vedeva solo «dati di un altro account».
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    writeFileSync(join(a.claude, 'projects', 'progetto', 'di-a.jsonl'), '{"a":1}')
    const syncA = apri(a, drive)
    expect((await syncA.creaPassphrase('passphrase-di-A')).ok).toBe(true)
    expect((await syncA.salva()).ok).toBe(true)

    // B ha una cassaforte sua (creata su un altro Drive) e un vecchio manifesto.
    const b = pc('B'); traccia(b)
    writeFileSync(join(b.claude, 'projects', 'progetto', 'di-b.jsonl'), '{"b":1}')
    const altroDrive = driveCondiviso()
    const syncBPrima = apri(b, altroDrive)
    expect((await syncBPrima.creaPassphrase('passphrase-di-B')).ok).toBe(true)
    expect((await syncBPrima.salva()).ok).toBe(true)
    expect(existsSync(join(b.dati, 'sync-manifesto.json'))).toBe(true)

    // Ora B si collega al Drive di A.
    const syncB = apri(b, drive)
    const stato = await syncB.stato()
    expect(stato.haCassaforte).toBe(true)
    expect(stato.cassaforteDiversa).toBe(true)
    // Con la sua passphrase apre la sua cassaforte, ma il Drive non si legge.
    expect((await syncB.sblocca('passphrase-di-B')).ok).toBe(true)
    expect((await syncB.ripristina()).ok).toBe(false)
    // Adotta quella del Drive.
    expect(await syncB.adottaCassaforteDelDrive()).toEqual({ ok: true })
    expect((await syncB.stato()).sbloccato).toBe(false)
    expect((await syncB.stato()).cassaforteDiversa).toBeUndefined()
    expect(existsSync(join(b.dati, 'sync-manifesto.json'))).toBe(false)
    expect(readdirSync(b.dati).some((n) => n.startsWith('cassaforte.messa-da-parte-'))).toBe(true)
    expect((await syncB.sblocca('passphrase-di-B')).ok).toBe(false)
    expect((await syncB.sblocca('passphrase-di-A')).ok).toBe(true)
    // Sale tutto quello di B (il manifesto e' stato dimenticato), senza toccare A.
    const salvato = await syncB.salva()
    expect(salvato.ok).toBe(true)
    expect(salvato.voci ?? 0).toBeGreaterThanOrEqual(1)
    expect((await syncA.ripristina()).ok).toBe(true)
    expect(existsSync(join(a.claude, 'projects', 'progetto', 'di-b.jsonl'))).toBe(true)
    expect(existsSync(join(a.claude, 'projects', 'progetto', 'di-a.jsonl'))).toBe(true)
  })

  it('nomiConosciuti sono i nomi del manifesto locale: quelli con cui si riconosce il proprio Drive', async () => {
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    writeFileSync(join(a.claude, 'projects', 'progetto', 'uno.jsonl'), '{"a":1}')
    writeFileSync(join(a.claude, 'projects', 'progetto', 'due.jsonl'), '{"a":2}')
    const syncA = apri(a, drive)
    expect(syncA.nomiConosciuti()).toEqual([])
    await syncA.creaPassphrase('segreta')
    await syncA.salva()
    const nomi = syncA.nomiConosciuti()
    expect(nomi).toHaveLength(2)
    const lassu = await drive.archivio().elenca()
    expect(nomi.every((n) => lassu.has(n))).toBe(true)
    syncA.cambiatoDrive()
    expect(syncA.nomiConosciuti()).toEqual([])
  })

  it('un cambio di passphrase su un altro PC non fa sembrare diversa la cassaforte, e la copia si allinea', async () => {
    // Sul portatile ogni account risultava «cassaforte diversa»: il confronto
    // guardava l'involucro con la passphrase, che un cambio di passphrase
    // rifa'. L'identita' e' la chiave-maestra, cioe' l'involucro di recupero.
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    writeFileSync(join(a.dati, 'workspaces.json'), '{"a":1}')
    const syncA = apri(a, drive)
    await syncA.creaPassphrase('prima-passphrase')
    await syncA.salva()
    const b = pc('B'); traccia(b)
    const syncB = apri(b, drive)
    expect((await syncB.sblocca('prima-passphrase')).ok).toBe(true)
    expect((await syncB.ripristina()).ok).toBe(true)
    // A cambia passphrase e la carica.
    expect((await syncA.cambiaPassphrase('prima-passphrase', 'seconda-passphrase')).ok).toBe(true)
    // B, riaperto: stessa cassaforte, e la copia locale si allinea alla nuova.
    const syncB2 = apri(b, drive)
    const st = await syncB2.stato()
    expect(st.haCassaforte).toBe(true)
    expect(st.cassaforteDiversa).toBeUndefined()
    expect((await syncB2.sblocca('prima-passphrase')).ok).toBe(false)
    expect((await syncB2.sblocca('seconda-passphrase')).ok).toBe(true)
  })

  it('la prova con la passphrase: apre il Drive giusto, e distingue un altra cassaforte con la stessa passphrase', async () => {
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    const syncA = apri(a, drive)
    await syncA.creaPassphrase('segreta')
    await syncA.salva()
    // B ha una cassaforte sua, per caso con la stessa passphrase.
    const b = pc('B'); traccia(b)
    const altro = driveCondiviso()
    await apri(b, altro).creaPassphrase('segreta')
    const syncB = apri(b, drive)
    expect((await syncB.stato()).cassaforteDiversa).toBe(true)
    const p1 = await syncB.provaPassphraseSulDrive('sbagliata')
    expect(p1.ok).toBe(false)
    const p2 = await syncB.provaPassphraseSulDrive('segreta')
    expect(p2).toMatchObject({ ok: true, stessa: false })
    expect((await syncB.stato()).cassaforteDiversa).toBe(true)
    // C ha la cassaforte di A (l'ha ripristinata), poi A cambia passphrase:
    // la prova con la passphrase nuova apre, allinea e sblocca.
    const c = pc('C'); traccia(c)
    const syncC = apri(c, drive)
    expect((await syncC.sblocca('segreta')).ok).toBe(true)
    syncC.blocca()
    expect((await syncA.cambiaPassphrase('segreta', 'nuovissima')).ok).toBe(true)
    const p3 = await syncC.provaPassphraseSulDrive('nuovissima')
    expect(p3).toEqual({ ok: true, stessa: true })
    expect((await syncC.stato()).sbloccato).toBe(true)
  })

  it('senza sblocco non salva né ripristina', async () => {
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    const sync = apri(a, drive)
    expect((await sync.salva()).ok).toBe(false)
    expect((await sync.ripristina()).ok).toBe(false)
  })

  it('il salvataggio automatico si accende, si spegne e si ricorda', async () => {
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    const sync = apri(a, drive)
    expect(sync.auto()).toBe(false)
    expect(sync.auto(true)).toBe(true)
    // Una nuova sessione sullo stesso PC ricorda la scelta.
    expect(apri(a, drive).auto()).toBe(true)
  })
})

describe('un backup a blocco unico (0.9.50–0.9.64) si ripristina ancora', () => {
  let temp: string[] = []
  const traccia = (p: { dati: string }): void => { temp.push(join(p.dati, '..')) }
  beforeEach(() => { temp = [] })
  afterEach(() => { for (const t of temp) rmSync(t, { recursive: true, force: true }) })

  it('senza manifesto sul Drive si prova il blocco vecchio, e i file tornano', async () => {
    // Chi ha salvato per l'ultima volta con quelle versioni — tipicamente il
    // secondo PC, che ripristina e non salva — si sentiva dire «niente sul
    // Drive» con tutto il backup intatto a un metro.
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    writeFileSync(join(a.dati, 'workspaces.json'), '{"ciao":"dal blocco unico"}', 'utf8')
    writeFileSync(join(a.claude, 'projects', 'progetto', 'vecchia.jsonl'), '{"riga":1}\n', 'utf8')
    const syncA = apri(a, drive)
    await syncA.creaPassphrase('passphrase-di-allora')
    // Il blocco unico, come lo scriveva la 0.9.5x: pacchetto cifrato con la
    // maestra, caricato sotto il nome predefinito del magazzino.
    const cassaforte = JSON.parse(readFileSync(join(a.dati, 'cassaforte.json'), 'utf8')) as Cassaforte
    const maestra = sblocca(cassaforte, 'passphrase-di-allora')
    expect(maestra).toBeDefined()
    const { cifrato } = await preparaBlocco({ dati: a.dati, radiceClaude: a.claude, maestra: maestra as Buffer, adesso: '2026-08-20T10:00:00.000Z' })
    await drive.magazzino().carica(cifrato, undefined)

    const b = pc('B'); traccia(b)
    const syncB = apri(b, drive)
    expect((await syncB.sblocca('passphrase-di-allora')).ok).toBe(true)
    const esito = await syncB.ripristina()
    expect(esito.ok).toBe(true)
    expect(esito.niente).toBeUndefined()
    expect(esito.scritti ?? 0).toBeGreaterThanOrEqual(2)
    expect(readFileSync(join(b.dati, 'workspaces.json'), 'utf8')).toBe('{"ciao":"dal blocco unico"}')
    expect(existsSync(join(b.claude, 'projects', 'progetto', 'vecchia.jsonl'))).toBe(true)
  })

  it('con niente sul Drive, né manifesto né blocco, si dice «niente»', async () => {
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    const syncA = apri(a, drive)
    await syncA.creaPassphrase('pw-vuota')
    const esito = await syncA.ripristina()
    expect(esito.ok).toBe(true)
    expect(esito.niente).toBe(true)
  })
})
