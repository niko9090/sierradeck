import { describe, expect, it } from 'vitest'
import {
  IMPOSTAZIONI_AVVISI_PREDEFINITE, LAVORI_AUTOMATICI, SUONI_VICINI_MS, bozzaChatFerma, bozzaDaAltroPc, bozzaDomanda, bozzaFatto, bozzaFermo, bozzaFile, bozzaProva,
  comeNasce, daFatto, daMandare, inSilenzio, leggiImpostazioniAvvisi, leggiRichiestaEventi, origineRichiesta, rigaConsegna, rigaStatoAvvisi,
  type Avviso, type AvvisoTenuto, type ImpostazioniAvvisi
} from '@shared/avvisi-telefono'
import { NOME_LAVORO } from '../../src/main/errori-arrivati-lavoro'
import { rispostaInCoda } from '../../src/autopilot-host/domande-in-chat'
import { codaVuota } from '@shared/coda-richieste'

const alle = (h: number, m: number): Date => new Date(2026, 10, 11, h, m, 0)

describe('la domanda', () => {
  it('titolo con il workspace, la domanda in una frase, la consigliata per prima fra le azioni', () => {
    const b = bozzaDomanda({
      cosa: 'domanda', id: 'd-1', workspace: 'Negozio', autopilota: 'ap-1', domanda: 'Tengo   il vecchio\nelenco?',
      scelte: [{ scelta: 'No, toglilo' }, { scelta: 'Sì, tienilo', consigliata: true }, { scelta: 'Ti scrivo io', libera: true }],
      scadeIl: alle(18, 40).getTime()
    })
    expect(b.id).toBe('domanda:d-1')
    expect(b.tipo).toBe('domanda')
    expect(b.titolo).toBe('Negozio chiede')
    expect(b.testo).toBe('Tengo il vecchio elenco?')
    expect(b.azioni).toEqual([{ etichetta: 'Sì, tienilo', risposta: 'Sì, tienilo' }, { etichetta: 'No, toglilo', risposta: 'No, toglilo' }])
    expect(b.sotto).toBe('Consigliata: Sì, tienilo. Se non rispondi entro le 18:40 scelgo Sì, tienilo')
    expect(b.scadeIl).toBe(alle(18, 40).toISOString())
    expect(b.bersaglio).toEqual({ cosa: 'domanda', id: 'd-1', autopilota: 'ap-1' })
  })

  it('rischiosa: aspetta lui, nessuna scadenza', () => {
    const b = bozzaDomanda({ cosa: 'domanda', id: 'd-2', workspace: 'Negozio', domanda: 'Cancello la cartella?', scelte: [{ scelta: 'No' }, { scelta: 'Sì' }], aspettaTe: true })
    expect(b.sotto).toBe('Aspetto te: non decido io')
    expect(b.scadeIl).toBeUndefined()
  })

  it('il consenso ai limiti: tre scelte, tre azioni, non scade', () => {
    const b = bozzaDomanda({ cosa: 'domanda', id: 'd-3', workspace: 'Autopilota · Negozio', domanda: 'Supero il limite del piano?', scelte: [{ scelta: 'Sì, questa volta' }, { scelta: 'Sì, sempre' }, { scelta: 'No' }, { scelta: 'Un’altra' }], aspettaTe: true })
    expect(b.titolo).toBe('Negozio chiede')
    expect(b.azioni?.map((a) => a.risposta)).toEqual(['Sì, questa volta', 'Sì, sempre', 'No'])
  })

  it('un workspace senza nome (la chiave della cartella) non finisce nel titolo', () => {
    expect(bozzaDomanda({ cosa: 'domanda', id: 'd', workspace: 'cartella:x', domanda: 'Vado?' }).titolo).toBe('SierraDeck chiede')
  })
})

