import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rotteClient, rotteLibere, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { nuovoAutopilota } from '@shared/autopilota'

/**
 * Il PC con le app vecchie (0.43.0). Nicholas (02/10): «sempre compatibile
 * con le versioni precedenti», anche al contrario: una 0.43 non deve rompere
 * un'app 2.39 (o più vecchia) rimasta sul telefono.
 *
 * `tests/fixtures/app-2.39-modelli.json` sono i modelli dell'app 2.39.0 come
 * erano nel git (tag v0.36.0, `Modelli.kt`): per ogni campo il tipo Kotlin e
 * se è obbligatorio (senza un predefinito). kotlinx.serialization con
 * `ignoreUnknownKeys` sopporta i campi nuovi, ma non un campo obbligatorio
 * che manca, né un campo che cambia tipo (una stringa dove c'era un elenco).
 * Qui si chiamano le rotte di oggi e si controlla la loro forma contro quei
 * modelli, con dati che accendono anche i campi nati dopo (parti delle
 * domande, strada verso gli altri PC, versione nel computer…).
 */
type Campo = { tipo: string; obbligatorio: boolean }
const modelli = (JSON.parse(readFileSync('tests/fixtures/app-2.39-modelli.json', 'utf8')) as { modelli: Record<string, Record<string, Campo>> }).modelli

/** I problemi di un valore JSON rispetto a un tipo Kotlin dell'app 2.39. */
function controlla(valore: unknown, tipo: string, dove: string, problemi: string[]): void {
  const nullabile = tipo.endsWith('?')
  const t = nullabile ? tipo.slice(0, -1) : tipo
  if (valore === null || valore === undefined) {
    if (valore === null && !nullabile) problemi.push(`${dove}: null dove l'app vuole ${tipo}`)
    return
  }
  const lista = /^List<(.+)>$/.exec(t)
  if (lista !== null) {
    if (!Array.isArray(valore)) { problemi.push(`${dove}: l'app vuole un elenco (${tipo})`); return }
    valore.forEach((x, i) => controlla(x, lista[1] as string, `${dove}[${i}]`, problemi))
    return
  }
  const mappa = /^Map<String, (.+)>$/.exec(t)
  if (mappa !== null) {
    if (typeof valore !== 'object' || Array.isArray(valore)) { problemi.push(`${dove}: l'app vuole un oggetto (${tipo})`); return }
    for (const [k, v] of Object.entries(valore as Record<string, unknown>)) controlla(v, mappa[1] as string, `${dove}.${k}`, problemi)
    return
  }
  if (t === 'String') { if (typeof valore !== 'string') problemi.push(`${dove}: l'app vuole una stringa`); return }
  if (t === 'Boolean') { if (typeof valore !== 'boolean') problemi.push(`${dove}: l'app vuole vero/falso`); return }
  if (t === 'Int' || t === 'Long') { if (typeof valore !== 'number' || !Number.isInteger(valore)) problemi.push(`${dove}: l'app vuole un intero`); return }
  if (t === 'Double' || t === 'Float') { if (typeof valore !== 'number') problemi.push(`${dove}: l'app vuole un numero`); return }
  if (t === 'JsonElement' || t === 'JsonObject') return
  const m = modelli[t]
  if (m === undefined) return
  if (typeof valore !== 'object' || Array.isArray(valore)) { problemi.push(`${dove}: l'app vuole un oggetto ${t}`); return }
  const o = valore as Record<string, unknown>
  for (const [nome, c] of Object.entries(m)) {
    if (c.obbligatorio && !(nome in o)) problemi.push(`${dove}.${nome}: manca, e per l'app 2.39 è obbligatorio`)
    if (nome in o) controlla(o[nome], c.tipo, `${dove}.${nome}`, problemi)
  }
}

