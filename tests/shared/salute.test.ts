import { describe, it, expect } from 'vitest'
import { componiSalute, erroriDalLog, quantoFa, type IngressiSalute } from '@shared/salute'

/**
 * 0.44.0, «Salute del sistema». Le righe del registro sono vere (registro
 * di questo PC del 02/10).
 */
const ADESSO = Date.parse('2026-10-02T15:00:00.000Z')
const REGISTRO = [
  '2026-10-02T01:23:45.181Z [info] [app] [client] SM-S938B (::ffff:100.120.40.52) collegato',
  "2026-10-02T13:53:17.744Z [info] [app] automatico: salvataggio non riuscito (LAVORO_IN_CORSO: sul Drive sta gia' girando «Salvo sul Drive».",
  "2026-10-02T14:08:17.751Z [info] [app] automatico: salvataggio non riuscito (LAVORO_IN_CORSO: sul Drive sta gia' girando «Salvo sul Drive».",
  '2026-10-02T14:43:16.932Z [ERRORE] [app] [electron-updater] Cannot download differentially, fallback to full download: Error: sha512 checksum mismatch',
  "2026-10-02T14:46:10.769Z [ERRORE] [app] [sistema] il lavoro con il Drive (arrivo) non e' finito in tempo: non chiudo",
  '    at newError (C:\\Users\\nikof\\AppData\\Local\\Programs\\SierraDeck\\resources\\app.asar\\node_modules\\builder-util-runtime\\out\\error.js:5:19)',
  '2026-10-02T03:00:00.000Z [ERRORE] [app] troppo vecchio per le ultime 6 ore'
]
const base: IngressiSalute = {
  adesso: ADESSO, versione: '0.44.0', oreErrori: 6,
  drive: { configurato: true, connesso: true, ultimoSalvataggio: '2026-10-02T14:30:00.000Z' },
  pc: [], errori: [], consegne: []
}

describe('gli errori dal registro', () => {
  it('le righe [ERRORE] e i «non riuscito» delle ultime ore, raggruppati, dalla più recente', () => {
    const e = erroriDalLog(REGISTRO, ADESSO, 6)
    expect(e.map((x) => x.volte)).toEqual([1, 1, 2])
    expect(e[0]?.messaggio).toContain('non e\' finito in tempo')
    expect(e[2]?.messaggio).toContain('salvataggio non riuscito')
    expect(e[2]?.primo).toBe('2026-10-02T13:53:17.744Z')
    // Le righe dello stack e quelle troppo vecchie non contano.
    expect(e.some((x) => x.messaggio.includes('troppo vecchio'))).toBe(false)
  })
})

