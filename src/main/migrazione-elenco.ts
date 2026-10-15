import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import type { Archivio } from '@shared/workspace'
import {
  FILE_MIGRAZIONE, elencoDopoTornaIndietro, leggiStatoMigrazione, pianoMigrazione, type RigaPiano, type StatoMigrazione
} from '@shared/migrazione-elenco'
import { CARTELLA_COPIE } from './copie-di-versione'

/**
 * La trasformazione dei workspace di questo PC (0.74.1), al primo avvio della
 * versione nuova. Le regole sono in `shared/migrazione-elenco.ts`; qui i file.
 *
 * L'ordine, pensato perché un guasto o uno spegnimento a metà non lascino
 * niente di storto:
 * 1. **copia atomica** di workspaces.json, case-chat, finestre, impostazioni,
 *    sottofondo e autopiloti in `copie-di-versione/migrazione-elenco-<quando>`
 *    (si scrive in una cartella `.tmp` e la si rinomina solo a copia finita);
 * 2. lo stato `in-corso`, con com'era la preferenza;
 * 3. la preferenza `workspaceElenco` con tutti i workspace;
 * 4. lo stato `fatta`, con gli autopiloti dormienti.
 *
 * Un riavvio fra 2 e 4 trova `in-corso`: rimette la preferenza com'era e rifà
 * da capo (idempotente). Un errore in qualunque passo rimette com'era, scrive
 * `fallita` con il motivo e lo dice nel registro `[migrazione]`: il programma
 * parte comunque, come prima.
 */

export type DipendenzeMigrazione = {
  dati: string
  leggiArchivio: () => Archivio | undefined
  leggiElenco: () => string[]
  scriviElenco: (l: string[]) => void
  log: (riga: string) => void
  errore?: (riga: string) => void
  adesso?: () => Date
  /** Solo per le prove: solleva a un passo, come un guasto o uno spegnimento lì. */
  guasto?: (passo: 'copia' | 'dopo-in-corso' | 'dopo-elenco') => void
}

export type EsitoMigrazione = { esito: 'fatta' | 'gia' | 'fallita'; stato?: StatoMigrazione; righe?: RigaPiano[] }

/** I file da mettere al sicuro: i soli che la trasformazione potrebbe riguardare, più gli autopiloti. */
const FILE_DA_COPIARE = ['workspaces.json', 'case-chat.json', 'finestre.json', 'impostazioni.json', 'sottofondo.json']