describe('fermo, fatto, da sapere', () => {
  it('il lavoro fermo dice il motivo', () => {
    const b = bozzaFermo({ cosa: 'fermo', id: 'x', workspace: 'Negozio', motivo: 'Fermo da 12 minuti: nessuno specialista al lavoro.' })
    expect(b).toMatchObject({ id: 'fermo:x', tipo: 'fermo', titolo: 'Lavoro fermo · Negozio', testo: 'Fermo da 12 minuti: nessuno specialista al lavoro.' })
  })

  it('una richiesta sua finita è «fatto», con le sue parole', () => {
    const b = bozzaFatto({ cosa: 'fatto', id: 'a', workspace: 'Negozio', titolo: 'Fatta: Rifai la schermata Adesso', tutte: true })
    expect(b).toMatchObject({ id: 'fatto:a', tipo: 'fatto', titolo: 'Fatto · Negozio', testo: 'Rifai la schermata Adesso Non resta altro in coda.' })
  })

  it('un lavoro automatico finito è «da sapere»', () => {
    for (const t of ['Fatta: Errori arrivati (3): …', 'Fatta: Controllo di tutti i PC: 3 criticità', 'Fatta: Scelta consigliata, presa dal programma senza risposta di Nicholas, a «…»: sì']) {
      expect(origineRichiesta(t)).toBe('automatica')
      expect(bozzaFatto({ cosa: 'fatto', id: 'a', workspace: 'w', titolo: t }).tipo).toBe('sapere')
    }
    expect(origineRichiesta('Fatta: Risposta di Nicholas a «Il revisore…»: sì')).toBe('tua')
  })

  it('i nomi dei lavori automatici sono quelli che scrive il programma', () => {
    expect(LAVORI_AUTOMATICI).toContain(NOME_LAVORO)
    // La scelta presa dal programma entra in coda con queste parole (domande-in-chat.ts).
    const e = rispostaInCoda(codaVuota('w'), { domanda: 'Vado?', risposta: 'Sì', quando: '2026-11-11T10:00:00.000Z', chi: 'programma' })
    expect(origineRichiesta(e.coda.richieste[0]?.titolo ?? '')).toBe('automatica')
    // La risposta di Nicholas è lavoro suo.
    const sua = rispostaInCoda(codaVuota('w'), { domanda: 'Vado?', risposta: 'Sì', quando: '2026-11-11T10:00:00.000Z' })
    expect(origineRichiesta(sua.coda.richieste[0]?.titolo ?? '')).toBe('tua')
  })

  it('la chat ferma: domanda se chiede, fatto se ha finito; un id nuovo a ogni fermata', () => {
    expect(bozzaChatFerma({ id: 'c1', nome: 'Sito', chiede: true, dal: 5 })).toMatchObject({ id: 'chat:c1:5', tipo: 'domanda', titolo: 'Sito aspetta te', testo: 'Chiede una scelta.', bersaglio: { cosa: 'chat', id: 'c1' } })
    expect(bozzaChatFerma({ id: 'c1', nome: 'Sito', chiede: false, dal: 9 })).toMatchObject({ id: 'chat:c1:9', tipo: 'fatto', testo: 'Ha finito il turno.' })
  })

  it('il file è solo per il suo telefono; la prova suona comunque', () => {
    expect(bozzaFile({ id: 'f1', nome: 'foto.png', per: 'tel:a' })).toMatchObject({ per: 'tel:a', tipo: 'sapere', bersaglio: { cosa: 'file', id: 'f1' } })
    expect(bozzaProva(alle(9, 5))).toMatchObject({ tipo: 'sapere', suonaComunque: true, testo: 'Se la leggi, gli avvisi arrivano. Partita alle 09:05.' })
  })

  it('da un altro PC: il suo id nel bersaglio e nell’id, il suo nome nel titolo', () => {
    const a: Avviso = { n: 7, id: 'domanda:d-1', tipo: 'domanda', titolo: 'Negozio chiede', testo: 'Vado?', quando: 'x', bersaglio: { cosa: 'domanda', id: 'd-1' }, suona: true }
    expect(bozzaDaAltroPc(a, 'pc-b', 'Studio')).toEqual({ id: 'pc:pc-b:domanda:d-1', tipo: 'domanda', titolo: 'Negozio chiede · Studio', testo: 'Vado?', bersaglio: { cosa: 'domanda', id: 'd-1', pc: 'pc-b' } })
  })

  it('la chiusura di una domanda porta come e testo', () => {
    expect(daFatto({ cosa: 'domanda-chiusa', id: 'd-1', come: 'programma', testo: 'Sì, tienilo' })).toEqual({ chiude: { id: 'domanda:d-1', come: 'programma', testo: 'Sì, tienilo' } })
    expect(daFatto({ cosa: 'domanda-chiusa', id: 'd-1', come: 'ritirata' })).toEqual({ chiude: { id: 'domanda:d-1', come: 'ritirata' } })
  })
})

