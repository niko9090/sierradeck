import { execFile } from 'node:child_process'
import { closeSync, mkdirSync, openSync, readSync, rmSync, statSync, appendFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
  idLavoroValido, lavoroAffidatoValido, modoAiutoValido, PACCHETTO_MAX_BYTE, PEZZO_BYTE, quantiPezzi, ramoDiRitorno,
  SILENZIO_MAX_MS, type Aiutante, type LavoroAffidato, type VistaLavoroAiutato
} from '@shared/aiuto-rete'

/**
 * **Lo spedizioniere** (0.103.0): il pezzo del programma che porta a un altro
 * PC il lavoro che il servizio gli ha affidato, e lo riporta indietro.
 *
 * A ogni giro: chiede agli altri PC quanti posti hanno per gli altri (ogni
 * mezzo minuto), lo dice al servizio, e riceve i lavori da spedire o da
 * seguire. Per ognuno: `git bundle` del ramo principale, i pezzi sul
 * collegamento sicuro, l'avvio; poi lo stato ogni pochi secondi; alla fine il
 * ramo ritirato a pezzi e preso nel progetto (`git fetch` dal pacchetto), e
 * l'esito al servizio, che lo unisce come quello di uno specialista di qui.
 *
 * Non tiene niente di suo: i lavori stanno nel servizio, e dopo un riavvio
 * del programma il giro li ritrova e riprende a seguirli.
 */

export type DipendenzeSpedizioniere = {
  /** Gli altri PC accesi adesso. */
  altri: () => { pcId: string; nome: string }[]
  /** Una rotta di un altro PC, sul collegamento sicuro. */
  chiama: (pcId: string, percorso: string, corpo?: Record<string, unknown>) => Promise<unknown>
  /** Una rotta `/aiuto/*` del servizio di questo PC. */
  servizio: (percorso: string, corpo?: Record<string, unknown>) => Promise<unknown>
  /** Dove preparare i pacchetti (si svuota da sé). */
  cartella: string
  git?: (args: string[], cwd: string) => Promise<string>
  log?: (r: string) => void
  /** 12/11: i blocchi vanno nello storico degli errori, che parte da solo verso il PC di sviluppo. */
  errore?: (r: string) => void
  adesso?: () => number
  dorme?: (ms: number) => Promise<void>
}

const GIRO_MS = 10_000
const POSTI_VALGONO_MS = 30_000
const STATO_OGNI_MS = 15_000
/** Un PC che ha rifiutato o perso un lavoro resta fuori per un po': niente giri a vuoto sullo stesso PC. */
const FUORI_PER_MS = 30 * 60_000

function gitVero(args: string[], cwd: string): Promise<string> {
  return new Promise((ok, no) => {
    execFile('git', args, { cwd, windowsHide: true, maxBuffer: 32 * 1024 * 1024, timeout: 10 * 60_000 }, (err, out, errOut) => {
      if (err !== null) no(new Error(`git ${args[0]}: ${String(errOut || err.message).replace(/\s+/gu, ' ').slice(0, 300)}`))
      else ok(String(out))
    })
  })
}

const testo = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/\s+/gu, ' ').slice(0, 300)

