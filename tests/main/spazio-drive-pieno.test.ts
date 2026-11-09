import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaSpazioDrive, intenzioniSuDisco, type ArchivioIntenzioni, type IntenzionePulizia } from '../../src/main/spazio-drive'
import { archivioInMemoria, type Archivio } from '../../src/main/cassaforte/archivio'
import { creaFreno, MESSAGGIO_DRIVE_PIENO } from '../../src/main/cassaforte/freno-drive'
import type { Manifesto } from '../../src/main/cassaforte/incrementale'
import { NOME_PULIZIE, leggiPulizie, RECUPERO_DRIVE_PIENO_DEFAULT } from '@shared/spazio-drive'

const GIORNO = 86_400_000

/**
 * Un Drive finto PIENO: l'archivio in memoria con un limite, e un freno come
 * quello vero (scritture bloccate finche' e' pieno, DELETE no). `bloccato`
 * tiene le scritture rifiutate anche se lo spazio c'e' (per provare il
 * riallineamento «quando torna spazio»); `cancellaRotta` fa fallire le DELETE.
 */
function banco(opz: { pieno?: boolean; capacita?: number; copie?: Map<string, { nome: string; size: number }[]> } = {}) {
  const adesso = Date.parse('2026-11-09T12:00:00.000Z')
  const base = archivioInMemoria()
  const freno = creaFreno(() => adesso)
  const stato = { bloccato: false, cancellaRotta: false, capacita: 0 }
  const dimensioni: Record<string, number> = { f_a1: 1000, f_a2: 1000, f_b: 1000, f_p: 500 }
  const capacita = opz.capacita ?? (opz.pieno === false ? 10_000 : 3500)
  stato.capacita = capacita
  const usato = async (): Promise<number> => (await base.elencaConDimensioni!()).reduce((t, f) => t + f.byte, 0)
  const puoScrivere = async (extra: number): Promise<void> => {
    if (stato.bloccato || (await usato()) + extra > stato.capacita || freno.pieno()) {
      freno.spazioPieno()
      throw new Error(MESSAGGIO_DRIVE_PIENO)
    }
    freno.spazioLibero()
  }
  const archivio: Archivio = {
    ...base,
    carica: async (n, b) => { await puoScrivere(b.length); await base.carica(n, b) },
    cancella: async (n) => { if (stato.cancellaRotta) throw new Error('rete caduta'); await base.cancella(n) },
    cancellaId: async (id) => { if (stato.cancellaRotta) throw new Error('rete caduta'); await base.cancella(id) },
    quota: async () => {
      const u = await usato()
      if (!stato.bloccato && u + 100 < stato.capacita) freno.spazioLibero()
      return { usato: u, limite: stato.capacita, usatoNelDrive: 123, nelCestino: 45 }
    }
  }
  const pronto = (async () => { for (const [n, b] of Object.entries(dimensioni)) await base.carica(n, Buffer.alloc(b)) })()
  let manifesto: Manifesto = {
    versione: 1, creatoIl: '',
    file: {
      'chat/slug-a/aaaa.jsonl': { nome: 'f_a1', size: 900, mtime: adesso - 90 * GIORNO },
      'chat/slug-a/bbbb.jsonl': { nome: 'f_b', size: 700, mtime: adesso - 90 * GIORNO },
      'chat/-x-SierraDeck-prova-1/pppp.jsonl': { nome: 'f_p', size: 400, mtime: adesso - 3 * GIORNO }
    }
  }
  const oggetti = new Map<string, unknown>()
  const righe: string[] = []
  const copie = opz.copie ?? new Map([['bbbb', [{ nome: 'Portatile', size: 700 }]]])
  let intenzioniMem: IntenzionePulizia[] = []
  const memoria: ArchivioIntenzioni = { leggi: () => JSON.parse(JSON.stringify(intenzioniMem)) as IntenzionePulizia[], scrivi: (l) => { intenzioniMem = JSON.parse(JSON.stringify(l)) as IntenzionePulizia[] } }
  const crea = (intenzioni: ArchivioIntenzioni = memoria, recupero?: 'salta' | 'tieni') => creaSpazioDrive({
    archivio: () => archivio,
    scatola: () => ({
      leggi: async <T>(n: string) => oggetti.get(n) as T | undefined,
      scrivi: async (n: string, o: unknown) => { await puoScrivere(100); oggetti.set(n, JSON.parse(JSON.stringify(o))) }
    }) as never,
    manifestoDrive: async () => manifesto,
    modificaManifesto: async (cambia) => {
      try { await puoScrivere(100) } catch (e) { return { ok: false, messaggio: (e as Error).message } }
      const d = cambia(manifesto)
      if (d !== undefined) manifesto = d
      return { ok: true }
    },
    copieSuiPc: () => copie,
    io: () => ({ id: 'pc-qui', nome: 'PC-ESEMPIO' }),
    log: (m) => { righe.push(m) },
    adesso: () => adesso,
    pieno: () => freno.pieno(),
    pienoDetto: () => freno.pienoDetto(),
    intenzioni,
    ...(recupero !== undefined ? { recuperoDrivePieno: () => recupero } : {})
  })
  const spazio = crea()
  const ora = async (): Promise<void> => { await pronto; if (opz.pieno !== false) freno.spazioPieno() }
  return { spazio, crea, archivio, base, freno, stato, manifesto: () => manifesto, oggetti, righe, copie, usato, ora, intenzioni: () => intenzioniMem, capacita }
}

