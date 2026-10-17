import { describe, it, expect } from 'vitest'
import {
  conArchiviata, controllaGettone, eFileTodoDi, governataDa, improntaSvuota, leggiArchiviate, leggiRecuperoChat, messaggioEsito,
  motivoNonArchivia, motivoNonChiude, motivoNonElimina, nascondiArchiviate, nelRecupero, ordinaPerSpazio, partiDiSessione, potaRecupero,
  scadenzaRecupero, scaduteRecupero, senzaArchiviate, sessioneValida, slugValido, statoPerAzione, totaleSelezione, vistaSpazio,
  FRASE_SVUOTA, GETTONE_SVUOTA_MS, TESTI_AZIONI_CHAT,
  type AutopilotaPerChat, type ChatInRecupero, type VoceSpazio
} from '@shared/gestione-chat'
import { byteLeggibili } from '@shared/spazio-drive'

// 0.79.0: la gestione delle chat. Solo id e nomi d'esempio.
const S1 = '11111111-1111-4111-8111-111111111111'
const S2 = '22222222-2222-4222-8222-222222222222'
const S3 = '33333333-3333-4333-8333-333333333333'

describe('i file di una sessione', () => {
  it('solo percorsi che contengono l’id della sessione, mai cartelle condivise', () => {
    const parti = partiDiSessione('E--progetti-esempio', S1)
    expect(parti.map((p) => p.relativo.join('/'))).toEqual([
      `projects/E--progetti-esempio/${S1}.jsonl`,
      `projects/E--progetti-esempio/${S1}`,
      `file-history/${S1}`,
      `session-env/${S1}`,
      `tasks/${S1}`,
      `debug/${S1}.txt`
    ])
    for (const p of parti) expect(p.relativo[p.relativo.length - 1]).toContain(S1)
  })

  it('niente con un id o uno slug che escono dalla cartella', () => {
    expect(partiDiSessione('..', S1)).toEqual([])
    expect(partiDiSessione('a/b', S1)).toEqual([])
    expect(partiDiSessione('progetto', '../../AppData')).toEqual([])
    expect(partiDiSessione('progetto', '')).toEqual([])
    expect(sessioneValida('11111111-1111-4111-8111-11111111111')).toBe(false)
    expect(slugValido('C--Users-esempio')).toBe(true)
    expect(slugValido('.')).toBe(false)
  })

  it('le liste di cose da fare: solo quelle della sessione', () => {
    expect(eFileTodoDi(`${S1}-agent-${S1}.json`, S1)).toBe(true)
    expect(eFileTodoDi(`${S1}.json`, S1)).toBe(true)
    expect(eFileTodoDi(`${S2}-agent-${S1}.json`, S1)).toBe(false)
    expect(eFileTodoDi(`${S1}-agent-x.txt`, S1)).toBe(false)
    expect(eFileTodoDi('todo.json', S1)).toBe(false)
  })
})

