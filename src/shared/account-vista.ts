import { stato, type StatoVista } from './stato-vista'
import { statoCassaforte, statoDrive } from './stato-sistema'

/**
 * Account e Drive riprogettati (0.70.0): una catena di quattro tessere —
 * Account → Drive → Cassaforte → Salvataggio — ognuna con la sua parola, e
 * sotto un solo «prossimo passo». Le azioni rare (Scollega, Cambia
 * passphrase, Blocca, Esci) stanno in «Strumenti ▾». Prima: due schede con
 * «collegato ✓»/«da creare» in grigio e un riquadro diverso per ogni caso.
 */

const GIORNO = 86_400_000

/**
 * Quanto manca ai sette giorni di Google. Un'app OAuth ancora «in prova»
 * (Testing) perde il permesso al Drive sette giorni dopo il collegamento: dal
 * sesto giorno lo si dice, per ricollegarlo prima che smetta di salvare.
 */
export function rischioSetteGiorni(collegatoIl: string | undefined, ora: number): { giorni: number; scade: boolean } | undefined {
  if (collegatoIl === undefined) return undefined
  const t = Date.parse(collegatoIl)
  if (Number.isNaN(t)) return undefined
  const giorni = Math.max(0, Math.floor((ora - t) / GIORNO))
  return { giorni, scade: ora - t >= 6 * GIORNO }
}

/** Il salvataggio sul Drive: al sicuro (meno di un giorno), vecchio, o mai. */
export function statoSalvataggio(ultimo: string | undefined, ora: number): StatoVista {
  if (ultimo === undefined) return stato('mai', 'mai', 'ambra', 'non hai ancora salvato su questo Drive')
  const t = Date.parse(ultimo)
  if (Number.isNaN(t)) return stato('mai', 'mai', 'ambra')
  const giorni = Math.floor((ora - t) / GIORNO)
  if (giorni < 1) return stato('al-sicuro', 'al sicuro', 'verde')
  return stato('vecchio', 'vecchio', 'ambra', giorni === 1 ? 'ultimo salvataggio ieri' : `ultimo salvataggio ${giorni} giorni fa`)
}

export type TesseraAccount = { id: 'account' | 'drive' | 'cassaforte' | 'salvataggio'; titolo: string; vista: StatoVista; sotto?: string }
export type PassoAccount = { id: 'entra' | 'connetti' | 'riconosci' | 'crea' | 'sblocca' | 'prova' | 'salva' | 'progetti'; testo: string }

export type IngressoAccount = {
  utente?: { email: string }
  drive?: { configurato: boolean; connesso: boolean; email?: string; collegatoIl?: string }
  sync?: { haCassaforte: boolean; sbloccato: boolean; cassaforteDiversa?: boolean; ultimoSalvataggio?: string }
  ora: number
}

/** Le quattro tessere e il prossimo passo: una sola azione, quella che sblocca la tessera dopo. */
export function vistaAccount(a: IngressoAccount): { tessere: TesseraAccount[]; prossimo?: PassoAccount } {
  const { utente, drive, sync, ora } = a
  const rischio = drive?.connesso === true ? rischioSetteGiorni(drive.collegatoIl, ora) : undefined
  let vDrive = statoDrive(drive)
  if (rischio?.scade === true) {
    vDrive = stato('scade', 'scade', 'ambra', `collegato ${rischio.giorni} giorni fa: se l’app OAuth di Google è ancora «in prova», al settimo giorno perde il permesso. Ricollegalo (Strumenti ▾ → Scollega, poi Connetti)`)
  }
  const tessere: TesseraAccount[] = [
    { id: 'account', titolo: 'Account', vista: utente !== undefined ? stato('entrato', 'entrato', 'verde') : stato('fuori', 'fuori', 'ambra'), ...(utente !== undefined ? { sotto: utente.email } : {}) },
    {
      id: 'drive', titolo: 'Drive', vista: vDrive,
      ...(drive?.email !== undefined ? { sotto: drive.email } : rischio !== undefined ? { sotto: rischio.giorni === 0 ? 'collegato oggi' : `collegato ${rischio.giorni} giorni fa` } : {})
    },
    { id: 'cassaforte', titolo: 'Cassaforte', vista: statoCassaforte(sync) },
    { id: 'salvataggio', titolo: 'Salvataggio', vista: drive?.connesso === true && sync?.sbloccato === true ? statoSalvataggio(sync.ultimoSalvataggio, ora) : stato('attende', '—', 'quieto', 'prima la cassaforte') }
  ]
  const prossimo: PassoAccount | undefined =
    utente === undefined ? { id: 'entra', testo: 'Entra' }
      : drive === undefined || sync === undefined ? undefined
        : !drive.connesso ? (drive.configurato ? { id: 'connetti', testo: 'Collega il Drive' } : undefined)
          : sync.cassaforteDiversa === true ? { id: 'prova', testo: 'Prova la passphrase su questo Drive' }
            : !sync.haCassaforte ? { id: 'crea', testo: 'Crea la passphrase' }
              : !sync.sbloccato ? { id: 'sblocca', testo: 'Sblocca la cassaforte' }
                : sync.ultimoSalvataggio === undefined ? { id: 'salva', testo: 'Salva ora (in Progetti)' }
                  : { id: 'progetti', testo: 'Apri Progetti' }
  return { tessere, ...(prossimo !== undefined ? { prossimo } : {}) }
}

/**
 * Come il PC mostra il prossimo passo (0.80.0). Tre passi hanno il loro tasto
 * qui; gli altri (entra, la passphrase, la cassaforte) si fanno nei riquadri
 * sotto la catena, e prima sul PC non si vedevano proprio, mentre la pagina e
 * l'app li scrivevano. Ora una riga di solo testo.
 */
export function passoSulPc(p: PassoAccount | undefined): { tasto: boolean; testo: string } | undefined {
  if (p === undefined) return undefined
  return { tasto: p.id === 'connetti' || p.id === 'salva' || p.id === 'progetti', testo: p.testo }
}
