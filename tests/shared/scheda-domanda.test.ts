import { describe, it, expect } from 'vitest'
import { chiDi, fraseDomanda, schedaDaParti, scelteDiChat } from '../../src/shared/scheda-domanda'
import { conversazioniDomande } from '../../src/shared/domande-conversazioni'
import { domandeScheda } from '../../src/shared/domande-autopilota'
import { messaggiCompatti, statoMessaggi } from '../../src/shared/stato-dal-vivo'
import { nuovoAutopilota, type Autopilota } from '../../src/shared/autopilota'
import type { PartiDomanda } from '../../src/shared/domanda-strutturata'

/**
 * 0.72.1, Nicholas (15/10): «vedo ancora un sacco di messaggi "consegnato
 * alle" che occupano tutto lo spazio; le domande non si capiscono, scrive
 * troppe cose ed è una chat a sé stante; deve esserci la domanda e le
 * risposte eventuali».
 */

const PARTI: PartiDomanda = {
  staFacendo: 'Il lavoro è finito e verificato: la 0.72.1 è in bozza.',
  domanda: 'Pubblico adesso la 0.72.1?',
  perche: 'Il progetto ha la regola «chiedi prima di pubblicare».',
  scelte: [
    { scelta: 'sì, pubblica', conseguenza: 'tolgo la bozza e controllo gli allegati', consigliata: true },
    { scelta: 'no, lascia così', conseguenza: 'la bozza resta' }
  ],
  seNonRispondi: 'non pubblico'
}

function ap(p: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({ id: 'ap-1', nome: 'Notte', obiettivo: 'Fai la 0.72.1', cwd: 'E:\\progetti\\SierraDeck', iniziatoIl: '2026-10-15T10:00:00.000Z' }),
    ...p
  }
}

describe('messaggi per la chat: spunte, e una riga sola per chi è fermo', () => {
  const ora = Date.parse('2026-10-15T12:00:00.000Z')
  const a = ap({
    stato: 'lavoro',
    daConsegnare: [
      { id: 'm-a', quando: '2026-10-15T11:52:00.000Z', testo: 'scrivimi cosa hai cambiato', chats: ['ap-1'] },
      { id: 'm-b', quando: '2026-10-15T11:55:00.000Z', testo: 'e il rapporto', chats: ['ap-1'] }
    ],
    consegnatiDi: Array.from({ length: 8 }, (_, i) => ({ id: `m-c${i}`, testo: `messaggio ${i}`, quando: '2026-10-15T10:00:00.000Z', consegnatoIl: `2026-10-15T10:0${i}:00.000Z` }))
  })

  it('otto consegnati diventano otto spunte, dal più vecchio, con ora e testo nel tooltip', () => {
    const c = messaggiCompatti(statoMessaggi(a, ora, (iso) => iso.slice(11, 16)))
    expect(c.segni).toHaveLength(8)
    expect(c.segni.every((s) => s.tipo === 'consegnato')).toBe(true)
    expect(c.segni[0]!.titolo).toBe('consegnato alle 10:00: messaggio 0')
    expect(c.segni[7]!.titolo).toBe('consegnato alle 10:07: messaggio 7')
  })

  it('due in attesa sono una riga sola, con il più vecchio, il numero e «Manda adesso»', () => {
    const c = messaggiCompatti(statoMessaggi(a, ora, (iso) => iso.slice(11, 16)))
    expect(c.fermo).toEqual({ dettaglio: 'in attesa da 8 min', quanti: 2, testo: 'scrivimi cosa hai cambiato', mandaAdesso: true })
  })

  it('niente fermo, niente riga; «in consegna» è un segno, non una riga', () => {
    const c = messaggiCompatti([
      { id: 'v', testo: 'in volo', stato: 'in consegna', dettaglio: 'in consegna alla chat' },
      { id: 'c', testo: 'arrivato', stato: 'consegnato', dettaglio: 'consegnato alle 10:00' }
    ])
    expect(c.fermo).toBeUndefined()
    expect(c.segni.map((s) => s.tipo)).toEqual(['consegnato', 'in consegna'])
  })
})

describe('la domanda in una frase', () => {
  it('dallo schermo di una chat: la frase con il «?», senza cornici né opzioni numerate', () => {
    const schermo = [
      '╭──────────────────────────────╮',
      '│ Bash command                  │',
      '│   rm -rf note/prova           │',
      '│ Do you want to proceed?       │',
      '╰──────────────────────────────╯',
      '❯ 1. Yes',
      '  2. No'
    ].join('\n')
    expect(fraseDomanda(schermo)).toBe('Do you want to proceed?')
  })

  it('da un testo lungo: l ultima frase interrogativa, non il paragrafo', () => {
    expect(fraseDomanda('Ho finito il primo giro. Ho trovato due strade. Procedo con la B o preferisci la A?\n\nSe vuoi ti spiego.')).toBe('Procedo con la B o preferisci la A?')
  })

  it('senza «?» l ultima riga, tagliata', () => {
    expect(fraseDomanda('riga uno\nriga due')).toBe('riga due')
    expect(fraseDomanda('x'.repeat(500)).length).toBeLessThanOrEqual(200)
  })

  it('«X» ti chiede: non è la domanda', () => {
    expect(fraseDomanda('«Notte» ti chiede:\n\nPubblico adesso?\n\nCosa sta facendo: il lavoro è finito.')).toBe('Pubblico adesso?')
  })
})

