import { readFileSync } from 'node:fs'
import { hostname, userInfo } from 'node:os'
import { join } from 'node:path'
import type { AttesaInvio } from '@shared/attesa-invio'
import type { InvioErrori } from '@shared/storico-errori'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { mandaErrori } from '../main/errori-arrivati'
import { giroRapportoLavori, mandaRapporto, righeDeiRegistri, type StatoRapporto } from '../main/rapporti-lavori'
import type { RapportoLavori } from '@shared/rapporto-lavori'
import { giroInvioErrori, pcSviluppoDi, type StatoInvio } from '../main/errori-invio-automatico'
import { apriStoricoErrori, conStorico, leggiStoricoDi, type StoricoSuFile } from '../main/storico-errori-file'
import type { Registro } from '../main/registro'

/**
 * **Gli errori dell'Aiutante verso il PC di sviluppo** (12/11). Nicholas:
 * «anche l'aiutante deve mandare al PC di sviluppo gli errori o blocchi ecc».
 *
 * Gli stessi pezzi del programma completo, senza riscriverli:
 * - `conStorico`: ogni `registro.errore` entra nello storico degli errori
 *   (senza segreti né il nome del PC o dell'utente, `togliSegreti`);
 * - `giroInvioErrori` + `mandaErrori`: quelli non ancora mandati partono da
 *   soli verso il PC di sviluppo (quello scelto, o il proprietario del
 *   progetto SierraDeck), sul collegamento sicuro; se quel PC è spento,
 *   restano sul Drive nella sua posta e arrivano appena si accende.
 *
 * Sul PC di sviluppo arrivano in «Errori arrivati» con il nome dell'Aiutante
 * (`invio.da`, la cartella del mittente).
 */

export type InvioErroriAiutante = {
  registro: Registro
  storico: StoricoSuFile
  /** Un giro dell'invio automatico; `forza` salta le attese («Manda ora»). */
  giro: (forza?: boolean) => Promise<{ ok: boolean; messaggio: string }>
}

/** Il registro con lo storico degli errori: da fare per primo, così anche i guai dell'avvio ci finiscono. */
export function registroConStorico(p: { dati: string; versione: string; registro: Registro; nomePc?: () => string | undefined }): { registro: Registro; storico: StoricoSuFile } {
  const storico = apriStoricoErrori(p.dati, 'app', {
    versione: p.versione,
    nomi: () => {
      const n: string[] = [hostname()]
      try { n.push(userInfo().username) } catch { /* senza utente */ }
      try { const scelto = p.nomePc?.(); if (scelto !== undefined && scelto !== '') n.push(scelto) } catch { /* non ancora pronta */ }
      return n
    }
  })
  return { registro: conStorico(p.registro, storico), storico }
}

/**
 * k-193a: il rapporto dei lavori dell'Aiutante (unioni, criteri, compiti dei
 * suoi registri) verso lo stesso PC di riferimento, sullo stesso canale. Se
 * l'Aiutante non ha avuto lavori non manda niente.
 */
export function creaInvioRapporti(d: {
  dati: string
  versione: string
  registro: Registro
  io: () => { id: string; nome: string }
  pcScelto: () => string | undefined
  progetti: () => ReadonlyArray<{ nome: string; proprietario?: string }>
  nomeDi: (pcId: string) => string | undefined
  chiama: (pcId: string, percorso: string, corpo: RapportoLavori) => Promise<unknown>
  perPosta: (pcId: string, rapporto: RapportoLavori, err: unknown) => Promise<boolean>
  adesso?: () => number
}): { giro: (forza?: boolean) => Promise<{ ok: boolean; messaggio: string }> } {
  const file = join(d.dati, 'rapporti-lavori-invio.json')
  const leggi = (): StatoRapporto | undefined => { try { return JSON.parse(readFileSync(file, 'utf8')) as StatoRapporto } catch { return undefined } }
  const pc = (): string | undefined => pcSviluppoDi(d.pcScelto(), d.progetti())
  let inCorso = false
  let motivo: string | undefined
  let attesa: AttesaInvio | undefined
  const giro = async (forza = false): Promise<{ ok: boolean; messaggio: string }> => {
    if (inCorso) return { ok: false, messaggio: 'Sto già mandando il rapporto dei lavori.' }
    inCorso = true
    try {
      return await giroRapportoLavori({
        righe: (giorno) => righeDeiRegistri(d.registro.cartella(), giorno),
        stato: { leggi, scrivi: (s) => { scriviJsonAtomico(file, s, 'rapporti-invio') } },
        pcRiferimento: pc,
        adesso: d.adesso ?? Date.now,
        da: () => d.io().nome || d.io().id,
        versione: d.versione,
        manda: (rapporto) => mandaRapporto({
          pcRiferimento: pc(),
          io: d.io(),
          rapporto,
          nomeDi: d.nomeDi,
          chiama: d.chiama,
          // Un Aiutante non è mai il PC di riferimento.
          salvaQui: () => ({ ok: false, errore: 'Un Aiutante non è il PC di sviluppo: scegline un altro.' }),
          perPosta: d.perPosta,
          log: (r) => d.registro.info(r)
        }),
        log: (r) => d.registro.info(r),
        fallimento: { leggi: () => motivo, scrivi: (m) => { motivo = m } },
        attesa: { leggi: () => attesa, scrivi: (a) => { attesa = a } },
        forza
      })
    } catch (err) {
      d.registro.info(`[rapporti] giro non riuscito: ${err instanceof Error ? err.message : String(err)}`)
      return { ok: false, messaggio: 'Rapporto non mandato: riprovo da solo.' }
    } finally {
      inCorso = false
    }
  }
  return { giro }
}

