import { describe, it, expect } from 'vitest'
import {
  compitoInBreve, noteDiChiarezza, partiDaChatFerma, partiSenzaSigle, riferimentoVago, senzaNotificaClaude, senzaSigle, sigleIn
} from '@shared/domanda-chiara'
import { domandaControllata, leggiParti, partiDaRisposta, validaDomanda, type PartiDomanda } from '@shared/domanda-strutturata'
import { domandaInFondo } from '@shared/domande-telefono'

/**
 * Domande chiare per sempre (0.84.0), con le domande vere arrivate a Nicholas
 * dal 19 al 21/10 (dalla memoria e dalla scheda Domande del servizio).
 */

/** Il resto di una domanda fatta bene: si cambia solo la parte che si prova. */
const intorno = (domanda: string, extra: Partial<PartiDomanda> = {}): PartiDomanda => ({
  staFacendo: 'Sto chiudendo il lavoro della versione 0.80.0 su questo PC.',
  domanda,
  perche: 'Le chat finite si chiudono da sole solo con la versione nuova installata.',
  scelte: [
    { scelta: 'la installo io', conseguenza: 'aspetto che tu la installi, poi chiudo le chat finite', consigliata: true },
    { scelta: 'non adesso', conseguenza: 'lascio le chat aperte e ti avviso più tardi' }
  ],
  seNonRispondi: 'aspetto senza chiudere niente',
  ...extra
})

const CHAT = [
  { id: 'c-4', compito: 'Interfaccia della gestione delle chat (0.79.0). Prima leggi la mappa.' },
  { id: 'c-7', compito: 'Collaudo della gestione delle chat (0.79.0). 1) Prova dal vero in una copia di prova' },
  { id: 'c-10', compito: 'Mappa dei cambi di workspace' },
  { id: 'c-12', compito: 'Rilascio 0.80.0 quando tutto è verde' }
]

describe('i casi veri: cosa il controllo non lascia passare', () => {
  it('19/10, «Chiudi tu a mano le chat c-7 e c-4…?»: le sigle tornano indietro', () => {
    const v = validaDomanda(intorno('Chiudi tu a mano le chat c-7 e c-4 dall’elenco delle chat, visto che io non ci riesco?'))
    expect(v.completa).toBe(false)
    expect(v.note.join(' ')).toContain('«c-7», «c-4»')
  })
  it('20/10, «Installi tu la 0.80.0…, così chiudo le chat finite c-7, c-10 e c-12?»: con le chat note diventano i loro compiti', () => {
    const p = partiSenzaSigle(intorno('Installi tu la 0.80.0 su questo PC, così chiudo le chat finite c-7, c-10 e c-12?'), CHAT)
    expect(p.domanda).toBe('Installi tu la 0.80.0 su questo PC, così chiudo le chat finite «Collaudo della gestione delle chat (0.79.0)», «Mappa dei cambi di workspace» e «Rilascio 0.80.0 quando tutto è verde»?')
    expect(sigleIn(p.domanda)).toEqual([])
  })
  it('20/10, «Will you install the 0.80.0…?»: non è italiano', () => {
    const v = validaDomanda(intorno('Will you install the 0.80.0 on this PC so finished chats close on their own?'))
    expect(v.note.join(' ')).toContain('non è in italiano')
  })
  it('anche le scelte in inglese tornano indietro', () => {
    const v = validaDomanda(intorno('Installo la 0.80.0 adesso?', {
      scelte: [
        { scelta: 'yes', conseguenza: 'I will install it now and then close the chats', consigliata: true },
        { scelta: 'no', conseguenza: 'we wait for the next one' }
      ]
    }))
    expect(v.note.join(' ')).toContain('non è in italiano')
  })
  it('20/10, «Quell’autopilota con la tua richiesta su Nexora lo sposto…?»: riferimento vago', () => {
    const v = validaDomanda(intorno('Quell’autopilota con la tua richiesta su Nexora lo sposto nel workspace NexoraOS, o lo lascio dov’è con un nome giusto?'))
    expect(v.note.join(' ')).toContain('«Quell’autopilota»')
  })
  it('19/10, «Come vado avanti con questo pezzo?» (Nicholas: «quale pezzo???»): riferimento vago', () => {
    expect(riferimentoVago('Come vado avanti con questo pezzo?')).toBe('questo pezzo')
    expect(validaDomanda(intorno('Come vado avanti con questo pezzo?')).completa).toBe(false)
  })
  it('«l’altra chat», «come detto», «quel lavoro»', () => {
    for (const d of ['Aspetto l’altra chat?', 'Faccio come detto?', 'Chiudo quel lavoro?']) expect(riferimentoVago(d), d).toBeDefined()
    expect(riferimentoVago('Pubblico la 0.84.0 con le domande chiare?')).toBeUndefined()
  })
  it('ogni scelta ha la sua conseguenza, non due su tre', () => {
    const p = intorno('Installo la 0.80.0 adesso?')
    const v = validaDomanda({ ...p, scelte: [...p.scelte, { scelta: 'decidi tu', conseguenza: '' }] })
    expect(v.mancano).toEqual(['scelte'])
    expect(v.note.join(' ')).toContain('«decidi tu»')
  })
})

