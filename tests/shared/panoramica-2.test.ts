import { describe, it, expect } from 'vitest'
import {
  adessoEFinite, colonnePiano, criteriVista, pianoAutopilota, righeDalVivo, separaConversazione, situazioneAutopilota, statoCoerente,
  type SchedaChat
} from '@shared/panoramica'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'

/** 0.78.0: la Panoramica 2 (Nicholas, 16/10: «puoi fare meglio»), rivista da un agente UI/UX. */
const ORA = Date.parse('2026-10-16T12:20:00.000Z')
const ap = (x: Partial<Autopilota> = {}): Autopilota => ({
  ...nuovoAutopilota({ id: 'ap-1', nome: 'Prova', obiettivo: 'Riga uno\n\nriga due', cwd: 'C:\\p', criteri: [], iniziatoIl: '2026-10-16T12:00:00.000Z' }),
  ...x
})
const chat = (id: string, compito: string, stato: ChatGovernata['stato'], x: Partial<ChatGovernata> = {}): ChatGovernata => ({ id, compito, stato, cicli: 1, sessionId: `s-${id}`, ...x })

describe('statoCoerente', () => {
  it('«finito» con criteri non tutti soddisfatti è «da verificare» in ambra, mai verde', () => {
    const a = ap({ stato: 'finito', criteri: [{ descrizione: 'a', soddisfatto: false }, { descrizione: 'b', soddisfatto: false }] })
    const s = statoCoerente(a, ORA)
    expect(s).toMatchObject({ id: 'da-verificare', parola: 'da verificare', colore: 'ambra', simbolo: '◐' })
    expect(s.ragione).toContain('0 su 2')
  })
  it('«finito» verde con ✓ solo con tutti i criteri soddisfatti; senza criteri grigio', () => {
    expect(statoCoerente(ap({ stato: 'finito', criteri: [{ descrizione: 'a', soddisfatto: true }] }), ORA)).toMatchObject({ parola: 'finito', colore: 'verde', simbolo: '✓' })
    expect(statoCoerente(ap({ stato: 'finito' }), ORA)).toMatchObject({ parola: 'finito', colore: 'quieto' })
  })
})

describe('situazione e criteri', () => {
  it('obiettivo intero in una riga (le 2 righe le fa chi disegna), criteri con esito e prova', () => {
    const a = ap({
      criteri: [
        { descrizione: 'test verdi', comando: 'npm test', soddisfatto: true, raggiuntoIl: '2026-10-16T12:10:00.000Z', ultimaVerifica: { quando: '2026-10-16T12:10:00.000Z', codice: 0, uscita: 'riga\n10 superati\n' } },
        { descrizione: 'compila', comando: 'tsc', soddisfatto: false, ultimaVerifica: { quando: '2026-10-16T12:11:00.000Z', codice: 2, uscita: 'errore TS2304' } },
        { descrizione: 'mai visto', soddisfatto: false }
      ]
    })
    const s = situazioneAutopilota(a, ORA)
    expect(s.obiettivo).toBe('Riga uno riga due')
    expect(s.criteri).toMatchObject({ fatti: 1, totali: 3, testo: '1/3' })
    expect(criteriVista(a).map((c) => c.esito)).toEqual(['si', 'no', 'mai'])
    expect(criteriVista(a)[0]?.prova).toBe('npm test: 10 superati')
  })
})

