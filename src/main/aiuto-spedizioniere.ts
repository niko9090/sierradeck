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

  const base0 = (l: LavoroAffidato): { quando: string; lavoroId: string; compito: string; daPc: string; aPc: string } => ({
    quando: new Date(adesso()).toISOString(), lavoroId: l.id, compito: l.compito ?? l.descrizione.slice(0, 80), daPc: 'questo PC', aPc: l.pcNome
  })

  const spedisci = async (l: LavoroAffidato): Promise<void> => {
    // 13/11: quello che si prepara qui (ramo, commit, pacchetto) se non riesce è un guaio del progetto,
    // non del PC che aiuta: si dice così, e quel PC non va messo fuori.
    const qui = async <T>(f: () => Promise<T>): Promise<T> => { try { return await f() } catch (err) { throw new ProgettoNonSpedibile(testo(err)) } }
    const ramoBase = (await qui(() => git(['symbolic-ref', '--short', 'HEAD'], l.cwd))).trim()
    const base = (await qui(() => git(['rev-parse', '--verify', `${ramoBase}^{commit}`], l.cwd))).trim()
    mkdirSync(d.cartella, { recursive: true })
    const file = join(d.cartella, `${l.id}.bundle`)
    try {
      await qui(() => git(['bundle', 'create', file, ramoBase], l.cwd))
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
          if (totale > 2) await avanza(l.id, { attivita: `spedisco il progetto (${n + 1}/${totale})` })
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

  const riassegna = async (l: LavoroAffidato, causa: CausaFallimento | undefined, motivo: string, lentezza?: DatiLentezza): Promise<LavoroAffidato | undefined> => {
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
    await d.chiama(l.pcId, '/api/aiuto/chiudi', { lavoro: l.id }).catch(() => undefined)
    registra(eventoRiassegnato({ quando, lavoroId: l.id, compito, daPc: l.pcNome, aPc: mossa.a.nome, motivo, causa: causa ?? 'pc' }))
    const frase = lentezza !== undefined
      ? `Il lavoro ${compito} ${motivo} su ${l.pcNome}: l’ho passato a ${mossa.a.nome}`
      : `Il lavoro ${compito}: ${motivo}. L’ho passato da ${l.pcNome} a ${mossa.a.nome}`
    await avanza(l.id, { riassegna: { pcId: mossa.a.pcId, pcNome: mossa.a.nome }, motivo: frase })
    log(`${l.id} (${compito}): passa da ${l.pcNome} a ${mossa.a.nome} (${motivo})`)
    return { ...l, pcId: mossa.a.pcId, pcNome: mossa.a.nome, stato: 'da-spedire', provati, riassegnazioni: (l.riassegnazioni ?? 0) + 1 }
  }

  const segui = async (l: LavoroAffidato): Promise<void> => {
    affidati.set(l.id, l)
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
        await avanza(l.id, { stato: 'fallito', causa, motivo: delProgetto ? `${fraseCausa('progetto')} — ${testo(err)}` : `non sono riuscito a spedirlo a ${l.pcNome}: ${testo(err)}` })
        await d.chiama(l.pcId, '/api/aiuto/chiudi', { lavoro: l.id }).catch(() => undefined)
        return
      }
    }
    let silenzioDa: number | undefined
    let ultima = ''
    const partitoIl = adesso()
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
          posti = { lista: [], il: -Infinity }
          avviso(`${l.id} (${l.compito ?? l.ruolo}): perso su ${l.pcNome}: ${sconosciuto ? 'non ha più il lavoro' : 'non risponde'}`)
          const nuovo = await riassegna(l, 'pc', sconosciuto ? `${l.pcNome} non ha più questo lavoro (si è riavviato?)` : `${l.pcNome} non risponde da ${Math.round(SILENZIO_MAX_MS / 60_000)} minuti`)
          if (nuovo !== undefined) return segui(nuovo)
          await avanza(l.id, { stato: 'fallito', causa: 'pc', motivo: sconosciuto ? `${l.pcNome} non ha più questo lavoro (si è riavviato?)` : `${l.pcNome} non risponde da ${Math.round(SILENZIO_MAX_MS / 60_000)} minuti` })
          // 12/11: «chiudi» anche qui, come alla fine e dopo una spedizione non riuscita: se quel PC
          // torna, o lo tiene ancora, toglie copia, ramo e pacchetti invece di lasciarli lì.
          await d.chiama(l.pcId, '/api/aiuto/chiudi', { lavoro: l.id }).catch(() => undefined)
          return
        }
      }
      if (v !== undefined) {
        if (v.attivita !== undefined && v.attivita !== ultima) { ultima = v.attivita; await avanza(l.id, { attivita: v.attivita }) }
        if (v.stato === 'finito' || v.stato === 'fallito' || v.stato === 'fermato') {
          let ramo: string | undefined
          let motivo = v.motivo
          // 13/11: la causa che dice quel PC; un PC di prima non la manda, e allora si legge dal motivo.
          let causa: CausaFallimento | undefined = v.stato === 'fermato' ? 'fermato' : v.stato === 'fallito' ? (v.causa ?? causaDelMotivo(v.motivo)) : undefined
          if ((v.byte ?? 0) > 0) {
            try { ramo = await ritira(l, v.byte!) } catch (err) { motivo = `il ramo non è tornato da ${l.pcNome}: ${testo(err)}`; causa = 'pc'; log(`${l.id}: ${motivo}`) }
          }
          // 16/11: fallito per colpa del PC (risorsa mancante, accesso…) e senza lavoro da ritirare: passa a un altro PC.
          if (v.stato === 'fallito' && ramo === undefined && causa !== undefined && causaRiassegnabile(causa)) {
            // Prima del passaggio: il registro dice perché quel PC non ha potuto (risorsa indispensabile mancante, o rifiuto).
            if (causa === 'risorsa') registra(eventoRisorsaMancante({ ...base0(l), motivo: motivo ?? fraseCausa(causa), dichiarate: l.risorse ?? [] }))
            else if (causa !== 'pc') registra(eventoRifiutato({ ...base0(l), motivo: motivo ?? fraseCausa(causa) }))
            if (causa !== 'pc') { fuori.set(l.pcId, adesso() + FUORI_PER_MS); posti = { lista: [], il: -Infinity } }
            const nuovo = await riassegna(l, causa, motivo ?? fraseCausa(causa))
            if (nuovo !== undefined) return segui(nuovo)
          }
          const riuscito = v.stato === 'finito' && ((v.byte ?? 0) === 0 || ramo !== undefined)
          await avanza(l.id, {
            stato: riuscito ? 'finito' : 'fallito',
            ...(v.riepilogo !== undefined ? { riepilogo: v.riepilogo } : {}),
            ...(ramo !== undefined ? { ramo } : {}),
            ...(motivo !== undefined ? { motivo } : {}),
            ...(!riuscito && causa !== undefined ? { causa } : {})
          })
          ;(riuscito ? log : blocco)(`${l.id} (${l.compito ?? l.ruolo}) da ${l.pcNome}: ${riuscito ? 'finito' : `non riuscito${motivo !== undefined ? `: ${motivo}` : ''}`}${ramo !== undefined ? `, ramo ${ramo} preso` : ''}`)
          await d.chiama(l.pcId, '/api/aiuto/chiudi', { lavoro: l.id }).catch(() => undefined)
          return
        }
        // k-166n6: ancora in corso ma fermo da troppo: passa a un altro PC capace; se non c'è nessuno, riparte qui.
        const dati: DatiLentezza = { ...(v.fermoMs !== undefined ? { fermoMs: v.fermoMs } : {}), trascorsoMs: adesso() - partitoIl, peso: 'medio' }
        if (eLento(dati) !== undefined && v.fermoMs !== undefined) {
          const minuti = Math.round(v.fermoMs / 60_000)
          const nuovo = await riassegna(l, undefined, `era fermo da ${minuti} minuti`, dati)
          if (nuovo !== undefined) {
            fuori.set(l.pcId, adesso() + FUORI_PER_MS)
            posti = { lista: [], il: -Infinity }
            return segui(nuovo)
          }
          if ((l.riassegnazioni ?? 0) < MAX_RIASSEGNAZIONI) {
            fuori.set(l.pcId, adesso() + FUORI_PER_MS)
            posti = { lista: [], il: -Infinity }
            const compito = l.compito ?? l.descrizione.slice(0, 80)
            const motivo = `Il lavoro ${compito} era fermo da ${minuti} minuti su ${l.pcNome}: nessun altro PC è capace e libero, lo riprendo e riparte qui`
            registra(eventoRiassegnato({ quando: new Date(adesso()).toISOString(), lavoroId: l.id, compito, daPc: l.pcNome, aPc: 'questo PC', motivo: `fermo da ${minuti} minuti, nessun altro PC capace`, causa: 'pc' }))
            await d.chiama(l.pcId, '/api/aiuto/chiudi', { lavoro: l.id }).catch(() => undefined)
            await avanza(l.id, { stato: 'fallito', causa: 'pc', motivo })
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
        if (!idLavoroValido(l.id) || inMano.has(l.id)) continue
        inMano.add(l.id)
        void segui(l).catch((err) => log(`${l.id}: ${testo(err)}`)).finally(() => { inMano.delete(l.id); affidati.delete(l.id) })
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
