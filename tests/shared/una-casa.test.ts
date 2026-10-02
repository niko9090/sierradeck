import { describe, it, expect } from 'vitest'
import {
  PASSI_SPOSTA, caseVuote, controlliSposta, decidiCasa, fuoriCasa, leggiCase, manifestoConProprietari, perCasa, pianoAnnulla, pianoRiordino,
  saleDaQui, scendeQui, sessioneDiPercorso, sipuoSpostare, unisciCase, verificaMigrazione, verificaSposta,
  type CasaChat, type CaseChat, type IndiziChat, type Man, type RegistroRiordino, type StatoPerSposta
} from '@shared/una-casa'

/**
 * 0.42.0, «una chat, una casa». Progetto:
 * .sierradeck/quaderno/2026-10-02-una-chat-una-casa-progetto.md
 */
const FISSO = { id: 'fisso', nome: 'PC-Fisso' }
const LAP = { pcId: 'lap', nome: 'LAPTOP' }
const base: IndiziChat = { sessione: 's1', cwd: 'C:\\Users\\nikof\\Documents\\Trading', qui: { size: 1000 }, cartellaQui: true, altri: [] }
const casa = (pc: string, da: CasaChat['da'], decisaIl: string): CasaChat => ({ pc, pcNome: pc, motivo: 'm', decisaIl, da })

describe('la regola della casa', () => {
  it('memorizzata: non cambia da sola', () => {
    expect(decidiCasa({ ...base, altri: [{ ...LAP, haCartella: true, aperta: true }] }, FISSO, casa('fisso', 'regola', '2026-10-02')).pc).toBe('fisso')
  })
  it('1. nata qui: c’è solo qui e il Drive non l’ha mai vista', () => {
    const d = decidiCasa(base, FISSO)
    expect(d).toMatchObject({ pc: 'fisso', regola: 'nascita' })
    expect(d.motivo).toContain('è nata su PC-Fisso')
  })
  it('2. la cartella c’è su un PC solo: è la sua casa', () => {
    const d = decidiCasa({ ...base, cartellaQui: false, drive: { size: 1000 }, altri: [{ ...LAP, haCartella: true, aperta: false }] }, FISSO)
    expect(d).toMatchObject({ pc: 'lap', regola: 'cartella' })
    expect(d.motivo).toContain('c\'è solo su LAPTOP')
  })
  it('3. la cartella su tutti e due: vince dove è aperta adesso', () => {
    const d = decidiCasa({ ...base, drive: { size: 1000 }, altri: [{ ...LAP, haCartella: true, aperta: true }] }, FISSO)
    expect(d).toMatchObject({ pc: 'lap', regola: 'attivita' })
    expect(decidiCasa({ ...base, drive: { size: 1000 }, apertaQui: true, altri: [{ ...LAP, haCartella: true, aperta: false }] }, FISSO).pc).toBe('fisso')
  })
  it('3. la cartella su tutti e due: vince la copia più avanti (non le date dei file)', () => {
    const altri = [{ ...LAP, haCartella: true, aperta: false }]
    expect(decidiCasa({ ...base, qui: { size: 2000, ultimoMessaggio: '2026-10-01T10:00:00Z' }, drive: { size: 1500 }, altri }, FISSO)).toMatchObject({ pc: 'fisso', regola: 'attivita' })
    const d = decidiCasa({ ...base, qui: { size: 900 }, drive: { size: 1500, pc: 'lap' }, altri }, FISSO)
    expect(d).toMatchObject({ pc: 'lap', regola: 'attivita' })
    expect(d.motivo).toContain('ha continuato a lavorare su LAPTOP')
  })
  it('4. altrimenti resta dov’è', () => {
    // Senza una copia di qui da confrontare, senza cartella nota e nessuno che la apre.
    expect(decidiCasa({ sessione: 's9', cartellaQui: false, altri: [{ ...LAP, haCartella: false, aperta: false }], drive: { size: 1000 } }, FISSO).regola).toBe('unica')
  })
})