export function creaInvioErrori(d: {
  dati: string
  versione: string
  registro: Registro
  storico: StoricoSuFile
  io: () => { id: string; nome: string }
  /** Il PC scelto nelle impostazioni dell'Aiutante, se c'è. */
  pcScelto: () => string | undefined
  /** I progetti del registro sul Drive: il proprietario di SierraDeck è il PC di sviluppo di serie. */
  progetti: () => ReadonlyArray<{ nome: string; proprietario?: string }>
  nomeDi: (pcId: string) => string | undefined
  chiama: (pcId: string, percorso: string, corpo: InvioErrori) => Promise<unknown>
  /** Il PC di sviluppo non risponde: gli errori nella sua posta sul Drive. `false` se non si può. */
  perPosta: (pcId: string, invio: InvioErrori, err: unknown) => Promise<boolean>
  adesso?: () => number
}): InvioErroriAiutante {
  const adesso = d.adesso ?? Date.now
  const fileInvio = join(d.dati, 'errori-invio-automatico.json')
  const leggiStato = (): StatoInvio | undefined => { try { return JSON.parse(readFileSync(fileInvio, 'utf8')) as StatoInvio } catch { return undefined } }
  const pcSviluppo = (): string | undefined => pcSviluppoDi(d.pcScelto(), d.progetti())
  let inCorso = false
  let motivoFallito: string | undefined
  let attesa: AttesaInvio | undefined
  const giro = async (forza = false): Promise<{ ok: boolean; messaggio: string }> => {
    if (inCorso) return { ok: false, messaggio: 'Sto già mandando gli errori: riprova fra poco.' }
    inCorso = true
    try {
      return await giroInvioErrori({
        storico: () => leggiStoricoDi(d.dati, d.storico.leggi()),
        stato: { leggi: leggiStato, scrivi: (s) => { scriviJsonAtomico(fileInvio, s, 'errori-invio') } },
        pcSviluppo,
        // Un Aiutante non è mai il PC di sviluppo: non ha la cartella di SierraDeck.
        eSviluppo: () => false,
        adesso,
        manda: (s) => mandaErrori({
          pcSviluppo: pcSviluppo(),
          io: d.io(),
          versione: d.versione,
          storico: s,
          nomeDi: d.nomeDi,
          chiama: d.chiama,
          salvaQui: () => ({ ok: false, errore: 'Un Aiutante non è il PC di sviluppo: scegline un altro.' }),
          perPosta: d.perPosta,
          log: (r) => d.registro.info(r)
        }),
        log: (r) => d.registro.info(r),
        fallimento: { leggi: () => motivoFallito, scrivi: (m) => { motivoFallito = m } },
        attesa: { leggi: () => attesa, scrivi: (a) => { attesa = a } },
        forza
      })
    } catch (err) {
      d.registro.info(`[errori] invio automatico: giro non riuscito: ${err instanceof Error ? err.message : String(err)}`)
      return { ok: false, messaggio: 'Non mandati: qualcosa è andato storto, riprovo da solo.' }
    } finally {
      inCorso = false
    }
  }
  return { registro: d.registro, storico: d.storico, giro }
}
