import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import type { Archivio } from '@shared/workspace'
import { pianoMigrazione, type StatoMigrazione } from '@shared/migrazione-elenco'
import type { StatoAdozione } from '@shared/migrazione-adozione'
import {
  CARTELLA_COPIE_RIPARAZIONE, COPIE_RIPARAZIONE_DA_TENERE, FILE_AUTORIPARAZIONE,
  idRiparazione, leggiStatoRiparazione, nomeCorto, riassuntoRiparazione, sistemate, statoVuoto,
  type AnnulloRiparazione, type MotivoRiparazione, type RapportoRiparazione, type StatoRiparazione, type VoceRiparazione
} from '@shared/autoriparazione'

/**
 * **L'autoriparazione del programma** (k-59), la parte di questo PC: la
 * trasformazione in elenco (0.74.1), l'adozione delle chat già avviate
 * (0.78.0), i workspace nati dopo. Le parti del servizio (autopiloti di
 * prima, chat orfane, copie e rami) le fa il servizio, con
 * `autopilot-host/autoriparazione.ts`: da qui si chiede a lui.
 *
 * Riusa `creaMigrazione` e `creaMigrazioneAdozione` (con le loro copie e il
 * loro «Torna come prima»); in più, prima di ogni cambiamento, una copia sua
 * in `copie-autoriparazione/<id>/principale` e «Torna come prima»
 * dell'insieme (`tornaComePrima`).
 *
 * Mai fermare o riavviare una chat: qui non si tocca nessuna chat. Mai toccare
 * le «solo mia»: le segnala il servizio. Idempotente: se non c'è niente da
 * riparare non scrive niente (né copie né file di stato dei workspace).
 */

export type ServizioRiparazione = {
  /** Il servizio degli autopiloti risponde (e si avvia se serve)? */
  pronto: () => Promise<boolean>
  ripara: (id: string) => Promise<{ voci: VoceRiparazione[]; copiato: boolean }>
  annulla: (id: string) => Promise<{ ripristinati: string[]; rimandati: string[]; errori: string[] }>
}

export type DipendenzeAutoriparazione = {
  dati: string
  leggiArchivio: () => Archivio | undefined
  elenco: { leggi: () => string[]; scrivi: (l: string[]) => void }
  migrazione: { stato: () => StatoMigrazione | undefined; rifai: () => { esito: 'fatta' | 'gia' | 'fallita'; stato?: StatoMigrazione } }
  adozione: { stato: () => StatoAdozione | undefined; rifai: () => Promise<{ esito: 'fatta' | 'gia' | 'fallita' | 'niente'; stato?: StatoAdozione }> }
  servizio?: ServizioRiparazione
  cartellaEsiste?: (cartella: string) => boolean
  /** I PC che questo PC conosce adesso; `undefined` se non si sa ancora (allora i riquadri remoti non si giudicano). */
  pcNoti?: () => string[] | undefined
  /** Il PC che tiene il progetto di questa cartella, se non è questo. */
  casaDi?: (cwd: string) => { id: string; nome: string } | undefined
  log: (riga: string) => void
  errore?: (riga: string) => void
  /** Il rapporto visibile: la notifica del programma. */
  notifica?: (titolo: string, testo: string) => void
  adesso?: () => Date
}

const STATI_DA_COPIARE = ['migrazione-elenco.json', 'migrazione-adozione.json']