describe('le impostazioni', () => {
  it('di partenza: domanda e fermo suonano, fatto e da sapere silenziosi, chat ferma spenta', () => {
    expect(IMPOSTAZIONI_AVVISI_PREDEFINITE).toEqual({ tipi: { domanda: 'suona', fermo: 'suona', fatto: 'silenziosa', sapere: 'silenziosa' }, chatFerma: false, silenzio: null })
  })

  it('quello che non si capisce resta com’era', () => {
    const base: ImpostazioniAvvisi = { tipi: { domanda: 'suona', fermo: 'spenta', fatto: 'silenziosa', sapere: 'silenziosa' }, chatFerma: true, silenzio: { da: '23:00', a: '07:00' } }
    expect(leggiImpostazioniAvvisi({ tipi: { domanda: 'forte', fatto: 'suona' }, silenzio: { da: '25:00', a: '07:00' }, chatFerma: 'sì' }, base))
      .toEqual({ ...base, tipi: { ...base.tipi, fatto: 'suona' } })
    expect(leggiImpostazioniAvvisi({ silenzio: null }, base).silenzio).toBeNull()
    expect(leggiImpostazioniAvvisi('rotto')).toEqual(IMPOSTAZIONI_AVVISI_PREDEFINITE)
  })

  it('le ore di silenzio, anche a cavallo della mezzanotte', () => {
    const notte = { da: '23:00', a: '07:00' }
    expect(inSilenzio(notte, alle(23, 30))).toBe(true)
    expect(inSilenzio(notte, alle(6, 59))).toBe(true)
    expect(inSilenzio(notte, alle(7, 0))).toBe(false)
    expect(inSilenzio({ da: '13:00', a: '15:00' }, alle(14, 0))).toBe(true)
    expect(inSilenzio({ da: '13:00', a: '15:00' }, alle(15, 0))).toBe(false)
    expect(inSilenzio({ da: '08:00', a: '08:00' }, alle(8, 0))).toBe(false)
    expect(inSilenzio(null, alle(3, 0))).toBe(false)
  })

  it('spenta non nasce; silenziosa nasce muta; suona, ma non di notte né a 20 secondi da un altro suono', () => {
    const imp: ImpostazioniAvvisi = { tipi: { domanda: 'suona', fermo: 'spenta', fatto: 'silenziosa', sapere: 'silenziosa' }, chatFerma: false, silenzio: { da: '23:00', a: '07:00' } }
    const giorno = alle(12, 0)
    expect(comeNasce({ tipo: 'fermo' }, imp, giorno, undefined)).toEqual({ nasce: false, suona: false })
    expect(comeNasce({ tipo: 'fatto' }, imp, giorno, undefined)).toEqual({ nasce: true, suona: false })
    expect(comeNasce({ tipo: 'domanda' }, imp, giorno, undefined)).toEqual({ nasce: true, suona: true })
    expect(comeNasce({ tipo: 'domanda' }, imp, alle(2, 0), undefined)).toEqual({ nasce: true, suona: false })
    expect(comeNasce({ tipo: 'domanda' }, imp, giorno, giorno.getTime() - SUONI_VICINI_MS + 1)).toEqual({ nasce: true, suona: false })
    expect(comeNasce({ tipo: 'domanda' }, imp, giorno, giorno.getTime() - SUONI_VICINI_MS)).toEqual({ nasce: true, suona: true })
    // La prova suona anche con «da sapere» spento e di notte.
    expect(comeNasce({ tipo: 'sapere', suonaComunque: true }, { ...imp, tipi: { ...imp.tipi, sapere: 'spenta' } }, alle(2, 0), alle(2, 0).getTime())).toEqual({ nasce: true, suona: true })
  })
})

