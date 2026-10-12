import { describe, it, expect } from 'vitest'
import {
  byteLeggibili, daSvuotare, indiceConDiNuovo, indiceSenza, misura, nuovaPulizia, proposteDiPulizia, restaFuori, tipoDi,
  type FileDrive, type IndiceDrive, type RegistroPulizie
} from '@shared/spazio-drive'

const GIORNO = 86_400_000
const ADESSO = Date.parse('2026-10-12T12:00:00.000Z')
const vecchio = ADESSO - 90 * GIORNO
const recente = ADESSO - 2 * GIORNO

// Un Drive d'esempio: due chat, una salvata due volte (due cartelle), un progetto, battiti, una copia di sicurezza vecchia e un file senza voce.
const indice: IndiceDrive = {
  'chat/C--pc-a-lavoro/aaaa.jsonl': { nome: 'f_a1', size: 5000, mtime: vecchio },
  'chat/C--pc-b-lavoro/aaaa.jsonl': { nome: 'f_a2', size: 4000, mtime: vecchio },
  'chat/C--pc-b-lavoro/aaaa/subagents/x.jsonl': { nome: 'f_a2s', size: 100, mtime: vecchio },
  'chat/C--pc-a-lavoro/bbbb.jsonl': { nome: 'f_b', size: 3000, mtime: vecchio },
  'chat/C--pc-a-lavoro/cccc.jsonl': { nome: 'f_c', size: 2000, mtime: recente },
  'progetto-p1/src/main.ts': { nome: 'f_p', size: 700, mtime: recente },
  'sierradeck/workspaces.json': { nome: 'f_w', size: 300, mtime: recente }
}
const file: FileDrive[] = [
  { nome: 'f_a1', byte: 5100 }, { nome: 'f_a2', byte: 4100 }, { nome: 'f_a2s', byte: 150 }, { nome: 'f_b', byte: 3100 }, { nome: 'f_c', byte: 2100 },
  { nome: 'f_p', byte: 800 }, { nome: 'f_w', byte: 400 },
  { nome: 'pc-aaaa', byte: 9000 }, { nome: 'posta-aaaa', byte: 100 },
  { nome: 'sierradeck.manifesto', byte: 20_000 },
  { nome: 'sierradeck.manifesto.prima-0.42-pc-2026-08-01', byte: 18_000, modificato: new Date(ADESSO - 60 * GIORNO).toISOString() },
  { nome: 'sierradeck.manifesto.prima-0.42-pc-2026-10-11', byte: 19_000, modificato: new Date(ADESSO - GIORNO).toISOString() },
  { nome: 'f_orfano', byte: 600, modificato: new Date(ADESSO - 10 * GIORNO).toISOString() },
  { nome: 'f_appena', byte: 50, modificato: new Date(ADESSO - 60_000).toISOString() }
]