describe('pianoAutopilota', () => {
  it('da fare, in corso, in revisione, fatto, con lo specialista; le Revisioni stanno sul compito che rivedono', () => {
    const a = ap({
      stato: 'lavoro',
      compitiDaFare: ['Docs'],
      ruoliCompiti: { Docs: { ruolo: 'interfaccia', dopo: [] } },
      chats: [
        chat('c-1', 'Somma', 'finita', { ruolo: 'sviluppo', approvata: true }),
        chat('c-2', 'Media', 'finita', { ruolo: 'sviluppo', rifacimenti: 1 }),
        chat('c-3', 'Collauda', 'lavoro', { ruolo: 'collaudo' }),
        chat('c-4', 'Rivedi c-2', 'lavoro', { ruolo: 'revisione', revisioneDi: 'c-2' }),
        chat('c-5', 'Bloccato', 'bloccata', { ruolo: 'sviluppo' })
      ]
    })
    const col = colonnePiano(pianoAutopilota(a))
    expect(col.map((c) => c.nome)).toEqual(['Da fare', 'In corso', 'In revisione', 'Fatto'])
    expect(col.map((c) => c.compiti.map((x) => x.testo))).toEqual([['Docs'], ['Bloccato', 'Collauda'], ['Media'], ['Somma']])
    const media = col[2]!.compiti[0]!
    expect(media).toMatchObject({ ruolo: 'revisione', autore: 'sviluppo', sessione: 's-c-4', giri: 1 })
    expect(col[1]!.compiti[0]).toMatchObject({ nota: 'aspetta una risposta', sessione: 's-c-5' })
    expect(col[0]!.compiti[0]).toMatchObject({ ruolo: 'interfaccia' })
  })
  it('con l’autopilota finito ogni chat finita è fatta; un compito rifatto compare una volta', () => {
    const a = ap({ stato: 'finito', chats: [chat('c-1', 'Somma', 'finita', { ruolo: 'sviluppo' }), chat('c-6', 'Somma', 'finita', { ruolo: 'sviluppo' })] })
    const p = pianoAutopilota(a)
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ id: 'c-6', fase: 'fatto' })
  })
  it('la chat unica è un compito solo; non partito, niente', () => {
    expect(pianoAutopilota(ap({ stato: 'lavoro', sessionId: 's-x' }))).toEqual([expect.objectContaining({ fase: 'in-corso', sessione: 's-x', testo: 'Prova' })])
    expect(pianoAutopilota(ap({ stato: 'intervista' }))).toEqual([])
  })
})

describe('adessoEFinite', () => {
  it('in «Adesso» solo chi aspetta te e chi lavora, prima chi aspetta; il resto nelle finite', () => {
    const s = (id: string, stato: SchedaChat['stato']): SchedaChat => ({ id, titolo: id, stato, nataIl: 0 })
    const { adesso, finite } = adessoEFinite([s('a', 'ferma'), s('b', 'lavora'), s('c', 'finita'), s('d', 'chiede')])
    expect(adesso.map((x) => x.id)).toEqual(['d', 'b'])
    expect(finite.map((x) => x.id)).toEqual(['a', 'c'])
  })
})

describe('separaConversazione', () => {
  it('a sinistra solo tu e lui; le note in «Cosa è successo», dalla più recente', () => {
    const b = [{ da: 'tu' as const, t: 1 }, { da: 'nota' as const, t: 2 }, { da: 'lui' as const, t: 3 }, { da: 'nota' as const, t: 4 }]
    const r = separaConversazione(b)
    expect(r.messaggi.map((x) => x.t)).toEqual([1, 3])
    expect(r.eventi.map((x) => x.t)).toEqual([4, 2])
  })
})

describe('0.78.0: le linguette con molte chat che chiedono', () => {
  it('26 chat che chiedono (copia dei dati veri): al più 9 linguette in vista, la chat aperta fra queste, le altre in «Altre»', async () => {
    const { linguetteVisibili, LARGHEZZA_FISSA, LARGHEZZA_LINGUETTA } = await import('@shared/panoramica')
    const chat: SchedaChat[] = Array.from({ length: 28 }, (_, i) => ({ id: `c${i}`, titolo: `c${i}`, stato: i < 26 ? 'chiede' : 'ferma', nataIl: i }))
    const { visibili, altre } = linguetteVisibili(LARGHEZZA_FISSA + 20 * LARGHEZZA_LINGUETTA, chat, 'c27')
    expect(visibili).toHaveLength(9)
    expect(visibili.map((x) => x.id)).toContain('c27')
    expect(altre).toHaveLength(19)
  })
})

describe('0.78.0: l’ultima azione non è il riepilogo del turno', () => {
  it('«✻ Churned for 22s · done 17:31» non è un’azione: vale la riga prima', async () => {
    const { ultimaAzioneDalVivo } = await import('@shared/panoramica')
    expect(ultimaAzioneDalVivo(['● Ecco i 3 test proposti', '✻ Churned for 22s · done 17:31'])).toBe('● Ecco i 3 test proposti')
  })
})

describe('0.78.0: righe dal vivo più pulite', () => {
  it('cornici con un titolo dentro, bordi di casella, testata e riga di stato, doppioni', () => {
    const schermo = [
      '╭─── Claude Code v2.1.301 ───────────────────────╮',
      '│ ▐▛███▜▌  Opus 5.5 · Claude Max │',
      '──────────── Chat B ────────────────────────',
      '│ Scrivo src/somma.js │',
      '● Fatto il test',
      '  … +18 lines (ctrl+o to expand)',
      '● Fatto il test',
      'Opus 5.5 · settimana 12% · $3'
    ]
    expect(righeDalVivo(schermo, 6)).toEqual(['Scrivo src/somma.js', '● Fatto il test'])
  })
})
