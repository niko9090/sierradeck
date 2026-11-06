import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaAutoriparazione, type DipendenzeAutoriparazione } from '../../src/main/autoriparazione'
import { creaMigrazione } from '../../src/main/migrazione-elenco'
import { creaMigrazioneAdozione, type ServizioAdozione } from '../../src/main/adozione-chat'
import { conChatAdottate } from '@shared/adozione'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { parseArchivio, type Archivio } from '@shared/workspace'
import { CARTELLA_COPIE_RIPARAZIONE, FILE_AUTORIPARAZIONE, leggiStatoRiparazione, riassuntoRiparazione, type VoceRiparazione } from '@shared/autoriparazione'
import { FILE_MIGRAZIONE } from '@shared/migrazione-elenco'
import { FILE_ADOZIONE } from '@shared/migrazione-adozione'

/**
 * k-59: l'autoriparazione dalla parte del programma. Le migrazioni sono quelle
 * vere (`creaMigrazione`, `creaMigrazioneAdozione`) su una cartella dei dati
 * temporanea; il servizio è finto. Un caso per volta: la trasformazione e
 * l'adozione mai fatte, a metà o fallite, i workspace nati dopo, le chat
 * rimandate, le segnalazioni, l'idempotenza e «Torna come prima».
 */

const pane = (id: string, p: Record<string, unknown> = {}) => ({ id, sessionUuid: `s-${id}`, cwd: 'prova/p', title: `chat ${id}`, ...p })
const ws = (nome: string, panes: ReturnType<typeof pane>[]) => ({
  nome,
  perSlot: {
    1: {
      root: panes.length === 1
        ? { type: 'pane', id: panes[0]!.id }
        : { type: 'split', id: `x-${nome}`, direction: 'horizontal', children: panes.map((p) => ({ type: 'pane', id: p.id })), sizes: panes.map(() => 1 / panes.length) },
      panes
    }
  }
})
let archivioGrezzo: { versione: number; attivo: string; workspace: ReturnType<typeof ws>[] }

let dati = ''
let elenco: string[]
let righe: string[]
let notifiche: Array<[string, string]>
let autopiloti: Autopilota[]
let servizioSu: boolean
let chiamateRipara: number
let rispostaServizio: { voci: VoceRiparazione[]; copiato: boolean }
let annullate: string[]
let adesso: Date
let pcNoti: string[] | undefined

const archivio = (): Archivio => parseArchivio(JSON.parse(JSON.stringify(archivioGrezzo))).archivio

const servizioAdozione = (): ServizioAdozione => ({
  elenca: async () => autopiloti,
  adotta: async (id, chat) => {
    const i = autopiloti.findIndex((a) => a.id === id)
    const r = conChatAdottate(autopiloti[i]!, chat, 'q')
    autopiloti[i] = r.autopilota
    return r.nuove.map((x) => x.sessionId)
  },
  togli: async (id, sessioni) => {
    const i = autopiloti.findIndex((a) => a.id === id)
    autopiloti[i] = { ...autopiloti[i]!, adottate: (autopiloti[i]!.adottate ?? []).filter((x) => !sessioni.includes(x.sessionId)) }
  }
})

function crea(over: Partial<DipendenzeAutoriparazione> = {}) {
  const migrazione = creaMigrazione({
    dati, leggiArchivio: archivio, leggiElenco: () => elenco, scriviElenco: (l) => { elenco = l },
    log: (r) => { righe.push(r) }, adesso: () => adesso
  })
  const adozione = creaMigrazioneAdozione({
    dati, leggiArchivio: archivio, statoMigrazione: () => migrazione.stato(), servizio: servizioAdozione(),
    log: (r) => { righe.push(r) }, adesso: () => adesso
  })
  const a = creaAutoriparazione({
    dati,
    leggiArchivio: archivio,
    elenco: { leggi: () => elenco, scrivi: (l) => { elenco = l } },
    migrazione, adozione,
    servizio: {
      pronto: async () => servizioSu,
      ripara: async () => { chiamateRipara++; return rispostaServizio },
      annulla: async (id) => { annullate.push(id); return { ripristinati: ['S'], rimandati: [], errori: [] } }
    },
    cartellaEsiste: () => true,
    pcNoti: () => pcNoti,
    log: (r) => { righe.push(r) },
    notifica: (t, x) => { notifiche.push([t, x]) },
    adesso: () => adesso,
    ...over
  })
  return { a, migrazione, adozione }
}