describe('chi non si tocca, e perché', () => {
  it('elimina: si rifiuta per chi lavora, chiede, è aperta, governata attiva, di un altro PC, col PIN, senza file qui', () => {
    expect(motivoNonElimina({ sessione: S1, titolo: 'Bozza' })).toBeUndefined()
    expect(motivoNonElimina({ sessione: S1, titolo: 'Bozza', aperta: { lavora: true, chiede: false } })).toMatch(/sta lavorando/)
    expect(motivoNonElimina({ sessione: S1, titolo: 'Bozza', aperta: { lavora: false, chiede: true } })).toMatch(/aspetta una tua risposta/)
    expect(motivoNonElimina({ sessione: S1, titolo: 'Bozza', aperta: { lavora: false, chiede: false } })).toMatch(/aperta e ti aspetta/)
    expect(motivoNonElimina({ sessione: S1, aperta: { lavora: false, chiede: false, sottofondo: 'telefono' } })).toMatch(/in sottofondo per telefono/)
    expect(motivoNonElimina({ sessione: S1, governata: { autopilota: 'Notte', attivo: true } })).toMatch(/autopilota «Notte»/)
    expect(motivoNonElimina({ sessione: S1, governata: { autopilota: 'Notte', attivo: false } })).toBeUndefined()
    expect(motivoNonElimina({ sessione: S1, altroPc: 'PC-ESEMPIO' })).toMatch(/vive su «PC-ESEMPIO»/)
    expect(motivoNonElimina({ sessione: S1, pinChiusa: true })).toMatch(/PIN/)
    expect(motivoNonElimina({ sessione: S1, nonQui: true })).toMatch(/non ha file/)
  })

  it('il motivo dice di quale chat parla', () => {
    expect(motivoNonElimina({ sessione: S1, titolo: 'Il lettore di CSV', aperta: { lavora: true, chiede: false } })).toBe('«Il lettore di CSV» sta lavorando: aspetta che finisca, poi chiudila.')
    expect(motivoNonElimina({ sessione: S1, aperta: { lavora: true, chiede: false } })).toMatch(/^Questa chat/)
  })

  it('un altro PC vince su tutto: si elimina da lì', () => {
    expect(motivoNonElimina({ sessione: S1, altroPc: 'PC-ESEMPIO', aperta: { lavora: true, chiede: false } })).toMatch(/vive su/)
  })

  it('archivia: una chat aperta e ferma si archivia (si chiude prima), una che lavora o chiede no', () => {
    expect(motivoNonArchivia({ sessione: S1, aperta: { lavora: false, chiede: false } })).toBeUndefined()
    expect(motivoNonArchivia({ sessione: S1, aperta: { lavora: true, chiede: false } })).toMatch(/sta lavorando/)
    expect(motivoNonArchivia({ sessione: S1, aperta: { lavora: false, chiede: true } })).toMatch(/risposta/)
    expect(motivoNonArchivia({ sessione: S1, governata: { autopilota: 'Notte', attivo: true } })).toMatch(/autopilota/)
    expect(motivoNonArchivia({ sessione: S1, altroPc: 'PC-ESEMPIO' })).toMatch(/si archivia da lì/)
  })

  it('chiudi: una chat chiusa è già chiusa, una governata attiva no', () => {
    expect(motivoNonChiude({ sessione: S1 })).toMatch(/già chiusa/)
    expect(motivoNonChiude({ sessione: S1, aperta: { lavora: true, chiede: false } })).toBeUndefined()
    expect(motivoNonChiude({ sessione: S1, aperta: { lavora: false, chiede: false }, governata: { autopilota: 'Notte', attivo: true } })).toMatch(/autopilota/)
  })
})