describe('la scheda di una domanda', () => {
  it('con le cinque parti: la frase e i tasti a vista, il resto nei dettagli', () => {
    const s = schedaDaParti(chiDi('autopilota', 'Notte', 'E:\\progetti\\SierraDeck'), PARTI)
    expect(s.chi).toBe('autopilota «Notte» · SierraDeck')
    expect(s.domanda).toBe('Pubblico adesso la 0.72.1?')
    // 0.84.3: sotto ogni tasto cosa succede.
    expect(s.scelte).toEqual([
      { testo: 'sì, pubblica', consigliata: true, conseguenza: 'tolgo la bozza e controllo gli allegati' },
      { testo: 'no, lascia così', conseguenza: 'la bozza resta' }
    ])
    expect(s.dettagli.map((d) => d.etichetta)).toEqual(['Cosa sta facendo', 'Perché te lo chiede', 'Cosa succede con ogni scelta', 'Se non rispondi'])
    expect(s.dettagli[2]!.testo).toContain('sì, pubblica → tolgo la bozza')
  })

  it('le opzioni di Claude Code: «(Recommended)» diventa la consigliata, la spiegazione sotto il tasto (0.84.3) e nei dettagli', () => {
    const { scelte, spiegazioni } = scelteDiChat([
      { numero: 1, testo: 'Usa npm (Recommended)', scelta: true, descrizione: 'c è già package-lock.json' },
      { numero: 2, testo: 'Usa pnpm', scelta: false },
      { numero: 3, testo: 'Type something.', scelta: false, libera: true }
    ])
    expect(scelte).toEqual([
      { testo: 'Usa npm (Recommended)', numero: 1, consigliata: true, conseguenza: 'c è già package-lock.json' },
      { testo: 'Usa pnpm', numero: 2 },
      { testo: 'Type something.', numero: 3, etichetta: 'Scrivo io la risposta', libera: true }
    ])
    expect(spiegazioni?.testo).toBe('Usa npm (Recommended) — c è già package-lock.json')
  })

  it('/api/domande: ogni conversazione ha la sua scheda, senza la storia dell autopilota', () => {
    const a = ap({ stato: 'attesa', dialogo: [{ quando: '2026-10-15T10:30:00.000Z', da: 'tu', testo: 'come va?' }] })
    const c = conversazioniDomande({
      voci: [
        { tipo: 'autopilota', id: 'd-1', autopilotaId: 'ap-1', autopilota: 'Notte', origine: 'lavoro', testo: '«Notte» ti chiede:\n\nPubblico adesso la 0.72.1?\n\nCosa sta facendo: …', opzioni: ['sì, pubblica', 'no, lascia così'], parti: PARTI },
        { tipo: 'scelta', chat: 'c-1', titolo: 'Prova', cwd: 'E:\\progetti\\Prova', righe: ['Bash command', 'Do you want to proceed?'], opzioni: [{ numero: 1, testo: 'Yes', scelta: true }, { numero: 2, testo: 'No', scelta: false }], corrente: 0 },
        { tipo: 'chat', chat: 'c-2', titolo: 'Altra', cwd: 'E:\\progetti\\Altra', righe: ['Ho finito. Procedo con la B?'], chiede: true },
        { tipo: 'chat', chat: 'c-3', titolo: 'Ferma', cwd: 'E:\\progetti\\Ferma', righe: ['Fatto.'] }
      ],
      autopiloti: [a]
    })
    const per = Object.fromEntries(c.map((x) => [x.chiave, x.scheda!]))
    expect(per['ap:ap-1']).toMatchObject({ chi: 'autopilota «Notte» · SierraDeck', domanda: 'Pubblico adesso la 0.72.1?', scelte: [{ testo: 'sì, pubblica', consigliata: true }, { testo: 'no, lascia così' }] })
    // Nessuna cronologia nella scheda: «come va?» non c'è.
    expect(JSON.stringify(per['ap:ap-1'])).not.toContain('come va?')
    expect(per['chat:c-1']).toMatchObject({ chi: 'chat «Prova»', domanda: 'Do you want to proceed?', scelte: [{ testo: 'Yes', numero: 1 }, { testo: 'No', numero: 2 }] })
    expect(per['chat:c-2']!.domanda).toBe('Procedo con la B?')
    expect(per['chat:c-3']!.domanda).toBe('Ha finito il turno: cosa le scrivi?')
  })

  it('il via: una frase, «Vai» consigliato, l’obiettivo nei dettagli', () => {
    const c = conversazioniDomande({ voci: [], autopiloti: [ap({ stato: 'pronto' })] })
    expect(c[0]!.scheda).toMatchObject({ domanda: 'Si è preparato: gli dai il via?', scelte: [{ testo: 'Vai', consigliata: true }] })
    expect(c[0]!.scheda!.dettagli.map((d) => d.etichetta)).toEqual(['Obiettivo'])
  })

  it('la linguetta «Domande» dell autopilota ha la stessa scheda', () => {
    const d = domandeScheda(ap({ stato: 'attesa' }), [{ id: 'd-1', autopilotaId: 'ap-1', testo: 'lungo', parti: PARTI, opzioni: ['sì, pubblica', 'no, lascia così'] }])
    expect(d[0]!.scheda).toMatchObject({ domanda: 'Pubblico adesso la 0.72.1?', scelte: [{ testo: 'sì, pubblica', consigliata: true }, { testo: 'no, lascia così' }] })
    const via = domandeScheda(ap({ stato: 'pronto' }), [])
    expect(via[0]!.scheda).toMatchObject({ domanda: 'Si è preparato: gli dai il via?', scelte: [{ testo: 'Vai', consigliata: true }] })
  })
})
