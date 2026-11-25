import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  accessiPersi, bozzaAccessoPerso, creaGuardiaAccessi, esitoProvaPortachiavi, leggiAccessiVisti, motivoCassaforte, motivoClaude,
  motivoDrive, motivoGettone, prossimiVisti, rigaAccessi, testoAccessoPerso, PAROLA_DI_PROVA,
  type AccessiVisti, type FotoAccessi
} from '../../src/main/accessi-visti'
import { diagnosiDrive, FILE_SCOLLEGATO, FILE_TOKEN_DRIVE } from '../../src/main/cassaforte/conto-drive'
import type { DiagnosiDrive } from '../../src/main/cassaforte/conto-drive'

const drive = (x: Partial<DiagnosiDrive> = {}): DiagnosiDrive => ({ configurato: true, lettura: 'ok', rinnovo: true, messoDaParte: false, ...x })
const tutto = (stato: 'presente' | 'assente'): FotoAccessi => ({
  drive: { stato, motivo: 'm' }, cassaforte: { stato, motivo: 'm' }, claude: { stato, motivo: 'm' }, gettoneClaude: { stato, motivo: 'm' }
})
const visti = (presente: boolean): AccessiVisti => ({
  versione: '1.0.0', quando: '2026-11-24T10:00:00.000Z',
  accessi: { drive: { presente, dal: 'x' }, cassaforte: { presente, dal: 'x' }, claude: { presente, dal: 'x' }, gettoneClaude: { presente, dal: 'x' } }
})

describe('accessi visti: il motivo di ciascun accesso', () => {
  it('Drive: ogni lettura del token ha il suo motivo', () => {
    expect(motivoDrive(drive())).toEqual({ stato: 'presente', motivo: 'collegato' })
    expect(motivoDrive(drive({ rinnovo: false })).motivo).toMatch(/senza rinnovo/u)
    expect(motivoDrive(drive({ lettura: 'portachiavi-non-pronto' })).stato).toBe('in-attesa')
    expect(motivoDrive(drive({ lettura: 'non-si-decifra' })).motivo).toBe('token del Drive presente ma il portachiavi di Windows non lo decifra')
    expect(motivoDrive(drive({ lettura: 'non-si-decifra' }), 'cambiata').motivo).toMatch(/chiave del portachiavi è cambiata/u)
    expect(motivoDrive(drive({ lettura: 'illeggibile' })).motivo).toMatch(/rovinato/u)
    expect(motivoDrive(drive({ configurato: false })).motivo).toMatch(/credenziali Google del programma/u)
    expect(motivoDrive(drive({ lettura: 'assente' })).motivo).toBe('token del Drive assente: file google-drive-token.json mancante')
    expect(motivoDrive(drive({ lettura: 'assente', messoDaParte: true })).motivo).toMatch(/rifiutato da Google/u)
  })

  it('Drive: invalid_grant e «scollegato da te» si distinguono, e il secondo è voluto', () => {
    const revocata = motivoDrive(drive({ lettura: 'assente', scollegamento: { quando: '2026-11-25T08:30:00.000Z', motivo: 'revocata' } }))
    expect(revocata.motivo).toMatch(/^Google risponde invalid_grant: accesso revocato o scaduto/u)
    expect(revocata.voluto).toBeUndefined()
    const aMano = motivoDrive(drive({ lettura: 'assente', scollegamento: { quando: '2026-11-25T08:30:00.000Z', motivo: 'a-mano' } }))
    expect(aMano.voluto).toBe(true)
  })

  it('cassaforte: aperta, in attesa del portachiavi, o il perché serve la passphrase', () => {
    expect(motivoCassaforte({ haCassaforte: true, aperta: true }).stato).toBe('presente')
    expect(motivoCassaforte({ haCassaforte: false, aperta: false }).stato).toBe('assente')
    expect(motivoCassaforte({ haCassaforte: true, aperta: false, chiave: 'portachiavi-non-pronto' }).stato).toBe('in-attesa')
    expect(motivoCassaforte({ haCassaforte: true, aperta: false, chiave: 'non-si-decifra' }).motivo).toMatch(/non la decifra: serve la passphrase$/u)
    expect(motivoCassaforte({ haCassaforte: true, aperta: false, chiave: 'messa-da-parte' }, 'cambiata').motivo).toMatch(/è cambiata/u)
    expect(motivoCassaforte({ haCassaforte: true, aperta: false, chiave: 'assente' }).motivo).toMatch(/maestra-portachiavi\.json mancante/u)
  })

  it('Claude Code e l accesso di un anno', () => {
    expect(motivoClaude({ autenticato: true }).stato).toBe('presente')
    expect(motivoClaude({ autenticato: false, motivo: 'Manca l’accesso a Claude Code: apri un terminale, lancia «claude» e completa il login.' }).motivo).toMatch(/credentials\.json mancante/u)
    const scade = Date.parse('2027-11-20T00:00:00.000Z')
    expect(motivoGettone({ stato: 'valido', creatoIl: 0, scadeIl: scade, giorniRimasti: 300 }).stato).toBe('presente')
    expect(motivoGettone({ stato: 'assente' }).motivo).toBe('mai salvato')
    expect(motivoGettone({ stato: 'rifiutato', creatoIl: 0, scadeIl: scade, giorniRimasti: 300, rifiutatoPerche: 'Failed to authenticate' }).motivo).toBe('Claude l’ha rifiutato (Failed to authenticate)')
    expect(motivoGettone({ stato: 'scaduto', creatoIl: 0, scadeIl: scade, giorniRimasti: 0 }).motivo).toMatch(/^scaduto il /u)
  })

  it('la parola di prova del portachiavi: uguale, cambiata, nuova, non disponibile', () => {
    const decifra = (s: string): string => { if (s !== 'buona') throw new Error('no'); return PAROLA_DI_PROVA }
    expect(esitoProvaPortachiavi('buona', { disponibile: true, decifra })).toBe('uguale')
    expect(esitoProvaPortachiavi('di-un-altra-chiave', { disponibile: true, decifra })).toBe('cambiata')
    expect(esitoProvaPortachiavi(undefined, { disponibile: true, decifra })).toBe('nuova')
    expect(esitoProvaPortachiavi('buona', { disponibile: false, decifra })).toBe('non-disponibile')
  })
})

