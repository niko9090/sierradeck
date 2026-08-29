import { readdirSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { ArchivioDestinazioni, Destinazione, Segreto } from './destinazioni'
import { apriSessione, ImprontaSconosciuta, suRemoto, unisciRemoto, type Sessione } from './sftp'

/**
 * Le connessioni aperte, e i comandi che l'interfaccia può dare.
 *
 * Sta fra il pannello e il motore, e fa la cosa che nessuno dei due può fare da
 * solo: **tenere aperte le sessioni**. Aprire un canale SSH costa un secondo
 * abbondante fra scambio di chiavi e autenticazione, e sfogliare cartelle ne fa
 * una decina di richieste: riaprirlo ogni volta renderebbe il pannello
 * inutilizzabile senza che nessun errore lo spieghi.
 *
 * Si chiudono da sole dopo un po' che nessuno le usa. Un canale lasciato aperto
 * per sempre non resta aperto per sempre: lo chiude il server, per conto suo, e
 * quasi sempre nel momento in cui stavi per usarlo.
 */

export type Aperta = { sessione: Sessione; ultimoUso: number }

export type EsitoLocale = {
  percorso: string
  su?: string
  voci: { nome: string; percorso: string; cartella: boolean; dimensione: number; quando: number }[]
}

export type Trasferimenti = {
  destinazioni: (cwd: string) => Destinazione[]
  /**
   * Si collega, o dice cosa manca.
   *
   * `impronta` torna quando il server non è ancora fidato: non è un guasto, è
   * la domanda «sei tu?» che va fatta una volta sola per server.
   */
  collega: (id: string) => Promise<{ ok: boolean; impronta?: string; cambiata?: boolean; errore?: string }>
  fidati: (id: string, impronta: string) => void
  elencaRemoto: (id: string, percorso: string) => Promise<{ percorso: string; su: string; voci: unknown[] }>
  elencaLocale: (percorso: string) => EsitoLocale
  scarica: (id: string, remoto: string, cartellaLocale: string) => Promise<void>
  carica: (id: string, locale: string, cartellaRemota: string) => Promise<void>
  creaCartellaRemota: (id: string, percorso: string) => Promise<void>
  eliminaRemoto: (id: string, percorso: string, cartella: boolean) => Promise<void>
  rinominaRemoto: (id: string, da: string, a: string) => Promise<void>
  scollega: (id: string) => void
  /** Chiude tutto: si chiama quando il programma esce. */
  chiudiTutto: () => void
}

/** Dopo tanto che non la usi, una sessione si chiude da sola. */
export const INATTIVA_MS = 5 * 60_000

export function creaTrasferimenti(
  archivio: ArchivioDestinazioni,
  /** L'avanzamento di una copia, per la barra nel pannello. */
  avvisa?: (evento: { id: string; cosa: string; fatti: number; totale: number; finito?: boolean; errore?: string }) => void
): Trasferimenti {
  const aperte = new Map<string, Aperta>()

  const potatura = setInterval(() => {
    const adesso = Date.now()
    for (const [id, a] of aperte) {
      if (adesso - a.ultimoUso < INATTIVA_MS) continue
      try { a.sessione.chiudi() } catch { /* già a terra */ }
      aperte.delete(id)
    }
  }, 60_000)
  // Un timer che tiene vivo il processo all'uscita è il modo classico di far
  // sembrare che il programma non si chiuda mai.
  potatura.unref?.()

  const dammi = async (id: string): Promise<Sessione> => {
    const gia = aperte.get(id)
    if (gia !== undefined) {
      gia.ultimoUso = Date.now()
      return gia.sessione
    }
    const destinazione = archivio.trova(id)
    if (destinazione === undefined) throw new Error('destinazione sconosciuta')
    const segreto: Segreto = archivio.segretoDi(id)
    const sessione = await apriSessione(destinazione, segreto)
    aperte.set(id, { sessione, ultimoUso: Date.now() })
    return sessione
  }

  return {
    destinazioni: (cwd) => archivio.perProgetto(cwd),

    async collega(id) {
      try {
        await dammi(id)
        return { ok: true }
      } catch (err) {
        if (err instanceof ImprontaSconosciuta) {
          return { ok: false, impronta: err.impronta, cambiata: err.cambiata }
        }
        return { ok: false, errore: err instanceof Error ? err.message : String(err) }
      }
    },

    fidati: (id, impronta) => archivio.fidatiDi(id, impronta),

    async elencaRemoto(id, percorso) {
      const s = await dammi(id)
      const dove = percorso.trim() === '' ? await s.casa() : percorso
      const elenco = await s.elenca(dove)
      return { percorso: elenco.percorso, su: suRemoto(elenco.percorso), voci: elenco.voci }
    },

    /**
     * Il lato locale del pannello.
     *
     * Sta qui e non nel renderer perché il renderer non ha il disco: è la
     * stessa ragione per cui le chiavi private non passano da una pagina web.
     */
    elencaLocale(percorso) {
      const su = dirname(percorso)
      const voci: EsitoLocale['voci'] = []
      let dentro: string[] = []
      try {
        dentro = readdirSync(percorso)
      } catch {
        return { percorso, ...(su !== percorso ? { su } : {}), voci: [] }
      }
      for (const nome of dentro) {
        const intero = join(percorso, nome)
        try {
          const st = statSync(intero)
          voci.push({
            nome,
            percorso: intero,
            cartella: st.isDirectory(),
            dimensione: st.size,
            quando: st.mtimeMs
          })
        } catch {
          // Un file che sparisce fra `readdir` e `stat` esiste davvero: un
          // compilatore che lavora nella stessa cartella lo fa di continuo.
        }
      }
      voci.sort((a, b) =>
        a.cartella !== b.cartella ? (a.cartella ? -1 : 1) : a.nome.localeCompare(b.nome, 'it')
      )
      return { percorso, ...(su !== percorso ? { su } : {}), voci }
    },

    async scarica(id, remoto, cartellaLocale) {
      const s = await dammi(id)
      const nome = remoto.split('/').filter((x) => x !== '').pop() ?? 'scaricato'
      const destinazione = join(cartellaLocale, nome)
      try {
        await s.scarica(remoto, destinazione, (p) =>
          avvisa?.({ id, cosa: nome, fatti: p.fatti, totale: p.totale }))
        avvisa?.({ id, cosa: nome, fatti: 1, totale: 1, finito: true })
      } catch (err) {
        avvisa?.({ id, cosa: nome, fatti: 0, totale: 0, finito: true, errore: String(err) })
        throw err
      }
    },

    async carica(id, locale, cartellaRemota) {
      const s = await dammi(id)
      const nome = basename(locale)
      try {
        await s.carica(locale, unisciRemoto(cartellaRemota, nome), (p) =>
          avvisa?.({ id, cosa: nome, fatti: p.fatti, totale: p.totale }))
        avvisa?.({ id, cosa: nome, fatti: 1, totale: 1, finito: true })
      } catch (err) {
        avvisa?.({ id, cosa: nome, fatti: 0, totale: 0, finito: true, errore: String(err) })
        throw err
      }
    },

    async creaCartellaRemota(id, percorso) {
      await (await dammi(id)).creaCartella(percorso)
    },

    async eliminaRemoto(id, percorso, cartella) {
      await (await dammi(id)).elimina(percorso, cartella)
    },

    async rinominaRemoto(id, da, a) {
      await (await dammi(id)).rinomina(da, a)
    },

    scollega(id) {
      const a = aperte.get(id)
      if (a === undefined) return
      try { a.sessione.chiudi() } catch { /* già a terra */ }
      aperte.delete(id)
    },

    chiudiTutto() {
      clearInterval(potatura)
      for (const [, a] of aperte) {
        try { a.sessione.chiudi() } catch { /* già a terra */ }
      }
      aperte.clear()
    }
  }
}
