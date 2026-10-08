import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaUnaCasa, type ChatLocale } from '../../src/main/una-casa'
import { creaOspite, type Ospite } from '../../src/main/ospite'
import { fermaSeCasaAltrove } from '@shared/ospite-chat'
import { leggiChatAltrove } from '@shared/posta'
import type { Scatola } from '../../src/main/progetti/presenza'

/**
 * L'ospite di ogni chat (0.52.0) sul disco vero, con due PC simulati che si
 * parlano come fanno davvero: la rotta `/api/case` (subito) e la scatola del
 * Drive (al giro). Scheda: .sierradeck/quaderno/ospite-delle-chat.md
 */
function scatolaInMemoria(): Scatola {
  const dati = new Map<string, unknown>()
  return {
    leggi: <T,>(nome: string) => Promise.resolve(dati.get(nome) as T | undefined),
    scrivi: (nome, oggetto) => { dati.set(nome, JSON.parse(JSON.stringify(oggetto))); return Promise.resolve() },
    cancella: (nome) => { dati.delete(nome); return Promise.resolve() }
  }
}

type Pc = {
  id: string; nome: string; ospite: Ospite; progetti: string
  apri: (a: { sessione: string; alLavoro: boolean }[]) => void
  chiusi: { sessione: string; pc: { id: string; nome: string } }[]
  salvati: number
  unaCasa: ReturnType<typeof creaUnaCasa>
}

function due(): { a: Pc; b: Pc; orologio: { t: number } } {
  const scatola = scatolaInMemoria()
  const orologio = { t: Date.parse('2026-10-07T13:00:00Z') }
  const pcs: Record<string, Pc> = {}
  const crea = (id: string, nome: string, altro: { id: string; nome: string }): Pc => {
    const radice = mkdtempSync(join(tmpdir(), `sd-ospite-${id}-`))
    const progetti = join(radice, 'projects')
    const chat: ChatLocale[] = []
    for (const s of ['money', 'sito']) {
      mkdirSync(join(progetti, 'C--Money'), { recursive: true })
      const f = join(progetti, 'C--Money', `${s}.jsonl`)
      writeFileSync(f, `{"${s}":"${id}"}\n`)
      chat.push({ sessione: s, slug: 'C--Money', titolo: s, cwd: 'C:\\Money', jsonl: f })
    }
    let aperte: { sessione: string; alLavoro: boolean }[] = []
    const unaCasa = creaUnaCasa({
      dati: join(radice, 'dati'), radiceProgetti: progetti,
      io: () => ({ id, nome }), scatola: () => scatola, battiti: () => [],
      chatLocali: () => chat.filter((c) => existsSync(c.jsonl)),
      aperte: () => aperte.map((x) => ({ sessione: x.sessione, cwd: 'C:\\Money' })),
      sulDrive: () => undefined,
      adesso: () => new Date(orologio.t).toISOString()
    })
    const pc: Pc = {
      id, nome, progetti, unaCasa, chiusi: [], salvati: 0,
      apri: (a) => { aperte = a },
      ospite: creaOspite({
        unaCasa,
        io: () => ({ id, nome }),
        altriPc: () => [altro],
        // La rotta `/api/case` dell'altro PC, come la chiama `pc-remoto`.
        chiamaPc: async (pcId, percorso, corpo) => {
          expect(percorso).toBe('/api/case')
          return (pcs[pcId] as Pc).ospite.ricevi(corpo)
        },
        chatLocali: () => chat.filter((c) => existsSync(c.jsonl)),
        aperte: () => aperte,
        chatDeiWorkspace: () => [{ workspace: 'Soldi', sessione: 'money', titolo: 'money', cwd: 'C:\\Money' }, { workspace: 'Soldi', sessione: 'sito', titolo: 'sito', cwd: 'C:\\Money' }],
        salva: async () => { pc.salvati += 1 },
        chiudiQui: (c) => { pc.chiusi.push(...c) },
        avvisa: () => undefined,
        adesso: () => new Date(orologio.t).toISOString()
      })
    }
    pcs[id] = pc
    return pc
  }
  const a = crea('fisso', 'PC-Fisso', { id: 'desk', nome: 'DESKTOP' })
  const b = crea('desk', 'DESKTOP', { id: 'fisso', nome: 'PC-Fisso' })
  return { a, b, orologio }
}

const jsonl = (pc: Pc, s: string): string => join(pc.progetti, 'C--Money', `${s}.jsonl`)
/** Il cancello dello spawn: lancia il messaggio «casa altrove», o niente. */
const avvio = (pc: Pc, s: string, forzaQui = false): ReturnType<typeof leggiChatAltrove> | 'parte' => {
  void forzaQui // «apri qui lo stesso» non entra nel cancello: la casa vince comunque.
  try { fermaSeCasaAltrove({ sessionUuid: s, cwd: 'C:\\Money' }, pc.ospite.casaAltroveDi); return 'parte' } catch (e) { return leggiChatAltrove(e) }
}