const sistemati = (v: VoceRiparazione[]) => v.filter((x) => x.esito === 'sistemato')
const copie = (): string[] => (existsSync(join(dati, CARTELLA_COPIE_RIPARAZIONE)) ? readdirSync(join(dati, CARTELLA_COPIE_RIPARAZIONE)) : [])
const tempo = (): void => { adesso = new Date(adesso.getTime() + 60_000) }

beforeEach(() => {
  dati = mkdtempSync(join(tmpdir(), 'ripara-main-'))
  archivioGrezzo = { versione: 1, attivo: 'S', workspace: [ws('S', [pane('a'), pane('b')])] }
  elenco = []; righe = []; notifiche = []; servizioSu = true; chiamateRipara = 0; annullate = []; pcNoti = undefined
  adesso = new Date('2026-11-06T10:00:00Z')
  rispostaServizio = { voci: [], copiato: false }
  autopiloti = [{ ...nuovoAutopilota({ id: 'ap-1', nome: 'Autopilota S', obiettivo: 'x', cwd: 'prova/p', iniziatoIl: '2026-11-01T08:00:00.000Z', workspace: 'S' }), stato: 'lavoro' }]
})
afterEach(() => { rmSync(dati, { recursive: true, force: true }) })

describe('trasformazione in elenco mai finita', () => {
  it('mai fatta: la fa, con la copia e la notifica; il rapporto dice quanti workspace', async () => {
    const { a } = crea()
    const r = (await a.ripara('avvio'))!
    expect(sistemati(r.voci).find((v) => v.caso === 'trasformazione-mancante')).toBeTruthy()
    expect(elenco).toEqual(['S'])
    expect(copie()).toHaveLength(1)
    expect(existsSync(join(dati, CARTELLA_COPIE_RIPARAZIONE, copie()[0]!, 'principale'))).toBe(true)
    expect(notifiche).toHaveLength(1)
    expect(notifiche[0]![1]).toMatch(/^Ho sistemato/)
    expect(righe.some((x) => x.startsWith('[autoriparazione]') && x.includes('trasformazione'))).toBe(true)
  })

  it('fallita: la rifà', async () => {
    writeFileSync(join(dati, FILE_MIGRAZIONE), JSON.stringify({ versione: 1, stato: 'fallita', iniziata: 'x', prima: { workspaceElenco: [] }, aggiunti: [], dormienti: [], motivo: 'guasto' }))
    const { a, migrazione } = crea()
    const r = (await a.ripara('avvio'))!
    expect(sistemati(r.voci)[0]).toMatchObject({ caso: 'trasformazione-mancante' })
    expect(r.voci[0]!.cosa).toContain('fallita')
    expect(migrazione.stato()!.stato).toBe('fatta')
  })

  it('rimasta a metà (in-corso): la rimette a posto e la rifà', async () => {
    writeFileSync(join(dati, FILE_MIGRAZIONE), JSON.stringify({ versione: 1, stato: 'in-corso', iniziata: 'x', prima: { workspaceElenco: [] }, aggiunti: [], dormienti: [] }))
    const { a, migrazione } = crea()
    await a.ripara('avvio')
    expect(migrazione.stato()!.stato).toBe('fatta')
    expect(elenco).toEqual(['S'])
  })

  it('annullata da Nicholas: non si tocca', async () => {
    writeFileSync(join(dati, FILE_MIGRAZIONE), JSON.stringify({ versione: 1, stato: 'annullata', iniziata: 'x', prima: { workspaceElenco: [] }, aggiunti: [], dormienti: [] }))
    const { a, migrazione } = crea()
    const r = (await a.ripara('avvio'))!
    expect(sistemati(r.voci)).toEqual([])
    expect(migrazione.stato()!.stato).toBe('annullata')
    expect(elenco).toEqual([])
    expect(copie()).toEqual([])
  })

  it('un guasto della trasformazione è una voce «fallito» e non butta giù il resto', async () => {
    const fallita = { versione: 1 as const, stato: 'fallita' as const, iniziata: 'x', prima: { workspaceElenco: [] }, aggiunti: [], dormienti: [], motivo: 'archivio illeggibile' }
    const { a } = crea({ migrazione: { stato: () => undefined, rifai: () => ({ esito: 'fallita' as const, stato: fallita }) } })
    const r = (await a.ripara('avvio'))!
    expect(r.voci.find((v) => v.caso === 'trasformazione-mancante')).toMatchObject({ esito: 'fallito' })
    expect(r.voci[0]!.cosa).toContain('archivio illeggibile')
    expect(notifiche).toEqual([])
  })
})

