import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { archivioInMemoria } from '../../src/main/cassaforte/archivio'
import { salvaIncrementale, manifestoVuoto, leggiManifesto } from '../../src/main/cassaforte/incrementale'
import { firmaRadici, type Radice } from '../../src/main/cassaforte/raccolta'
import { pianifica, sceltePredefinite, fondiArchivi, fondiRegistri, eseguiFusione, registroConIlDrive } from '../../src/main/cassaforte/fusione'
import type { Archivio } from '@shared/workspace'

/**
 * Un PC con le sue chat, un Drive con altre: l'unione, scelta voce per voce.
 */
describe('la fusione', () => {
  const maestra = randomBytes(32)
  const chat = (id: string, sess: string, title: string) => ({ root: { type: 'pane' as const, id }, panes: [{ id, sessionUuid: sess, cwd: 'C:\\p', title }] })
  const archivioPc: Archivio = { versione: 1, attivo: 'lavoro', workspace: [
    { nome: 'lavoro', perSlot: { '1': chat('p1', 'u-pc', 'Chat del PC') } },
    { nome: 'solo-pc', perSlot: { '1': chat('p2', 'u-comune', 'In comune') } }
  ] }
  const archivioDrive: Archivio = { versione: 1, attivo: 'altro', workspace: [
    { nome: 'lavoro', perSlot: { '1': chat('d1', 'u-drive', 'Chat del Drive') } },
    { nome: 'altro', perSlot: { '1': chat('d2', 'u-comune', 'In comune (Drive)') } }
  ] }

  function cartella(): string { return mkdtempSync(join(tmpdir(), 'sd-fus-')) }
  function scrivi(dir: string, rel: string, testo: string): void {
    const p = join(dir, ...rel.split('/'))
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, testo)
  }

  it('il piano dice cosa c e di qua, di la, in comune e diverso, con etichette da persona', async () => {
    const archivio = archivioInMemoria()
    const drive = cartella()
    scrivi(drive, 'slug/u-drive.jsonl', '{"drive":1}')
    scrivi(drive, 'slug/u-comune.jsonl', '{"c":1}')
    const mD = await salvaIncrementale({ radici: [{ prefisso: 'chat', cartella: drive }], maestra, archivio, manifestoPrec: manifestoVuoto(), adesso: 'x' })
    const pc = cartella()
    scrivi(pc, 'slug/u-pc.jsonl', '{"pc":1}')
    scrivi(pc, 'slug/u-comune.jsonl', '{"c":1,"aggiunta":2}')
    const firma = await firmaRadici([{ prefisso: 'chat', cartella: pc }])
    const firmaPc = new Map([...firma].map(([k, v]) => [k, { size: v.size, mtime: v.mtime }]))
    const piano = pianifica({
      firmaPc, manifestoDrive: mD.manifesto, archivioPc, archivioDrive,
      registroPc: { versione: 1, progetti: [] }, registroDrive: { versione: 1, progetti: [] }, pcId: 'A', cassaforteDiversa: false
    })
    expect(piano.totali).toEqual({ soloPc: 1, soloDrive: 1, diverse: 1, uguali: 0 })
    const per = new Map(piano.chat.map((v) => [v.percorso, v]))
    expect(per.get('chat/slug/u-pc.jsonl')).toMatchObject({ dove: 'pc', etichetta: 'Chat del PC', predefinita: 'carica' })
    expect(per.get('chat/slug/u-drive.jsonl')).toMatchObject({ dove: 'drive', etichetta: 'Chat del Drive', predefinita: 'scarica' })
    // Diverse: vince la piu' lunga, che qui e' quella del PC.
    expect(per.get('chat/slug/u-comune.jsonl')).toMatchObject({ dove: 'entrambi', diverse: true, predefinita: 'carica', etichetta: 'In comune' })
    expect(piano.workspace.map((w) => [w.nome, w.dove])).toEqual([['lavoro', 'entrambi'], ['solo-pc', 'pc'], ['altro', 'drive']])
    // Con l'indice, la chat ha il suo nome vero, la cartella e la data.
    const conIndice = pianifica({
      firmaPc, manifestoDrive: mD.manifesto, archivioPc, archivioDrive,
      registroPc: { versione: 1, progetti: [] }, registroDrive: { versione: 1, progetti: [] }, pcId: 'A', cassaforteDiversa: false,
      titoliIndice: new Map([['u-drive', { titolo: 'Sistemare il lettore', cwd: 'E:\\Progetti\\SD', quando: '2026-09-01T10:00:00.000Z', messaggi: 12 }]])
    })
    const vd = conIndice.chat.find((v) => v.percorso === 'chat/slug/u-drive.jsonl')
    expect(vd).toMatchObject({ etichetta: 'Sistemare il lettore', cartella: 'E:\\Progetti\\SD', quando: '2026-09-01T10:00:00.000Z' })
    expect(vd?.sotto).toContain('12 messaggi')
    // Senza niente, non un codice: «Conversazione» con la cartella dal nome del file.
    const vp = conIndice.chat.find((v) => v.percorso === 'chat/slug/u-pc.jsonl')
    expect(vp?.etichetta).toBe('Chat del PC')
    expect(vp?.cartella).toBe('slug')
    const scelte = sceltePredefinite(piano)
    expect(scelte.voci).toEqual({ 'chat/slug/u-pc.jsonl': 'carica', 'chat/slug/u-drive.jsonl': 'scarica', 'chat/slug/u-comune.jsonl': 'carica' })
  })

  it('l unione dei workspace: per nome, chat per chat, senza doppioni, con l ordine e l attivo del PC', () => {
    const fuso = fondiArchivi(archivioPc, archivioDrive, 'unione') as Archivio
    expect(fuso.attivo).toBe('lavoro')
    expect(fuso.workspace.map((w) => w.nome)).toEqual(['lavoro', 'solo-pc', 'altro'])
    const lavoro = fuso.workspace[0]!.perSlot['1']!.panes.map((p) => p.sessionUuid)
    expect(lavoro).toEqual(['u-pc', 'u-drive'])
    // «u-comune» sta in solo-pc (del PC) e in altro (del Drive): una chat, un workspace. Vince il PC.
    const dove = fuso.workspace.filter((w) => Object.values(w.perSlot).some((l) => l.panes.some((p) => p.sessionUuid === 'u-comune'))).map((w) => w.nome)
    expect(dove).toEqual(['solo-pc'])
    // Escludere un workspace lo lascia com'e' qui.
    const senza = fondiArchivi(archivioPc, archivioDrive, 'unione', ['lavoro']) as Archivio
    expect(senza.workspace[0]!.perSlot['1']!.panes.map((p) => p.sessionUuid)).toEqual(['u-pc'])
    expect(fondiArchivi(archivioPc, archivioDrive, 'pc')).toBe(archivioPc)
    // «Tieni quelli del Drive» (0.65.1): vale per i workspace in comune; quelli solo di questo PC restano.
    const tieniDrive = fondiArchivi(archivioPc, archivioDrive, 'drive') as Archivio
    expect(tieniDrive.workspace.map((w) => w.nome)).toEqual([...archivioDrive.workspace.map((w) => w.nome), ...archivioPc.workspace.filter((w) => !archivioDrive.workspace.some((x) => x.nome === w.nome)).map((w) => w.nome)])
    expect(tieniDrive.workspace.some((w) => w.nome === 'solo-pc')).toBe(true)
    expect(fondiArchivi(undefined, archivioDrive, 'drive')).toBe(archivioDrive)
    // Per il Drive invece resta quello del Drive.
    expect(fondiArchivi(archivioPc, archivioDrive, 'drive', [], { perDrive: true })).toBe(archivioDrive)
    expect(fondiArchivi(undefined, archivioDrive, 'unione')).toBe(archivioDrive)
  })

  it('l unione dei registri: per id, con i percorsi di tutti i PC', () => {
    const a = { versione: 1 as const, progetti: [{ id: 'p1', nome: 'X', percorsi: { A: 'C:\\x' }, aggiuntoIl: '' }] }
    const b = { versione: 1 as const, progetti: [{ id: 'p1', nome: 'X', percorsi: { B: 'D:\\x' }, aggiuntoIl: '' }, { id: 'p2', nome: 'Y', percorsi: { B: 'D:\\y' }, aggiuntoIl: '' }] }
    const f = fondiRegistri(a, b)
    expect(f.progetti.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(f.progetti[0]!.percorsi).toEqual({ A: 'C:\\x', B: 'D:\\x' })
  })

  it('il pannello vede anche i progetti messi sul Drive da un altro PC, ma non quelli tolti (0.60.2)', () => {
    // Collaudo dell'11/10: il fisso mette un progetto sul Drive, il pannello del portatile non lo mostrava.
    const qui = { versione: 1 as const, progetti: [{ id: 'p1', nome: 'X', percorsi: { B: 'D:\\x' }, aggiuntoIl: '' }] }
    const drive = { versione: 1 as const, progetti: [
      { id: 'p1', nome: 'X', percorsi: { A: 'C:\\x' }, aggiuntoIl: '' },
      { id: 'p-nuovo', nome: 'Prova', percorsi: { A: 'C:\\prova' }, aggiuntoIl: '' },
      { id: 'p-tolto', nome: 'Tolto', percorsi: { A: 'C:\\tolto' }, aggiuntoIl: '' }
    ] }
    const conFile = (id: string): boolean => id !== 'p-tolto'
    const r = registroConIlDrive(qui, drive, conFile)
    expect(r.progetti.map((p) => p.id)).toEqual(['p1', 'p-nuovo'])
    // Quello noto prende anche i percorsi degli altri PC; quelli di qui vincono.
    expect(r.progetti[0]!.percorsi).toEqual({ A: 'C:\\x', B: 'D:\\x' })
    // Senza registro sul Drive resta quello di qui, tale e quale.
    expect(registroConIlDrive(qui, undefined, conFile)).toBe(qui)
  })

  it('esegue le scelte: carica, scarica, copia, e il resto del Drive resta com e', async () => {
    const archivio = archivioInMemoria()
    const drive = cartella()
    scrivi(drive, 'src/a.ts', 'A del Drive')
    scrivi(drive, 'src/solo-drive.ts', 'solo Drive')
    scrivi(drive, 'src/intatto.ts', 'intatto')
    const mD = await salvaIncrementale({ radici: [{ prefisso: 'progetto-p', cartella: drive }], maestra, archivio, manifestoPrec: manifestoVuoto(), adesso: 'x' })
    const pc = cartella()
    scrivi(pc, 'src/a.ts', 'A del PC')
    scrivi(pc, 'src/solo-pc.ts', 'solo PC')
    const radici: Radice[] = [{ prefisso: 'progetto-p', cartella: pc }]
    const esito = await eseguiFusione({
      maestra, archivio, radici, pcNome: 'Torre', adesso: '2026-09-06T10:00:00.000Z',
      scelte: { voci: { 'progetto-p/src/solo-pc.ts': 'carica', 'progetto-p/src/solo-drive.ts': 'scarica', 'progetto-p/src/a.ts': 'copia' }, workspace: { modo: 'unione', escludi: [] } }
    })
    expect(esito).toMatchObject({ caricati: 2, scaricati: 1, copie: 1, saltati: 0 })
    // Sul PC: solo-drive e' arrivato, a.ts e' rimasto il mio, la versione del Drive e' accanto.
    expect(readFileSync(join(pc, 'src', 'solo-drive.ts'), 'utf8')).toBe('solo Drive')
    expect(readFileSync(join(pc, 'src', 'a.ts'), 'utf8')).toBe('A del PC')
    const copie = readdirSync(join(pc, 'src')).filter((n) => n.includes('.conflitto-drive-'))
    expect(copie).toHaveLength(1)
    expect(readFileSync(join(pc, 'src', copie[0] as string), 'utf8')).toBe('A del Drive')
    // Sul Drive: solo-pc e' salito, a.ts e' il mio, la copia c'e', intatto e' intatto.
    const m = await leggiManifesto(archivio, maestra)
    expect(m.stato).toBe('ok')
    const file = m.stato === 'ok' ? m.manifesto.file : {}
    expect(Object.keys(file).sort()).toEqual([
      'progetto-p/src/a.ts', `progetto-p/src/a.conflitto-drive-20260906-100000.ts`, 'progetto-p/src/intatto.ts', 'progetto-p/src/solo-drive.ts', 'progetto-p/src/solo-pc.ts'
    ].sort())
    expect(file['progetto-p/src/a.ts']?.size).toBe('A del PC'.length)
    expect(existsSync(join(pc, 'src', 'intatto.ts'))).toBe(false)
    expect(mD.manifesto.file['progetto-p/src/intatto.ts']).toEqual(file['progetto-p/src/intatto.ts'])
  })

  it('l unione dei registri: lo stesso progetto adottato da due PC (stessa origine) diventa uno, con l id piu vecchio', () => {
    // Il 14/09 «Server_home» stava nel registro due volte: ogni PC l'aveva
    // adottato prima di vedere l'altro.
    const a = { versione: 1 as const, progetti: [{ id: 'p-fisso', nome: 'Server_home', percorsi: { F: 'C:\\Users\\n\\Progetti SierraDeck\\Server_home' }, origini: ['C:\\Users\\n\\Documents\\Server_home'], aggiuntoIl: '2026-09-14T22:03:48.523Z' }] }
    const b = { versione: 1 as const, progetti: [
      { id: 'p-port', nome: 'Server_home', percorsi: { P: 'C:\\Users\\n\\Progetti SierraDeck\\Server_home' }, origini: ['c:/users/n/documents/server_home/'], aggiuntoIl: '2026-09-13T22:03:01.610Z' },
      { id: 'p-altro', nome: 'Server_home', percorsi: { P: 'D:\\altro\\Server_home' }, aggiuntoIl: '2026-09-01T00:00:00.000Z' }
    ] }
    const f = fondiRegistri(a, b)
    expect(f.progetti.map((p) => p.id).sort()).toEqual(['p-altro', 'p-port'])
    const uno = f.progetti.find((p) => p.id === 'p-port')!
    expect(uno.percorsi).toEqual({ P: 'C:\\Users\\n\\Progetti SierraDeck\\Server_home', F: 'C:\\Users\\n\\Progetti SierraDeck\\Server_home' })
    expect(uno.origini).toEqual(['c:/users/n/documents/server_home/', 'C:\\Users\\n\\Documents\\Server_home'])
  })

})

