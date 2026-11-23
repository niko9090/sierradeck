import { execFile } from 'node:child_process'
import { closeSync, mkdirSync, openSync, readdirSync, readSync, rmSync, statSync, appendFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
  autoreValido, idLavoroValido, lavoroAffidatoValido, modoAiutoValido, programmaAiuto, PACCHETTO_MAX_BYTE, PEZZO_BYTE, quantiPezzi, ramoDiRitorno,
  SILENZIO_MAX_MS, type Aiutante, type LavoroAffidato, type VistaLavoroAiutato
} from '@shared/aiuto-rete'
import { causaDelMotivo, causaRiassegnabile, fraseCausa, type CausaFallimento } from '@shared/aiuto-esito'
import { decidiRiassegna, eLento, eventoAffidato, eventoArreso, eventoRifiutato, eventoRiassegnato, eventoRisorsaMancante, MAX_RIASSEGNAZIONI, type DatiLentezza } from '@shared/aiuto-riassegna'
import { valutaPrimaDiAffidare, type CandidatoPc, type RequisitiCompito } from '../autopilot-host/affida-valuta'
import { fileDalDiff } from '@shared/dati-pannello-agenti'
import type { EventoAiuto } from '@shared/eventi-aiuto'
import { ricavaRisorse } from '@shared/aiuto-risorse'
import { capacitaValida, type CapacitaPc } from '@shared/capacita-pc'

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
  /** Gli altri PC accesi adesso; 12/11: `aiutante` se il battito dice che è SierraDeck Aiutante. */
  altri: () => { pcId: string; nome: string; aiutante?: boolean; /** k-166n9: dal battito, per valutare i requisiti di un compito. */ battito?: string; capacita?: CapacitaPc }[]
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
  /** 14/11: un PC che non risponde è un caso atteso di rete: avviso nel registro, non errore (non va negli «Errori arrivati»). */
  avviso?: (r: string) => void
  /** 16/11: il registro dei passaggi di mano (`eventi-aiuto.json`): riassegnazioni e rese. */
  registra?: (e: EventoAiuto) => void
  adesso?: () => number
  dorme?: (ms: number) => Promise<void>
}

const GIRO_MS = 10_000
const POSTI_VALGONO_MS = 30_000
const STATO_OGNI_MS = 15_000
/** Un PC che ha rifiutato o perso un lavoro resta fuori per un po': niente giri a vuoto sullo stesso PC. */
const FUORI_PER_MS = 30 * 60_000
/** k-178e: un lavoro finito su un altro PC si aspetta fino a un giorno, poi si rinuncia. */
const ATTESA_RITORNO_MAX_MS = 24 * 60 * 60_000

function gitVero(args: string[], cwd: string): Promise<string> {
  return new Promise((ok, no) => {
    execFile('git', args, { cwd, windowsHide: true, maxBuffer: 32 * 1024 * 1024, timeout: 10 * 60_000 }, (err, out, errOut) => {
      if (err !== null) no(new Error(`git ${args[0]}: ${String(errOut || err.message).replace(/\s+/gu, ' ').slice(0, 300)}`))
      else ok(String(out))
    })
  })
}

const testo = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/\s+/gu, ' ').slice(0, 300)

/** 13/11: il progetto non si impacchetta qui (colpa del progetto, non del PC che aiuta: non va messo fuori). */
class ProgettoNonSpedibile extends Error {}

/** 13/11: il peso del pacchetto da leggere nel registro: «0 MB» per un progetto piccolo sembrava un pacchetto vuoto. */
export function pesoInParole(byte: number): string {
  if (byte < 1024 * 1024) return `${Math.max(1, Math.round(byte / 1024))} KB`
  return `${Math.round(byte / 1048576)} MB`
}

export type Spedizioniere = {
  giro: () => Promise<void>
  ferma: () => void
  inMano: () => string[]
  dichiarate: (lavoro: string) => { pcId: string; nomi: readonly string[] } | undefined
}

