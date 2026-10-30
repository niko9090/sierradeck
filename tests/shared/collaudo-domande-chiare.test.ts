import { describe, it, expect } from 'vitest'
import { noteDiChiarezza, riferimentoVago, senzaSigle, sigleIn } from '@shared/domanda-chiara'
import { domandaControllata, leggiParti, partiDaRisposta, validaDomanda, type PartiDomanda } from '@shared/domanda-strutturata'
import { conversazioniDomande } from '@shared/domande-conversazioni'
import { tipoDomanda } from '@shared/domande-vista'
import { risoltaDalloStato } from '../../src/autopilot-host/domande-doppie'
import { nuovoAutopilota } from '@shared/autopilota'

/**
 * Collaudo delle domande chiare (0.84.0), sopra il lavoro di c-61, con le
 * domande vere arrivate a Nicholas il 20 e il 21/10 (memoria del servizio).
 *
 * I casi «DIFETTO» sono gli 8 difetti trovati dal collaudo, corretti nella
 * 0.84.1 (scheda collaudo-domande-chiare-0-84-0.md).
 */

const intorno = (domanda: string, extra: Partial<PartiDomanda> = {}): PartiDomanda => ({
  staFacendo: 'Sto chiudendo il lavoro della versione 0.81.1 su questo PC.',
  domanda,
  perche: 'I due workspace sbagliati si tolgono solo dopo l’installazione.',
  scelte: [
    { scelta: 'chiudi adesso', conseguenza: 'chiudo e ti lascio scritti i passi da fare', consigliata: true },
    { scelta: 'aspetta', conseguenza: 'resto acceso finché non installi' }
  ],
  seNonRispondi: 'aspetto senza chiudere niente',
  ...extra
})

describe('casi veri del 20-21/10 che il controllo già tratta bene', () => {
  it('20/10, «Come vuoi che proceda?» da sola (Nicholas: «rivedi i criteri») non passa', () => {
    const v = validaDomanda(leggiParti('Come vuoi che proceda?'))
    expect(v.completa).toBe(false)
    expect(v.mancano).toEqual(expect.arrayContaining(['staFacendo', 'perche', 'scelte']))
  })

  it('20/10, «Installi tu la 0.80.0…, così chiudo le chat finite c-7, c-10 e c-12?» non passa così', () => {
    const v = validaDomanda(intorno('Installi tu la 0.80.0 su questo PC, così chiudo le chat finite c-7, c-10 e c-12?'))
    expect(v.completa).toBe(false)
    expect(v.note.join(' ')).toContain('«c-7», «c-10», «c-12»')
  })

  it('21/10, le quattro domande sulla 0.81.1 (Nicholas: «superata») si riconoscono dallo stato vero', () => {
    const stato = { releasePubblicate: ['0.81.1'], versioneInstallata: '0.81.1' }
    expect(risoltaDalloStato('Pubblico adesso una 0.81.1 con la correzione delle chat chiuse, mai installata, o la lascio in main per la prossima release?', stato)).toBeDefined()
    expect(risoltaDalloStato('Quando la 0.81.1 sarà pubblicata, la installi tu su questo PC?', stato)).toBeDefined()
  })

  it('20-21/10, le domande sul NAS (nomi inventati) dicono già di cosa parlano e passano il controllo di chiarezza', () => {
    for (const d of [
      'Puoi accendere SSH su nas-prova e scrivermi porta e utente per entrare?',
      'Nel pannello di nas-prova, il servizio SSH risulta attivo e salvato, e con quale numero di porta?',
      'Puoi aggiungere sul NAS, per l’utente mario, la chiave pubblica backup@pc-prova, oppure entro con la password che mi scrivi?'
    ]) expect(noteDiChiarezza(intorno(d)), d).toEqual([])
  })

  it('una sigla maiuscola («C-12») è una sigla', () => {
    expect(sigleIn('Unisco C-12 in main?')).toEqual(['c-12'])
  })
})