/**
 * Le liste dei workspace di ogni PC (0.65.1). Il caso del 12/10: ogni «Porta
 * qui» di un progetto fondeva nella lista del PC TUTTI i workspace del Drive,
 * e i PC finivano per mostrare la stessa lista; un riquadro di un altro PC che
 * guardava questo, arrivato qui, guardava sé stesso.
 */
describe('la lista dei workspace di un PC resta sua', () => {
  const pc = { versione: 1, attivo: 'mio', workspace: [{ nome: 'mio', perSlot: {} }, { nome: 'Gestionale', perSlot: {} }] } as unknown as Archivio
  const drive = {
    versione: 1, attivo: 'x',
    workspace: [
      { nome: 'altro-1', perSlot: {} }, { nome: 'altro-2', perSlot: {} },
      { nome: 'Progetto Nuovo', perSlot: { 1: { root: undefined, panes: [{ id: 'q', sessionUuid: 's9', cwd: 'C:\\y', title: 'y', remoto: { pcId: 'pc-io', pcNome: 'IO', cwd: 'C:\\vero', sessione: 's9' } }] } } }
    ]
  } as unknown as Archivio
  it('«Porta qui» di un progetto aggiunge solo il workspace del progetto, non tutti quelli del Drive', () => {
    const escludi = drive.workspace.map((w) => w.nome).filter((n) => n !== 'Progetto Nuovo')
    const fuso = fondiArchivi(pc, drive, 'unione', escludi, { io: 'pc-io' }) as Archivio
    expect(fuso.workspace.map((w) => w.nome)).toEqual(['mio', 'Gestionale', 'Progetto Nuovo'])
  })
  it('un riquadro del Drive che guarda questo PC arriva qui locale, nella sua cartella vera', () => {
    const fuso = fondiArchivi(pc, drive, 'unione', [], { io: 'pc-io' }) as Archivio
    const p = fuso.workspace.find((w) => w.nome === 'Progetto Nuovo')!.perSlot[1]!.panes[0]!
    expect(p.remoto).toBeUndefined()
    expect(p.cwd).toBe('C:\\vero')
  })
  it('«tieni quelli del Drive» non toglie mai i workspace che ha solo questo PC', () => {
    const fuso = fondiArchivi(pc, drive, 'drive', [], { io: 'pc-io' }) as Archivio
    expect(fuso.workspace.map((w) => w.nome)).toEqual(['altro-1', 'altro-2', 'Progetto Nuovo', 'mio', 'Gestionale'])
  })
})