describe('accessi visti: il confronto con la volta scorsa', () => {
  it('un accesso che c era e adesso manca fa un avviso; uno che mancava già no', () => {
    expect(accessiPersi(visti(true), tutto('assente')).map((p) => p.chiave)).toEqual(['drive', 'cassaforte', 'claude', 'gettoneClaude'])
    expect(accessiPersi(visti(false), tutto('assente'))).toEqual([])
    expect(accessiPersi(visti(true), tutto('presente'))).toEqual([])
    // Il primo avvio con la traccia: niente da confrontare.
    expect(accessiPersi(undefined, tutto('assente'))).toEqual([])
  })

  it('«in attesa» e «scollegato da te» non sono accessi persi', () => {
    const foto = { ...tutto('presente'), drive: { stato: 'assente' as const, motivo: 'scollegato da te', voluto: true as const }, cassaforte: { stato: 'in-attesa' as const, motivo: 'portachiavi' } }
    expect(accessiPersi(visti(true), foto)).toEqual([])
  })

  it('lo stato da scrivere tiene quello di prima quando non si sa, e cambia la data solo se cambia il sì/no', () => {
    const prima = visti(true)
    const foto: FotoAccessi = { ...tutto('presente'), cassaforte: { stato: 'in-attesa', motivo: 'p' }, drive: { stato: 'assente', motivo: 'm' } }
    const dopo = prossimiVisti(prima, foto, '2.0.0', Date.parse('2026-11-25T09:00:00.000Z'))
    expect(dopo.accessi.cassaforte).toEqual({ presente: true, dal: 'x' })
    expect(dopo.accessi.claude).toEqual({ presente: true, dal: 'x' })
    expect(dopo.accessi.drive).toEqual({ presente: false, dal: '2026-11-25T09:00:00.000Z' })
    expect(dopo.versione).toBe('2.0.0')
    // Solo sì/no e date: niente altro dentro.
    expect(JSON.stringify(dopo)).not.toMatch(/token|refresh|sk-ant/iu)
  })

  it('i testi dell avviso: corti, col motivo e con cosa fare', () => {
    expect(testoAccessoPerso('drive', 'Google risponde invalid_grant: accesso revocato o scaduto', true))
      .toBe('Dopo l’aggiornamento il Drive si è scollegato: Google risponde invalid_grant: accesso revocato o scaduto. Ricollegalo da Account.')
    expect(testoAccessoPerso('cassaforte', 'x', false)).toBe('La cassaforte è rimasta chiusa: x. Aprila da Account con la passphrase.')
    const b = bozzaAccessoPerso('gettoneClaude', 'scaduto', true, 123)
    expect(b.tipo).toBe('sapere')
    expect(b.id).toBe('accesso-perso:gettoneClaude:123')
    expect(b.titolo).toBe('Accesso perso dopo l’aggiornamento')
  })

  it('la riga del registro dice la versione di prima e il motivo di ciò che manca', () => {
    const foto: FotoAccessi = { ...tutto('presente'), drive: { stato: 'assente', motivo: 'token del Drive assente: file google-drive-token.json mancante' } }
    const riga = rigaAccessi(foto, { versione: '2.0.0', da: '1.9.0', prova: 'uguale' })
    expect(riga).toBe('[accessi] avvio della 2.0.0 (prima volta, venivo dalla 1.9.0): Drive no (token del Drive assente: file google-drive-token.json mancante) · cassaforte sì · Claude Code sì · accesso di un anno sì · portachiavi di Windows: come l’ultima volta')
  })
})

