import { join } from 'node:path'
import type { IpcMain } from 'electron'
import { bozzaProva, type DomandaDelProgramma } from '@shared/avvisi-telefono'
import type { DomandaPerDomande } from '@shared/domande-telefono'
import { idDomandaConferma, leggiIdDomandaConferma, OPZIONI_CONFERMA, testoConferma } from '@shared/file-telefono'
import { leggiIdDomandaPersonale } from '@shared/quaderno-personale'
import type { AlTelefono } from './al-telefono'
import { FILE_GIORNALE_AVVISI } from '../autopilot-host/giornale-avvisi'
import { invioReale } from '../autopilot-host/telegram'
import { apriAvvisi, type RegistroAvvisi } from './avvisi'
import { GIRO_ALTRI_PC_MS, GIRO_AVVISI_MS, creaFontiAvvisi, statoAvvisi, type DipendenzeAvvisiPc } from './avvisi-pc'
import { avviaTelegram, configurazioneTelegram } from './avvisi-telegram'
import { conAvvisi, vistaAvvisi, type RottaClient, type VistaAvvisi } from './rotte-avvisi'

/**
 * **Gli avvisi del PC, accesi** (11/11): il registro su disco, i giri che lo
 * riempiono, Telegram, e le rotte per il telefono e la pagina. In `index.ts`
 * restano due righe: questa chiamata, e le rotte del telefono avvolte con
 * `rotte`.
 */

/** Il primo giro verso gli altri PC: dopo l'avvio, quando il collegamento con loro è pronto. */
const PRIMO_GIRO_ALTRI_PC_MS = 15_000

export type AvvisiAccesi = {
  registro: RegistroAvvisi
  /** Le rotte del telefono con quelle degli avvisi davanti. */
  rotte: (interna: RottaClient) => RottaClient
  /** Per la schermata «Notifiche» del PC. */
  vista: () => VistaAvvisi
  prova: () => void
  ferma: () => void
}

/**
 * Le domande che apre il programma: il sì a un file che sta fuori dalla
 * cartella della chat, il consenso a un dato del quaderno personale. Le stesse
 * che il PC mette nelle Domande (`index.ts`, `rotte.domande`).
 */
export function domandeDelProgramma(coda: Pick<AlTelefono, 'elenco'>, quaderno: { domande: () => readonly DomandaPerDomande[] }): DomandaDelProgramma[] {
  return [
    ...coda.elenco().filter((c) => c.stato === 'conferma').map((c) => ({
      id: idDomandaConferma(c.id), testo: testoConferma(c), opzioni: [...OPZIONI_CONFERMA], da: `Manda al telefono · ${c.daChat ?? 'una chat'}`
    })),
    ...quaderno.domande().map((d) => ({
      id: d.id, testo: d.testo, ...(d.opzioni !== undefined ? { opzioni: d.opzioni } : {}), ...(d.da !== undefined ? { da: d.da } : {}),
      ...(d.sotto !== undefined ? { sotto: d.sotto } : {}), ...(d.scadeIl !== undefined ? { scadeIl: d.scadeIl } : {})
    }))
  ]
}
export const eDomandaDelProgramma = (id: string): boolean => leggiIdDomandaConferma(id) !== undefined || leggiIdDomandaPersonale(id) !== undefined

export function accendiAvvisi(deps: Omit<DipendenzeAvvisiPc, 'registro' | 'fileGiornale' | 'domandeDelProgramma' | 'delProgramma' | 'consegne'> & {
  /** La cartella dei dati del programma: lì il registro, e sotto `autopiloti/servizio` il giornale del servizio. */
  dati: string
  log: (riga: string) => void
  /** I telefoni accoppiati: la riga di stato e il nome nella riga della consegna. */
  telefoni: () => readonly { id: string; nome: string; ultimoAccesso?: string }[]
  /** I file per il telefono, e il quaderno personale: le loro domande e i loro avvisi. */
  coda: Pick<AlTelefono, 'elenco'>
  quadernoPersonale: { domande: () => readonly DomandaPerDomande[] }
  ambiente?: Record<string, string | undefined>
}): AvvisiAccesi {
  const { dati, log, telefoni, ambiente, coda, quadernoPersonale, ...fontiDeps } = deps
  const registro = apriAvvisi({ file: join(dati, 'avvisi.json'), log })
  const fonti = creaFontiAvvisi({
    ...fontiDeps, registro, fileGiornale: join(dati, 'autopiloti', 'servizio', FILE_GIORNALE_AVVISI), log,
    domandeDelProgramma: () => domandeDelProgramma(coda, quadernoPersonale),
    delProgramma: eDomandaDelProgramma,
    consegne: () => coda.elenco()
  })
  const stato = () => statoAvvisi(registro, telefoni(), Date.now())

  const giro = setInterval(() => { fonti.giro() }, GIRO_AVVISI_MS)
  giro.unref?.()
  fonti.giro()
  let altriInCorso = false
  const giroAltri = (): void => {
    if (altriInCorso) return
    altriInCorso = true
    void fonti.giroAltriPc()
      .catch((err: unknown) => { log(`[avviso] giro degli altri PC non riuscito: ${err instanceof Error ? err.message : String(err)}`) })
      .finally(() => { altriInCorso = false })
  }
  const primo = setTimeout(giroAltri, PRIMO_GIRO_ALTRI_PC_MS)
  primo.unref?.()
  const altri = setInterval(giroAltri, GIRO_ALTRI_PC_MS)
  altri.unref?.()
  const smettiTelegram = avviaTelegram(registro, { configurazione: configurazioneTelegram(ambiente ?? process.env, dati, log), manda: invioReale, log })

  return {
    registro,
    rotte: (interna) => conAvvisi(interna, {
      registro,
      stato,
      nomeDispositivo: (id) => telefoni().find((t) => t.id === id)?.nome
    }),
    vista: () => vistaAvvisi(registro, stato()),
    prova: () => { registro.nasce(bozzaProva(new Date())) },
    ferma: () => { clearInterval(giro); clearTimeout(primo); clearInterval(altri); smettiTelegram() }
  }
}

/** La schermata «Notifiche» del PC: leggere, cambiare, provare. */
export function ipcAvvisi(ipc: Pick<IpcMain, 'handle' | 'removeHandler'>, avvisi: AvvisiAccesi): void {
  ipc.removeHandler('avvisi:stato')
  ipc.handle('avvisi:stato', () => avvisi.vista())
  ipc.removeHandler('avvisi:imposta')
  ipc.handle('avvisi:imposta', (_e, x: unknown) => avvisi.registro.imposta(x))
  ipc.removeHandler('avvisi:prova')
  ipc.handle('avvisi:prova', () => { avvisi.prova(); return avvisi.vista() })
}