describe('le case scritte da più PC', () => {
  it('Nicholas e «Sposta» battono la regola; fra regole vince la prima; fra scelte l’ultima', () => {
    const a: CaseChat = { versione: 1, case: { s1: casa('fisso', 'regola', '2026-10-01'), s2: casa('fisso', 'nicholas', '2026-10-01'), s3: casa('fisso', 'regola', '2026-10-01') } }
    const b: CaseChat = { versione: 1, case: { s1: casa('lap', 'sposta', '2026-09-01'), s2: casa('lap', 'nicholas', '2026-10-02'), s3: casa('lap', 'regola', '2026-10-02'), s4: casa('lap', 'nascita', '2026-10-02') } }
    const u = unisciCase(a, b).case
    expect(u.s1?.pc).toBe('lap')
    expect(u.s2?.pc).toBe('lap')
    expect(u.s3?.pc).toBe('fisso')
    expect(u.s4?.pc).toBe('lap')
    // L'ordine non conta per il risultato.
    expect(unisciCase(b, a).case).toEqual(u)
  })
  it('da fuori si tiene solo quello che ha la forma giusta', () => {
    expect(leggiCase({ case: { s: { pc: 'lap', decisaIl: 'x', da: 'boh' }, t: { pc: 3 } } }).case).toEqual({ s: { pc: 'lap', pcNome: 'lap', motivo: '', decisaIl: 'x', da: 'regola' } })
    expect(leggiCase(null)).toEqual(caseVuote())
  })
})

describe('la sincronia: cosa sale e cosa scende', () => {
  const cc: CaseChat = { versione: 1, case: { mia: casa('fisso', 'nascita', 'x'), sua: casa('lap', 'regola', 'x') } }
  it('la sessione di un percorso, anche dei sotto-agenti', () => {
    expect(sessioneDiPercorso('chat/C--Trading/mia.jsonl')).toBe('mia')
    expect(sessioneDiPercorso('chat/C--Trading/mia/subagents/agent-1.jsonl')).toBe('mia')
    expect(sessioneDiPercorso('C--Trading\\mia.jsonl')).toBe('mia')
  })
  it('salgono le mie e quelle senza casa; non quelle di un altro PC; il resto come prima', () => {
    expect(saleDaQui('chat/x/mia.jsonl', cc, 'fisso')).toBe(true)
    expect(saleDaQui('chat/x/nuova.jsonl', cc, 'fisso')).toBe(true)
    expect(saleDaQui('chat/x/sua.jsonl', cc, 'fisso')).toBe(false)
    expect(saleDaQui('chat/x/sua/subagents/a.jsonl', cc, 'fisso')).toBe(false)
    expect(saleDaQui('sierradeck/workspaces.json', cc, 'fisso')).toBe(true)
  })
  it('scendono da sole solo le chat di casa qui', () => {
    expect(scendeQui('chat/x/mia.jsonl', cc, 'fisso')).toBe(true)
    expect(scendeQui('chat/x/sua.jsonl', cc, 'fisso')).toBe(false)
    expect(scendeQui('chat/x/sconosciuta.jsonl', cc, 'fisso')).toBe(false)
    expect(scendeQui('progetto-abc/file.txt', cc, 'fisso')).toBe(true)
  })
})