describe('i casi veri: cosa passa', () => {
  it('21/10, la domanda sulla chiave SSH di nexora-nas era già chiara e passa così com’è', () => {
    const vera: PartiDomanda = {
      staFacendo: 'Provo a entrare in nexora-nas sulla porta 30 come nicholas per copiare VisitaFacile. Il NAS rifiuta tutte e tre le chiavi di PC-Fisso.',
      domanda: 'Nel pannello di nexora-nas, in Utenti → nicholas → Chiavi SSH, c’è la chiave che finisce con «nexus-backup@PC-Fisso»?',
      perche: 'Mi hai scritto che ho già la chiave, ma il NAS la rifiuta: devo sapere se è salvata proprio per nicholas.',
      scelte: [
        { scelta: 'Non c’era, l’ho incollata e salvata ora', conseguenza: 'Faccio un solo tentativo sulla porta 30, poi cerco e copio il progetto in sola lettura', consigliata: true },
        { scelta: 'C’è già, salvata per nicholas', conseguenza: 'Il problema è nel servizio SSH del NAS: lo scrivo nel resoconto e mi fermo' },
        { scelta: 'È salvata per un altro utente', conseguenza: 'Scrivimi il nome di quell’utente e faccio un solo tentativo con quello' }
      ],
      seNonRispondi: 'Aspetto senza altri tentativi, per non far bloccare l’IP di PC-Fisso.'
    }
    expect(validaDomanda(vera)).toEqual({ completa: true, mancano: [], note: [] })
  })
  it('i nomi dei rami e dei file non sono sigle da sole, ma il ramo di una chat sì', () => {
    expect(sigleIn('leggi .sierradeck/consegne/c-440.md')).toEqual([])
    expect(sigleIn('il file abc-12 e la versione 0.80.0')).toEqual([])
    expect(sigleIn('unisco ap/ap-f1e631f5/c-61 in main?')).toEqual(['c-61'])
    expect(senzaSigle('unisco ap/ap-f1e631f5/c-12 in main?', CHAT)).toBe('unisco «Rilascio 0.80.0 quando tutto è verde» in main?')
  })
  it('una sigla che il programma non conosce diventa «una chat precedente»', () => {
    expect(senzaSigle('le correzioni di c-310', CHAT)).toBe('le correzioni di una chat precedente')
  })
  it('il compito in breve: la prima frase, tagliata a una parola intera', () => {
    expect(compitoInBreve('Rivedi il ramo ap/ap-f1e631f5/c-1 della chat c-1 («Verifica e motore della gestione»). Poi…', 40)).toBe('Rivedi il ramo ap/ap-f1e631f5/c-1…')
  })
})