export function creaSpedizioniere(d: DipendenzeSpedizioniere): Spedizioniere {
  const git = d.git ?? gitVero
  const log = d.log ?? ((r: string) => console.info(`[aiuto] ${r}`))
  const blocco = d.errore ?? ((r: string) => console.error(`[aiuto] ${r}`))
  const avviso = d.avviso ?? ((r: string) => console.warn(`[aiuto] ${r}`))
  const adesso = d.adesso ?? Date.now
  const registra = (e: EventoAiuto): void => { try { d.registra?.(e) } catch { /* un registro che non si scrive non ferma il lavoro */ } }
  const dorme = d.dorme ?? ((ms: number) => new Promise<void>((ok) => { const t = setTimeout(ok, ms); t.unref?.() }))
  const inMano = new Set<string>()
  /** I lavori che questo PC ha affidato e segue adesso (per sapere quali credenziali dichiarano e a chi). */
  const affidati = new Map<string, LavoroAffidato>()
  const fuori = new Map<string, number>()
  let posti: { lista: Aiutante[]; il: number } = { lista: [], il: -Infinity }
  let fermo = false

  // 12/11: i pacchetti rimasti da un programma chiuso a metà spedizione o ritiro. Qui nasce uno
  // spedizioniere solo, e prima del primo giro nessun pacchetto è in uso: via tutti (solo file `.bundle`).
  try {
    for (const n of readdirSync(d.cartella)) {
      if (/^r[0-9a-f]{12}(-ritorno)?\.bundle$/u.test(n)) { try { rmSync(join(d.cartella, n), { force: true }) } catch { /* resta */ } }
    }
  } catch { /* la cartella non c'è ancora */ }

  const aggiornaPosti = async (): Promise<Aiutante[]> => {
    if (adesso() - posti.il < POSTI_VALGONO_MS) return posti.lista
    const lista: Aiutante[] = []
    await Promise.all(d.altri().map(async (pc) => {
      if ((fuori.get(pc.pcId) ?? 0) > adesso()) return
      try {
        const r = await d.chiama(pc.pcId, '/api/aiuto/posti') as { modo?: unknown; liberi?: unknown; programma?: unknown; capacita?: unknown }
        if (!modoAiutoValido(r?.modo) || typeof r.liberi !== 'number') return
        // 12/11: è un Aiutante se lo dice la risposta o il battito: va scelto prima degli altri PC.
        const programma = programmaAiuto(r.programma) ?? (pc.aiutante === true ? 'aiutante' : undefined)
        // k-166n9: le capacità fresche dalla risposta, altrimenti quelle del battito; un PC vecchio non le porta («sconosciuto»).
        const capacita = capacitaValida(r.capacita) ?? pc.capacita
        lista.push({
          pcId: pc.pcId, nome: pc.nome, modo: r.modo, liberi: Math.max(0, Math.floor(r.liberi)),
          ...(programma !== undefined ? { programma } : {}),
          ...(pc.battito !== undefined ? { battito: pc.battito } : {}),
          ...(capacita !== undefined ? { capacita } : {})
        })
      } catch { /* spento, vecchio, o non presta: non è fra gli aiutanti */ }
    }))
    posti = { lista, il: adesso() }
    return lista
  }

  /** Chiama quel PC; se non risponde riprova un paio di volte (un pezzo perso non deve buttare il lavoro). */
  const conRiprova = async <T>(f: () => Promise<T>, volte = 3): Promise<T> => {
    let ultimo: unknown
    for (let i = 0; i < volte; i++) {
      try { return await f() } catch (err) { ultimo = err; if (i < volte - 1) await dorme(2000 * (i + 1)) }
    }
    throw ultimo instanceof Error ? ultimo : new Error(String(ultimo))
  }

  /** Dice un avanzamento al servizio (con qualche riprova); `true` solo se è arrivato. Quelli di poco conto: `volte = 1`. */
  const avanza = async (id: string, p: Record<string, unknown>, volte = 3): Promise<boolean> => {
    try { await conRiprova(() => d.servizio('/aiuto/avanza', { id, ...p }), volte); return true } catch (err) { log(`${id}: esito non detto al servizio (${testo(err)})`); return false }
  }

  /** k-178e: i lavori il cui ramo è già arrivato e detto al servizio: chi arriva dopo chiude soltanto. */
  const vinto = new Set<string>()
  /** k-178e: il ramo parziale ritirato da un PC lento: la nuova spedizione riparte da lì. */
  const ripartenza = new Map<string, { ramo: string; commit: string }>()

  const base0 = (l: LavoroAffidato): { quando: string; lavoroId: string; compito: string; daPc: string; aPc: string } => ({
    quando: new Date(adesso()).toISOString(), lavoroId: l.id, compito: l.compito ?? l.descrizione.slice(0, 80), daPc: 'questo PC', aPc: l.pcNome
  })

  const spedisci = async (l: LavoroAffidato): Promise<void> => {
    // 13/11: quello che si prepara qui (ramo, commit, pacchetto) se non riesce è un guaio del progetto,
    // non del PC che aiuta: si dice così, e quel PC non va messo fuori.
    const qui = async <T>(f: () => Promise<T>): Promise<T> => { try { return await f() } catch (err) { throw new ProgettoNonSpedibile(testo(err)) } }
    const ramoPrincipale = (await qui(() => git(['symbolic-ref', '--short', 'HEAD'], l.cwd))).trim()
    // k-178e: se un PC lento ha lasciato un ramo parziale, si riparte da lì (dal suo ultimo commit).
    const parziale = ripartenza.get(l.id)
    const ramoBase = parziale?.ramo ?? ramoPrincipale
    const base = parziale?.commit ?? (await qui(() => git(['rev-parse', '--verify', `${ramoBase}^{commit}`], l.cwd))).trim()
    mkdirSync(d.cartella, { recursive: true })
    const file = join(d.cartella, `${l.id}.bundle`)
    try {
      await qui(() => git(['bundle', 'create', file, ...(parziale !== undefined ? [ramoPrincipale, ramoBase] : [ramoBase])], l.cwd))
      const byte = statSync(file).size
      // Un pacchetto vuoto non apre niente di là (git di solito lo rifiuta già): meglio dirlo qui.
      if (byte === 0) throw new ProgettoNonSpedibile(`il pacchetto del progetto è vuoto (${byte} byte)`)
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
          if (totale > 2) await avanza(l.id, { attivita: `spedisco il progetto (${n + 1}/${totale})` }, 1)
        }
      } finally { closeSync(fd) }
      // 12/11: chi firma i commit di là: il nome e l'email di git di questo progetto (se ci sono).
      const autore = autoreValido({
        nome: (await git(['config', 'user.name'], l.cwd).catch(() => '')).trim(),
        email: (await git(['config', 'user.email'], l.cwd).catch(() => '')).trim()
      })
      const risorse = ricavaRisorse(l.prompt, l.risorse ?? [], [l.cwd])
      try {
        await d.chiama(l.pcId, '/api/aiuto/avvia', {
          lavoro: l.id, progetto: basename(l.cwd), ramoBase, base,
          prompt: l.prompt, sistema: l.sistema, modello: l.modello, strumenti: l.strumenti, ruolo: l.ruolo, descrizione: l.descrizione,
          // 16/11: le risorse (dichiarate + nominate nel messaggio) che là vanno verificate prima di partire; la cartella del progetto non serve, arriva col pacchetto.
          ...(risorse.length > 0 ? { risorse } : {}),
          ...(autore !== undefined ? { autore } : {})
        })
      } catch (err) {
        // 16/11: il PC ha risposto di no (niente posto, versione diversa…): è un rifiuto. Un PC che non risponde no, è rete.
        if (!/timeout|tempo|non risponde|econn|enotfound|etimedout|fetch failed|raggiungibile|abort/iu.test(testo(err))) {
          registra(eventoRifiutato({ ...base0(l), motivo: `il PC ha rifiutato il lavoro: ${testo(err)}` }))
        }
        throw err
      }
      registra(eventoAffidato(base0(l)))
      log(`${l.id} (${l.compito ?? l.ruolo}): progetto spedito a ${l.pcNome} (${pesoInParole(byte)}), parte lo specialista`)
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

  /**
   * 16/11: il PC non ha potuto agire (causa del PC): se c'è un altro PC libero mai provato per questo
   * lavoro, lo passa là (al più 2 volte), lo scrive nel registro e dice al servizio il nuovo PC.
   * `undefined` = resta fallito (causa del lavoro, tentativi finiti, nessun altro PC).
   */
  /** I programmi indispensabili che il lavoro dichiara: chi riceve deve averli. */
  const requisitiDel = (l: LavoroAffidato): RequisitiCompito | undefined => {
    const programmi = (l.risorse ?? []).filter((r) => r.tipo === 'programma' && r.indispensabile !== false).map((r) => r.valore)
    return programmi.length > 0 ? { programmi } : undefined
  }

  /** Chi può ricevere il lavoro: libero, capace dei requisiti, mai provato, non fuori; gli Aiutanti prima. */
  const scegliCapace = (l: LavoroAffidato, aiutanti: readonly Aiutante[], provati: readonly string[]): Aiutante | undefined => {
    const ok = aiutanti.filter((a) => !provati.includes(a.pcId) && (fuori.get(a.pcId) ?? 0) <= adesso())
    const requisiti = requisitiDel(l)
    const prova = (lista: readonly Aiutante[]): Aiutante | undefined => {
      const candidati: CandidatoPc[] = lista.map((a) => ({ pcId: a.pcId, nome: a.nome, liberi: a.liberi, battito: a.battito ?? new Date(adesso()).toISOString(), capacita: a.capacita }))
      const e = valutaPrimaDiAffidare(requisiti, candidati, adesso())
      return e.tipo === 'scelto' ? lista.find((a) => a.pcId === e.pc.pcId) : undefined
    }
    return prova(ok.filter((a) => a.programma === 'aiutante')) ?? prova(ok)
  }

  const riassegna = async (l: LavoroAffidato, causa: CausaFallimento | undefined, motivo: string, lentezza?: DatiLentezza, senzaChiudere = false): Promise<LavoroAffidato | undefined> => {
    const provati = [...new Set([...(l.provati ?? []), l.pcId])]
    const compito = l.compito ?? l.descrizione.slice(0, 80)
    const quando = new Date(adesso()).toISOString()
    const scelto = causa === undefined || causaRiassegnabile(causa) ? scegliCapace(l, await aggiornaPosti(), provati) : undefined
    const mossa = decidiRiassegna({
      ...(causa !== undefined ? { causa } : {}), ...(lentezza !== undefined ? { lentezza } : {}),
      riassegnazioni: l.riassegnazioni ?? 0, provati, aiutanti: scelto !== undefined ? [scelto] : [], adesso: adesso()
    })
    if (mossa.tipo !== 'riassegna') {
      if (mossa.tipo === 'resta-fallito' && mossa.arreso) registra(eventoArreso({ quando, lavoroId: l.id, compito, daPc: l.pcNome, motivo: `${mossa.motivo} (${motivo})` }))
      return undefined
    }
    // k-178e: un PC che tace non si chiude: se torna col lavoro finito, quel ramo non si perde.
    if (!senzaChiudere) await d.chiama(l.pcId, '/api/aiuto/chiudi', { lavoro: l.id }).catch(() => undefined)
    registra(eventoRiassegnato({ quando, lavoroId: l.id, compito, daPc: l.pcNome, aPc: mossa.a.nome, motivo, causa: causa ?? 'pc' }))
    const frase = lentezza !== undefined
      ? `Il lavoro ${compito} ${motivo} su ${l.pcNome}: l’ho passato a ${mossa.a.nome}`
      : `Il lavoro ${compito}: ${motivo}. L’ho passato da ${l.pcNome} a ${mossa.a.nome}`
    await avanza(l.id, { riassegna: { pcId: mossa.a.pcId, pcNome: mossa.a.nome }, motivo: frase })
    log(`${l.id} (${compito}): passa da ${l.pcNome} a ${mossa.a.nome} (${motivo})`)
    return { ...l, pcId: mossa.a.pcId, pcNome: mossa.a.nome, stato: 'da-spedire', provati, riassegnazioni: (l.riassegnazioni ?? 0) + 1 }
  }

  /** k-178e: il ramo parziale appena ritirato: da qui riparte la prossima spedizione. */
  const ricordaParziale = async (l: LavoroAffidato, ramo: string): Promise<void> => {
    const commit = (await git(['rev-parse', '--verify', `${ramo}^{commit}`], l.cwd)).trim()
    ripartenza.set(l.id, { ramo, commit })
  }

  /**
   * k-178e: il lavoro è stato riassegnato mentre quel PC taceva, senza chiuderlo. Lo si aspetta in parallelo:
   * il primo ramo riuscito che arriva vince. Se quel PC torna col lavoro finito e nessuno ha ancora vinto,
   * si ritira il ramo e si dice l'esito; poi si chiude. Si rinuncia dopo 24 ore.
   */
  const attendiRitorno = async (l: LavoroAffidato): Promise<void> => {
    const da = adesso()
    const chiudi = (): Promise<unknown> => d.chiama(l.pcId, '/api/aiuto/chiudi', { lavoro: l.id }).catch(() => undefined)
    while (!fermo && !vinto.has(l.id) && adesso() - da < ATTESA_RITORNO_MAX_MS) {
      await dorme(STATO_OGNI_MS)
      let v: VistaLavoroAiutato
      try { v = await d.chiama(l.pcId, '/api/aiuto/stato', { lavoro: l.id }) as VistaLavoroAiutato } catch { continue }
      if (vinto.has(l.id)) break
      if (v.stato === 'fallito' || v.stato === 'fermato' || (v.stato === 'finito' && (v.byte ?? 0) === 0)) { await chiudi(); return }
      if (v.stato !== 'finito') continue
      let ramo: string
      try { ramo = await ritira(l, v.byte!) } catch (err) { log(`${l.id}: il ramo non è tornato da ${l.pcNome}: ${testo(err)}`); continue }
      if (vinto.has(l.id)) { await chiudi(); return }
      vinto.add(l.id)
      const ok = await avanza(l.id, {
        stato: 'finito', ramo,
        ...(v.riepilogo !== undefined ? { riepilogo: v.riepilogo } : {}),
        ...(v.token !== undefined && v.token > 0 ? { token: v.token } : {})
      })
      if (ok) await chiudi()
      log(`${l.id} (${l.compito ?? l.ruolo}) da ${l.pcNome}: tornato dopo il silenzio, ramo ${ramo} preso`)
      return
    }
    // Un altro PC ha già portato il ramo (o un giorno è passato): la copia di quel PC si toglie.
    if (!fermo) await chiudi()
  }

  /** k-176i: i lavori che Nicholas ha chiesto di fermare (lo dice il servizio a ogni giro); lo stop parte per il PC che li ha. */
  const daFermare = new Set<string>()
  /** Lo stop è già arrivato a quel PC: non si manda due volte. */
  const stopInviato = new Set<string>()

  const segui = async (l: LavoroAffidato): Promise<void> => {
    affidati.set(l.id, l)
    if (l.fermareIl !== undefined) daFermare.add(l.id)
    // Fermato prima ancora di partire: non si spedisce niente.
    if (l.stato === 'da-spedire' && daFermare.has(l.id)) {
      await avanza(l.id, { stato: 'fallito', causa: 'fermato', motivo: 'fermato da Nicholas' })
      log(`${l.id} (${l.compito ?? l.ruolo}): fermato da Nicholas prima di partire`)
      return
    }
    if (l.stato === 'da-spedire') {
      try { await spedisci(l) } catch (err) {
        const delProgetto = err instanceof ProgettoNonSpedibile
        if (!delProgetto) {
          fuori.set(l.pcId, adesso() + FUORI_PER_MS)
          posti = { lista: [], il: -Infinity }
          const nuovo = await riassegna(l, 'pc', `non sono riuscito a spedirlo a ${l.pcNome}: ${testo(err)}`)
          if (nuovo !== undefined) return segui(nuovo)
        }
        const causa: CausaFallimento = delProgetto ? 'progetto' : 'pc'
        // Solo il progetto non spedibile è un difetto; un PC che non risponde è rete.
        ;(delProgetto ? blocco : avviso)(`${l.id}: non spedito a ${l.pcNome}: ${testo(err)}`)
        const detto = await avanza(l.id, { stato: 'fallito', causa, motivo: delProgetto ? `${fraseCausa('progetto')} — ${testo(err)}` : `non sono riuscito a spedirlo a ${l.pcNome}: ${testo(err)}` })
        if (detto) await d.chiama(l.pcId, '/api/aiuto/chiudi', { lavoro: l.id }).catch(() => undefined)
        return
      }
    }
    let silenzioDa: number | undefined
    /** Il silenzio lungo si tratta una volta sola (riassegnazione senza chiudere). */
    let inSilenzio = false
    /** Da quando non si riesce a ritirare il ramo o a dire l'esito al servizio. */
    let inAttesaDa: number | undefined
    /** Il ramo finito di questo PC, già preso nel progetto (e i file del suo diff). */
    let ramoTornato: string | undefined
    let fileTornati: string[] | undefined
    /** Questo PC ha vinto: il suo ramo è quello che vale. */
    let mioRamo = false
    /** Il ramo parziale già ritirato da questo PC lento (a quanti byte). */
    let parziale: { byte: number; ramo: string } | undefined
    let ultima = ''
    let ultimiDati = ''
    const partitoIl = adesso()
    while (!fermo) {
      if (daFermare.has(l.id) && !stopInviato.has(l.id)) {
        try { await d.chiama(l.pcId, '/api/aiuto/ferma', { lavoro: l.id }); stopInviato.add(l.id); log(`${l.id} (${l.compito ?? l.ruolo}): stop inoltrato a ${l.pcNome}`) } catch (err) { avviso(`${l.id}: stop non arrivato a ${l.pcNome}, riprovo: ${testo(err)}`) }
      }
      let v: VistaLavoroAiutato | undefined
      try {
        v = await d.chiama(l.pcId, '/api/aiuto/stato', { lavoro: l.id }) as VistaLavoroAiutato
        silenzioDa = undefined
      } catch (err) {
        const sconosciuto = /lavoro sconosciuto/u.test(testo(err))
        silenzioDa ??= adesso()
        if (daFermare.has(l.id) && (sconosciuto || adesso() - silenzioDa > SILENZIO_MAX_MS)) {
          // Nicholas voleva fermarlo e quel PC non c'è più: il lavoro è fermo comunque, non si passa a un altro PC.
          await avanza(l.id, { stato: 'fallito', causa: 'fermato', motivo: 'fermato da Nicholas' })
          return
        }
        if (sconosciuto) {
          fuori.set(l.pcId, adesso() + FUORI_PER_MS)
          posti = { lista: [], il: -Infinity }
          avviso(`${l.id} (${l.compito ?? l.ruolo}): perso su ${l.pcNome}: non ha più il lavoro`)
          const nuovo = await riassegna(l, 'pc', `${l.pcNome} non ha più questo lavoro (si è riavviato?)`)
          if (nuovo !== undefined) return segui(nuovo)
          const detto = await avanza(l.id, { stato: 'fallito', causa: 'pc', motivo: `${l.pcNome} non ha più questo lavoro (si è riavviato?)` })
          // 12/11: «chiudi» anche qui: se quel PC torna, o lo tiene ancora, toglie copia, ramo e pacchetti (ma solo se l'esito è arrivato).
          if (detto) await d.chiama(l.pcId, '/api/aiuto/chiudi', { lavoro: l.id }).catch(() => undefined)
          return
        }
        if (adesso() - silenzioDa > ATTESA_RITORNO_MAX_MS) {
          avviso(`${l.id} (${l.compito ?? l.ruolo}): ${l.pcNome} non risponde da più di un giorno`)
          const detto = await avanza(l.id, { stato: 'fallito', causa: 'pc', motivo: `${l.pcNome} non risponde da più di un giorno` })
          if (detto) await d.chiama(l.pcId, '/api/aiuto/chiudi', { lavoro: l.id }).catch(() => undefined)
          return
        }
        if (!inSilenzio && adesso() - silenzioDa > SILENZIO_MAX_MS) {
          // k-178e: un PC che tace non perde il lavoro: se c'è un altro PC capace il lavoro riparte là, e questo si aspetta in parallelo.
          inSilenzio = true
          fuori.set(l.pcId, adesso() + FUORI_PER_MS)
          posti = { lista: [], il: -Infinity }
          avviso(`${l.id} (${l.compito ?? l.ruolo}): perso su ${l.pcNome}: non risponde`)
          const nuovo = await riassegna(l, 'pc', `${l.pcNome} non risponde da ${Math.round(SILENZIO_MAX_MS / 60_000)} minuti`, undefined, true)
          if (nuovo !== undefined) {
            void attendiRitorno(l).catch((err) => log(`${l.id}: ${testo(err)}`))
            return segui(nuovo)
          }
        }
      }
      if (v !== undefined) {
        if (v.attivita !== undefined && v.attivita !== ultima) { ultima = v.attivita; await avanza(l.id, { attivita: v.attivita }) }
        // k-176b: i file e i token riferiti da quel PC, per il pannello a destra (solo se cambiano).
        const firmaDati = `${(v.file ?? []).length}|${v.token ?? 0}`
        if (firmaDati !== ultimiDati && ((v.file ?? []).length > 0 || (v.token ?? 0) > 0)) {
          ultimiDati = firmaDati
          await avanza(l.id, { ...((v.file ?? []).length > 0 ? { file: v.file, origineFile: 'remoto' } : {}), ...((v.token ?? 0) > 0 ? { token: v.token } : {}) })
        }
        if (v.stato === 'finito' || v.stato === 'fallito' || v.stato === 'fermato') {
          let ramo: string | undefined = ramoTornato
          let motivo = v.motivo
          // 13/11: la causa che dice quel PC; un PC di prima non la manda, e allora si legge dal motivo.
          let causa: CausaFallimento | undefined = v.stato === 'fermato' ? 'fermato' : v.stato === 'fallito' ? (v.causa ?? causaDelMotivo(v.motivo)) : undefined
          let fileRamo: string[] | undefined = fileTornati
          if ((v.byte ?? 0) > 0 && ramoTornato === undefined) {
            // k-176b: «Invio dati – fine lavori»: da qui finché il ramo non è arrivato (o il lavoro si chiude).
            await avanza(l.id, { inInvio: true })
            try {
              ramo = await ritira(l, v.byte!)
              ramoTornato = ramo
              inAttesaDa = undefined
              // Il diff del ramo tornato dice i file davvero cambiati: prende il posto di quelli riferiti.
              try { fileRamo = fileDalDiff(await git(['diff', '--name-only', `HEAD...${ramo}`], l.cwd)); fileTornati = fileRamo } catch { /* restano i file riferiti da quel PC */ }
            } catch (err) {
              // k-178e: il ramo c'è ancora di là: si riprova (fino a 24 ore) e non si chiude, così il lavoro non si perde.
              inAttesaDa ??= adesso()
              log(`${l.id}: il ramo non è tornato da ${l.pcNome}: ${testo(err)}`)
              if (adesso() - inAttesaDa > ATTESA_RITORNO_MAX_MS) {
                await avanza(l.id, { stato: 'fallito', causa: 'pc', motivo: `il ramo non è tornato da ${l.pcNome} in più di un giorno: ${testo(err)}` })
                return
              }
              await dorme(STATO_OGNI_MS)
              continue
            }
          }
          // 16/11: fallito per colpa del PC (risorsa mancante, accesso…): passa a un altro PC, dal ramo parziale se c'è.
          if (v.stato === 'fallito' && causa !== undefined && causaRiassegnabile(causa) && !daFermare.has(l.id) && (ramo === undefined || (v.commit ?? 1) > 0)) {
            if (ramo !== undefined) {
              try { await ricordaParziale(l, ramo) } catch (err) { log(`${l.id}: ramo parziale non leggibile: ${testo(err)}`) }
            }
            // Prima del passaggio: il registro dice perché quel PC non ha potuto (risorsa indispensabile mancante, o rifiuto).
            if (causa === 'risorsa') registra(eventoRisorsaMancante({ ...base0(l), motivo: motivo ?? fraseCausa(causa), dichiarate: l.risorse ?? [] }))
            else if (causa !== 'pc') registra(eventoRifiutato({ ...base0(l), motivo: motivo ?? fraseCausa(causa) }))
            if (causa !== 'pc') { fuori.set(l.pcId, adesso() + FUORI_PER_MS); posti = { lista: [], il: -Infinity } }
            const nuovo = await riassegna(l, causa, motivo ?? fraseCausa(causa))
            if (nuovo !== undefined) return segui(nuovo)
          }
          const riuscito = v.stato === 'finito' && ((v.byte ?? 0) === 0 || ramo !== undefined)
          if (riuscito && !mioRamo) {
            // k-178e: il primo ramo riuscito vince; chi arriva dopo (un PC tornato dal silenzio, o questo) chiude soltanto.
            if (vinto.has(l.id)) { await d.chiama(l.pcId, '/api/aiuto/chiudi', { lavoro: l.id }).catch(() => undefined); return }
            vinto.add(l.id)
            mioRamo = true
          }
          const detto = await avanza(l.id, {
            stato: riuscito ? 'finito' : 'fallito',
            ...(v.riepilogo !== undefined ? { riepilogo: v.riepilogo } : {}),
            ...(ramo !== undefined ? { ramo } : {}),
            ...(fileRamo !== undefined && fileRamo.length > 0 ? { file: fileRamo, origineFile: 'diff-ramo' } : {}),
            ...(v.token !== undefined && v.token > 0 ? { token: v.token } : {}),
            ...(motivo !== undefined ? { motivo } : {}),
            ...(!riuscito && causa !== undefined ? { causa } : {})
          })
          if (!detto) {
            // k-178e: l'esito non è arrivato al servizio: il ramo di là non si chiude, si riprova (fino a 24 ore).
            inAttesaDa ??= adesso()
            if (adesso() - inAttesaDa > ATTESA_RITORNO_MAX_MS) { blocco(`${l.id}: esito mai detto al servizio in più di un giorno`); return }
            await dorme(STATO_OGNI_MS)
            continue
          }
          ;(riuscito ? log : blocco)(`${l.id} (${l.compito ?? l.ruolo}) da ${l.pcNome}: ${riuscito ? 'finito' : `non riuscito${motivo !== undefined ? `: ${motivo}` : ''}`}${ramo !== undefined ? `, ramo ${ramo} preso` : ''}`)
          await d.chiama(l.pcId, '/api/aiuto/chiudi', { lavoro: l.id }).catch(() => undefined)
          return
        }
        // k-166n6: ancora in corso ma fermo da troppo: passa a un altro PC capace; se non c'è nessuno, riparte qui.
        const dati: DatiLentezza = { ...(v.fermoMs !== undefined ? { fermoMs: v.fermoMs } : {}), trascorsoMs: adesso() - partitoIl, peso: 'medio', ...(v.commit !== undefined ? { commit: v.commit } : {}) }
        if (eLento(dati) !== undefined && v.fermoMs !== undefined) {
          const minuti = Math.round(v.fermoMs / 60_000)
          const puoPassare = (l.riassegnazioni ?? 0) < MAX_RIASSEGNAZIONI
          // k-178e: prima di chiudere quel PC si ritira il ramo parziale: i commit già fatti non si perdono e la nuova spedizione riparte da lì.
          if (puoPassare && (v.byte ?? 0) > 0 && parziale?.byte !== v.byte) {
            try {
              const ramo = await ritira(l, v.byte!)
              await ricordaParziale(l, ramo)
              parziale = { byte: v.byte!, ramo }
            } catch (err) {
              log(`${l.id}: ramo parziale non ritirato da ${l.pcNome}: ${testo(err)}`)
              await dorme(STATO_OGNI_MS)
              continue
            }
          }
          const nuovo = await riassegna(l, undefined, `era fermo da ${minuti} minuti`, dati)
          if (nuovo !== undefined) {
            fuori.set(l.pcId, adesso() + FUORI_PER_MS)
            posti = { lista: [], il: -Infinity }
            return segui(nuovo)
          }
          if (puoPassare) {
            fuori.set(l.pcId, adesso() + FUORI_PER_MS)
            posti = { lista: [], il: -Infinity }
            const compito = l.compito ?? l.descrizione.slice(0, 80)
            const motivo = `Il lavoro ${compito} era fermo da ${minuti} minuti su ${l.pcNome}: nessun altro PC è capace e libero, lo chiudo come non riuscito${parziale !== undefined ? `; il ramo parziale è salvato qui (${parziale.ramo})` : ''}`
            const detto = await avanza(l.id, { stato: 'fallito', causa: 'pc', motivo, ...(parziale !== undefined ? { ramo: parziale.ramo } : {}) })
            if (!detto) { await dorme(STATO_OGNI_MS); continue }
            registra(eventoArreso({ quando: new Date(adesso()).toISOString(), lavoroId: l.id, compito, daPc: l.pcNome, motivo: `fermo da ${minuti} minuti, nessun altro PC capace` }))
            await d.chiama(l.pcId, '/api/aiuto/chiudi', { lavoro: l.id }).catch(() => undefined)
            avviso(`${l.id} (${compito}): ${motivo}`)
            return
          }
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
        if (!idLavoroValido(l.id)) continue
        if (l.fermareIl !== undefined) daFermare.add(l.id)
        if (inMano.has(l.id)) continue
        inMano.add(l.id)
        void segui(l).catch((err) => log(`${l.id}: ${testo(err)}`)).finally(() => { inMano.delete(l.id); affidati.delete(l.id); daFermare.delete(l.id); stopInviato.delete(l.id) })
      }
    } catch { /* servizio giù o vecchio: al prossimo giro */ } finally { inGiro = false }
  }

  const timer = setInterval(() => { void giro() }, GIRO_MS)
  timer.unref?.()
  return {
    giro,
    ferma: () => { fermo = true; clearInterval(timer) },
    inMano: () => [...inMano],
    /** k-166n7: le credenziali di rete che un lavoro affidato da questo PC dichiara, e il PC a cui è affidato (per `servi`). */
    dichiarate: (lavoro: string) => {
      const l = affidati.get(lavoro)
      if (l === undefined) return undefined
      return { pcId: l.pcId, nomi: ricavaRisorse(l.prompt, l.risorse ?? [], [l.cwd]).filter((r) => r.tipo === 'credenziale').map((r) => r.valore) }
    }
  }
}