describe('la migrazione del manifesto', () => {
  const prima: Man = {
    versione: 1, creatoIl: 'x',
    file: {
      'chat/x/mia.jsonl': { nome: 'f_1', size: 10, mtime: 1, sha: 'a' },
      'chat/x/sua.jsonl': { nome: 'f_2', size: 20, mtime: 2 },
      'chat/x/ignota.jsonl': { nome: 'f_3', size: 30, mtime: 3 },
      'sierradeck/workspaces.json': { nome: 'f_4', size: 40, mtime: 4 }
    }
  }
  const cc: CaseChat = { versione: 1, case: { mia: casa('fisso', 'nascita', 'x'), sua: casa('lap', 'regola', 'x') } }
  it('il proprietario sulle chat di cui si sa la casa; niente si toglie, niente si rinomina', () => {
    const dopo = manifestoConProprietari(prima, cc)
    expect(dopo.file['chat/x/mia.jsonl']?.pc).toBe('fisso')
    expect(dopo.file['chat/x/sua.jsonl']?.pc).toBe('lap')
    expect(dopo.file['chat/x/ignota.jsonl']?.pc).toBeUndefined()
    expect(dopo.file['sierradeck/workspaces.json']?.pc).toBeUndefined()
    expect(verificaMigrazione(prima, dopo)).toEqual([])
  })
  it('la verifica trova ogni voce persa o cambiata', () => {
    const { ['chat/x/sua.jsonl']: _tolta, ...resto } = prima.file
    expect(verificaMigrazione(prima, { ...prima, file: resto })).toEqual(['chat/x/sua.jsonl'])
    expect(verificaMigrazione(prima, { ...prima, file: { ...prima.file, 'chat/x/mia.jsonl': { nome: 'f_1', size: 11, mtime: 1, sha: 'a' } } })).toEqual(['chat/x/mia.jsonl'])
  })
})

describe('il riordino', () => {
  const chat = [
    { sessione: 'a', slug: 'C--Trading', titolo: 'A', byte: 10, aperta: false },
    { sessione: 'b', slug: 'C--Trading', titolo: 'B', byte: 10, aperta: true },
    { sessione: 'c', slug: 'C--Mio', titolo: 'C', byte: 10, aperta: false }
  ]
  const decidi = (c: { sessione: string }): { pc: string; pcNome: string; motivo: string; regola: 'cartella' } =>
    c.sessione === 'c' ? { pc: 'fisso', pcNome: 'PC-Fisso', motivo: 'm', regola: 'cartella' } : { pc: 'lap', pcNome: 'LAPTOP', motivo: 'la cartella c\'è solo su LAPTOP', regola: 'cartella' }
  it('fuori casa: solo quelle con casa altrove, raggruppate per casa', () => {
    const f = fuoriCasa(chat, decidi, 'fisso')
    expect(f.map((x) => x.sessione)).toEqual(['a', 'b'])
    expect(perCasa(f)).toMatchObject([{ pc: 'lap', nome: 'LAPTOP', chat: [{ sessione: 'a' }, { sessione: 'b' }] }])
  })
  it('il piano: dalla cartella dei progetti a quella di recupero, stessa struttura, mai fuori', () => {
    const p = pianoRiordino({ id: 'r1', radiceProgetti: 'C:\\Users\\n\\.claude\\projects', recupero: 'C:\\dati\\recupero', file: [
      { sessione: 'a', relativo: 'C--Trading/a.jsonl' }, { sessione: 'a', relativo: 'C--Trading/a/subagents/x.jsonl' }, { sessione: 'z', relativo: '../fuori.jsonl' }
    ] })
    expect(p).toEqual([
      { sessione: 'a', da: 'C:/Users/n/.claude/projects/C--Trading/a.jsonl', a: 'C:/dati/recupero/r1/C--Trading/a.jsonl' },
      { sessione: 'a', da: 'C:/Users/n/.claude/projects/C--Trading/a/subagents/x.jsonl', a: 'C:/dati/recupero/r1/C--Trading/a/subagents/x.jsonl' }
    ])
  })
  it('l’annullamento non sovrascrive mai: se al posto c’è un’altra copia, la copia di recupero resta', () => {
    const r: RegistroRiordino = { id: 'r1', tipo: 'riordino', quando: 'x', casePrima: {}, spostamenti: [
      { sessione: 'a', da: '/p/a.jsonl', a: '/r/a.jsonl' }, { sessione: 'b', da: '/p/b.jsonl', a: '/r/b.jsonl' }, { sessione: 'c', da: '/p/c.jsonl', a: '/r/c.jsonl' }
    ] }
    const esiste = (p: string): boolean => ['/r/a.jsonl', '/r/b.jsonl', '/p/b.jsonl'].includes(p)
    const piano = pianoAnnulla(r, esiste)
    expect(piano.rimetti).toEqual([{ sessione: 'a', da: '/r/a.jsonl', a: '/p/a.jsonl' }])
    expect(piano.restano.map((x) => x.sessione)).toEqual(['b', 'c'])
    expect(piano.restano[0]?.perche).toContain('non la sovrascrivo')
  })
})

