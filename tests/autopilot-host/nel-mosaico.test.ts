import { describe, it, expect } from 'vitest'
import { esecutoreNelMosaico, primoCompito } from '../../src/autopilot-host/nel-mosaico'
import { creaConsegne } from '../../src/autopilot-host/consegne'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

const autopilota = (over: Partial<Autopilota> = {}): Autopilota => ({
  ...nuovoAutopilota({
    id: 'ap-1',
    nome: 'Notte',
    obiettivo: 'Fai passare i test',
    cwd: 'C:\\progetto',
    criteri: [{ descrizione: 'npm test verde', comando: 'npm test', soddisfatto: false }],
    iniziatoIl: '2026-08-13T01:00:00.000Z'
  }),
  ...over
})

function banco() {
  const consegne = creaConsegne()
  const ricordate: { chatId: string; sessionId: string }[] = []
  let n = 0
  const esecutore = esecutoreNelMosaico({
    consegne,
    nuovaSessione: () => { n += 1; return `sessione-${n}` },
    ricorda: (_ap, chatId, sessionId) => { ricordate.push({ chatId, sessionId }) }
  })
  return { consegne, esecutore, ricordate }
}

describe('l autopilota che scrive nelle chat', () => {
  it('non lancia niente: mette in coda cosa scrivere', async () => {
    // È tutto il punto. Prima l'autopilota eseguiva in un processo suo e di
    // quel lavoro si vedeva un riassunto in una riga; adesso l'istruzione
    // compare dentro una chat, scritta come l'avresti scritta tu.
    const { consegne, esecutore } = banco()
    await esecutore.avvia(autopilota())
    const [c] = consegne.preleva()
    expect(c?.cosa).toBe('scrivi')
    expect(c?.cwd).toBe('C:\\progetto')
    expect(c?.testo).toContain('Fai passare i test')
    expect(c?.testo).toContain('npm test verde')
  })

  it('decide lei l identificatore della sessione, e lo fa sapere', () => {
    // Imporlo fin dall'inizio è ciò che permette di aprire **quella**
    // conversazione: altrimenti lo sceglie Claude Code e si scopre solo al
    // primo hook, dopo minuti in cui non si sa cosa mostrare.
    const { esecutore, ricordate } = banco()
    void esecutore.avvia(autopilota())
    expect(ricordate).toEqual([{ chatId: 'ap-1', sessionId: 'sessione-1' }])
  })

  it('la seconda istruzione va nella stessa conversazione', async () => {
    // Una chat che riprende ha già in memoria l'obiettivo e il lavoro fatto:
    // aprirne una nuova a ogni giro vorrebbe dire buttarlo via ogni volta.
    const { consegne, esecutore, ricordate } = banco()
    await esecutore.avvia(autopilota())
    consegne.preleva()
    await esecutore.avvia(autopilota(), 'prosegui: manca il criterio 2')
    const [c] = consegne.preleva()
    expect(c?.sessionId).toBe('sessione-1')
    expect(c?.testo).toBe('prosegui: manca il criterio 2')
    // E non si è inventata una seconda sessione da ricordare.
    expect(ricordate).toHaveLength(1)
  })

  it('riprende la sessione che l autopilota gia aveva', async () => {
    const { consegne, esecutore } = banco()
    await esecutore.avvia(autopilota({ sessionId: 'di-ieri' }))
    expect(consegne.preleva()[0]?.sessionId).toBe('di-ieri')
  })

  it('ogni chat della flotta ha la sua conversazione e il suo compito', async () => {
    const { consegne, esecutore } = banco()
    const a = autopilota()
    await esecutore.avvia(a, undefined, { id: 'ch-1', compito: 'i test', stato: 'lavoro', cicli: 0 })
    await esecutore.avvia(a, undefined, { id: 'ch-2', compito: 'la documentazione', stato: 'lavoro', cicli: 0 })
    const tutte = consegne.preleva()
    expect(tutte.map((c) => c.chatId)).toEqual(['ch-1', 'ch-2'])
    expect(tutte[0]?.sessionId).not.toBe(tutte[1]?.sessionId)
    expect(tutte[0]?.testo).toContain('i test')
    expect(tutte[1]?.testo).toContain('la documentazione')
  })

  it('fermare toglie gli ordini in coda e chiede di interrompere', async () => {
    // Consegnare un'istruzione dopo lo stop vorrebbe dire far ripartire da solo
    // un autopilota che qualcuno ha appena fermato.
    const { consegne, esecutore } = banco()
    await esecutore.avvia(autopilota())
    esecutore.ferma('ap-1')
    const rimaste = consegne.preleva()
    expect(rimaste.map((c) => c.cosa)).toEqual(['interrompi'])
    expect(esecutore.attivi()).toEqual([])
  })

  it('fermare una chat sola non ferma le altre', async () => {
    const { esecutore } = banco()
    const a = autopilota()
    await esecutore.avvia(a, undefined, { id: 'ch-1', compito: 'x', stato: 'lavoro', cicli: 0 })
    await esecutore.avvia(a, undefined, { id: 'ch-2', compito: 'y', stato: 'lavoro', cicli: 0 })
    esecutore.ferma('ap-1', 'ch-1')
    expect(esecutore.attivi()).toEqual(['ap-1::ch-2'])
  })
})

