import { describe, it, expect } from 'vitest'
import { creaSpazioDrive } from '../../src/main/spazio-drive'
import { archivioInMemoria } from '../../src/main/cassaforte/archivio'
import type { Manifesto } from '../../src/main/cassaforte/incrementale'
import { NOME_PULIZIE, leggiPulizie } from '@shared/spazio-drive'

const GIORNO = 86_400_000

async function banco(opz: { manifestoRotto?: boolean } = {}) {
  let adesso = Date.parse('2026-10-12T12:00:00.000Z')
  const a = archivioInMemoria()
  for (const n of ['f_a1', 'f_a2', 'f_b']) await a.carica(n, Buffer.alloc(1000))
  let manifesto: Manifesto = {
    versione: 1, creatoIl: '',
    file: {
      'chat/slug-a/aaaa.jsonl': { nome: 'f_a1', size: 900, mtime: adesso - 90 * GIORNO },
      'chat/slug-b/aaaa.jsonl': { nome: 'f_a2', size: 800, mtime: adesso - 90 * GIORNO },
      'chat/slug-a/bbbb.jsonl': { nome: 'f_b', size: 700, mtime: adesso - 90 * GIORNO }
    }
  }
  const oggetti = new Map<string, unknown>()
  const righe: string[] = []
  const spazio = creaSpazioDrive({
    archivio: () => a,
    scatola: () => ({ leggi: async <T>(n: string) => oggetti.get(n) as T | undefined, scrivi: async (n: string, o: unknown) => { oggetti.set(n, JSON.parse(JSON.stringify(o))) } }) as never,
    manifestoDrive: async () => manifesto,
    modificaManifesto: async (cambia) => {
      if (opz.manifestoRotto === true) return { ok: false, messaggio: 'il Drive non risponde' }
      const d = cambia(manifesto)
      if (d !== undefined) manifesto = d
      return { ok: true }
    },
    copieSuiPc: () => new Map([['bbbb', [{ nome: 'Portatile', size: 700 }]]]),
    io: () => ({ id: 'pc-qui', nome: 'PC-ESEMPIO' }),
    log: (m) => { righe.push(m) },
    adesso: () => adesso
  })
  return { spazio, a, manifesto: () => manifesto, oggetti, righe, avanti: (ms: number) => { adesso += ms } }
}

describe('le pulizie del Drive, confermate, in recupero e annullabili', () => {
  it('misura e propone senza toccare niente', async () => {
    const b = await banco()
    const st = await b.spazio.stato()
    expect(st.misura?.perTipo.chat.file).toBe(3)
    expect(st.proposte.map((p) => p.tipo).sort()).toEqual(['doppie', 'vecchie'])
    expect(Object.keys(b.manifesto().file)).toHaveLength(3)
  })

  it('pulisci: prima il registro, poi le voci escono dal manifesto; i file restano sul Drive; «Annulla» le rimette', async () => {
    const b = await banco()
    const e = await b.spazio.pulisci('doppie')
    expect(e.ok).toBe(true)
    expect(b.manifesto().file['chat/slug-b/aaaa.jsonl']).toBeUndefined()
    expect((await b.a.elenca()).has('f_a2')).toBe(true)
    const r = leggiPulizie(b.oggetti.get(NOME_PULIZIE))
    expect(r.pulizie).toHaveLength(1)
    expect(b.spazio.fuoriDalDrive('chat/slug-b/aaaa.jsonl', 800)).toBe(true)
    const an = await b.spazio.annulla(r.pulizie[0]!.id)
    expect(an.ok).toBe(true)
    expect(b.manifesto().file['chat/slug-b/aaaa.jsonl']?.nome).toBe('f_a2')
    expect(b.spazio.fuoriDalDrive('chat/slug-b/aaaa.jsonl', 800)).toBe(false)
    expect(b.righe.join('\n')).toContain('annullata: 1 voci rimesse')
  })

  it('se il manifesto non si scrive, la pulizia si segna annullata e niente cambia', async () => {
    const b = await banco({ manifestoRotto: true })
    const e = await b.spazio.pulisci('vecchie')
    expect(e.ok).toBe(false)
    expect(e.messaggio).toContain('Niente è cambiato')
    expect(leggiPulizie(b.oggetti.get(NOME_PULIZIE)).pulizie[0]?.annullataIl).toBeDefined()
    expect(b.spazio.fuoriDalDrive('chat/slug-a/bbbb.jsonl', 700)).toBe(false)
  })

  it('dopo 30 giorni il giro cancella davvero i file della pulizia', async () => {
    const b = await banco()
    await b.spazio.pulisci('vecchie')
    await b.spazio.giro()
    expect((await b.a.elenca()).has('f_b')).toBe(true)
    b.avanti(31 * GIORNO)
    await b.spazio.giro()
    expect((await b.a.elenca()).has('f_b')).toBe(false)
    const p = leggiPulizie(b.oggetti.get(NOME_PULIZIE)).pulizie[0]
    expect(p?.svuotataIl).toBeDefined()
    expect((await b.spazio.annulla(p!.id)).ok).toBe(false)
  })

  it('Svuota con un file che il Drive non cancella: non dice «liberati» e la pulizia resta da svuotare (revisione ECC)', async () => {
    const b = await banco()
    await b.spazio.pulisci('vecchie')
    const id = leggiPulizie(b.oggetti.get(NOME_PULIZIE)).pulizie[0]!.id
    const cancella = b.a.cancella.bind(b.a)
    b.a.cancella = async () => { throw new Error('403 quota') }
    const e = await b.spazio.svuota(id)
    expect(e.ok).toBe(false)
    expect(e.messaggio).toContain('1 no')
    expect(leggiPulizie(b.oggetti.get(NOME_PULIZIE)).pulizie[0]?.svuotataIl).toBeUndefined()
    expect(b.righe.join('\n')).toContain('403 quota')
    // Il Drive torna: si riprova e va.
    b.a.cancella = cancella
    expect((await b.spazio.svuota(id)).ok).toBe(true)
    expect((await b.a.elenca()).has('f_b')).toBe(false)
  })

  it('due pulizie nello stesso millisecondo hanno id diversi', async () => {
    const b = await banco()
    await b.spazio.togliChat(['aaaa'], 'una')
    await b.spazio.togliChat(['bbbb'], 'due')
    const ids = leggiPulizie(b.oggetti.get(NOME_PULIZIE)).pulizie.map((p) => p.id)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
  })
})