export function creaSpedizioniere(d: DipendenzeSpedizioniere): { giro: () => Promise<void>; ferma: () => void; inMano: () => string[] } {
  const git = d.git ?? gitVero
  const log = d.log ?? ((r: string) => console.info(`[aiuto] ${r}`))
  const blocco = d.errore ?? ((r: string) => console.error(`[aiuto] ${r}`))
  const adesso = d.adesso ?? Date.now
  const dorme = d.dorme ?? ((ms: number) => new Promise<void>((ok) => { const t = setTimeout(ok, ms); t.unref?.() }))
  const inMano = new Set<string>()
  const fuori = new Map<string, number>()
  let posti: { lista: Aiutante[]; il: number } = { lista: [], il: -Infinity }
  let fermo = false

  const aggiornaPosti = async (): Promise<Aiutante[]> => {
    if (adesso() - posti.il < POSTI_VALGONO_MS) return posti.lista
    const lista: Aiutante[] = []
    await Promise.all(d.altri().map(async (pc) => {
      if ((fuori.get(pc.pcId) ?? 0) > adesso()) return
      try {
        const r = await d.chiama(pc.pcId, '/api/aiuto/posti') as { modo?: unknown; liberi?: unknown }
        if (!modoAiutoValido(r?.modo) || typeof r.liberi !== 'number') return
        lista.push({ pcId: pc.pcId, nome: pc.nome, modo: r.modo, liberi: Math.max(0, Math.floor(r.liberi)) })
      } catch { /* spento, vecchio, o non presta: non è fra gli aiutanti */ }
    }))
    posti = { lista, il: adesso() }
    return lista
  }

  const avanza = async (id: string, p: Record<string, unknown>): Promise<void> => {
    try { await d.servizio('/aiuto/avanza', { id, ...p }) } catch (err) { log(`${id}: esito non detto al servizio (${testo(err)})`) }
  }

  /** Chiama quel PC; se non risponde riprova un paio di volte (un pezzo perso non deve buttare il lavoro). */
  const conRiprova = async <T>(f: () => Promise<T>, volte = 3): Promise<T> => {
    let ultimo: unknown
    for (let i = 0; i < volte; i++) {
      try { return await f() } catch (err) { ultimo = err; await dorme(2000 * (i + 1)) }
    }
    throw ultimo instanceof Error ? ultimo : new Error(String(ultimo))
  }

  const spedisci = async (l: LavoroAffidato): Promise<void> => {
    const ramoBase = (await git(['symbolic-ref', '--short', 'HEAD'], l.cwd)).trim()
    const base = (await git(['rev-parse', ramoBase], l.cwd)).trim()
    mkdirSync(d.cartella, { recursive: true })
    const file = join(d.cartella, `${l.id}.bundle`)
    try {
      await git(['bundle', 'create', file, ramoBase], l.cwd)
      const byte = statSync(file).size
      if (byte > PACCHETTO_MAX_BYTE) throw new Error(`il progetto pesa ${Math.round(byte / 1048576)} MB: troppo da spedire`)
      const totale = quantiPezzi(byte)
      const buf = Buffer.alloc(PEZZO_BYTE)
      const fd = openSync(file, 'r')
      try {
        for (let n = 0; n < totale; n++) {
          if (fermo) throw new Error('il programma si sta chiudendo')
          const letti = readSync(fd, buf, 0, PEZZO_BYTE, n * PEZZO_BYTE)
          const dati = buf.subarray(0, letti).toString('base64')
          await conRiprova(() => d.chiama(l.pcId, '/api/aiuto/pezzo', { lavoro: l.id, n, totale, dati }))
          if (totale > 2) await avanza(l.id, { attivita: `spedisco il progetto (${n + 1}/${totale})` })
        }
      } finally { closeSync(fd) }
      await d.chiama(l.pcId, '/api/aiuto/avvia', {
        lavoro: l.id, progetto: basename(l.cwd), ramoBase, base,
        prompt: l.prompt, sistema: l.sistema, modello: l.modello, strumenti: l.strumenti, ruolo: l.ruolo, descrizione: l.descrizione
      })
      log(`${l.id} (${l.compito ?? l.ruolo}): progetto spedito a ${l.pcNome} (${Math.round(byte / 1048576)} MB), parte lo specialista`)
      await avanza(l.id, { stato: 'spedito', attivita: 'arrivato, prepara la copia' })
    } finally { try { rmSync(file, { force: true }) } catch { /* resta */ } }
  }

  /** Il ramo finito: i pezzi in un file, poi `git fetch` dal pacchetto nel progetto. */
  const ritira = async (l: LavoroAffidato, byte: number): Promise<string> => {
    const ramo = ramoDiRitorno(l.id)
    mkdirSync(d.cartella, { recursive: true })
    const file = join(d.cartella, `${l.id}-ritorno.bundle`)
    try {
      writeFileSync(file, Buffer.alloc(0))
      const totale = quantiPezzi(byte)
      for (let n = 0; n < totale; n++) {
        const r = await conRiprova(() => d.chiama(l.pcId, '/api/aiuto/ritira', { lavoro: l.id, n })) as { dati?: unknown }
        if (typeof r?.dati !== 'string') throw new Error(`pezzo ${n + 1} del ramo non arrivato`)
        appendFileSync(file, Buffer.from(r.dati, 'base64'))
      }
      await git(['fetch', '--no-tags', file, `+refs/heads/${ramo}:refs/heads/${ramo}`], l.cwd)
      return ramo
    } finally { try { rmSync(file, { force: true }) } catch { /* resta */ } }
  }

  const segui = async (l: LavoroAffidato): Promise<void> => {
    if (l.stato === 'da-spedire') {
      try { await spedisci(l) } catch (err) {
        fuori.set(l.pcId, adesso() + FUORI_PER_MS)
        posti = { lista: [], il: -Infinity }
        blocco(`${l.id}: non spedito a ${l.pcNome}: ${testo(err)}`)
        await avanza(l.id, { stato: 'fallito', motivo: `non sono riuscito a spedirlo a ${l.pcNome}: ${testo(err)}` })
        await d.chiama(l.pcId, '/api/aiuto/chiudi', { lavoro: l.id }).catch(() => undefined)
        return
      }
    }
    let silenzioDa: number | undefined
    let ultima = ''
    while (!fermo) {
      let v: VistaLavoroAiutato | undefined
      try {
        v = await d.chiama(l.pcId, '/api/aiuto/stato', { lavoro: l.id }) as VistaLavoroAiutato
        silenzioDa = undefined
      } catch (err) {
        const sconosciuto = /lavoro sconosciuto/u.test(testo(err))
        silenzioDa ??= adesso()
        if (sconosciuto || adesso() - silenzioDa > SILENZIO_MAX_MS) {
          fuori.set(l.pcId, adesso() + FUORI_PER_MS)
          blocco(`${l.id} (${l.compito ?? l.ruolo}): perso su ${l.pcNome}: ${sconosciuto ? 'non ha più il lavoro' : 'non risponde'}`)
          await avanza(l.id, { stato: 'fallito', motivo: sconosciuto ? `${l.pcNome} non ha più questo lavoro (si è riavviato?)` : `${l.pcNome} non risponde da ${Math.round(SILENZIO_MAX_MS / 60_000)} minuti` })
          return
        }
      }
      if (v !== undefined) {
        if (v.attivita !== undefined && v.attivita !== ultima) { ultima = v.attivita; await avanza(l.id, { attivita: v.attivita }) }
        if (v.stato === 'finito' || v.stato === 'fallito' || v.stato === 'fermato') {
          let ramo: string | undefined
          let motivo = v.motivo
          if ((v.byte ?? 0) > 0) {
            try { ramo = await ritira(l, v.byte!) } catch (err) { motivo = `il ramo non è tornato da ${l.pcNome}: ${testo(err)}`; log(`${l.id}: ${motivo}`) }
          }
          const riuscito = v.stato === 'finito' && ((v.byte ?? 0) === 0 || ramo !== undefined)
          await avanza(l.id, {
            stato: riuscito ? 'finito' : 'fallito',
            ...(v.riepilogo !== undefined ? { riepilogo: v.riepilogo } : {}),
            ...(ramo !== undefined ? { ramo } : {}),
            ...(motivo !== undefined ? { motivo } : {})
          })
          ;(riuscito ? log : blocco)(`${l.id} (${l.compito ?? l.ruolo}) da ${l.pcNome}: ${riuscito ? 'finito' : `non riuscito${motivo !== undefined ? `: ${motivo}` : ''}`}${ramo !== undefined ? `, ramo ${ramo} preso` : ''}`)
          await d.chiama(l.pcId, '/api/aiuto/chiudi', { lavoro: l.id }).catch(() => undefined)
          return
        }
      }
      await dorme(STATO_OGNI_MS)
    }
  }

  let inGiro = false
  const giro = async (): Promise<void> => {
    if (inGiro || fermo) return
    inGiro = true
    try {
      const aiutanti = await aggiornaPosti()
      const r = await d.servizio('/aiuto/giro', { aiutanti }) as { lavori?: unknown }
      const lavori = Array.isArray(r?.lavori) ? r.lavori.map(lavoroAffidatoValido).filter((l): l is LavoroAffidato => l !== undefined) : []
      for (const l of lavori) {
        if (!idLavoroValido(l.id) || inMano.has(l.id)) continue
        inMano.add(l.id)
        void segui(l).catch((err) => log(`${l.id}: ${testo(err)}`)).finally(() => inMano.delete(l.id))
      }
    } catch { /* servizio giù o vecchio: al prossimo giro */ } finally { inGiro = false }
  }

  const timer = setInterval(() => { void giro() }, GIRO_MS)
  timer.unref?.()
  return { giro, ferma: () => { fermo = true; clearInterval(timer) }, inMano: () => [...inMano] }
}