describe('workspace nati dopo la trasformazione', () => {
  const dopoTrasformazione = async () => {
    const x = crea()
    x.migrazione.rifai()
    await x.adozione.rifai()
    tempo()
    return x
  }

  it('entrano nella vista a elenco; quelli che Nicholas ha spento a mano restano spenti', async () => {
    const { a } = await dopoTrasformazione()
    elenco = [] // Nicholas ha spento «S» a mano
    archivioGrezzo.workspace.push(ws('Nuovo', [pane('n')]))
    const r = (await a.ripara('tasto'))!
    expect(sistemati(r.voci)).toEqual([expect.objectContaining({ caso: 'workspace-fuori-elenco', workspace: 'Nuovo' })])
    expect(elenco).toEqual(['Nuovo'])
    expect(riassuntoRiparazione(r)).toBe('Ho sistemato 1 workspace: Nuovo.')
  })

  it('è idempotente, e se poi lo spegne a mano non lo riaccende', async () => {
    const { a } = await dopoTrasformazione()
    archivioGrezzo.workspace.push(ws('Nuovo', [pane('n')]))
    await a.ripara('avvio')
    const copieDopo = copie()
    tempo()
    const seconda = (await a.ripara('avvio'))!
    expect(sistemati(seconda.voci)).toEqual([])
    expect(copie()).toEqual(copieDopo)
    expect(notifiche).toHaveLength(1)
    elenco = elenco.filter((x) => x !== 'Nuovo')
    tempo()
    expect(sistemati((await a.ripara('avvio'))!.voci)).toEqual([])
    expect(elenco).not.toContain('Nuovo')
  })
})

describe('adozione delle chat già avviate', () => {
  const trasformata = () => {
    const x = crea()
    x.migrazione.rifai()
    tempo()
    return x
  }

  it('mai fatta: la fa con la copia; le chat del workspace sono adottate', async () => {
    const { a } = trasformata()
    const r = (await a.ripara('avvio'))!
    expect(sistemati(r.voci).find((v) => v.caso === 'adozione-mancante')).toBeTruthy()
    expect(autopiloti[0]!.adottate?.map((x) => x.sessionId)).toEqual(['s-a', 's-b'])
    expect(copie()).toHaveLength(1)
  })

  it('fallita o a metà: la rifà', async () => {
    const x = trasformata()
    for (const stato of ['fallita', 'in-corso']) {
      autopiloti[0] = { ...autopiloti[0]!, adottate: [] }
      writeFileSync(join(dati, FILE_ADOZIONE), JSON.stringify({ versione: 1, stato, iniziata: 'x', dormientiArchiviati: [], adozioni: [], ...(stato === 'fallita' ? { motivo: 'guasto' } : {}) }))
      tempo()
      const r = (await x.a.ripara('tasto'))!
      expect(sistemati(r.voci).find((v) => v.caso === 'adozione-mancante'), stato).toBeTruthy()
      expect(x.adozione.stato()!.stato).toBe('fatta')
    }
  })

  it('è idempotente: la seconda volta non adotta niente e non fa copie', async () => {
    const { a } = trasformata()
    await a.ripara('avvio')
    const copieDopo = copie()
    const adottate = JSON.stringify(autopiloti[0]!.adottate)
    tempo()
    const seconda = (await a.ripara('avvio'))!
    expect(sistemati(seconda.voci)).toEqual([])
    expect(copie()).toEqual(copieDopo)
    expect(JSON.stringify(autopiloti[0]!.adottate)).toBe(adottate)
  })

  it('con il servizio spento aspetta (rimandato), non scrive niente e si riprova', async () => {
    const { a, adozione } = trasformata()
    servizioSu = false
    const r = (await a.ripara('avvio'))!
    expect(r.voci).toEqual([expect.objectContaining({ caso: 'adozione-mancante', esito: 'rimandato' })])
    expect(adozione.stato()).toBeUndefined()
    expect(autopiloti[0]!.adottate).toBeUndefined()
    expect(a.daRiprovare()).toBe(true)
    servizioSu = true
    tempo()
    await a.ripara('turno-finito')
    expect(a.daRiprovare()).toBe(false)
    expect(adozione.stato()!.stato).toBe('fatta')
  })

  it('annullata da Nicholas («Torna come prima» dell’adozione): non si rifà', async () => {
    const { a, adozione } = trasformata()
    writeFileSync(join(dati, FILE_ADOZIONE), JSON.stringify({ versione: 1, stato: 'annullata', iniziata: 'x', dormientiArchiviati: [], adozioni: [] }))
    const r = (await a.ripara('avvio'))!
    expect(sistemati(r.voci)).toEqual([])
    expect(adozione.stato()!.stato).toBe('annullata')
  })
})