const registroSulDrive = (b: ReturnType<typeof banco>) => leggiPulizie(b.oggetti.get(NOME_PULIZIE))

describe('pulizia a Drive pieno: annota in locale, cancella, riallinea', () => {
  it('il default a Drive pieno e\' «salta» e il messaggio del cestino non rimanda al cestino', () => {
    expect(RECUPERO_DRIVE_PIENO_DEFAULT).toBe('salta')
    expect(MESSAGGIO_DRIVE_PIENO).not.toMatch(/svuota il cestino/i)
    expect(MESSAGGIO_DRIVE_PIENO).toMatch(/dal programma/)
    expect(MESSAGGIO_DRIVE_PIENO).toMatch(/cestino conta solo per i file visibili/)
  })

  it('con il Drive pieno la pulizia libera davvero (prima non partiva) e, tornato lo spazio, indice e registro seguono', async () => {
    const b = await banco()
    await b.ora()
    expect(await b.usato()).toBeGreaterThan(b.capacita - 600)
    // Prova che il Drive e' davvero pieno: una scrittura qualunque e' rifiutata.
    await expect(b.archivio.carica('x', Buffer.alloc(900))).rejects.toThrow(MESSAGGIO_DRIVE_PIENO)
    const prima = await b.usato()
    const e = await b.spazio.pulisci('vecchie')
    expect(e.ok).toBe(true)
    expect(e.drivePieno).toBe(true)
    expect((await b.base.elenca()).has('f_b')).toBe(false)
    expect((await b.base.elenca()).has('f_a1')).toBe(true) // nessuna copia sul PC: non si tocca
    expect(await b.usato()).toBe(prima - 1000)
    // Lo spazio e' tornato: l'indice e il registro si sono riallineati nella stessa pulizia.
    expect(b.manifesto().file['chat/slug-a/bbbb.jsonl']).toBeUndefined()
    const p = registroSulDrive(b).pulizie[0]
    expect(p?.svuotataIl).toBeDefined()
    expect(b.spazio.inSospeso()).toHaveLength(0)
    expect(b.intenzioni()).toHaveLength(0)
    expect(b.spazio.fuoriDalDrive('chat/slug-a/bbbb.jsonl', 700)).toBe(true)
  })

  it('se il registro non si scrive resta in sospeso in locale e si riporta sul Drive al primo giro con spazio', async () => {
    const b = await banco()
    await b.ora()
    b.stato.bloccato = true
    const e = await b.spazio.pulisci('vecchie')
    expect(e.ok).toBe(true)
    expect(e.inSospeso).toBe(true)
    expect((await b.base.elenca()).has('f_b')).toBe(false) // la DELETE e' passata
    expect(registroSulDrive(b).pulizie).toHaveLength(0)
    expect(b.manifesto().file['chat/slug-a/bbbb.jsonl']).toBeDefined()
    expect(b.spazio.inSospeso()).toHaveLength(1)
    expect(b.intenzioni()).toHaveLength(1)
    // Intanto il salvataggio non la rimanda su, e il pannello la vede.
    expect(b.spazio.fuoriDalDrive('chat/slug-a/bbbb.jsonl', 700)).toBe(true)
    expect((await b.spazio.stato(true)).pulizie.map((x) => x.id)).toContain(e.pulizia!.id)
    // Un giro ancora senza spazio non rompe niente.
    await b.spazio.giro()
    expect(b.spazio.inSospeso()).toHaveLength(1)
    // Torna lo spazio.
    b.stato.bloccato = false
    b.freno.spazioLibero()
    await b.spazio.giro()
    expect(b.spazio.inSospeso()).toHaveLength(0)
    expect(b.intenzioni()).toHaveLength(0)
    expect(b.manifesto().file['chat/slug-a/bbbb.jsonl']).toBeUndefined()
    const r = registroSulDrive(b).pulizie
    expect(r).toHaveLength(1)
    expect(r[0]?.id).toBe(e.pulizia!.id)
    expect(r[0]?.svuotataIl).toBeDefined()
  })

  it('l\'intenzione annotata si riprende dopo un riavvio (file locale vero, scrittura atomica)', async () => {
    const cartella = mkdtempSync(join(tmpdir(), 'sd-intenzioni-'))
    try {
      const file = join(cartella, 'spazio-intenzioni.json')
      const b = await banco()
      await b.ora()
      const prima = b.crea(intenzioniSuDisco(file))
      b.stato.cancellaRotta = true
      b.stato.bloccato = true
      const e = await prima.pulisci('vecchie')
      expect(e.ok).toBe(false) // la cancellazione non e' riuscita: si riprova da sola
      expect((await b.base.elenca()).has('f_b')).toBe(true)
      expect(intenzioniSuDisco(file).leggi()).toHaveLength(1)
      // «Riavvio»: un'istanza nuova, stessa cartella; il Drive ora risponde.
      b.stato.cancellaRotta = false
      b.stato.bloccato = false
      b.freno.spazioLibero()
      const dopo = b.crea(intenzioniSuDisco(file))
      expect(dopo.inSospeso()).toHaveLength(1)
      await dopo.giro()
      expect((await b.base.elenca()).has('f_b')).toBe(false)
      expect(dopo.inSospeso()).toHaveLength(0)
      expect(intenzioniSuDisco(file).leggi()).toHaveLength(0)
      expect(registroSulDrive(b).pulizie[0]?.svuotataIl).toBeDefined()
      expect(b.manifesto().file['chat/slug-a/bbbb.jsonl']).toBeUndefined()
    } finally {
      rmSync(cartella, { recursive: true, force: true })
    }
  })

  it('niente si cancella dal Drive senza una copia intera sul PC (anche se la copia sparisce prima della ripresa)', async () => {
    const senza = await banco({ copie: new Map() })
    await senza.ora()
    const e = await senza.spazio.pulisci('prove')
    expect(e.ok).toBe(false)
    expect((await senza.base.elenca()).has('f_p')).toBe(true)
    expect(senza.spazio.inSospeso()).toHaveLength(0)
    expect(senza.intenzioni()).toHaveLength(0)

    // La copia c'era quando l'intenzione e' stata annotata, poi sparisce: alla ripresa il file resta.
    const b = await banco({ copie: new Map([['bbbb', [{ nome: 'Portatile', size: 700 }]]]) })
    await b.ora()
    b.stato.cancellaRotta = true
    const x = await b.spazio.pulisci('vecchie')
    expect(x.ok).toBe(false)
    b.copie.clear()
    b.stato.cancellaRotta = false
    await b.spazio.giro()
    expect((await b.base.elenca()).has('f_b')).toBe(true)
    expect(b.righe.join('\n')).toContain('la copia intera sul PC non c\'e\' piu\'')
    expect(b.spazio.inSospeso()).toHaveLength(0)
  })

  it('«Elimina dal PC anche dal Drive» (scelta di Nicholas) non chiede la copia sul PC', async () => {
    const b = await banco({ copie: new Map() })
    await b.ora()
    const e = await b.spazio.togliChat(['aaaa'], 'Chat eliminata')
    expect(e.ok).toBe(true)
    expect((await b.base.elenca()).has('f_a1')).toBe(false)
  })

  it('recupero «tieni»: va nel recupero come oggi, i file restano sul Drive e il registro segue appena c\'e\' spazio', async () => {
    const b = await banco()
    await b.ora()
    const prima = await b.usato()
    const e = await b.spazio.pulisci('vecchie', undefined, { recupero: 'tieni' })
    expect(e.ok).toBe(true)
    expect((await b.base.elenca()).has('f_b')).toBe(true)
    expect(await b.usato()).toBe(prima)
    expect(e.inSospeso).toBe(true) // Drive pieno: indice e registro non si scrivono
    expect(b.spazio.inSospeso()).toHaveLength(1)
    expect(b.spazio.fuoriDalDrive('chat/slug-a/bbbb.jsonl', 700)).toBe(true)
    b.stato.capacita = 10_000 // il Drive e' stato ingrandito o svuotato da fuori
    b.freno.spazioLibero()
    await b.spazio.giro()
    expect(b.spazio.inSospeso()).toHaveLength(0)
    const p = registroSulDrive(b).pulizie[0]
    expect(p?.svuotataIl).toBeUndefined()
    expect(p?.annullataIl).toBeUndefined()
    expect(b.manifesto().file['chat/slug-a/bbbb.jsonl']).toBeUndefined()
  })

  it('la preferenza (dipendenza) sceglie il recupero quando l\'opzione non c\'e\'', async () => {
    const b = await banco()
    await b.ora()
    const tieni = b.crea(undefined, 'tieni')
    const e = await tieni.pulisci('vecchie')
    expect(e.ok).toBe(true)
    expect((await b.base.elenca()).has('f_b')).toBe(true)
  })

  it('«Svuota adesso» e\' coerente anche se il registro non si scrive: intenzione locale, poi il registro segue', async () => {
    const b = await banco({ pieno: false })
    await b.ora()
    const e = await b.spazio.pulisci('vecchie') // Drive con spazio: recupero di sempre
    expect(e.ok).toBe(true)
    const id = registroSulDrive(b).pulizie[0]!.id
    expect(registroSulDrive(b).pulizie[0]?.svuotataIl).toBeUndefined()
    // Ora il Drive e' pieno e il registro non si scrive.
    b.stato.bloccato = true
    b.freno.spazioPieno()
    const s = await b.spazio.svuota(id)
    expect(s.ok).toBe(true)
    expect((await b.base.elenca()).has('f_b')).toBe(false)
    expect(registroSulDrive(b).pulizie[0]?.svuotataIl).toBeUndefined()
    expect(b.spazio.inSospeso()).toHaveLength(1)
    // L'annulla non rimette una voce senza file, e il registro non dice «in recupero».
    expect((await b.spazio.stato(true)).pulizie[0]?.svuotataIl).toBeDefined()
    b.stato.bloccato = false
    b.freno.spazioLibero()
    await b.spazio.giro()
    expect(b.spazio.inSospeso()).toHaveLength(0)
    expect(registroSulDrive(b).pulizie[0]?.svuotataIl).toBeDefined()
  })

  it('«Svuota» con una cancellazione che non riesce non segna niente e lascia riprovare', async () => {
    const b = await banco({ pieno: false })
    await b.ora()
    await b.spazio.pulisci('vecchie')
    const id = registroSulDrive(b).pulizie[0]!.id
    b.stato.cancellaRotta = true
    const s = await b.spazio.svuota(id)
    expect(s.ok).toBe(false)
    expect((await b.spazio.stato(true)).pulizie[0]?.svuotataIl).toBeUndefined()
    b.stato.cancellaRotta = false
    expect((await b.spazio.svuota(id)).ok).toBe(true)
    expect((await b.base.elenca()).has('f_b')).toBe(false)
    expect(registroSulDrive(b).pulizie[0]?.svuotataIl).toBeDefined()
  })

  it('senza un posto dove annotare in locale, a Drive pieno non cancella niente', async () => {
    const b = await banco()
    await b.ora()
    const senza = creaSpazioDrive({
      archivio: () => b.archivio, scatola: () => undefined, manifestoDrive: async () => b.manifesto(), modificaManifesto: async () => ({ ok: false }),
      copieSuiPc: () => b.copie, io: () => ({ id: 'x', nome: 'X' }), log: () => undefined, pieno: () => true
    })
    const e = await senza.pulisci('vecchie')
    expect(e.ok).toBe(false)
    expect((await b.base.elenca()).has('f_b')).toBe(true)
  })
})

describe('la misura della quota', () => {
  it('restituisce limite, usato, percentuale, nel Drive, nel cestino e lo spazio di SierraDeck per tipo, e scrive una riga di log', async () => {
    const b = await banco()
    await b.ora()
    const q = await b.spazio.quota(true)
    expect(q).toBeDefined()
    expect(q!.limite).toBe(b.capacita)
    expect(q!.usato).toBe(3500)
    expect(q!.percentuale).toBe(100)
    expect(q!.usatoNelDrive).toBe(123)
    expect(q!.nelCestino).toBe(45)
    expect(q!.sierraDeck.file).toBe(4)
    expect(q!.sierraDeck.byte).toBe(3500)
    expect(q!.sierraDeck.perTipo.chat.file).toBe(3)
    expect(q!.sierraDeck.perTipo.orfani.file).toBe(1)
    expect(Object.keys(q!.sierraDeck.perTipo).sort()).toEqual(['battiti', 'chat', 'orfani', 'progetti', 'recupero', 'sistema'])
    expect(b.righe.some((r) => r.startsWith('[spazio] quota: usato') && r.includes('(100%)') && r.includes('nel cestino'))).toBe(true)
  })
})
