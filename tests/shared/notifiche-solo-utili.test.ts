import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nuovoAutopilota, riparteDaSolo, type Autopilota } from '../../src/shared/autopilota'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { paginaClient } from '../../src/main/client-pagina'

/**
 * Notifiche solo utili (0.81.0): un fermo che riparte da solo (limiti del
 * piano, aggiornamento) non avvisa, su Telegram, pagina e app. La regola è sul
 * PC (`riparteDaSolo`), che la manda in `/api/stato`.
 */
const ap = (over: Partial<Autopilota>): Autopilota => ({
  ...nuovoAutopilota({ id: 'ap-1', nome: 'Notte', obiettivo: 'x', cwd: 'C:\\Progetti\\Esempio', criteri: [], iniziatoIl: '2026-10-19T10:00:00.000Z' }),
  ...over
})

describe('la regola: chi riparte da solo', () => {
  it('pausa per i limiti o per un aggiornamento sì; un errore o una domanda no', () => {
    expect(riparteDaSolo(ap({ stato: 'sospeso', pausaLimitiFinoA: '2026-10-19T12:00:00.000Z' }))).toBe(true)
    expect(riparteDaSolo(ap({ stato: 'sospeso', fermatoPerAggiornamento: true }))).toBe(true)
    expect(riparteDaSolo(ap({ stato: 'sospeso', motivoSospensione: 'la preparazione si e guastata' }))).toBe(false)
    expect(riparteDaSolo(ap({ stato: 'fallito' }))).toBe(false)
    // La revisione: un fallito con una pausa rimasta addosso non riparte mai, e avvisa.
    expect(riparteDaSolo(ap({ stato: 'fallito', pausaLimitiFinoA: '2026-10-19T12:00:00.000Z' }))).toBe(false)
  })
})

describe('/api/stato lo dice a pagina e app', () => {
  const deps = (autopiloti: Autopilota[]): DipendenzeRotte => ({
    dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-notifiche-'))),
    chat: () => [], autopiloti: () => Promise.resolve(autopiloti), rispondi: () => Promise.resolve(), domande: () => Promise.resolve([]),
    scriviAChat: () => undefined, apriChat: () => undefined, cartelle: () => Promise.resolve([]),
    workspace: () => Promise.resolve({ nomi: ['Lavoro'], attivo: 'Lavoro' }), cambiaWorkspace: () => Promise.resolve(),
    fermaAutopilota: () => Promise.resolve(), riprendiAutopilota: () => Promise.resolve(), vaiAutopilota: () => Promise.resolve(),
    creaAutopilota: () => Promise.resolve({ id: 'ap-9' }), eliminaAutopilota: () => Promise.resolve(), riprendiAlRiavvio: () => Promise.resolve(),
    chiudiChat: () => undefined, rinominaChat: () => undefined, sessioni: () => Promise.resolve([]), riprendiSessione: () => undefined,
    creaWorkspace: () => Promise.resolve(), eliminaWorkspace: () => Promise.resolve(), salvataggi: () => Promise.resolve([]),
    caricaIstantanea: () => Promise.resolve(), consumi: () => Promise.resolve({}), quaderno: () => [], scheda: () => undefined,
    impostaPreferenze: () => Promise.resolve(), aggiornamento: () => ({ fase: 'fermo' as const }), cercaAggiornamento: () => undefined,
    scaricaAggiornamento: () => undefined, installaAggiornamento: () => undefined, versione: '0.81.0', apk: () => Promise.resolve(undefined)
  } as unknown as DipendenzeRotte)

  it('riparteDaSolo solo sui fermi che ripartono da soli', async () => {
    const r = await rotteClient(deps([
      ap({ id: 'ap-pausa', stato: 'sospeso', pausaLimitiFinoA: '2026-10-19T12:00:00.000Z', fermatoIl: '2026-10-19T10:30:00.000Z' }),
      ap({ id: 'ap-rotto', stato: 'sospeso', motivoSospensione: 'la verifica non parte', fermatoIl: '2026-10-19T10:30:00.000Z' })
    ]))({ metodo: 'GET', percorso: '/api/stato', corpo: undefined })
    const lista = (r.corpo as { autopiloti: { id: string; riparteDaSolo?: boolean }[] }).autopiloti
    expect(lista.find((a) => a.id === 'ap-pausa')?.riparteDaSolo).toBe(true)
    expect(lista.find((a) => a.id === 'ap-rotto')?.riparteDaSolo).toBeUndefined()
  })
})

describe('la pagina non annuncia un fermo che riparte da solo', () => {
  const html = paginaClient()
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
  it('lo salta, ma annuncia ancora gli altri', () => {
    expect(script).toContain("a.riparteDaSolo === true")
    // Il filtro sta sulla riga che decide se annunciare il fermo, prima del «si è fermato».
    const i = script.indexOf("a.riparteDaSolo === true")
    expect(i).toBeGreaterThan(0)
    expect(script.indexOf(' si è fermato', i)).toBeGreaterThan(i)
  })
})
