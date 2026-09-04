import { describe, it, expect } from 'vitest'
import { creaPersistenza, type PersistenzaDeps } from '../../src/renderer/persistenza-layout'
import type { LayoutSalvato } from '@shared/workspace'

function ambiente() {
  const salvati: LayoutSalvato[] = []
  const applicati: LayoutSalvato[] = []
  let cambiamento: (() => void) | undefined
  let sottoscrizioneAttiva = false
  let statoEsportato: LayoutSalvato = { root: undefined, panes: [] }
  let risolviCarica: ((l: LayoutSalvato) => void) | undefined
  let rifiutaCarica: ((err: unknown) => void) | undefined

  const deps: PersistenzaDeps = {
    carica: () => new Promise<LayoutSalvato>((ris, rif) => { risolviCarica = ris; rifiutaCarica = rif }),
    salva: (l) => { salvati.push(l) },
    esporta: () => statoEsportato,
    // Come il vero `useLayoutStore.getState().carica`, applicare un layout e'
    // una mutazione dello store: notifica chi e' sottoscritto, sincronamente.
    // Un finto che non lo facesse renderebbe verde la guardia sul caricamento
    // anche se sparisse, perche' il caso che deve intercettare - il primo
    // rirender dopo l'applicazione - non si presenterebbe mai nel test.
    applica: (l) => {
      applicati.push(l)
      statoEsportato = l
      if (sottoscrizioneAttiva) cambiamento?.()
    },
    sottoscrivi: (cb) => {
      cambiamento = cb
      sottoscrizioneAttiva = true
      return () => { sottoscrizioneAttiva = false; cambiamento = undefined }
    }
  }

  return {
    deps,
    salvati,
    applicati,
    emettiCambiamento: () => cambiamento?.(),
    setStatoEsportato: (l: LayoutSalvato) => { statoEsportato = l },
    risolviCarica: (l: LayoutSalvato) => risolviCarica?.(l),
    rifiutaCarica: (err: unknown) => rifiutaCarica?.(err)
  }
}

const layoutA: LayoutSalvato = {
  root: { type: 'pane', id: 'a' },
  panes: [{ id: 'a', sessionUuid: 'u', cwd: 'C:\\p', title: 't' }]
}

const layoutB: LayoutSalvato = {
  root: { type: 'pane', id: 'b' },
  panes: [{ id: 'b', sessionUuid: 'u2', cwd: 'C:\\q', title: 't2' }]
}

/** Porta la persistenza fino a dopo il caricamento, che e' dove tutto comincia. */
async function avviata(a: ReturnType<typeof ambiente>) {
  const p = creaPersistenza(a.deps)
  p.avvia()
  a.risolviCarica({ root: undefined, panes: [] })
  await Promise.resolve()
  await Promise.resolve()
  return p
}

describe('creaPersistenza', () => {
  it('un cambiamento prima che il caricamento sia finito non produce alcun salvataggio', () => {
    const a = ambiente()
    creaPersistenza(a.deps).avvia()
    a.emettiCambiamento()
    expect(a.salvati).toHaveLength(0)
  })

  it('il layout caricato viene applicato e non viene risalvato subito dopo', async () => {
    const a = ambiente()
    creaPersistenza(a.deps).avvia()
    a.risolviCarica(layoutA)
    await Promise.resolve()
    await Promise.resolve()
    expect(a.applicati).toEqual([layoutA])
    // Il punto vero: applicare il layout appena letto notifica i sottoscritti
    // (come farebbe il vero store), ma non deve produrre un salvataggio che lo
    // riscriverebbe sopra se stesso.
    expect(a.salvati).toHaveLength(0)
  })

  it('un layout che arriva dal Core si applica senza essere risalvato', async () => {
    // Il giro senza fine: la finestra applicava il layout spinto dal Core, lo
    // store notificava, partiva un salvataggio con lo scontrino di un attimo
    // prima, il Core rifiutava e rispingeva. Sette gigabyte di registro in un
    // pomeriggio. Quello che arriva dal Core e' gia' la verita' del disco.
    const a = ambiente()
    const p = await avviata(a)
    p.applicaDaFuori(layoutA)
    expect(a.applicati).toEqual([layoutA])
    expect(a.salvati).toHaveLength(0)
    // I cambiamenti veri, dopo, si salvano come sempre.
    a.setStatoEsportato(layoutB)
    a.emettiCambiamento()
    expect(a.salvati).toEqual([layoutB])
  })

  it('un caricamento fallito non blocca i salvataggi successivi', async () => {
    const a = ambiente()
    creaPersistenza(a.deps).avvia()
    a.rifiutaCarica(new Error('disco pieno'))
    await Promise.resolve()
    await Promise.resolve()
    a.setStatoEsportato(layoutA)
    a.emettiCambiamento()
    expect(a.salvati).toEqual([layoutA])
  })

  it('ogni cambiamento e scritto nello stesso istante in cui avviene', async () => {
    // E' il punto 1 della fila. Prima si aspettavano 600 ms dopo l'ultima
    // modifica: sono i 600 ms che un blackout porta via, e con loro l'ultimo
    // riquadro aperto — la perdita piu' fastidiosa possibile, perche' e'
    // proprio l'ultima cosa fatta. Nessun timer, nessun ritardo da attendere
    // nel test: se ricomparisse un rinvio, questa asserzione cadrebbe subito.
    const a = ambiente()
    await avviata(a)

    a.setStatoEsportato(layoutA)
    a.emettiCambiamento()

    expect(a.salvati).toEqual([layoutA])
  })

  it('due cambiamenti ravvicinati arrivano entrambi sul disco, in ordine', async () => {
    // Il ritardo esisteva per il trascinamento di un divisore, che produce un
    // evento per pixel. Il prezzo era che l'ultimo stato poteva non essere mai
    // scritto; il prezzo di toglierlo e' qualche scrittura in piu' di un file
    // piccolo, ed e' il prezzo giusto: qui non si perde niente.
    const a = ambiente()
    await avviata(a)

    a.setStatoEsportato(layoutA)
    a.emettiCambiamento()
    a.setStatoEsportato(layoutB)
    a.emettiCambiamento()

    expect(a.salvati).toEqual([layoutA, layoutB])
  })

  it('chiudi toglie la sottoscrizione e non lascia passare altri salvataggi', async () => {
    const a = ambiente()
    const p = await avviata(a)

    p.chiudi()
    a.setStatoEsportato(layoutA)
    a.emettiCambiamento()

    expect(a.salvati).toHaveLength(0)
  })

  it('salvaSubito scrive lo stato corrente anche senza un cambiamento', async () => {
    // L'ultima parola alla chiusura della finestra: con il salvataggio
    // immediato non c'e' piu' niente in sospeso da svuotare, ma un'uscita e'
    // l'unico momento in cui vale la pena di essere ridondanti.
    const a = ambiente()
    const p = await avviata(a)

    a.setStatoEsportato(layoutA)
    p.salvaSubito()

    expect(a.salvati).toEqual([layoutA])
  })

  it('salvaSubito dopo chiudi non scrive niente', async () => {
    // La stessa guardia di sempre: chiudere prima che il caricamento sia
    // finito, o dopo aver gia' chiuso, non deve scrivere il vuoto sopra il
    // layout salvato.
    const a = ambiente()
    const p = await avviata(a)
    p.chiudi()

    a.setStatoEsportato(layoutA)
    p.salvaSubito()

    expect(a.salvati).toHaveLength(0)
  })
})
