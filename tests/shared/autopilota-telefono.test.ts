import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'
import { autopilotaPerTelefono, battuteLeggere, CHAT_VIVE_MAX, chatViva, DETTAGLIO_MAX, specialistiLeggeri, SPECIALISTI_FINITI_MAX, TESTO_MAX } from '@shared/autopilota-telefono'
import { CODA_LEGGERA } from '@shared/autopilota-leggero'
import { specialistiDi } from '@shared/specialisti'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'

/**
 * La scheda leggera dell'autopilota (m-collegamento): campi scelti a mano,
 * testi con un tetto, solo le chat vive. È la rotta sospettata dei 214 MB.
 */

const LUNGO = 'parola '.repeat(30_000) // 210 KB

/** Un autopilota enorme: migliaia di chat finite, decisioni e battute lunghissime. */
function enorme(): Autopilota {
  const base = nuovoAutopilota({ id: 'ap-1', nome: 'Notte', obiettivo: LUNGO, cwd: 'C:\\esempio', iniziatoIl: '2026-10-01T00:00:00.000Z' })
  const quando = (i: number): string => new Date(Date.UTC(2026, 9, 1, 0, 0, i)).toISOString()
  const chats: ChatGovernata[] = Array.from({ length: 3000 }, (_, i) => ({
    id: `c-${i + 1}`, compito: LUNGO.slice(0, 20_000), stato: i < 2995 ? 'finita' : 'lavoro', cicli: 3, ruolo: 'sviluppo', ultimaAzione: LUNGO.slice(0, 5000), dal: quando(i),
    ...(i < 2995 ? { conclusa: { il: quando(i), come: 'unito' as const } } : {})
  }))
  return {
    ...base,
    stato: 'lavoro',
    sessionId: 's-1',
    chats,
    decisioni: Array.from({ length: 600 }, (_, i) => ({ quando: quando(i), cosa: `supervisore → continua: ${LUNGO.slice(0, 50_000)}` })),
    dialogo: Array.from({ length: 60 }, (_, i) => ({ quando: quando(i), da: i % 2 === 0 ? 'tu' as const : 'lui' as const, testo: LUNGO, esito: LUNGO.slice(0, 3000) })),
    adottate: Array.from({ length: 500 }, (_, i) => ({ sessionId: `s-${i}`, titolo: LUNGO.slice(0, 2000) })) as unknown as Autopilota['adottate']
  }
}

function deps(a: Autopilota): DipendenzeRotte {
  return {
    dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-ap-tel-'))),
    chat: () => [],
    autopiloti: () => Promise.resolve([a]),
    autopilota: (id: string) => Promise.resolve(id === a.id ? a : undefined),
    domande: () => Promise.resolve([]),
    adesso: () => Date.parse('2026-10-01T02:00:00.000Z')
  } as unknown as DipendenzeRotte
}

describe('la scheda leggera per il telefono', () => {
  it('un autopilota enorme: la leggera resta sotto il mega, l’intera no', async () => {
    const a = enorme()
    const chiedi = async (leggera: boolean): Promise<string> => JSON.stringify(((await rotteClient(deps(a))({ metodo: 'POST', percorso: '/api/autopilota', corpo: { autopilota: 'ap-1', ...(leggera ? { leggero: true } : {}) }, dispositivo: 't1' })) as { corpo: unknown }).corpo)
    const leggera = await chiedi(true)
    const intera = await chiedi(false)
    expect(leggera.length).toBeLessThan(1024 * 1024)
    expect(intera.length).toBeGreaterThan(8 * 1024 * 1024)
  })

  it('solo le chat vive, con i campi che servono', () => {
    const l = autopilotaPerTelefono(enorme())
    const chats = l.chats as Record<string, unknown>[]
    expect(chats.map((c) => c.id)).toEqual(['c-2996', 'c-2997', 'c-2998', 'c-2999', 'c-3000'])
    expect(Object.keys(chats[0]!).sort()).toEqual(['cicli', 'compito', 'dal', 'id', 'ruolo', 'stato', 'ultimaAzione'])
    expect((chats[0]!.compito as string).length).toBeLessThanOrEqual(DETTAGLIO_MAX + 1)
    expect(l.chatsTutte).toBe(3000)
  })

  it('le code di decisioni e dialogo, e quanto erano lunghe', () => {
    const l = autopilotaPerTelefono(enorme())
    expect(l.decisioni).toHaveLength(CODA_LEGGERA.decisioni)
    expect(l.dialogo).toHaveLength(CODA_LEGGERA.dialogo)
    expect(l.troncati).toEqual({ decisioni: 600, dialogo: 60 })
    expect(((l.dialogo as { testo: string }[])[0]!.testo).length).toBeLessThanOrEqual(TESTO_MAX + 1)
    expect((l.obiettivo as string).endsWith('…')).toBe(true)
  })

  it('niente campi che app e pagina non leggono', () => {
    const l = autopilotaPerTelefono(enorme())
    for (const k of ['adottate', 'perAdottate', 'daConsegnare', 'inVolo', 'consegnatiDi', 'cloud', 'consegna', 'commitBase']) expect(l[k], k).toBeUndefined()
  })

  it('le chat vive non superano il paracadute', () => {
    const a = enorme()
    a.chats = a.chats.map((c) => ({ ...c, stato: 'lavoro' as const, conclusa: undefined }))
    expect((autopilotaPerTelefono(a).chats as unknown[]).length).toBe(CHAT_VIVE_MAX)
  })

  it('una chat avviata alla chiusura non è viva', () => {
    const c: ChatGovernata = { id: 'c-1', compito: 'x', stato: 'lavoro', cicli: 0 }
    expect(chatViva(c)).toBe(true)
    expect(chatViva({ ...c, fine: { esito: 'unita', il: '2026-10-01T00:00:00.000Z', passo: 'chiudi' } })).toBe(false)
    expect(chatViva({ ...c, stato: 'finita' })).toBe(false)
  })

  it('battute e specialisti con i tetti; degli specialisti finiti solo gli ultimi', () => {
    const b = battuteLeggere([{ quando: 'q', da: 'nota', testo: LUNGO, dettaglio: LUNGO }])
    expect(b[0]!.testo.length).toBeLessThanOrEqual(TESTO_MAX + 1)
    expect(b[0]!.dettaglio!.length).toBeLessThanOrEqual(DETTAGLIO_MAX + 1)
    const s = specialistiLeggeri(specialistiDi(enorme(), Date.parse('2026-10-01T02:00:00.000Z')))
    expect(s.elenco.filter((x) => x.chiusa === true)).toHaveLength(SPECIALISTI_FINITI_MAX)
    expect(s.elenco.filter((x) => x.chiusa !== true)).toHaveLength(5)
  })
})