describe('accessi visti: la guardia con il disco', () => {
  const cartelle: string[] = []
  const nuova = (): string => { const c = mkdtempSync(join(tmpdir(), 'sd-accessi-')); cartelle.push(c); return c }
  afterEach(() => { for (const c of cartelle.splice(0)) rmSync(c, { recursive: true, force: true }) })

  it('alla prima sessione scrive cosa vede; alla seconda, perso il Drive, avvisa (anche prima che il registro degli avvisi ci sia)', () => {
    const dir = nuova()
    const file = join(dir, 'accessi-visti.json')
    let foto = tutto('presente')
    const righe: string[] = []
    const portachiavi = { disponibile: () => true, cifra: (s: string) => `c:${s}`, decifra: (s: string) => s.slice(2) }
    const prima = creaGuardiaAccessi({ file, versione: '1.0.0', foto: () => foto, portachiavi, log: (r) => righe.push(r), adesso: () => 1000 })
    prima.controlla('avvio')
    expect(leggiAccessiVisti(file)?.accessi.drive?.presente).toBe(true)
    expect(leggiAccessiVisti(file)?.provaPortachiavi).toBe(`c:${PAROLA_DI_PROVA}`)
    expect(readFileSync(file, 'utf8')).not.toMatch(/token/iu)

    foto = { ...tutto('presente'), drive: { stato: 'assente', motivo: 'Google risponde invalid_grant' } }
    const avvisi: string[] = []
    const dopo = creaGuardiaAccessi({ file, versione: '1.1.0', da: '1.0.0', foto: () => foto, portachiavi, log: (r) => righe.push(r), adesso: () => 2000 })
    dopo.controlla('avvio')
    expect(righe.some((r) => r.includes('venivo dalla 1.0.0') && r.includes('portachiavi di Windows: come l’ultima volta'))).toBe(true)
    dopo.collegaAvvisi((b) => avvisi.push(b.testo))
    expect(avvisi).toEqual(['Dopo l’aggiornamento il Drive si è scollegato: Google risponde invalid_grant. Ricollegalo da Account.'])
    // Al giro dopo l'avviso non si ripete: adesso «mancava già».
    dopo.controlla('giro')
    expect(avvisi).toHaveLength(1)
  })

  it('il portachiavi cambiato si vede nella riga e passa ai motivi', () => {
    const dir = nuova()
    const file = join(dir, 'accessi-visti.json')
    writeFileSync(file, JSON.stringify({ ...visti(true), provaPortachiavi: 'cifrata-con-la-chiave-di-prima' }))
    const righe: string[] = []
    let vista: string | undefined
    const g = creaGuardiaAccessi({
      file, versione: '1.1.0',
      foto: (prova) => { vista = prova; return tutto('presente') },
      portachiavi: { disponibile: () => true, cifra: (s) => `nuova:${s}`, decifra: () => { throw new Error('altra chiave') } },
      log: (r) => righe.push(r)
    })
    g.controlla('avvio')
    expect(vista).toBe('cambiata')
    expect(righe[0]).toMatch(/portachiavi di Windows: CAMBIATO/u)
    expect(leggiAccessiVisti(file)?.provaPortachiavi).toBe(`nuova:${PAROLA_DI_PROVA}`)
  })
})

describe('diagnosiDrive: il perché dai file, senza cambiarli', () => {
  const cartelle: string[] = []
  const nuova = (): string => { const c = mkdtempSync(join(tmpdir(), 'sd-diagnosi-')); cartelle.push(c); return c }
  afterEach(() => { for (const c of cartelle.splice(0)) rmSync(c, { recursive: true, force: true }) })
  const portachiavi = (ok: boolean) => ({ disponibile: () => true, cifra: (s: string) => `c:${s}`, decifra: (s: string) => { if (!ok) throw new Error('no'); return s.slice(2) } })

  it('token cifrato che non si decifra, assente col segno di invalid_grant, buono col rinnovo', () => {
    const dir = nuova()
    const token = JSON.stringify({ accessToken: 'a', refreshToken: 'r', scadeIl: 0 })
    writeFileSync(join(dir, FILE_TOKEN_DRIVE), JSON.stringify({ sierradeckCifrato: 1, dati: `c:${token}` }))
    expect(diagnosiDrive(dir, portachiavi(true))).toMatchObject({ lettura: 'ok', rinnovo: true })
    expect(diagnosiDrive(dir, portachiavi(false)).lettura).toBe('non-si-decifra')
    expect(diagnosiDrive(dir, { ...portachiavi(true), disponibile: () => false }).lettura).toBe('portachiavi-non-pronto')
    // Il file non è stato toccato (niente migrazione, niente cancellazione).
    expect(readFileSync(join(dir, FILE_TOKEN_DRIVE), 'utf8')).toContain('sierradeckCifrato')

    rmSync(join(dir, FILE_TOKEN_DRIVE))
    writeFileSync(join(dir, FILE_SCOLLEGATO), JSON.stringify({ quando: '2026-11-25T08:00:00.000Z', motivo: 'revocata' }))
    const d = diagnosiDrive(dir, portachiavi(true))
    expect(d.lettura).toBe('assente')
    expect(motivoDrive({ ...d, configurato: true }).motivo).toMatch(/invalid_grant/u)
  })
})