describe('la chat ferma senza supervisore (21/10, due volte con «⚠ Domanda incompleta»)', () => {
  const DETTO = 'Nella mia cartella di lavoro non c’era niente da salvare: nessun file modificato fuori dal commit già fatto. Quindi non ho fatto nuovi commit e mi fermo qui, come chiesto; la chat la chiudi tu.\n\nNon ho toccato la cartella principale e non ho pubblicato né installato niente.'
  const COMPITO = '0.83.0 (minor), una sola release, mai installata da noi, rapporto in italiano. Ristrutturazione dell’app Android nativa'

  it('la notifica inglese sparisce, la domanda nomina il lavoro e si capisce da sola', () => {
    expect(senzaNotificaClaude('idle_prompt: Claude is waiting for your input\n\nLa chat aveva appena detto:\nciao')).toBe('ciao')
    const p = partiDaChatFerma({ compito: COMPITO, obiettivo: 'x', detto: DETTO })
    expect(p.domanda).toBe('Cosa deve fare adesso la chat che lavora a «0.83.0 (minor), una sola release, mai installata da noi, rapporto in italiano»?')
    expect(p.perche).toContain('la chat la chiudi tu')
    expect(validaDomanda(p)).toEqual({ completa: true, mancano: [], note: [] })
    expect(JSON.stringify(p)).not.toContain('Claude is waiting')
  })
  it('se il messaggio finisce con una domanda vera, la domanda è quella', () => {
    const detto = 'Ho finito la mappa.\n\nLa mando a Nicholas adesso o dopo le foto dell’emulatore?'
    const p = partiDaChatFerma({ compito: COMPITO, obiettivo: 'x', detto, domandaInFondo: domandaInFondo(detto)! })
    expect(p.domanda).toBe('La mando a Nicholas adesso o dopo le foto dell’emulatore?')
    expect(p.scelte.every((s) => s.conseguenza.length > 5)).toBe(true)
  })
})

describe('il controllo prima di mostrare', () => {
  it('le sigle si sostituiscono da sole: niente riscrittura, nessuna sigla nel testo', async () => {
    let riscritture = 0
    const r = await domandaControllata('App Android', intorno('Installi tu la 0.80.0 su questo PC, così chiudo le chat finite c-7 e c-12?'), async () => { riscritture += 1; return '' }, partiDaRisposta, CHAT)
    expect(riscritture).toBe(0)
    expect(r.avvertenza).toBeUndefined()
    expect(sigleIn(r.testo)).toEqual([])
    expect(r.testo).toContain('«Collaudo della gestione delle chat (0.79.0)»')
  })
  it('senza le chat, una sigla fa riscrivere la domanda; la riscrittura chiara vince', async () => {
    const richieste: string[] = []
    const buona = intorno('Chiudo le chat del collaudo e dell’interfaccia, ormai finite?')
    const r = await domandaControllata('App Android', intorno('Chiudo le chat c-7 e c-4?'), async (q) => { richieste.push(q); return JSON.stringify(buona) }, partiDaRisposta)
    expect(richieste[0]).toContain('niente sigle di chat')
    expect(r.parti.domanda).toBe(buona.domanda)
    expect(r.avvertenza).toBeUndefined()
  })
  it('una domanda vaga riscritta ancora vaga passa con l’avvertenza (mai un lavoro fermo in silenzio)', async () => {
    const r = await domandaControllata('X', intorno('Come vado avanti con questo pezzo?'), async () => JSON.stringify(intorno('Come vado avanti con quel pezzo?')), partiDaRisposta)
    expect(r.avvertenza).toContain('Domanda incompleta')
  })
  it('le note di chiarezza sono vuote per una domanda buona', () => {
    expect(noteDiChiarezza(intorno('Installo la 0.80.0 adesso?'))).toEqual([])
    expect(noteDiChiarezza(leggiParti('Uso npm o pnpm?'))).toEqual([])
  })
})