describe('il servizio: chat al lavoro e solo mia', () => {
  it('le voci del servizio entrano nel rapporto; una chat al lavoro resta intatta e si riprova', async () => {
    rispostaServizio = {
      copiato: true,
      voci: [
        { caso: 'autopiloti-di-prima', workspace: 'S', esito: 'sistemato', cosa: '«S»: un autopilota di prima passato' },
        { caso: 'autopiloti-di-prima', workspace: 'T', esito: 'rimandato', cosa: '«T»: ha una chat al lavoro' },
        { caso: 'chat-solo-mia', workspace: 'S', esito: 'segnalato', cosa: '«S»: una chat «solo mia» lasciata com’è' }
      ]
    }
    const { a } = crea()
    const r = (await a.ripara('avvio'))!
    expect(r.conCopia).toBe(true)
    expect(a.stato().annullo?.servizio).toBe(true)
    expect(riassuntoRiparazione(r)).toContain('Ho sistemato 1 workspace: S')
    expect(riassuntoRiparazione(r)).toContain('Una cosa aspetta')
    expect(a.daRiprovare()).toBe(true)
    // le «solo mia» e le chat al lavoro non sono toccate qui: il programma non chiama né togli né adotta sulle loro sessioni
    expect(autopiloti[0]!.adottate?.some((x) => x.soloMia === true) ?? false).toBe(false)
    rispostaServizio = { voci: [], copiato: false }
    tempo()
    await a.ripara('turno-finito')
    expect(a.daRiprovare()).toBe(false)
  })

  it('un servizio che non risponde non ferma la riparazione: il resto si fa e la parte sua aspetta', async () => {
    const x = crea({ servizio: { pronto: async () => true, ripara: async () => { throw new Error('timeout') }, annulla: async () => ({ ripristinati: [], rimandati: [], errori: [] }) } })
    const r = (await x.a.ripara('avvio'))!
    expect(r.voci.some((v) => v.esito === 'rimandato')).toBe(true)
    expect(elenco).toEqual(['S'])
  })

  it('due richieste insieme: una sola riparazione, la stessa risposta', async () => {
    const { a } = crea()
    const [x, y] = await Promise.all([a.ripara('avvio'), a.ripara('tasto')])
    expect(x).toBe(y)
    expect(chiamateRipara).toBe(1)
  })
})

describe('case sparite e chat senza casa: solo segnalate', () => {
  it('un riquadro di un PC che non risulta più si segnala; con i PC ancora ignoti non si giudica', async () => {
    archivioGrezzo.workspace = [ws('S', [pane('a'), pane('b'), pane('r', { remoto: { pcId: 'pc-sparito', pcNome: 'Altro', cwd: 'x', sessione: 's' } })])]
    const x = crea()
    x.migrazione.rifai()
    tempo()
    expect((await x.a.ripara('tasto'))!.voci.some((v) => v.caso === 'casa-sparita')).toBe(false)
    pcNoti = ['questo', 'pc-altro']
    tempo()
    const r = (await x.a.ripara('tasto'))!
    expect(r.voci.find((v) => v.caso === 'casa-sparita')).toMatchObject({ esito: 'segnalato', workspace: 'S' })
    expect(archivio().workspace[0]!.perSlot[1]!.panes).toHaveLength(3)
  })

  it('un riquadro locale con la cartella sparita e nessun PC che la tenga è «senza casa»; se un PC la tiene no', async () => {
    const x = crea({ cartellaEsiste: () => false })
    x.migrazione.rifai()
    tempo()
    expect((await x.a.ripara('tasto'))!.voci.filter((v) => v.caso === 'senza-casa')).toHaveLength(1)
    const y = crea({ cartellaEsiste: () => false, casaDi: () => ({ id: 'pc-altro', nome: 'Altro' }) })
    tempo()
    expect((await y.a.ripara('tasto'))!.voci.filter((v) => v.caso === 'senza-casa')).toHaveLength(0)
  })

  it('le segnalazioni non sono un cambiamento: niente notifica, niente copia', async () => {
    const x = crea({ cartellaEsiste: () => false })
    x.migrazione.rifai()
    await x.adozione.rifai()
    tempo()
    await x.a.ripara('avvio')
    expect(notifiche).toEqual([])
    expect(copie()).toEqual([])
  })
})