function deps(over: Partial<DipendenzeRotte> = {}): DipendenzeRotte {
  return {
    dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-compat-'))),
    chat: () => [
      { id: 'p-1', titolo: 'Gestore', cwd: 'C:\\p', sessione: 's-1', aspetta: true, viva: true },
      { id: 'p-2', titolo: 'Trading', cwd: 'C:\\t', sessione: 's-2', viva: true, coda: ['❯ 1. Sì', '  2. No'] }
    ],
    autopiloti: () => Promise.resolve([
      { ...nuovoAutopilota({ id: 'ap-1', nome: 'Notte', obiettivo: 'Test', cwd: 'C:\\p',
        criteri: [{ descrizione: 'x', soddisfatto: true }, { descrizione: 'y', soddisfatto: false }],
        iniziatoIl: '2026-08-12T10:00:00.000Z' }), stato: 'attesa' as const, motivoSospensione: 'chiave?' }
    ]),
    rispondi: () => Promise.resolve(),
    // Una domanda con le parti della 0.41.0: un'app vecchia deve leggerla lo stesso.
    domande: () => Promise.resolve([{
      id: 'd-1', autopilotaId: 'ap-1', testo: '«Notte» ti chiede:\n\nQuale chiave?', opzioni: ['a', 'b'],
      parti: { staFacendo: 'rilascio', domanda: 'Quale chiave?', perche: 'due chiavi', scelte: [{ scelta: 'a', conseguenza: 'uso a' }, { scelta: 'b', conseguenza: 'uso b' }], seNonRispondi: 'aspetto' },
      avvertenza: undefined
    } as never]),
    scriviAChat: () => undefined,
    apriChat: () => undefined,
    cartelle: () => Promise.resolve(['C:\\lavoro']),
    workspace: () => Promise.resolve({ nomi: ['lavoro'], attivo: 'lavoro' }),
    cambiaWorkspace: () => Promise.resolve(),
    fermaAutopilota: () => Promise.resolve(),
    riprendiAutopilota: () => Promise.resolve(),
    vaiAutopilota: () => Promise.resolve(),
    creaAutopilota: () => Promise.resolve({ id: 'ap-9' }),
    eliminaAutopilota: () => Promise.resolve(),
    riprendiAlRiavvio: () => Promise.resolve(),
    chiudiChat: () => undefined,
    rinominaChat: () => undefined,
    sessioni: () => Promise.resolve([]),
    riprendiSessione: () => undefined,
    creaWorkspace: () => Promise.resolve(),
    eliminaWorkspace: () => Promise.resolve(),
    salvataggi: () => Promise.resolve([]),
    caricaIstantanea: () => Promise.resolve(),
    consumi: () => Promise.resolve({ oggi: { costo: 3.2, token: 120000 } }),
    quaderno: () => [],
    scheda: () => undefined,
    impostaPreferenze: () => Promise.resolve(),
    aggiornamento: () => ({ fase: 'fermo' as const }),
    cercaAggiornamento: () => undefined,
    scaricaAggiornamento: () => undefined,
    installaAggiornamento: () => undefined,
    versione: '0.43.0',
    nomeComputer: () => 'PC-Fisso',
    apk: () => Promise.resolve({ versione: '2.46.0', url: 'https://github.com/niko9090/sierradeck/releases/download/v0.43.0/SierraDeck-2.46.0.apk' }),
    // Le chat che aspettano su un altro PC, con la strada (0.40.0).
    pc: () => Promise.resolve([{ pcId: 'lap', nome: 'LAPTOP', versione: '0.43.0', battito: new Date().toISOString(), cartelle: [], chat: [{ sessione: 's-9', titolo: 'Sul portatile', cwd: 'C:\\x', aspetta: true }] }]),
    pcIo: () => 'fisso',
    scriviAltroPc: () => Promise.resolve({ ok: true as const }),
    stradaPc: () => 'Tailscale',
    avvisoDrive: () => ({ titolo: 'Drive scollegato', testo: 'ricollega', giorni: 9 }),
    ...over
  } as DipendenzeRotte
}

const giri: [string, string, string, unknown, string][] = [
  ['/api/stato', 'GET', '/api/stato', undefined, 'Stato'],
  ['/api/domande', 'GET', '/api/domande', undefined, 'Domande'],
  ['/api/autopilota', 'POST', '/api/autopilota', { autopilota: 'ap-1' }, 'AutopilotaDettaglio']
]

describe('le rotte di oggi lette da un’app 2.39', () => {
  for (const [nome, metodo, percorso, corpo, modello] of giri) {
    it(`${nome}: i campi obbligatori ci sono e nessun campo ha cambiato tipo`, async () => {
      expect(modelli[modello]).toBeDefined()
      const e = await rotteClient(deps())({ metodo, percorso, corpo, dispositivo: 'telefono' })
      expect(e.stato).toBe(200)
      const problemi: string[] = []
      controlla(e.corpo, modello, nome, problemi)
      expect(problemi).toEqual([])
    })
  }
  it('/api/app (senza chiave): versione e indirizzo dell’APK, come sempre', async () => {
    const e = await rotteLibere(deps())({ metodo: 'GET', percorso: '/api/app', corpo: undefined })
    const problemi: string[] = []
    controlla(e.corpo, 'AppScaricabile', '/api/app', problemi)
    expect(problemi).toEqual([])
    expect(e.corpo).toMatchObject({ versione: '2.46.0' })
  })
  it('/api/ciao: nome e versione, come sempre', async () => {
    const e = await rotteLibere(deps())({ metodo: 'GET', percorso: '/api/ciao', corpo: undefined })
    const problemi: string[] = []
    controlla(e.corpo, 'Ciao', '/api/ciao', problemi)
    expect(problemi).toEqual([])
  })
  it('il controllo trova davvero un campo che cambia tipo o che manca', () => {
    const problemi: string[] = []
    controlla({ chat: 'una stringa', autopiloti: [{ nome: 'x' }] }, 'Stato', 'finto', problemi)
    expect(problemi.some((p) => p.includes('finto.chat'))).toBe(true)
    expect(problemi.some((p) => p.includes('autopiloti[0].id: manca'))).toBe(true)
  })
  it('i modelli registrati sono quelli dell’app 2.39', () => {
    expect(Object.keys(modelli).length).toBeGreaterThan(50)
    expect(modelli.Chat?.id).toEqual({ tipo: 'String', obbligatorio: true })
  })
})
