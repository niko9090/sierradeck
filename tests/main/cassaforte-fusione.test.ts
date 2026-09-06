import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { archivioInMemoria } from '../../src/main/cassaforte/archivio'
import { salvaIncrementale, manifestoVuoto, leggiManifesto } from '../../src/main/cassaforte/incrementale'
import { firmaRadici, type Radice } from '../../src/main/cassaforte/raccolta'
import { pianifica, sceltePredefinite, fondiArchivi, fondiRegistri, eseguiFusione } from '../../src/main/cassaforte/fusione'
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
    expect(fondiArchivi(archivioPc, archivioDrive, 'drive')).toBe(archivioDrive)
    expect(fondiArchivi(undefined, archivioDrive, 'unione')).toBe(archivioDrive)
  })

  it('l unione dei registri: per id, con i percorsi di tutti i PC', () => {
    const a = { versione: 1 as const, progetti: [{ id: 'p1', nome: 'X', percorsi: { A: 'C:\\x' }, aggiuntoIl: '' }] }
    const b = { versione: 1 as const, progetti: [{ id: 'p1', nome: 'X', percorsi: { B: 'D:\\x' }, aggiuntoIl: '' }, { id: 'p2', nome: 'Y', percorsi: { B: 'D:\\y' }, aggiuntoIl: '' }] }
    const f = fondiRegistri(a, b)
    expect(f.progetti.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(f.progetti[0]!.percorsi).toEqual({ A: 'C:\\x', B: 'D:\\x' })
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
})
