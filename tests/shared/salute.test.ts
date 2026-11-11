import { describe, it, expect } from 'vitest'
import { componiSalute, erroriDalLog, quantoFa, type IngressiSalute } from '@shared/salute'

/**
 * 0.44.0, «Salute del sistema». Le righe del registro sono vere (registro
 * di questo PC del 02/10).
 */
const ADESSO = Date.parse('2026-10-02T15:00:00.000Z')
const REGISTRO = [
  '2026-10-02T01:23:45.181Z [info] [app] [client] SM-S938B (::ffff:100.64.0.11) collegato',
  "2026-10-02T13:53:17.744Z [info] [app] automatico: salvataggio non riuscito (LAVORO_IN_CORSO: sul Drive sta gia' girando «Salvo sul Drive».",
  "2026-10-02T14:08:17.751Z [info] [app] automatico: salvataggio non riuscito (LAVORO_IN_CORSO: sul Drive sta gia' girando «Salvo sul Drive».",
  '2026-10-02T14:43:16.932Z [ERRORE] [app] [electron-updater] Cannot download differentially, fallback to full download: Error: sha512 checksum mismatch',
  "2026-10-02T14:46:10.769Z [ERRORE] [app] [sistema] il lavoro con il Drive (arrivo) non e' finito in tempo: non chiudo",
  '    at newError (C:\\Users\\utente\\AppData\\Local\\Programs\\SierraDeck\\resources\\app.asar\\node_modules\\builder-util-runtime\\out\\error.js:5:19)',
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

  it('11/11: le righe che raccontano (risposte e domande dell’autopilota, quello che gli scrivi) non sono errori', () => {
    const righe = [
      '2026-10-02T14:00:00.000Z [info] [servizio] [orchestratore] Lavoro — risponde: La correzione non è entrata nel progetto: 86 prove passate e 2 fallite, il tentativo è stato rifiutato.',
      '2026-10-02T14:01:00.000Z [info] [servizio] [orchestratore] Lavoro — domanda vista in chat ma senza risposta: passa nelle Domande: Le unioni non riuscite le riprovo io o le lascio a te?',
      '2026-10-02T14:02:00.000Z [info] [servizio] [orchestratore] Lavoro — domanda superata dalla richiesta r-68 (fatta), chiusa: Correggo le tre prove fallite?',
      '2026-10-02T14:03:00.000Z [info] [servizio] [orchestratore] Lavoro — domanda non vista in chat: passa nelle Domande: Rilancio il salvataggio non riuscito?',
      '2026-10-02T14:04:00.000Z [info] [servizio] [domande] ap-1 — la tua risposta «anche negli altri PC il salvataggio è fallito» (modale): ricevuta'
    ]
    expect(erroriDalLog(righe, ADESSO, 6)).toEqual([])
  })

  it('11/11: un conto a zero non è un guasto, un conto vero sì', () => {
    const zero = '2026-10-02T14:00:00.000Z [info] [app] [spazio] versioni vecchie tolte su conferma: 0 (0 byte), 0 rifiutate dal Drive, 0 errori'
    const dieci = '2026-10-02T14:05:00.000Z [info] [app] [spazio] versioni vecchie tolte su conferma: 4 (900 byte), 10 rifiutate dal Drive, 0 errori'
    expect(erroriDalLog([zero], ADESSO, 6)).toEqual([])
    expect(erroriDalLog([zero, dieci], ADESSO, 6).map((x) => x.messaggio)).toEqual([dieci.slice(dieci.indexOf('[app]'))])
  })

  it('11/11: un guasto vero dell’autopilota e una riga [ERRORE] che racconta contano ancora', () => {
    const righe = [
      '2026-10-02T14:00:00.000Z [info] [servizio] [orchestratore] Lavoro — turno non riuscito per la rete, riprovo: ENOTFOUND',
      '2026-10-02T14:01:00.000Z [ERRORE] [servizio] [orchestratore] Lavoro — risponde: qualcosa che il servizio ha scritto come errore',
      '2026-10-02T14:02:00.000Z [info] [app] [posta] giro fallito (non lo ripeto finche\' non torna a rispondere): Error: rete'
    ]
    expect(erroriDalLog(righe, ADESSO, 6)).toHaveLength(3)
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
  it('0.89.0: «installazione non riuscita» di una sessione di prima dell’avvio non conta; dopo sì', () => {
    const righe = [
      '2026-10-31T21:37:20.000Z [INFO] [aggiornamenti] INSTALLAZIONE NON RIUSCITA: Ho provato a installare la 0.88.6',
      '2026-10-31T21:37:20.000Z [INFO] [aggiornamenti] diario di SierraDeck Update: 21:37:11 installer terminato (codice 0)',
      '2026-10-31T21:38:00.000Z [INFO] SALVA fallito: rete',
      '2026-10-31T22:30:00.000Z [INFO] [aggiornamenti] INSTALLAZIONE NON RIUSCITA: Ho provato a installare la 0.89.0'
    ]
    const adesso = Date.parse('2026-10-31T23:00:00.000Z')
    const e = erroriDalLog(righe, adesso, 6, Date.parse('2026-10-31T22:00:00.000Z')).map((x) => x.messaggio)
    expect(e).toEqual(['[aggiornamenti] INSTALLAZIONE NON RIUSCITA: Ho provato a installare la 0.89.0', 'SALVA fallito: rete'])
    expect(erroriDalLog(righe, adesso, 6).map((x) => x.volte)).toEqual([2, 1])
  })
})

describe('un PC che risponde non è «nessuna strada» (05/11)', () => {
  const pcConStato = (stato: string) => componiSalute({ ...base, pc: [{ pcId: 'p1', nome: 'PC-ESEMPIO', versione: '0.44.0', battito: new Date(ADESSO - 60_000).toISOString(), stato }] }).voci.find((v) => v.chiave === 'pc:p1')!
  it('chiave: lo dice, con cosa fare', () => {
    const v = pcConStato('chiave')
    expect(v.spiegazione).toContain('risponde ma non riconosce la chiave')
    expect(v.spiegazione).not.toContain('nessuna strada')
    expect(v.cosaFare).toContain('cassaforte')
  })
  it('altro: a quell’indirizzo risponde un altro', () => {
    const v = pcConStato('altro')
    expect(v.spiegazione).toContain('risponde un altro')
    expect(v.titolo).not.toContain('non so se è acceso')
  })
  it('muto: resta «nessuna strada»', () => {
    expect(pcConStato('non-so').spiegazione).toContain('non risponde a nessuna strada')
  })
})

describe('«Quanto lavora SierraDeck» e i battiti vecchi', () => {
  const mie = { cpu: 0, ramMb: 409, processi: 5, driveAlMinuto: 0, drivePerTipo: {}, driveRifiutate: 0, misuratoIl: new Date(ADESSO).toISOString() }
  const altro = { ...mie, cpu: 3, driveAlMinuto: 40, driveRifiutate: 25 }
  const voce = (battito: string) => componiSalute({ ...base, risorse: mie, pc: [{ pcId: 'p9', nome: 'PC-FINTO', versione: '0.90.0', battito, risorse: altro }] }).voci.find((v) => v.chiave === 'risorse')!
  it('con pochi consumi qui il tono è ok', () => {
    expect(voce(new Date(ADESSO - 60_000).toISOString()).tono).toBe('ok')
  })
  it('battito recente: i numeri dell’altro PC si vedono, con le rifiutate', () => {
    const v = voce(new Date(ADESSO - 60_000).toISOString())
    expect(v.spiegazione).toContain('PC-FINTO: CPU 3%')
    expect(v.spiegazione).toContain('Google ne ha rifiutate')
  })
  it('battito vecchio: niente numeri, si dice di quando è, niente frase sulle rifiutate', () => {
    const v = voce(new Date(ADESSO - 4 * 86_400_000).toISOString())
    expect(v.spiegazione).toContain('PC-FINTO: nessun dato di adesso (ultimo battito 4 giorni fa)')
    expect(v.spiegazione).not.toContain('PC-FINTO: CPU')
    expect(v.spiegazione).not.toContain('rifiutate')
  })
})
