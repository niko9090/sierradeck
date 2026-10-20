import { describe, it, expect } from 'vitest'
import { adessoDi, durata, MAI_PARTITA_DA_MS, MUTA_DA_MS, type SegniDalVivo } from '@shared/adesso'
import { conversazione, esitoRisposta } from '@shared/chat-autopilota'
import { conStatiDatati, nuovoAutopilota, parseAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'
import { tracciaDopoRisposta } from '@shared/domande-autopilota'

/**
 * Nicholas partecipe (0.81.0, 20/10): «non mi sento partecipe». Ha risposto a
 * domande senza vedere cosa ne è stato fatto, e c-14 e c-15 sono rimaste ferme
 * 844 minuti mentre la scheda le dava «al lavoro».
 */
const ORA = Date.parse('2026-10-20T09:00:00.000Z')
const MIN = 60_000
const iso = (ms: number): string => new Date(ms).toISOString()

const chat = (id: string, x: Partial<ChatGovernata> = {}): ChatGovernata =>
  ({ id, compito: `Il compito di ${id}. Altro.`, stato: 'lavoro', cicli: 2, sessionId: `s-${id}`, ...x })

const ap = (x: Partial<Autopilota> & SegniDalVivo = {}): Autopilota & SegniDalVivo => ({
  ...nuovoAutopilota({ id: 'ap-1', nome: 'Prova', obiettivo: 'Fare la cosa', cwd: 'C:\\p', criteri: [], iniziatoIl: '2026-10-20T06:00:00.000Z' }),
  stato: 'lavoro',
  sessionId: 's-ap',
  ...x
})

describe('durata: corta, in una riga', () => {
  it('minuti, ore, giorni', () => {
    expect(durata(20_000)).toBe('meno di un minuto')
    expect(durata(12 * MIN)).toBe('12 min')
    expect(durata(60 * MIN)).toBe('1 h')
    expect(durata(844 * MIN)).toBe('14 h 4 min')
    expect(durata(26 * 60 * MIN)).toBe('1 g 2 h')
  })
})

describe('il riquadro «Adesso»: una riga per chat', () => {
  it('IL CASO DEL 20/10: una chat aperta da ore senza un turno né un segno è ferma, «mai partita», e sta in cima', () => {
    const a = ap({
      chats: [
        chat('c-13', { dal: iso(ORA - 20 * MIN) }),
        chat('c-14', { cicli: 0, dal: iso(ORA - 844 * MIN) })
      ],
      segniChat: { 'c-13': iso(ORA - 2 * MIN) }
    })
    const { righe } = adessoDi(a, ORA)
    expect(righe[0]).toMatchObject({ id: 'c-14', tono: 'ferma' })
    expect(righe[0]?.testo).toBe('non è ancora partita: aperta 14 h 4 min fa, nessun segno')
    expect(righe[1]).toMatchObject({ id: 'c-13', tono: 'lavoro', testo: 'al lavoro da 20 min' })
  })

  it('appena aperta non è ancora «mai partita»: le si dà il tempo di partire', () => {
    const a = ap({ chats: [chat('c-1', { cicli: 0, dal: iso(ORA - (MAI_PARTITA_DA_MS - MIN)) })] })
    expect(adessoDi(a, ORA).righe[0]?.tono).toBe('lavoro')
  })

  it('al lavoro ma senza segni da un quarto d’ora: ferma, con da quanto', () => {
    const a = ap({ chats: [chat('c-1', { dal: iso(ORA - 60 * MIN) })], segniChat: { 'c-1': iso(ORA - MUTA_DA_MS - 5 * MIN) } })
    expect(adessoDi(a, ORA).righe[0]).toMatchObject({ tono: 'ferma', testo: 'nessun segno da 20 min' })
  })

  it('messa da parte (0.80.1): ferma, e dice che torna da sola', () => {
    const a = ap({ chats: [chat('c-1', { dal: iso(ORA - 40 * MIN) })], daParte: ['c-1'] })
    expect(adessoDi(a, ORA).righe[0]?.testo).toBe('ferma da 40 min: non chiude un turno, messa da parte. Torna da sola appena risponde')
  })

  it('chi aspetta te lo dice, con da quanto; prima le ferme, poi chi aspetta, poi le altre', () => {
    const a = ap({
      chats: [
        chat('c-1', { ultimaAzione: 'Scrivo i test.' }),
        chat('c-2', { stato: 'bloccata', dal: iso(ORA - 65 * MIN) }),
        chat('c-3', { stato: 'finita' }),
        chat('c-4', { ruolo: 'revisione' })
      ],
      daParte: ['c-4']
    })
    const { righe, finite } = adessoDi(a, ORA)
    expect(righe.map((r) => r.id)).toEqual(['c-4', 'c-2', 'c-1'])
    expect(righe[0]?.chi).toBe('Revisione')
    expect(righe[1]?.testo).toBe('aspetta la tua risposta da 1 h 5 min')
    // Una chat nata prima del campo `dal`: niente «da quanto» inventato.
    expect(righe[2]?.testo).toBe('al lavoro · Scrivo i test.')
    expect(finite).toBe(1)
  })

  it('autopilota fermo: le sue chat non sono «al lavoro»', () => {
    const a = ap({ stato: 'sospeso', chats: [chat('c-1')] })
    expect(adessoDi(a, ORA).righe[0]).toMatchObject({ tono: 'ferma', testo: 'ferma: l’autopilota è fermo' })
  })

  it('chat sola: una riga, con il motivo se è fermo', () => {
    const fermo = ap({ stato: 'sospeso', motivoSospensione: 'tetto di cicli', fermatoIl: iso(ORA - 3 * MIN) })
    expect(adessoDi(fermo, ORA).righe).toEqual([expect.objectContaining({ tono: 'ferma', testo: 'ferma da 3 min: tetto di cicli' })])
    const muto = ap({ ultimoSegno: iso(ORA - 30 * MIN) })
    expect(adessoDi(muto, ORA).righe[0]?.testo).toBe('nessun segno da 30 min')
  })

  it('niente righe per chi non è ancora partito o ha finito', () => {
    expect(adessoDi(ap({ stato: 'intervista' }), ORA).righe).toEqual([])
    expect(adessoDi(ap({ stato: 'finito', chats: [chat('c-1', { stato: 'finita' })] }), ORA)).toEqual({ righe: [], finite: 0 })
  })
})

describe('da quando ogni chat è nel suo stato (`dal`)', () => {
  it('una chat nuova o che cambia stato prende adesso; le altre tengono il loro', () => {
    const prima = ap({ chats: [chat('c-1', { dal: iso(ORA - 30 * MIN) }), chat('c-2', { dal: iso(ORA - 30 * MIN) })] })
    const dopo = ap({ chats: [chat('c-1'), chat('c-2', { stato: 'bloccata' }), chat('c-3')] })
    const datato = conStatiDatati(dopo, prima, iso(ORA))
    expect(datato.chats.map((c) => c.dal)).toEqual([iso(ORA - 30 * MIN), iso(ORA), iso(ORA)])
  })

  it('una chat nata prima del campo resta senza: «da quanto» non si inventa', () => {
    const prima = ap({ chats: [chat('c-1')] })
    expect(conStatiDatati(ap({ chats: [chat('c-1')] }), prima, iso(ORA)).chats[0]?.dal).toBeUndefined()
  })

  it('il campo sopravvive al salvataggio', () => {
    const a = ap({ chats: [chat('c-1', { dal: iso(ORA) })] })
    expect(parseAutopilota({ ...JSON.parse(JSON.stringify(a)), versione: 1 }).autopilota?.chats[0]?.dal).toBe(iso(ORA))
  })
})

describe('«Hai risposto: …» e cosa ne è stato fatto', () => {
  it('la risposta dalla linguetta Domande si legge come tale, con sotto chi l’ha ricevuta', () => {
    const quando = iso(ORA)
    const a = ap({
      chats: [chat('c-3', { ruolo: 'sviluppo', compito: 'Lo storico degli errori.' })],
      dialogo: tracciaDopoRisposta('Quale PC riceve gli errori?', 'il fisso', quando),
      decisioni: [{ quando: iso(ORA + 2_000), cosa: 'risposta tardiva (c-3): il fisso' }]
    })
    const tua = conversazione(a).find((b) => b.da === 'tu' && b.testo.startsWith('Hai risposto'))
    expect(tua?.testo).toBe('Hai risposto: il fisso')
    expect(tua?.dettaglio).toBe('Sviluppo («Lo storico degli errori») l’ha ricevuta e riprende il lavoro.')
  })

  it('«pubblico?»: dice se pubblica o no', () => {
    const a = ap({ decisioni: [{ quando: iso(ORA + 1_000), cosa: 'non pubblico: hai risposto «no»' }] })
    expect(esitoRisposta(a, iso(ORA), 'no')).toBe('Non pubblica, come hai detto.')
  })

  it('nessuno l’ha ancora usata: lo dice, non tace', () => {
    expect(esitoRisposta(ap(), iso(ORA), 'sì')).toBe('Ricevuta: la porto alla chat che l’aveva chiesta.')
    expect(esitoRisposta(ap({ stato: 'sospeso' }), iso(ORA), 'sì')).toBe('Ricevuta. L’autopilota è fermo: la userà quando riparte.')
  })

  it('una riga del servizio di un’altra risposta, o di ore dopo, non conta', () => {
    const a = ap({ decisioni: [
      { quando: iso(ORA + 1_000), cosa: 'risposta tardiva (c-3): un’altra cosa' },
      { quando: iso(ORA + 3 * 60 * MIN), cosa: 'risposta tardiva (c-3): il fisso' }
    ] })
    expect(esitoRisposta(a, iso(ORA), 'il fisso')).toBe('Ricevuta: la porto alla chat che l’aveva chiesta.')
  })

  it('la risposta arrivata a una chat della flotta («risposta tardiva (c-3): …») non resta una riga grezza', () => {
    const a = ap({ chats: [chat('c-3')], decisioni: [{ quando: iso(ORA), cosa: 'risposta tardiva (c-3): sì, vai' }] })
    const righe = conversazione(a)
    expect(righe.some((b) => b.testo.startsWith('risposta tardiva'))).toBe(false)
    expect(righe.find((b) => b.da === 'tu' && b.testo.startsWith('Hai risposto'))?.testo).toBe('Hai risposto: sì, vai')
  })
})