describe('le voci del pannello', () => {
  it('tutto a posto: Drive collegato, nessun altro PC, nessun errore', () => {
    const s = componiSalute(base)
    expect(s.tono).toBe('ok')
    expect(s.riassunto).toBe('Tutto a posto.')
    expect(s.voci.map((v) => v.gruppo)).toEqual(['drive', 'pc', 'errori'])
    expect(s.voci[0]?.spiegazione).toContain('Ultimo salvataggio: 30 minuti fa')
  })
  it('Drive scollegato: guasto, con il perché e l’azione per ricollegarlo', () => {
    const s = componiSalute({ ...base, drive: { configurato: true, connesso: false, titolo: 'Drive scollegato da 9 giorni: gli altri PC non si vedono', testo: 'Il 23/09 Google ha rifiutato…' } })
    const d = s.voci[0]
    expect(d).toMatchObject({ tono: 'guasto', titolo: 'Drive scollegato da 9 giorni: gli altri PC non si vedono' })
    expect(d?.azioni[0]?.id).toBe('apri-drive')
    expect(s.tono).toBe('guasto')
  })
  it('ogni PC: ultimo battito, strada, versione; indietro o non raggiungibile con cosa fare', () => {
    const s = componiSalute({
      ...base,
      pc: [
        { pcId: 'lap', nome: 'LAPTOP', versione: '0.38.2', battito: '2026-10-02T14:58:00.000Z', stato: 'acceso', strada: 'Tailscale' },
        { pcId: 'uff', nome: 'UFFICIO', versione: '0.44.0', battito: '2026-09-23T03:34:56.764Z', stato: 'non-so' }
      ]
    })
    const lap = s.voci.find((v) => v.chiave === 'pc:lap')
    expect(lap?.titolo).toBe('LAPTOP · acceso · 0.38.2')
    expect(lap?.spiegazione).toContain('Ultimo battito sul Drive: 2 minuti fa')
    expect(lap?.spiegazione).toContain('via Tailscale')
    expect(lap?.cosaFare).toContain('LAPTOP')
    expect(lap?.tono).toBe('attenzione')
    // 0.46.0: indietro e raggiungibile = «Installa là» con la versione di qui.
    expect(lap?.azioni[0]).toMatchObject({ id: 'installa-la', pc: 'lap', versione: '0.44.0' })
    expect(lap?.cosaFare).toContain('Installa là')
    const uff = s.voci.find((v) => v.chiave === 'pc:uff')
    expect(uff?.titolo).toContain('non so se è acceso')
    expect(uff?.spiegazione).toContain('9 giorni fa')
    expect(uff?.azioni[0]).toMatchObject({ id: 'riprova-pc', pc: 'uff' })
  })
  it('l’installazione non riuscita, gli errori e le consegne non partite', () => {
    const s = componiSalute({
      ...base,
      tentativoFallito: { titolo: 'Ho provato a installare la 0.44.1 alle 16:00, ma sei ancora sulla 0.44.0.', motivo: 'Probabilmente Smart App Control.', strade: ['Scaricala a mano.'], pagina: 'https://github.com/niko9090/sierradeck/releases/tag/v0.44.1', versione: '0.44.1' },
      errori: erroriDalLog(REGISTRO, ADESSO, 6),
      consegne: [{ autopilota: 'ap-1', nome: 'Notte', quando: '2026-10-02T14:00:00.000Z', chat: 'Trading', esito: 'non-partita', inizio: 'Leggi ed esegui…' }]
    })
    const a = s.voci.find((v) => v.gruppo === 'aggiornamento')
    expect(a?.azioni.map((x) => x.id)).toEqual(['installa', 'scarica-a-mano'])
    expect(s.voci.filter((v) => v.gruppo === 'errori')).toHaveLength(3)
    const c = s.voci.find((v) => v.gruppo === 'consegne')
    expect(c?.titolo).toContain('non partita nella chat «Trading» (1 ore fa)'.replace('1 ore fa', '1 ora fa'))
    expect(c?.azioni[0]).toMatchObject({ id: 'apri-autopilota', autopilota: 'ap-1' })
    expect(s.riassunto).toBe('2 cose da sistemare · 3 da guardare')
  })
  it('una chat ferma per un errore dell’API (segnale StopFailure) è un guasto con cosa fare', () => {
    const s = componiSalute({ ...base, chatInErrore: [{ titolo: 'Trading', errore: 'rate_limit: Claude usage limit reached' }] })
    const v = s.voci.find((x) => x.chiave === 'chat-errore:Trading')
    expect(v?.tono).toBe('guasto')
    expect(v?.titolo).toContain('rate_limit')
    expect(v?.cosaFare).toContain('/login')
  })
  it('ogni voce ha una spiegazione per esteso', () => {
    const s = componiSalute({ ...base, drive: { configurato: false, connesso: false }, errori: erroriDalLog(REGISTRO, ADESSO, 6) })
    for (const v of s.voci) expect(v.spiegazione.length, v.chiave).toBeGreaterThan(40)
  })
  it('quanto fa', () => {
    expect(quantoFa(undefined, ADESSO)).toBe('mai')
    expect(quantoFa('2026-10-02T14:59:30.000Z', ADESSO)).toBe('adesso')
    expect(quantoFa('2026-09-30T15:00:00.000Z', ADESSO)).toBe('2 giorni fa')
  })
})