export function creaAutoriparazione(d: DipendenzeAutoriparazione) {
  const adesso = d.adesso ?? (() => new Date())
  const errore = d.errore ?? d.log
  const file = join(d.dati, FILE_AUTORIPARAZIONE)
  const radiceCopie = join(d.dati, CARTELLA_COPIE_RIPARAZIONE)
  let inCorso: Promise<RapportoRiparazione | undefined> | undefined

  const leggi = (): StatoRiparazione => {
    try { return existsSync(file) ? leggiStatoRiparazione(JSON.parse(readFileSync(file, 'utf8'))) : statoVuoto() } catch { return statoVuoto() }
  }
  const scrivi = (s: StatoRiparazione): void => {
    if (!scriviJsonAtomico(file, s, 'autoriparazione')) errore(`[autoriparazione] ${FILE_AUTORIPARAZIONE} non si è potuto scrivere`)
  }

  /** Le copie in eccesso (le più vecchie) si tolgono: servono a tornare indietro, non a fare un archivio. */
  const potaCopie = (): void => {
    try {
      const nomi = readdirSync(radiceCopie).filter((n) => /^[0-9]{8}-[0-9]{6}/u.test(n)).sort()
      for (const n of nomi.slice(0, Math.max(0, nomi.length - COPIE_RIPARAZIONE_DA_TENERE))) rmSync(join(radiceCopie, n), { recursive: true, force: true })
    } catch { /* niente da potare */ }
  }

  const nuovoId = (): string => {
    const base = idRiparazione(adesso())
    let id = base
    for (let i = 2; existsSync(join(radiceCopie, id)); i++) id = `${base}-${i}`
    return id
  }

  const esegui = async (motivo: MotivoRiparazione): Promise<RapportoRiparazione | undefined> => {
    const stato0 = leggi()
    // «Torna come prima» è una scelta di Nicholas: da solo non si ripara più, finché non preme «Ripara».
    if (motivo !== 'tasto' && stato0.sospesa === true) return undefined
    const id = nuovoId()
    const voci: VoceRiparazione[] = []
    const principale = join(radiceCopie, id, 'principale')
    let copiato = false
    let elencoPrima: string[] | undefined
    let servizioCambiato = false
    const aggiunti: string[] = []
    const statiPrima = { migrazione: existsSync(join(d.dati, STATI_DA_COPIARE[0]!)), adozione: existsSync(join(d.dati, STATI_DA_COPIARE[1]!)) }
    /** La copia, una volta, prima del primo cambiamento. */
    const copia = (): void => {
      if (copiato) return
      mkdirSync(principale, { recursive: true })
      for (const f of STATI_DA_COPIARE) if (existsSync(join(d.dati, f))) copyFileSync(join(d.dati, f), join(principale, f))
      copiato = true
    }
    const prendiElenco = (): void => { elencoPrima ??= d.elenco.leggi() }

    // 1. La trasformazione in elenco, mai fatta, fallita o rimasta a metà. «Annullata» è una scelta di Nicholas: non si tocca.
    const m = d.migrazione.stato()
    if (m === undefined || m.stato === 'fallita' || m.stato === 'in-corso') {
      try {
        copia()
        prendiElenco()
        const e = d.migrazione.rifai()
        if (e.esito === 'fatta') {
          const era = m === undefined ? 'mai fatta' : m.stato === 'fallita' ? 'fallita' : 'rimasta a metà'
          for (const w of d.leggiArchivio()?.workspace ?? []) voci.push({ caso: 'trasformazione-mancante', workspace: w.nome, esito: 'sistemato', cosa: `«${nomeCorto(w.nome)}»: trasformazione in Panoramica ${era}, ora fatta` })
        } else {
          voci.push({ caso: 'trasformazione-mancante', esito: 'fallito', cosa: `trasformazione in Panoramica non riuscita: ${e.stato?.motivo ?? 'motivo sconosciuto'}` })
        }
      } catch (err) {
        voci.push({ caso: 'trasformazione-mancante', esito: 'fallito', cosa: `trasformazione in Panoramica non riuscita: ${String(err).slice(0, 160)}` })
      }
    }

    // 2. I workspace nati dopo la trasformazione: nella vista a elenco. Quelli che c'erano e che Nicholas ha spento si lasciano.
    const dopoM1 = d.migrazione.stato()
    const archivio = d.leggiArchivio()
    if (dopoM1?.stato === 'fatta' && archivio !== undefined) {
      const elenco = d.elenco.leggi()
      const gestiti = new Set(stato0.aggiuntiAElenco ?? [])
      const nuovi = archivio.workspace
        .map((w) => w.nome)
        .filter((n) => !elenco.includes(n) && !gestiti.has(n) && !dopoM1.dormienti.some((x) => x.workspace === n))
      if (nuovi.length > 0) {
        try {
          copia()
          prendiElenco()
          const piano = pianoMigrazione({ ...archivio, workspace: archivio.workspace.filter((w) => nuovi.includes(w.nome)) }, elenco)
          d.elenco.scrivi(piano.elenco)
          aggiunti.push(...nuovi)
          for (const n of nuovi) voci.push({ caso: 'workspace-fuori-elenco', workspace: n, esito: 'sistemato', cosa: `«${nomeCorto(n)}» era nato dopo la trasformazione: ora è nella Panoramica` })
        } catch (err) {
          voci.push({ caso: 'workspace-fuori-elenco', esito: 'fallito', cosa: `vista a elenco non aggiornata: ${String(err).slice(0, 160)}` })
        }
      }
    }

    // 3. Il servizio: autopiloti di prima, chat orfane, copie e rami. Con la sua copia; le chat occupate aspettano.
    const servizioPronto = d.servizio !== undefined && await d.servizio.pronto().catch(() => false)
    if (d.servizio !== undefined && servizioPronto) {
      try {
        const e = await d.servizio.ripara(id)
        voci.push(...e.voci)
        servizioCambiato = e.copiato
      } catch (err) {
        voci.push({ caso: 'autopiloti-di-prima', esito: 'rimandato', cosa: `il servizio degli autopiloti non ha risposto (${String(err).slice(0, 100)}): riprovo` })
      }
    }

    // 4. L'adozione delle chat già avviate, mai fatta, fallita o rimasta a metà (con il servizio su).
    const dopoM = d.migrazione.stato()
    const ad = d.adozione.stato()
    if (dopoM?.stato === 'fatta' && (ad === undefined || ad.stato === 'fallita' || ad.stato === 'in-corso')) {
      if (d.servizio === undefined || !servizioPronto) {
        voci.push({ caso: 'adozione-mancante', esito: 'rimandato', cosa: 'adozione delle chat già avviate da fare: il servizio degli autopiloti non è pronto' })
      } else {
        try {
          copia()
          const e = await d.adozione.rifai()
          if (e.esito === 'fatta') {
            const era = ad === undefined ? 'mai fatta' : ad.stato === 'fallita' ? 'fallita' : 'rimasta a metà'
            for (const x of e.stato?.adozioni ?? []) voci.push({ caso: 'adozione-mancante', workspace: x.workspace, esito: 'sistemato', cosa: `«${nomeCorto(x.workspace)}»: adozione delle chat già avviate ${era}, ora fatta (${x.sessioni.length} chat adottate)` })
          } else if (e.esito === 'fallita') {
            voci.push({ caso: 'adozione-mancante', esito: 'fallito', cosa: `adozione delle chat già avviate non riuscita: ${e.stato?.motivo ?? 'motivo sconosciuto'}` })
          }
        } catch (err) {
          voci.push({ caso: 'adozione-mancante', esito: 'fallito', cosa: `adozione delle chat già avviate non riuscita: ${String(err).slice(0, 160)}` })
        }
      }
    }

    // 5. Case sparite e chat senza casa: solo segnalate, niente si cancella (una chat di un altro PC può essere spenta, non sparita).
    if (archivio !== undefined) {
      const noti = d.pcNoti?.()
      const esiste = d.cartellaEsiste ?? ((c: string): boolean => existsSync(c))
      for (const w of archivio.workspace) {
        const riquadri = Object.values(w.perSlot).flatMap((l) => l.panes)
        const sparite = noti === undefined ? 0 : riquadri.filter((p) => p.remoto !== undefined && !noti.includes(p.remoto.pcId)).length
        if (sparite > 0) voci.push({ caso: 'casa-sparita', workspace: w.nome, esito: 'segnalato', cosa: `«${nomeCorto(w.nome)}»: ${sparite === 1 ? 'una chat vive' : `${sparite} chat vivono`} su un PC che non risulta più` })
        const senza = riquadri.filter((p) => p.remoto === undefined && p.cwd !== '' && !esiste(p.cwd) && d.casaDi?.(p.cwd) === undefined).length
        if (senza > 0) voci.push({ caso: 'senza-casa', workspace: w.nome, esito: 'segnalato', cosa: `«${nomeCorto(w.nome)}»: ${senza === 1 ? 'una chat ha' : `${senza} chat hanno`} la cartella sparita e nessun PC che la tenga` })
      }
    }

    const rapporto: RapportoRiparazione = { id, quando: adesso().toISOString(), motivo, voci, conCopia: copiato || servizioCambiato }
    const cambiato = sistemate(rapporto).length > 0
    const nuovo: StatoRiparazione = { ...stato0, ultimo: rapporto }
    delete nuovo.sospesa
    if (aggiunti.length > 0) nuovo.aggiuntiAElenco = [...new Set([...(stato0.aggiuntiAElenco ?? []), ...aggiunti])]
    if (cambiato) {
      const annullo: AnnulloRiparazione = {
        id,
        ...(elencoPrima !== undefined ? { elencoPrima } : {}),
        statiPrima,
        servizio: servizioCambiato
      }
      nuovo.ultimoCambiamento = rapporto
      nuovo.annullo = annullo
    }
    if (copiato || servizioCambiato) potaCopie()
    scrivi(nuovo)
    for (const v of voci) {
      if (v.esito === 'sistemato') d.log(`[autoriparazione] ${v.workspace !== undefined ? `${nomeCorto(v.workspace)} — ` : ''}${v.cosa}`)
      else if (v.esito === 'fallito') errore(`[autoriparazione] non riuscito: ${v.cosa}`)
    }
    if (cambiato) {
      d.log(`[autoriparazione] ${riassuntoRiparazione(rapporto)} Copia: ${CARTELLA_COPIE_RIPARAZIONE}/${id}`)
      d.notifica?.('Workspace sistemati', riassuntoRiparazione(rapporto))
    }
    return rapporto
  }

  return {
    stato: leggi,
    /** Una riparazione alla volta: chi chiede mentre ne gira una prende quella. */
    ripara: (motivo: MotivoRiparazione): Promise<RapportoRiparazione | undefined> => {
      inCorso ??= esegui(motivo).catch((err: unknown) => {
        errore(`[autoriparazione] non riuscita: ${String(err)}`)
        return undefined
      }).finally(() => { inCorso = undefined })
      return inCorso
    },
    /** Ci sono cose che aspettano un turno finito? Allora si riprova. */
    daRiprovare: (): boolean => {
      const s = leggi()
      return s.sospesa !== true && (s.ultimo?.voci.some((v) => v.esito === 'rimandato') ?? false)
    },
    /** «Torna come prima»: l'ultima riparazione che ha cambiato qualcosa, annullata. Da solo non si ripara più finché non si preme «Ripara». */
    async tornaComePrima(): Promise<{ ok: boolean; messaggio: string }> {
      const s = leggi()
      const a = s.annullo
      if (a === undefined || a.annullatoIl !== undefined) return { ok: false, messaggio: 'Non c’è una riparazione da annullare.' }
      try {
        if (a.servizio) {
          if (d.servizio === undefined) return { ok: false, messaggio: 'Il servizio degli autopiloti non risponde: riprova fra un momento.' }
          const r = await d.servizio.annulla(a.id)
          if (r.rimandati.length > 0) return { ok: false, messaggio: `Ci sono chat al lavoro in ${r.rimandati.length} workspace: riprova a turno finito.` }
          if (r.errori.length > 0) return { ok: false, messaggio: `Non riuscito: ${r.errori[0]}` }
        }
        const copia = join(radiceCopie, a.id, 'principale')
        if (a.elencoPrima !== undefined) d.elenco.scrivi(a.elencoPrima)
        const stati: Array<[string, boolean]> = [[STATI_DA_COPIARE[0]!, a.statiPrima.migrazione], [STATI_DA_COPIARE[1]!, a.statiPrima.adozione]]
        for (const [nome, c] of stati) {
          const viva = join(d.dati, nome)
          if (c && existsSync(join(copia, nome))) copyFileSync(join(copia, nome), viva)
          else if (!c && existsSync(viva)) renameSync(viva, `${viva}.dopo-annullo-${a.id}`)
        }
        const { aggiuntiAElenco: _tolti, ...resto } = s
        scrivi({ ...resto, annullo: { ...a, annullatoIl: adesso().toISOString() }, sospesa: true })
        d.log(`[autoriparazione] «Torna come prima»: rimesso com'era prima della riparazione ${a.id}; da solo non ripara più, finché non preme «Ripara»`)
        return { ok: true, messaggio: 'Fatto: tutto com’era prima della riparazione. Le chat non sono state toccate.' }
      } catch (err) {
        errore(`[autoriparazione] «Torna come prima» non riuscito: ${String(err)}`)
        return { ok: false, messaggio: `Non riuscito: ${String(err)}` }
      }
    }
  }
}

export type Autoriparazione = ReturnType<typeof creaAutoriparazione>