describe('lo stato di una chat dai pezzi', () => {
  const ap = (o: Partial<AutopilotaPerChat>): AutopilotaPerChat => ({ id: 'ap-1', nome: 'Notte', stato: 'lavoro', chats: [], ...o })

  it('governata: la chat principale, una della flotta, il supervisore; conta quello attivo', () => {
    expect(governataDa([ap({ sessionId: S1 })], S1)).toEqual({ autopilota: 'Notte', attivo: true })
    expect(governataDa([ap({ chats: [{ sessionId: S1 }] })], S1)).toEqual({ autopilota: 'Notte', attivo: true })
    expect(governataDa([ap({ chats: [{ sessioneSupervisore: S1 }] })], S1)?.attivo).toBe(true)
    expect(governataDa([ap({ sessionId: S1, stato: 'sospeso' })], S1)).toEqual({ autopilota: 'Notte', attivo: false })
    expect(governataDa([ap({ sessionId: S1, stato: 'finito' })], S1)?.attivo).toBe(false)
    expect(governataDa([ap({ sessionId: S1, archiviato: true })], S1)?.attivo).toBe(false)
    expect(governataDa([ap({ sessionId: S1, stato: 'finito' }), ap({ id: 'ap-2', nome: 'Giorno', chats: [{ sessionId: S1 }] })], S1)).toEqual({ autopilota: 'Giorno', attivo: true })
    expect(governataDa([ap({ sessionId: S2 })], S1)).toBeUndefined()
  })

  it('aperta: lavora, chiede, aspetta, in sottofondo', () => {
    const base = { sessione: S1, autopiloti: [], io: 'pc-qui' }
    expect(statoPerAzione({ ...base, aperte: [{ sessione: S1, viva: true }] }).aperta).toEqual({ lavora: true, chiede: false })
    expect(statoPerAzione({ ...base, aperte: [{ sessione: S1, viva: true, aspetta: true }] }).aperta).toEqual({ lavora: false, chiede: false })
    expect(statoPerAzione({ ...base, aperte: [{ sessione: S1, viva: true, chiedeSegnale: true }] }).aperta).toEqual({ lavora: false, chiede: true })
    expect(statoPerAzione({ ...base, aperte: [{ sessione: S1, viva: true, sceltaAperta: true }] }).aperta?.chiede).toBe(true)
    expect(statoPerAzione({ ...base, aperte: [{ sessione: S1, viva: false }] }).aperta).toEqual({ lavora: false, chiede: false })
    expect(statoPerAzione({ ...base, aperte: [{ sessione: S1, aspetta: true, sottofondo: { nome: 'telefono' } }] }).aperta?.sottofondo).toBe('telefono')
    expect(statoPerAzione({ ...base, aperte: [{ sessione: S2, viva: true }] }).aperta).toBeUndefined()
  })

  it('di un altro PC: la casa memorizzata altrove, o il progetto là', () => {
    const base = { sessione: S1, autopiloti: [], aperte: [], io: 'pc-qui' }
    expect(statoPerAzione({ ...base, casa: { pc: 'pc-la', pcNome: 'PORTATILE-ESEMPIO' } }).altroPc).toBe('PORTATILE-ESEMPIO')
    expect(statoPerAzione({ ...base, casa: { pc: 'pc-qui', pcNome: 'QUI' } }).altroPc).toBeUndefined()
    expect(statoPerAzione({ ...base, progettoAltrove: 'PC-ESEMPIO' }).altroPc).toBe('PC-ESEMPIO')
  })
})

describe('le archiviate', () => {
  it('si leggono tollerando le voci rotte, senza doppioni', () => {
    const l = leggiArchiviate({ archiviate: [{ sessione: S1, il: '2026-10-17T10:00:00Z' }, { sessione: S1, il: '2026-10-17T11:00:00Z' }, { sessione: 'x', il: 'y' }, null, { sessione: S2, il: 'non una data' }] })
    expect(l.map((x) => x.sessione)).toEqual([S1])
    expect(leggiArchiviate('rotto')).toEqual([])
  })

  it('archiviare due volte non duplica; ripristinare toglie', () => {
    let l = conArchiviata([], { sessione: S1, il: '2026-10-17T10:00:00Z' })
    l = conArchiviata(l, { sessione: S1, il: '2026-10-17T11:00:00Z' })
    l = conArchiviata(l, { sessione: S2, il: '2026-10-17T11:00:00Z' })
    expect(l.map((x) => x.sessione)).toEqual([S2, S1])
    expect(senzaArchiviate(l, [S2]).map((x) => x.sessione)).toEqual([S1])
    expect(conArchiviata(l, { sessione: 'non-valida', il: '2026-10-17T11:00:00Z' })).toHaveLength(2)
  })

  it('gli elenchi le nascondono, lo stesso filtro ovunque', () => {
    const voci = [{ id: S1 }, { id: S2 }, { id: undefined }]
    expect(nascondiArchiviate(voci, [{ sessione: S1, il: '2026-10-17T10:00:00Z' }], (v) => v.id)).toEqual([{ id: S2 }, { id: undefined }])
    expect(nascondiArchiviate(voci, [], (v) => v.id)).toHaveLength(3)
  })
})