describe('difetti trovati dal collaudo', () => {
  it('DIFETTO 1: «c-7/c-4» — la seconda sigla dopo la barra non si vede (domanda-chiara.ts:22)', () => {
    expect(sigleIn('Chiudo le chat c-7/c-4?')).toEqual(['c-7', 'c-4'])
  })

  it('DIFETTO 2: una sigla sconosciuta diventa «una chat precedente» e la domanda non dice più quale lavoro (domanda-chiara.ts:96)', async () => {
    // Le chat c-310 e c-311 non sono più fra quelle dell'autopilota.
    const testo = senzaSigle('Chiudo le chat c-310 e c-311?', [])
    expect(testo).toBe('Chiudo le chat c-310 e c-311?')
    // E soprattutto non passa il controllo come se fosse chiara: senza riscrittura e senza avvertenza.
    const r = await domandaControllata('App Android', intorno('Chiudo le chat c-310 e c-311?'), async () => '', partiDaRisposta, [{ id: 'c-1', compito: 'Altro' }])
    expect(r.avvertenza).toBeDefined()
  })

  it('DIFETTO 3: 21/10, «Chiudo adesso questo lavoro…» e «…questo autopilota…» non dicono quale (domanda-chiara.ts:26)', () => {
    expect(riferimentoVago('Chiudo adesso questo lavoro e tolgo i due workspace sbagliati dopo che installi la 0.81.1, o lo lascio aperto ad aspettare?')).toBeDefined()
    expect(riferimentoVago('Chiudo adesso questo autopilota e ti lascio scritti i due passi da fare dopo l’installazione della 0.81.1, oppure lo tengo acceso finché non installi?')).toBeDefined()
  })

  it('DIFETTO 4: «quella cosa» in una scelta passa il controllo; nella domanda no (domanda-strutturata.ts:123, domanda-chiara.ts:56)', () => {
    const p = intorno('Pubblico la 0.84.0 adesso?', {
      scelte: [
        { scelta: 'fai quella cosa', conseguenza: 'faccio subito quello che serve', consigliata: true },
        { scelta: 'aspetta', conseguenza: 'non pubblico niente' }
      ]
    })
    expect(validaDomanda(p).completa).toBe(false)
  })

  it('DIFETTO 5: l’id dell’autopilota («ap-f1e631f5») è una sigla come «c-12» e passa (domanda-chiara.ts:22)', () => {
    expect(validaDomanda(intorno('Chiudo l’autopilota ap-f1e631f5 adesso?')).completa).toBe(false)
  })

  it('DIFETTO 6: una domanda superata si legge come «risposta dall’autopilota» e «ha risposto da solo» (domande-conversazioni.ts:288, :297)', () => {
    const [c] = conversazioniDomande({
      voci: [{
        tipo: 'risolta', autopilotaId: 'ap-1', autopilota: 'App Android', chatTitolo: 'Ristrutturazione dell’app Android',
        domanda: 'Pubblico adesso una 0.81.1 con la correzione delle chat chiuse?',
        risposta: 'Superata, non serve più: la 0.81.1 è già pubblicata', quando: '2026-10-21T13:45:32.663Z'
      }],
      autopiloti: [{ ...nuovoAutopilota({ id: 'ap-1', nome: 'App Android', obiettivo: 'x', cwd: '.', iniziatoIl: '2026-10-21T06:00:00.000Z' }), stato: 'lavoro' }]
    })
    const testi = JSON.stringify(c)
    expect(testi).not.toContain('risposta dall’autopilota: Superata')
    expect(testi).not.toContain('ha risposto da solo')
    // La scheda (PC, pagina, app) non ha una «risposta»: ha il motivo (0.84.1).
    expect(c!.scheda?.risposta).toBeUndefined()
    expect(c!.scheda?.superata).toBe('la 0.81.1 è già pubblicata')
    expect(tipoDomanda(c!).parola).toBe('non serve più')
  })

  it('una risposta vera dell’autopilota resta «risposta dall’autopilota»', () => {
    const [c] = conversazioniDomande({
      voci: [{ tipo: 'risolta', autopilotaId: 'ap-1', autopilota: 'App Android', domanda: 'Uso la porta 8080?', risposta: 'Sì, usa la 8080.', quando: '2026-10-21T13:45:32.663Z' }],
      autopiloti: [{ ...nuovoAutopilota({ id: 'ap-1', nome: 'App Android', obiettivo: 'x', cwd: '.', iniziatoIl: '2026-10-21T06:00:00.000Z' }), stato: 'lavoro' }]
    })
    expect(c!.scheda?.risposta).toBe('Sì, usa la 8080.')
    expect(c!.scheda?.superata).toBeUndefined()
    expect(tipoDomanda(c!).parola).toBe('risposta dall’autopilota')
  })
})