describe('il primo messaggio', () => {
  it('dice l obiettivo, i criteri e come si verificano', () => {
    const testo = primoCompito(autopilota())
    expect(testo).toContain('Fai passare i test')
    expect(testo).toContain('si verifica con: npm test')
    expect(testo).toContain('Lavora fino a soddisfarli tutti.')
  })

  it('dice alla chat che qualcuno la sta guardando e puo intervenire', () => {
    // Senza, un'osservazione buttata lì in mezzo verrebbe trattata come una
    // digressione da chiudere in fretta — mentre è quasi sempre una correzione
    // di rotta: nessuno interrompe un lavoro per fare conversazione.
    const testo = primoCompito(autopilota())
    expect(testo).toContain('se')
    expect(testo.toLowerCase()).toContain('scrive qualcosa mentre lavori')
  })

  it('a una chat della flotta dice anche qual e il suo pezzo', () => {
    // L'obiettivo resta sopra perché serve a capire perché quel pezzo esiste.
    const testo = primoCompito(autopilota(), { id: 'ch-1', compito: 'solo i test', stato: 'lavoro', cicli: 0 })
    expect(testo).toContain('Fai passare i test')
    expect(testo).toContain('Il tuo compito, dentro questo obiettivo: solo i test')
  })
})

describe('dove va il lavoro', () => {
  // Il workspace lo decide l'autopilota alla nascita, e la consegna se lo
  // porta. Dedurlo cercando la sessione in `workspaces.json` funziona solo per
  // una chat **ripresa**: per una che deve **nascere** quella sessione non c'e'
  // ancora, la ricerca torna a vuoto, e la chat compare nel workspace che hai
  // davanti — non nel suo.
  it('la consegna porta il workspace dell autopilota', async () => {
    const { consegne, esecutore } = banco()
    await esecutore.avvia(autopilota({ workspace: 'lavoro' }))
    expect(consegne.preleva()[0]?.workspace).toBe('lavoro')
  })

  it('un autopilota senza workspace non ne inventa uno', async () => {
    // Gli autopiloti nati prima di questo campo restano validi: la consegna
    // arriva senza destinazione e la chat nasce dove sei, come faceva prima.
    const { consegne, esecutore } = banco()
    await esecutore.avvia(autopilota())
    expect(consegne.preleva()[0]?.workspace).toBeUndefined()
  })

  it('anche l interruzione sa dove andare', async () => {
    // Fermare una chat vuol dire scriverle dentro: se la finestra non va prima
    // nel suo workspace, l'interruzione finisce in una copia aperta altrove.
    const { consegne, esecutore } = banco()
    await esecutore.avvia(autopilota({ workspace: 'lavoro' }))
    consegne.preleva()
    esecutore.ferma('ap-1')
    expect(consegne.preleva()[0]?.workspace).toBe('lavoro')
  })
})