describe('il recupero delle chat eliminate', () => {
  const voce = (o: Partial<ChatInRecupero>): ChatInRecupero => ({
    id: 'r-1', sessione: S1, titolo: 'Bozza', slug: 'progetto', quando: '2026-10-01T10:00:00.000Z', scadeIl: scadenzaRecupero('2026-10-01T10:00:00.000Z'),
    byte: 100, file: [], ...o
  })

  it('30 giorni, poi scade; le rimesse e le svuotate non scadono più', () => {
    expect(scadenzaRecupero('2026-10-01T10:00:00.000Z')).toBe('2026-10-31T10:00:00.000Z')
    const r = { versione: 1 as const, chat: [voce({}), voce({ id: 'r-2', ripristinataIl: '2026-10-02T00:00:00Z' }), voce({ id: 'r-3', svuotataIl: '2026-10-02T00:00:00Z' })] }
    expect(scaduteRecupero(r, Date.parse('2026-10-30T10:00:00Z'))).toEqual([])
    expect(scaduteRecupero(r, Date.parse('2026-10-31T10:00:00Z')).map((c) => c.id)).toEqual(['r-1'])
    expect(r.chat.filter(nelRecupero).map((c) => c.id)).toEqual(['r-1'])
  })

  it('il registro si legge tollerante e tiene le svuotate (l’arrivo dal Drive le deve sapere)', () => {
    expect(leggiRecuperoChat({ chat: [voce({}), { id: 'x' }, null] }).chat).toHaveLength(1)
    expect(leggiRecuperoChat(undefined).chat).toEqual([])
    const r = { versione: 1 as const, chat: [voce({ id: 'a', svuotataIl: '2026-01-01T00:00:00Z' }), voce({ id: 'b', ripristinataIl: '2026-01-01T00:00:00Z' }), voce({ id: 'c', ripristinataIl: '2026-10-10T00:00:00Z' })] }
    expect(potaRecupero(r, Date.parse('2026-10-17T00:00:00Z')).chat.map((c) => c.id)).toEqual(['a', 'c'])
  })
})

describe('«Svuota il recupero adesso»: la conferma forte', () => {
  const voci: ChatInRecupero[] = [
    { id: 'r-1', sessione: S1, titolo: 'A', slug: 'p', quando: '2026-10-01T00:00:00Z', scadeIl: '2026-10-31T00:00:00Z', byte: 1, file: [] },
    { id: 'r-2', sessione: S2, titolo: 'B', slug: 'p', quando: '2026-10-01T00:00:00Z', scadeIl: '2026-10-31T00:00:00Z', byte: 1, file: [] }
  ]
  const impronta = improntaSvuota(voci, false)
  const dato = { gettone: 'abc', impronta, scadeIl: 1000 + GETTONE_SVUOTA_MS }

  it('vale il gettone giusto, entro due minuti, con la parola scritta', () => {
    expect(controllaGettone(dato, { gettone: 'abc', frase: FRASE_SVUOTA, impronta, adesso: 1000 })).toEqual({ ok: true })
    expect(controllaGettone(dato, { gettone: 'abc', frase: ' svuota ', impronta, adesso: 1000 })).toEqual({ ok: true })
  })

  it('no senza richiesta, con un gettone sbagliato, scaduto, senza la parola', () => {
    expect(controllaGettone(undefined, { gettone: 'abc', frase: FRASE_SVUOTA, impronta, adesso: 1000 }).ok).toBe(false)
    expect(controllaGettone(dato, { gettone: 'xyz', frase: FRASE_SVUOTA, impronta, adesso: 1000 }).ok).toBe(false)
    expect(controllaGettone(dato, { gettone: 'abc', frase: FRASE_SVUOTA, impronta, adesso: 1001 + GETTONE_SVUOTA_MS })).toEqual({ ok: false, motivo: expect.stringMatching(/scaduta/) })
    expect(controllaGettone(dato, { gettone: 'abc', frase: 'sì', impronta, adesso: 1000 })).toEqual({ ok: false, motivo: expect.stringMatching(/SVUOTA/) })
    expect(controllaGettone(dato, { gettone: 'abc', frase: undefined, impronta, adesso: 1000 }).ok).toBe(false)
  })

  it('no se il recupero è cambiato o se cambia «anche dal Drive»', () => {
    expect(controllaGettone(dato, { gettone: 'abc', frase: FRASE_SVUOTA, impronta: improntaSvuota(voci.slice(0, 1), false), adesso: 1000 })).toEqual({ ok: false, motivo: expect.stringMatching(/cambiato/) })
    expect(controllaGettone(dato, { gettone: 'abc', frase: FRASE_SVUOTA, impronta: improntaSvuota(voci, true), adesso: 1000 }).ok).toBe(false)
  })

  it('l’impronta non dipende dall’ordine e ignora le già rimesse', () => {
    expect(improntaSvuota([...voci].reverse(), false)).toBe(impronta)
    expect(improntaSvuota([...voci, { ...voci[0]!, id: 'r-3', ripristinataIl: '2026-10-02T00:00:00Z' }], false)).toBe(impronta)
  })
})