export function creaMigrazione(d: DipendenzeMigrazione) {
  const adesso = d.adesso ?? (() => new Date())
  const file = join(d.dati, FILE_MIGRAZIONE)
  const errore = d.errore ?? d.log

  const stato = (): StatoMigrazione | undefined => {
    try { return existsSync(file) ? leggiStatoMigrazione(JSON.parse(readFileSync(file, 'utf8'))) : undefined } catch { return undefined }
  }
  const scrivi = (s: StatoMigrazione): void => {
    if (!scriviJsonAtomico(file, s, 'migrazione')) throw new Error(`${FILE_MIGRAZIONE} non si è potuto scrivere`)
  }

  /** La copia atomica: tutta in `.tmp`, poi un solo rename. Torna il nome della cartella. */
  const copia = (): string => {
    d.guasto?.('copia')
    const t = adesso().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', '-')
    const radice = join(d.dati, CARTELLA_COPIE)
    // Un nome libero: due copie nello stesso secondo («Rifai» subito dopo) non si scontrano.
    let nome = `migrazione-elenco-${t}`
    for (let i = 2; existsSync(join(radice, nome)); i++) nome = `migrazione-elenco-${t}-${i}`
    const tmp = join(radice, `.${nome}.tmp`)
    mkdirSync(join(tmp, 'autopiloti'), { recursive: true })
    for (const f of FILE_DA_COPIARE) if (existsSync(join(d.dati, f))) copyFileSync(join(d.dati, f), join(tmp, f))
    const ap = join(d.dati, 'autopiloti')
    if (existsSync(ap)) {
      for (const f of readdirSync(ap)) {
        if (f.endsWith('.json') && statSync(join(ap, f)).isFile()) copyFileSync(join(ap, f), join(tmp, 'autopiloti', f))
      }
    }
    renameSync(tmp, join(radice, nome))
    return nome
  }

  const esegui = (forza = false): EsitoMigrazione => {
    const prima = stato()
    if (!forza && (prima?.stato === 'fatta' || prima?.stato === 'annullata')) return { esito: 'gia', stato: prima }
    if (!forza && prima?.stato === 'fallita') return { esito: 'fallita', stato: prima }
    // Un riavvio a metà: si rimette com'era, poi si rifà da capo.
    if (prima?.stato === 'in-corso') {
      d.log(`[migrazione] trovata a metà (iniziata ${prima.iniziata}): rimetto la vista com'era e la rifaccio da capo`)
      d.scriviElenco(prima.prima.workspaceElenco)
    }
    const com = prima?.stato === 'in-corso' ? prima.prima : { workspaceElenco: d.leggiElenco() }
    try {
      const a = d.leggiArchivio()
      if (a === undefined) throw new Error("l'archivio dei workspace non si legge")
      const cartella = copia()
      const iniziata = adesso().toISOString()
      scrivi({ versione: 1, stato: 'in-corso', iniziata, copia: cartella, prima: com, aggiunti: [], dormienti: [] })
      d.guasto?.('dopo-in-corso')
      const piano = pianoMigrazione(a, com.workspaceElenco)
      d.scriviElenco(piano.elenco)
      d.guasto?.('dopo-elenco')
      const fatta: StatoMigrazione = { versione: 1, stato: 'fatta', iniziata, finita: adesso().toISOString(), copia: cartella, prima: com, aggiunti: piano.aggiunti, dormienti: piano.dormienti }
      scrivi(fatta)
      d.log(`[migrazione] fatta: ${a.workspace.length} workspace a elenco (${piano.aggiunti.length} nuovi), ${piano.dormienti.reduce((n, x) => n + x.chat, 0)} chat lasciate come erano; copia in ${CARTELLA_COPIE}/${cartella}`)
      for (const r of piano.righe) d.log(`[migrazione] «${r.workspace}»: ${r.chat} chat → ${r.diventa}`)
      return { esito: 'fatta', stato: fatta, righe: piano.righe }
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err)
      try { d.scriviElenco(com.workspaceElenco) } catch (e) { errore(`[migrazione] non riesco a rimettere la vista com'era: ${String(e)}`) }
      const fallita: StatoMigrazione = { versione: 1, stato: 'fallita', iniziata: adesso().toISOString(), prima: com, aggiunti: [], dormienti: [], motivo }
      try { scrivi(fallita) } catch { /* lo dice il registro */ }
      errore(`[migrazione] non riuscita, tutto com'era prima: ${motivo}`)
      return { esito: 'fallita', stato: fallita }
    }
  }

  return {
    stato,
    esegui: (): EsitoMigrazione => esegui(false),
    /** «Rifai la trasformazione»: dopo un guasto o dopo «Torna come prima». */
    rifai: (): EsitoMigrazione => esegui(true),
    /** «Torna come prima»: la vista esattamente com'era; le chat non si toccano. */
    tornaComePrima(): { ok: boolean; messaggio: string } {
      const s = stato()
      if (s === undefined || (s.stato !== 'fatta' && s.stato !== 'in-corso')) return { ok: false, messaggio: 'Non c’è una trasformazione da annullare.' }
      try {
        d.scriviElenco(elencoDopoTornaIndietro(s))
        scrivi({ ...s, stato: 'annullata', finita: adesso().toISOString() })
        d.log(`[migrazione] «Torna come prima»: vista com'era (${s.prima.workspaceElenco.length} workspace a elenco), autopiloti dormienti tolti; chat non toccate`)
        return { ok: true, messaggio: 'Fatto: i workspace sono tornati come prima. Le chat non sono state toccate.' }
      } catch (err) {
        errore(`[migrazione] «Torna come prima» non riuscito: ${String(err)}`)
        return { ok: false, messaggio: `Non riuscito: ${String(err)}` }
      }
    }
  }
}

export type Migrazione = ReturnType<typeof creaMigrazione>