describe('«Torna come prima»', () => {
  it('rimette la vista e i file di stato com’erano, chiama il servizio, e da solo non ripara più finché non si preme «Ripara»', async () => {
    elenco = ['Già a elenco']
    rispostaServizio = { voci: [{ caso: 'autopiloti-di-prima', workspace: 'S', esito: 'sistemato', cosa: 'passato' }], copiato: true }
    const { a } = crea()
    const r = (await a.ripara('avvio'))!
    expect(elenco).toContain('S')
    expect(existsSync(join(dati, FILE_MIGRAZIONE))).toBe(true)
    const e = await a.tornaComePrima()
    expect(e.ok).toBe(true)
    expect(annullate).toEqual([r.id])
    expect(elenco).toEqual(['Già a elenco'])
    expect(existsSync(join(dati, FILE_MIGRAZIONE))).toBe(false)
    expect(existsSync(join(dati, FILE_ADOZIONE))).toBe(false)
    // i file messi da parte restano sul disco: niente si perde
    expect(readdirSync(dati).some((n) => n.startsWith(`${FILE_MIGRAZIONE}.dopo-annullo`))).toBe(true)
    expect(a.stato().sospesa).toBe(true)
    // l'avvio dopo non ripara da solo
    tempo()
    expect(await a.ripara('avvio')).toBeUndefined()
    expect(await a.ripara('turno-finito')).toBeUndefined()
    expect(elenco).toEqual(['Già a elenco'])
    expect(a.daRiprovare()).toBe(false)
    // il tasto sì
    tempo()
    expect(sistemati((await a.ripara('tasto'))!.voci).length).toBeGreaterThan(0)
    expect(a.stato().sospesa).toBeUndefined()
  })

  it('rimette i file di stato che c’erano (una trasformazione fallita torna fallita)', async () => {
    const fallita = JSON.stringify({ versione: 1, stato: 'fallita', iniziata: 'x', prima: { workspaceElenco: [] }, aggiunti: [], dormienti: [], motivo: 'guasto' })
    writeFileSync(join(dati, FILE_MIGRAZIONE), fallita)
    const { a, migrazione } = crea()
    await a.ripara('avvio')
    expect(migrazione.stato()!.stato).toBe('fatta')
    expect((await a.tornaComePrima()).ok).toBe(true)
    expect(JSON.parse(readFileSync(join(dati, FILE_MIGRAZIONE), 'utf8'))).toMatchObject({ stato: 'fallita' })
  })

  it('se il servizio ha chat al lavoro nei workspace da rimettere, non annulla e lo dice', async () => {
    rispostaServizio = { voci: [{ caso: 'autopiloti-di-prima', workspace: 'S', esito: 'sistemato', cosa: 'passato' }], copiato: true }
    const x = crea({ servizio: { pronto: async () => true, ripara: async () => rispostaServizio, annulla: async () => ({ ripristinati: [], rimandati: ['S'], errori: [] }) } })
    await x.a.ripara('avvio')
    const e = await x.a.tornaComePrima()
    expect(e.ok).toBe(false)
    expect(e.messaggio).toContain('chat al lavoro')
    expect(elenco).toEqual(['S'])
    expect(x.a.stato().annullo?.annullatoIl).toBeUndefined()
  })

  it('senza niente da annullare lo dice', async () => {
    expect((await crea().a.tornaComePrima()).ok).toBe(false)
  })
})

describe('stato su disco e copie', () => {
  it('lo stato si rilegge, anche se è sporco', async () => {
    const { a } = crea()
    await a.ripara('avvio')
    expect(leggiStatoRiparazione(JSON.parse(readFileSync(join(dati, FILE_AUTORIPARAZIONE), 'utf8'))).ultimoCambiamento).toBeTruthy()
    writeFileSync(join(dati, FILE_AUTORIPARAZIONE), '{ non json')
    expect(a.stato()).toEqual({ versione: 1 })
    expect(leggiStatoRiparazione({ ultimo: { id: 1 }, annullo: 'x' })).toEqual({ versione: 1 })
  })

  it('si tengono solo le copie più recenti', async () => {
    mkdirSync(join(dati, CARTELLA_COPIE_RIPARAZIONE), { recursive: true })
    for (let i = 1; i <= 6; i++) mkdirSync(join(dati, CARTELLA_COPIE_RIPARAZIONE, `2026010${i}-000000`))
    const { a } = crea()
    await a.ripara('avvio')
    const c = copie()
    expect(c).toHaveLength(5)
    expect(c).not.toContain('20260101-000000')
  })
})