describe('cosa si manda', () => {
  const a = (n: number, extra: Partial<AvvisoTenuto> = {}): AvvisoTenuto => ({ n, id: `x${n}`, tipo: 'domanda', titolo: 't', testo: 'x', quando: 'q', bersaglio: { cosa: 'domanda', id: `d${n}` }, suona: false, ...extra })

  it('solo quello che è cambiato dopo il numero, in ordine', () => {
    expect(daMandare([a(5), a(3), a(4)], 5, 3).map((x) => x.n)).toEqual([4, 5])
    expect(daMandare([a(5)], 5, 5)).toEqual([])
  })

  it('da capo (zero, o più avanti dell’ultimo): solo le domande ancora aperte', () => {
    const tutti = [a(1, { chiuso: { quando: 'q', come: 'risposta' } }), a(2), a(3, { tipo: 'fatto' }), a(4, { tipo: 'sapere' })]
    expect(daMandare(tutti, 4, 0).map((x) => x.n)).toEqual([2])
    expect(daMandare(tutti, 4, 99).map((x) => x.n)).toEqual([2])
  })

  it('il file di un telefono non va agli altri, e il campo non esce', () => {
    const tutti = [a(1, { per: 'tel:a' }), a(2)]
    expect(daMandare(tutti, 2, -1, { per: 'tel:b' }).map((x) => x.n)).toEqual([2])
    const miei = daMandare(tutti, 2, -1, { per: 'tel:a' })
    expect(miei.map((x) => x.n)).toEqual([1, 2])
    expect('per' in (miei[0] as object)).toBe(false)
  })

  it('a un altro PC non si rimandano gli avvisi presi da altri PC', () => {
    const tutti = [a(1), a(2, { bersaglio: { cosa: 'domanda', id: 'd', pc: 'pc-b' } })]
    expect(daMandare(tutti, 2, -1, { soloLocali: true }).map((x) => x.n)).toEqual([1])
  })

  it('i parametri di /api/eventi: attesa fra 0 e 50 secondi, stato solo se dato', () => {
    expect(leggiRichiestaEventi(new URLSearchParams('avvisi=12&stato=7&attesa=50'))).toEqual({ avvisi: 12, stato: 7, attesaMs: 50_000 })
    expect(leggiRichiestaEventi(new URLSearchParams('avvisi=12&attesa=600'))).toEqual({ avvisi: 12, attesaMs: 50_000 })
    expect(leggiRichiestaEventi(new URLSearchParams('attesa=-3&avvisi=x'))).toEqual({ avvisi: 0, attesaMs: 0 })
    expect(leggiRichiestaEventi(undefined)).toEqual({ avvisi: 0, attesaMs: 0 })
  })
})

describe('le righe', () => {
  it('la consegna dice i secondi di ritardo, dalla nascita o dalla chiusura', () => {
    const base: Avviso = { n: 3, id: 'i', tipo: 'domanda', titolo: 'Negozio chiede', testo: 'x', quando: '2026-11-11T10:00:00.000Z', bersaglio: { cosa: 'domanda', id: 'd' }, suona: true }
    expect(rigaConsegna(base, 'telefono', Date.parse('2026-11-11T10:00:04.400Z'))).toBe('[avviso] consegnato n=3 domanda «Negozio chiede» a telefono dopo 4 s')
    expect(rigaConsegna({ ...base, n: 4, chiuso: { quando: '2026-11-11T11:00:00.000Z', come: 'risposta' } }, 'telefono', Date.parse('2026-11-11T11:00:02.000Z')))
      .toBe('[avviso] consegnato n=4 domanda «Negozio chiede» (la chiusura) a telefono dopo 2 s')
  })

  it('la riga di stato: in ascolto, da quanto, o nessun telefono', () => {
    const ora = 10 * 3_600_000
    expect(rigaStatoAvvisi({ telefoni: 0, inAscolto: false, ora })).toMatch(/^Nessun telefono accoppiato/)
    expect(rigaStatoAvvisi({ telefoni: 1, inAscolto: true, ora })).toBe('Il telefono è in ascolto adesso.')
    expect(rigaStatoAvvisi({ telefoni: 1, inAscolto: false, ultimoContatto: ora - 5 * 60_000, ora })).toBe('Ultimo contatto del telefono: 5 min fa.')
    expect(rigaStatoAvvisi({ telefoni: 1, inAscolto: false, ultimoContatto: ora - 5 * 3_600_000, ora })).toBe('Ultimo contatto del telefono: 5 ore fa.')
    expect(rigaStatoAvvisi({ telefoni: 1, inAscolto: false, ora })).toMatch(/non si è ancora fatto vivo/)
  })
})