describe('«Sposta progetto»', () => {
  const tuttoOk: StatoPerSposta = {
    chatDaSpostare: 3, chatAperte: 0, chatAlLavoro: 0, autopilotiAlLavoro: 0, git: { repo: true, modifiche: 0 },
    driveCollegato: true, cassaforteAperta: true, destinazione: { raggiungibile: true, nome: 'LAPTOP', versione: '0.42.0', strada: 'Tailscale' }
  }
  it('sei passi, ognuno con il suo testo per esteso', () => {
    expect(PASSI_SPOSTA.map((p) => p.id)).toEqual(['scelta', 'controlli', 'trasferimento', 'verifica', 'casa', 'archivio'])
    for (const p of PASSI_SPOSTA) expect(p.testo.length).toBeGreaterThan(120)
    expect(PASSI_SPOSTA[5].testo).toContain('non si cancellano')
  })
  it('tutto a posto: si può spostare', () => {
    const c = controlliSposta(tuttoOk)
    expect(sipuoSpostare(c)).toBe(true)
    expect(c.find((x) => x.id === 'destinazione')?.titolo).toContain('LAPTOP risponde (Tailscale)')
  })
  it('ogni controllo che non va dice cosa fare, e ferma la procedura', () => {
    const casi: [Partial<StatoPerSposta>, string, string][] = [
      [{ chatAperte: 2 }, 'aperte', 'Chiudi i loro riquadri'],
      [{ chatAlLavoro: 1 }, 'lavoro', 'Aspetta che finiscano'],
      [{ git: { repo: true, modifiche: 4 } }, 'git', 'Fai un commit'],
      [{ driveCollegato: false }, 'drive', 'Account → Drive → Collega'],
      [{ destinazione: { raggiungibile: false, nome: 'LAPTOP' } }, 'destinazione', 'Accendi LAPTOP'],
      [{ destinazione: { raggiungibile: true, nome: 'LAPTOP', versione: '0.41.0' } }, 'destinazione', 'Aggiorna LAPTOP alla 0.42.0']
    ]
    for (const [cambio, id, testo] of casi) {
      const c = controlliSposta({ ...tuttoOk, ...cambio })
      expect(sipuoSpostare(c)).toBe(false)
      expect(c.find((x) => x.id === id)?.cosaFare).toContain(testo)
    }
    // Una cartella senza git va bene: viaggia com'è.
    expect(sipuoSpostare(controlliSposta({ ...tuttoOk, git: { repo: false, modifiche: 0 } }))).toBe(true)
  })
  it('la verifica: ogni chat arrivata uguale, o ci si ferma', () => {
    const qui = { a: { size: 10, sha: 'x' }, b: { size: 20, sha: 'y' } }
    expect(verificaSposta(qui, { a: { size: 10, sha: 'x' }, b: { size: 20, sha: 'y' } })).toEqual({ ok: true, diverse: [] })
    expect(verificaSposta(qui, { a: { size: 10, sha: 'x' }, b: { size: 20, sha: 'z' } })).toEqual({ ok: false, diverse: ['b'] })
    expect(verificaSposta(qui, { a: { size: 10, sha: 'x' } }).diverse).toEqual(['b'])
  })
})