describe('«Ospitata da»: la scelta, la propagazione, la regola dura', () => {
  it('scelgo DESKTOP stando sul Fisso: lo sa subito anche DESKTOP; sul Fisso non parte più, su DESKTOP sì', async () => {
    const { a, b } = due()
    expect(avvio(a, 'money')).toBe('parte')
    const r = await a.ospite.scegli({ sessioni: ['money'], pc: { id: 'desk', nome: 'DESKTOP' } })
    expect(r.ok).toBe(true)
    // Prima di cedere, la copia di qui sale sul Drive.
    expect(a.salvati).toBe(1)
    // Subito anche sull'altro PC, dalla rotta.
    expect(b.unaCasa.casaDi('money')).toMatchObject({ pc: 'desk', da: 'nicholas', sceltaDa: 'fisso' })
    const fermo = avvio(a, 'money')
    expect(fermo).toMatchObject({ casa: true, pc: { id: 'desk', nome: 'DESKTOP' }, sessionUuid: 'money' })
    expect(avvio(a, 'money', true)).not.toBe('parte')
    expect(avvio(b, 'money')).toBe('parte')
    // L'altra chat non è toccata.
    expect(avvio(a, 'sito')).toBe('parte')
  })

  it('la copia di qui va nella cartella di recupero (non cancellata) e si annulla', async () => {
    const { a, b, orologio } = due()
    await a.ospite.scegli({ sessioni: ['money'], pc: { id: 'desk', nome: 'DESKTOP' } })
    await a.ospite.giro()
    expect(existsSync(jsonl(a, 'money'))).toBe(false)
    const reg = a.ospite.dove().traslochi
    expect(reg).toHaveLength(1)
    expect(reg[0]).toMatchObject({ tipo: 'ospite', verso: { pc: 'desk', nome: 'DESKTOP' } })
    expect(readFileSync(reg[0]?.spostamenti[0]?.a as string, 'utf8')).toBe('{"money":"fisso"}\n')
    // Su DESKTOP, che è l'ospite, la sua copia resta dov'è.
    await b.ospite.giro()
    expect(existsSync(jsonl(b, 'money'))).toBe(true)

    orologio.t += 60_000
    const u = await a.unaCasa.annulla(reg[0]?.id as string)
    expect(u).toMatchObject({ ok: true, rimessi: 1 })
    expect(readFileSync(jsonl(a, 'money'), 'utf8')).toBe('{"money":"fisso"}\n')
    // Annullare riporta l'ospite qui: di nuovo parte qui.
    expect(a.unaCasa.casaDi('money')).toMatchObject({ pc: 'fisso', da: 'nicholas' })
    expect(avvio(a, 'money')).toBe('parte')
    // E DESKTOP lo sa al giro del Drive.
    await b.unaCasa.sincronizza()
    expect(b.unaCasa.casaDi('money')?.pc).toBe('fisso')
    expect(avvio(b, 'money')).toMatchObject({ casa: true, pc: { id: 'fisso' } })
  })

  it('aperta qui e al lavoro: si aspetta la fine del turno, poi si chiude, poi si sposta — mai a metà', async () => {
    const { a } = due()
    a.apri([{ sessione: 'money', alLavoro: true }])
    await a.ospite.scegli({ sessioni: ['money'], pc: { id: 'desk', nome: 'DESKTOP' } })
    await a.ospite.giro()
    expect(a.chiusi).toEqual([])
    expect(existsSync(jsonl(a, 'money'))).toBe(true)
    // Ha finito il turno: si chiede alle finestre di chiudere il claude.exe (il riquadro diventa remoto).
    a.apri([{ sessione: 'money', alLavoro: false }])
    await a.ospite.giro()
    expect(a.chiusi).toEqual([{ sessione: 'money', pc: { id: 'desk', nome: 'DESKTOP' } }])
    expect(existsSync(jsonl(a, 'money'))).toBe(true)
    // Chiusa: la copia va nel recupero.
    a.apri([])
    await a.ospite.giro()
    expect(existsSync(jsonl(a, 'money'))).toBe(false)
  })

  it('i conflitti: due PC che si dicono casa si mettono d’accordo sulla scelta più recente', async () => {
    const { a, b, orologio } = due()
    await a.ospite.scegli({ sessioni: ['sito'], pc: { id: 'fisso', nome: 'PC-Fisso' } })
    orologio.t += 5_000
    await b.ospite.scegli({ sessioni: ['sito'], pc: { id: 'desk', nome: 'DESKTOP' } })
    expect(a.unaCasa.casaDi('sito')?.pc).toBe('desk')
    expect(b.unaCasa.casaDi('sito')?.pc).toBe('desk')
    // Una scelta più vecchia che arriva dopo non ribalta niente.
    await b.ospite.ricevi({ case: { sito: { pc: 'fisso', pcNome: 'PC-Fisso', motivo: 'vecchia', decisaIl: '2026-10-07T12:00:00.000Z', da: 'nicholas' } } })
    expect(b.unaCasa.casaDi('sito')?.pc).toBe('desk')
    expect(avvio(a, 'sito')).toMatchObject({ casa: true })
    expect(avvio(b, 'sito')).toBe('parte')
  })

  it('la scelta per un workspace intero e la schermata «Dove vive ogni chat»', async () => {
    const { a, b } = due()
    await a.ospite.scegli({ sessioni: ['money', 'sito'], pc: { id: 'desk', nome: 'DESKTOP' }, workspace: 'Soldi' })
    const d = a.ospite.dove()
    expect(d.gruppi[0]).toMatchObject({ workspace: 'Soldi', ospiteComune: 'desk' })
    expect(d.gruppi[0]?.righe.every((r) => r.fonte === 'scelta' && !r.qui)).toBe(true)
    expect(d.pc.map((p) => p.id).sort()).toEqual(['desk', 'fisso'])
    expect(b.unaCasa.casaDi('sito')?.motivo).toContain('workspace «Soldi»')
  })

  it('dal file di case scritto da un PC vecchio: una casa senza `sceltaDa` vale lo stesso', async () => {
    const { a } = due()
    await a.ospite.ricevi({ case: { money: { pc: 'desk', pcNome: 'DESKTOP', motivo: 'regola', decisaIl: '2026-10-02T15:09:04.143Z', da: 'regola' } } })
    // Una casa della regola blocca l'avvio, ma non sposta la copia da sola.
    expect(avvio(a, 'money')).toMatchObject({ casa: true })
    await a.ospite.giro()
    expect(existsSync(jsonl(a, 'money'))).toBe(true)
  })
})