describe('lo spazio delle chat', () => {
  const v = (sessione: string, byte: number, o: Partial<VoceSpazio> = {}): VoceSpazio => ({ sessione, titolo: sessione.slice(0, 1), slug: 'p', byte, parti: {}, archiviata: false, aperta: false, ...o })

  it('dalla più grande; il totale e quanto si può liberare', () => {
    const vista = vistaSpazio([v(S1, 10), v(S2, 300, { nonEliminabile: 'sta lavorando' }), v(S3, 50)], { versione: 1, chat: [] })
    expect(vista.chat.map((c) => c.sessione)).toEqual([S2, S3, S1])
    expect(vista.totale).toBe(360)
    expect(vista.eliminabili).toBe(60)
    expect(vista.recupero).toEqual({ chat: 0, byte: 0 })
  })

  it('a parità di spazio, prima la meno recente', () => {
    expect(ordinaPerSpazio([v(S1, 5, { ultimaAttivita: '2026-10-10' }), v(S2, 5, { ultimaAttivita: '2026-09-01' })]).map((c) => c.sessione)).toEqual([S2, S1])
  })

  it('più chat insieme: lo spazio totale, e quelle escluse col motivo', () => {
    const voci = [v(S1, 10), v(S2, 300, { nonEliminabile: 'sta lavorando' }), v(S3, 50)]
    expect(totaleSelezione(voci, [S1, S2, 'sconosciuta'])).toEqual({ chat: 2, byte: 310, eliminabili: 1, byteEliminabili: 10, escluse: [{ sessione: S2, motivo: 'sta lavorando' }] })
    expect(totaleSelezione(voci, []).chat).toBe(0)
  })
})

describe('i testi', () => {
  it('tre azioni, ognuna con un testo corto e il suo «?»', () => {
    for (const k of ['chiudi', 'archivia', 'elimina'] as const) {
      expect(TESTI_AZIONI_CHAT[k].breve.length).toBeLessThanOrEqual(45)
      expect(TESTI_AZIONI_CHAT[k].spiega.length).toBeGreaterThan(TESTI_AZIONI_CHAT[k].breve.length)
    }
    expect(TESTI_AZIONI_CHAT.elimina.etichetta).toBe('Elimina dal PC')
  })

  it('l’esito dice quante e quanto spazio, e che il recupero c’è', () => {
    expect(messaggioEsito('elimina', 2, 1, 2048, byteLeggibili)).toBe('2 chat eliminate dal PC: 2,0 KB tolti dalle chat. Per 30 giorni restano nel recupero; il disco si libera quando si svuota. 1 chat no: guarda il motivo.')
    expect(messaggioEsito('archivia', 1, 0, undefined, byteLeggibili)).toMatch(/Archiviate/)
    expect(messaggioEsito('elimina', 0, 3, 0, byteLeggibili)).toMatch(/^Niente fatto/)
    expect(messaggioEsito('chiudi', 0, 0, undefined, byteLeggibili)).toBe('Niente da fare.')
  })
})