describe('lo spazio sul Drive', () => {
  it('ogni file ha il suo tipo: dal percorso del manifesto, se no dal nome', () => {
    expect(tipoDi('f_x', 'chat/s/u.jsonl')).toBe('chat')
    expect(tipoDi('f_x', 'progetto-p1/a.ts')).toBe('progetti')
    expect(tipoDi('f_x', 'sierradeck/workspaces.json')).toBe('sistema')
    expect(tipoDi('pc-abc')).toBe('battiti')
    expect(tipoDi('rtc-offerta-a-b')).toBe('battiti')
    expect(tipoDi('sierradeck.manifesto.prima-0.42')).toBe('recupero')
    expect(tipoDi('sierradeck.manifesto')).toBe('sistema')
    expect(tipoDi('f_senza')).toBe('orfani')
  })

  it('la misura somma i byte veri per tipo, e il totale', () => {
    const m = misura({ file, indice, quota: { limite: 15e9, usato: 3e9 }, adesso: ADESSO })
    expect(m.perTipo.chat).toEqual({ file: 5, byte: 5100 + 4100 + 150 + 3100 + 2100 })
    expect(m.perTipo.progetti.byte).toBe(800)
    expect(m.perTipo.battiti).toEqual({ file: 2, byte: 9100 })
    expect(m.perTipo.recupero.file).toBe(2)
    expect(m.perTipo.orfani.file).toBe(2)
    expect(m.totale.byte).toBe(file.reduce((t, f) => t + f.byte, 0))
    expect(m.quota?.limite).toBe(15e9)
  })

  it('le proposte: copie doppie (resta la più lunga), chat vecchie già intere su un PC, recupero scaduto', () => {
    const copieSuiPc = new Map([
      ['bbbb', [{ nome: 'Portatile', size: 3000 }]],
      // cccc è recente: non si propone anche se è su un PC.
      ['cccc', [{ nome: 'Portatile', size: 2000 }]]
    ])
    const p = proposteDiPulizia({ file, indice, copieSuiPc, adesso: ADESSO })
    const doppie = p.find((x) => x.tipo === 'doppie')
    expect(doppie?.voci.map((v) => v.percorso)).toEqual(['chat/C--pc-b-lavoro/aaaa.jsonl', 'chat/C--pc-b-lavoro/aaaa/subagents/x.jsonl'])
    expect(doppie?.byte).toBe(4100 + 150)
    expect(doppie?.breve).toContain('1 chat')
    const vecchie = p.find((x) => x.tipo === 'vecchie')
    expect(vecchie?.voci.map((v) => v.percorso)).toEqual(['chat/C--pc-a-lavoro/bbbb.jsonl'])
    const scaduto = p.find((x) => x.tipo === 'recupero-scaduto')
    expect(scaduto?.voci.map((v) => v.nome).sort()).toEqual(['f_orfano', 'sierradeck.manifesto.prima-0.42-pc-2026-08-01'])
  })

  it('una chat vecchia con la copia del PC più corta di quella sul Drive non si propone: il Drive è l’unica copia intera', () => {
    const p = proposteDiPulizia({ file, indice, copieSuiPc: new Map([['bbbb', [{ nome: 'Portatile', size: 10 }]]]), adesso: ADESSO })
    expect(p.find((x) => x.tipo === 'vecchie')).toBeUndefined()
  })

  it('una pulizia toglie le voci dal manifesto e le tiene per «Annulla»; le voci già in recupero non si ripropongono', () => {
    const pr = proposteDiPulizia({ file, indice, copieSuiPc: new Map(), adesso: ADESSO }).find((x) => x.tipo === 'doppie')
    expect(pr).toBeDefined()
    const pulizia = nuovaPulizia(pr!, { id: 'pulizia-1', chi: 'PC-ESEMPIO', adesso: ADESSO })
    expect(pulizia.scadeIl).toBe(new Date(ADESSO + 30 * GIORNO).toISOString())
    const dopo = indiceSenza(indice, pulizia.voci)
    expect(dopo['chat/C--pc-b-lavoro/aaaa.jsonl']).toBeUndefined()
    expect(dopo['chat/C--pc-a-lavoro/aaaa.jsonl']).toBeDefined()
    const registro: RegistroPulizie = { versione: 1, pulizie: [pulizia] }
    expect(proposteDiPulizia({ file, indice: dopo, copieSuiPc: new Map(), pulizie: registro, adesso: ADESSO }).find((x) => x.tipo === 'doppie')).toBeUndefined()
    // In recupero si contano a parte.
    expect(misura({ file, indice: dopo, pulizie: registro, adesso: ADESSO }).inRecupero).toEqual({ file: 2, byte: 4250 })
    // «Annulla»: tornano, se i file ci sono ancora.
    const rimesso = indiceConDiNuovo(dopo, pulizia.voci, () => true)
    expect(rimesso.rimesse).toBe(2)
    expect(rimesso.indice).toEqual(indice)
  })

  it('«Annulla» non sovrascrive una voce più nuova sullo stesso percorso, né rimette un file che non c’è più', () => {
    const voci = [{ nome: 'f_b', byte: 3100, percorso: 'chat/C--pc-a-lavoro/bbbb.jsonl', voce: indice['chat/C--pc-a-lavoro/bbbb.jsonl']! }]
    const conNuova = { ...indiceSenza(indice, voci), 'chat/C--pc-a-lavoro/bbbb.jsonl': { nome: 'f_b', size: 9000, mtime: ADESSO } }
    expect(indiceConDiNuovo(conNuova, voci, () => true)).toMatchObject({ rimesse: 0, restano: 1 })
    expect(indiceConDiNuovo(indiceSenza(indice, voci), voci, () => false)).toMatchObject({ rimesse: 0, restano: 1 })
  })

  it('una voce tolta non risale con il salvataggio finché è uguale; se la chat cresce risale', () => {
    const voci = [{ nome: 'f_b', byte: 3100, percorso: 'chat/C--pc-a-lavoro/bbbb.jsonl', voce: indice['chat/C--pc-a-lavoro/bbbb.jsonl']! }]
    const r: RegistroPulizie = { versione: 1, pulizie: [{ id: 'x', tipo: 'vecchie', titolo: 't', quando: '', chi: '', scadeIl: '', voci, byte: 3100 }] }
    expect(restaFuori(r, 'chat/C--pc-a-lavoro/bbbb.jsonl', 3000)).toBe(true)
    expect(restaFuori(r, 'chat/C--pc-a-lavoro/bbbb.jsonl', 3500)).toBe(false)
    expect(restaFuori({ ...r, pulizie: [{ ...r.pulizie[0]!, annullataIl: 'ieri' }] }, 'chat/C--pc-a-lavoro/bbbb.jsonl', 3000)).toBe(false)
  })

  it('le pulizie scadute si svuotano; le annullate e le già svuotate no', () => {
    const base = { tipo: 'vecchie' as const, titolo: 't', quando: '', chi: '', voci: [], byte: 0 }
    const r: RegistroPulizie = {
      versione: 1,
      pulizie: [
        { ...base, id: 'scaduta', scadeIl: new Date(ADESSO - 1).toISOString() },
        { ...base, id: 'ancora', scadeIl: new Date(ADESSO + GIORNO).toISOString() },
        { ...base, id: 'annullata', scadeIl: new Date(ADESSO - 1).toISOString(), annullataIl: 'x' },
        { ...base, id: 'svuotata', scadeIl: new Date(ADESSO - 1).toISOString(), svuotataIl: 'x' }
      ]
    }
    expect(daSvuotare(r, ADESSO).map((x) => x.id)).toEqual(['scaduta'])
  })

  it('i byte si leggono come li legge una persona', () => {
    expect(byteLeggibili(512)).toBe('512 byte')
    expect(byteLeggibili(1536)).toBe('1,5 KB')
    expect(byteLeggibili(3.2 * 1024 ** 3)).toBe('3,2 GB')
    expect(byteLeggibili(340 * 1024 ** 2)).toBe('340 MB')
  })
})