describe('ogni punto di avvio passa dal cancello', () => {
  const src = (p: string): string => readFileSync(join(__dirname, '../../src', p), 'utf8')
  it('lo spawn di una chat (pty:spawn) ferma la casa altrove prima di tutto, anche prima di «apri qui lo stesso»', () => {
    const ipc = src('main/ipc.ts')
    const i = ipc.indexOf("ipcMain.handle('pty:spawn'")
    const corpo = ipc.slice(i, ipc.indexOf('return id', i))
    expect(corpo.indexOf('fermaSeCasaAltrove(req, casaAltroveDi)')).toBeGreaterThan(0)
    expect(corpo.indexOf('fermaSeCasaAltrove(req, casaAltroveDi)')).toBeLessThan(corpo.indexOf('risolviCartella(req.cwd, req.sessionUuid, req.forzaQui'))
    expect(corpo.indexOf('fermaSeCasaAltrove(req, casaAltroveDi)')).toBeLessThan(corpo.indexOf("kind: 'spawn'"))
  })
  it('claude.exe per una chat parte solo da lì: nessun altro spawn con la conversazione', () => {
    const tutti: string[] = []
    const giro = (d: string): void => {
      for (const n of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, n.name)
        if (n.isDirectory()) giro(p)
        else if (/\.(ts|tsx)$/.test(n.name)) tutti.push(p)
      }
    }
    giro(join(__dirname, '../../src'))
    const conArgsChat = tutti.filter((f) => readFileSync(f, 'utf8').includes('buildClaudeArgs(')).map((f) => f.replace(/\\/g, '/').replace(/^.*\/src\//, ''))
    expect(conArgsChat.sort()).toEqual(['main/config.ts', 'main/ipc.ts'])
    // Nel renderer una chat si avvia solo dal Terminal, cioè da pty:spawn.
    const spawnRenderer = tutti.filter((f) => f.replace(/\\/g, '/').includes('/renderer/') && readFileSync(f, 'utf8').includes('gestore.pty.spawn(')).map((f) => f.replace(/\\/g, '/').replace(/^.*\/src\//, ''))
    expect(spawnRenderer).toEqual(['renderer/components/Terminal.tsx'])
  })
  it('ripristino, «Torna a com’era», «Riprendi», cambio di workspace, autopiloti, consegne e telefono montano un Terminal: tutti allo stesso spawn', () => {
    const t = src('renderer/components/Terminal.tsx')
    // Il riquadro chiede da dove aprirla prima di aprire (ripristino, Riprendi, cambio di workspace)...
    expect(t).toContain('window.gestore.remoto.daDove(')
    // ...e quando lo spawn dice «casa altrove» (autopilota, riaggancio, «apri qui lo stesso») richiede e diventa remoto.
    expect(t).toContain('if (c.casa === true) forzaQui.current = false')
    // Il «da dove» del Core legge la casa memorizzata.
    const main = src('main/index.ts')
    expect(main).toContain('ospiteGlobale?.casaAltroveDi(sessione)')
    // Dalla prima istante, anche prima che il servizio delle case sia pronto.
    expect(main).toContain("impostaGuardiaCasa((s, autopilota) => {")
  })
})

/**
 * Caso NexoraOS (diario dell'autopilota, 07/10 16:24 UTC): «in 90 secondi il
 * terminale della chat non è nato». La chat dell'autopilota aveva la casa su un
 * altro PC per la **regola** della migrazione (02/10): il cancello della 0.52.0
 * rifiutava l'avvio e il riquadro diventava remoto. Una chat governata vive sul
 * PC del suo autopilota; una scelta di Nicholas resta.
 */
describe('la chat di un autopilota e il cancello dell’ospite (0.52.5)', () => {
  const src = (p: string): string => readFileSync(join(__dirname, '../../src', p), 'utf8')
  const governata = (pc: Pc, s: string): ReturnType<typeof leggiChatAltrove> | 'parte' => {
    const ap = { id: 'ap-esempio', chat: 'ch-1' }
    try {
      fermaSeCasaAltrove({ sessionUuid: s, cwd: 'C:\\Money', autopilota: ap }, (x, a) => a !== undefined ? pc.ospite.casaAltrovePerAutopilota(x, a.id) : pc.ospite.casaAltroveDi(x))
      return 'parte'
    } catch (e) { return leggiChatAltrove(e) }
  }

  it('casa altrove per la regola: la chat governata parte qui, la casa diventa questo PC e lo sa anche l’altro PC', async () => {
    const { a, b } = due()
    // Come il 02/10: la regola ha messo la casa su DESKTOP.
    await a.unaCasa.memorizza({ money: { pc: 'desk', pcNome: 'DESKTOP', motivo: 'la sua cartella c’è solo su DESKTOP', decisaIl: '2026-10-02T14:45:00.000Z', da: 'regola' } })
    // Una chat qualunque resta ferma: il cancello vale come prima.
    expect(avvio(a, 'money')).toMatchObject({ casa: true })
    // Quella governata da un autopilota di qui parte.
    expect(governata(a, 'money')).toBe('parte')
    // E da adesso la casa è qui, anche per le chat non governate e sul disco.
    expect(avvio(a, 'money')).toBe('parte')
    await new Promise((r) => setTimeout(r, 50))
    expect(a.unaCasa.casaDi('money')).toMatchObject({ pc: 'fisso', da: 'sposta' })
    expect(a.unaCasa.casaDi('money')?.motivo).toContain('autopilota')
    // L'altro PC lo sa subito (rotta /api/case): su DESKTOP non parte più.
    expect(b.unaCasa.casaDi('money')).toMatchObject({ pc: 'fisso' })
    expect(avvio(b, 'money')).toMatchObject({ casa: true, pc: { id: 'fisso' } })
  })

  it('casa altrove scelta da Nicholas: resta altrove anche per l’autopilota', async () => {
    const { a } = due()
    await a.ospite.scegli({ sessioni: ['money'], pc: { id: 'desk', nome: 'DESKTOP' } })
    expect(governata(a, 'money')).toMatchObject({ casa: true, pc: { id: 'desk', nome: 'DESKTOP' } })
    expect(a.unaCasa.casaDi('money')).toMatchObject({ pc: 'desk', da: 'nicholas' })
  })

  it('casa qui o nessuna casa: parte, senza toccare niente', () => {
    const { a } = due()
    expect(governata(a, 'sito')).toBe('parte')
    expect(a.unaCasa.casaDi('sito')).toBeUndefined()
  })

  it('nel codice: lo spawn passa l’autopilota al cancello, e la guardia lo usa anche prima che l’ospite sia pronto', () => {
    const main = src('main/index.ts')
    expect(main).toContain('ospiteGlobale.casaAltrovePerAutopilota(s, autopilota.id)')
    expect(main).toContain('casaPerAutopilota({ casa: daDisco.case.case[s]')
    expect(main).toContain('for (const [s, ap] of daPrendereDopo) ospite.casaAltrovePerAutopilota(s, ap)')
    // La richiesta di spawn porta l'autopilota (Terminal) e il cancello la legge tutta.
    expect(src('renderer/components/Terminal.tsx')).toContain('...(ora.autopilota !== undefined ? { autopilota: ora.autopilota } : {})')
    expect(src('shared/ospite-chat.ts')).toContain('const fuori = casa(req.sessionUuid, req.autopilota)')
  })
})
