import { leggiCase, type CasaChat, type CaseChat, type RegistroRiordino } from '@shared/una-casa'
import {
  casaAltrove, casaPerAutopilota, pianoTrasloco, righeDove, sceltaOspite, sceltePerWorkspace,
  type ChatApertaQui, type ChatDiWorkspace, type GruppoDove, type PcNoto
} from '@shared/ospite-chat'
import type { ChatLocale, UnaCasa } from './una-casa'

/**
 * L'ospite di ogni chat (0.52.0), su questo PC: la scelta «Ospitata da»,
 * la sua propagazione agli altri PC e il trasloco della copia di qui nella
 * cartella di recupero quando l'ospite è un altro PC. Le regole stanno in
 * `src/shared/ospite-chat.ts`; il cancello che impedisce l'avvio è in
 * `src/main/ipc.ts` (`fermaSeCasaAltrove`).
 *
 * La propagazione ha due strade, come le altre cose fra PC:
 * - **subito**, la rotta `/api/case` di ogni altro PC acceso, che passa solo
 *   con la chiave di casa (regola della 0.47);
 * - **al prossimo giro**, l'oggetto cifrato `case-chat` nella scatola del
 *   Drive, che ogni PC unisce ogni due minuti.
 * Due PC che si dicono casa si mettono d'accordo con `unisciCase`: la scelta
 * di Nicholas più recente vince.
 */

export type Ospite = {
  /** Per il cancello dello spawn e per «da dove aprirla». */
  casaAltroveDi: (sessione: string) => (PcNoto & { motivo: string }) | undefined
  casaQui: (sessione: string) => boolean
  /**
   * Il cancello per una chat governata da un autopilota di questo PC (0.52.5):
   * se la casa altrove era solo della regola, la prende (subito in memoria,
   * poi sul disco e agli altri PC) e la chat parte qui. Una scelta di Nicholas
   * resta: si risponde con la casa altrove, come per le altre chat.
   */
  casaAltrovePerAutopilota: (sessione: string, autopilota: string) => (PcNoto & { motivo: string }) | undefined
  /** «Ospitata da: PC» per una o più chat (o per un workspace intero). */
  scegli: (p: { sessioni: string[]; pc: PcNoto; workspace?: string }) => Promise<{ ok: boolean; messaggio: string }>
  /** La schermata «Dove vive ogni chat». */
  dove: () => { io: PcNoto; pc: PcNoto[]; gruppi: GruppoDove[]; traslochi: RegistroRiordino[] }
  /** Le case che manda un altro PC. */
  ricevi: (corpo: unknown) => Promise<{ ok: boolean; cambiate: number }>
  leggi: () => CaseChat
  /** Fa rispettare le scelte: chiude (a fine turno) e sposta le copie di qui. */
  giro: () => Promise<void>
}

export function creaOspite(deps: {
  unaCasa: UnaCasa
  io: () => PcNoto
  altriPc: () => PcNoto[]
  chiamaPc: (pcId: string, percorso: string, corpo?: unknown) => Promise<unknown>
  chatLocali: () => ChatLocale[]
  aperte: () => ChatApertaQui[]
  chatDeiWorkspace: () => ChatDiWorkspace[]
  /** Salva sul Drive prima di cedere una chat: l'ospite nuovo trova la copia più avanti. */
  salva: () => Promise<unknown>
  /** Chiede alle finestre di chiudere il claude.exe di quelle chat e di farne riquadri remoti. */
  chiudiQui: (chat: { sessione: string; pc: PcNoto }[]) => void
  /** Le case sono cambiate: le finestre rileggono. */
  avvisa: () => void
  adesso?: () => string
  log?: (m: string) => void
}): Ospite {
  const adesso = deps.adesso ?? ((): string => new Date().toISOString())
  const log = deps.log ?? ((): void => {})
  let inGiro = false
  const chiestaChiusura = new Map<string, number>()

  /** Le case prese per un autopilota, finché il disco non le ha scritte. */
  const prese = new Map<string, CasaChat>()
  const casaDi = (s: string): CasaChat | undefined => prese.get(s) ?? deps.unaCasa.casaDi(s)
  const casaAltroveDi = (s: string): (PcNoto & { motivo: string }) | undefined => casaAltrove(casaDi(s), deps.io().id)

  const giro = async (): Promise<void> => {
    if (inGiro) return
    inGiro = true
    try {
      const io = deps.io().id
      const locali = deps.chatLocali()
      const piano = pianoTrasloco({ case: deps.unaCasa.case(), io, copieQui: locali.map((c) => c.sessione), aperte: deps.aperte() })
      // Ferme sul prompt: si chiude il loro claude.exe, una volta ogni mezzo minuto al massimo.
      const ora = Date.now()
      const daChiudere = piano.chiudi.filter((s) => ora - (chiestaChiusura.get(s) ?? 0) > 30_000)
      if (daChiudere.length > 0) {
        for (const s of daChiudere) chiestaChiusura.set(s, ora)
        deps.chiudiQui(daChiudere.map((s) => { const c = casaAltroveDi(s) as PcNoto; return { sessione: s, pc: { id: c.id, nome: c.nome } } }))
        log(`[ospite] ${daChiudere.length} chat con l'ospite altrove erano aperte qui e ferme: chiudo il loro claude.exe e le guardo dal vivo`)
      }
      if (piano.aspetta.length > 0) log(`[ospite] ${piano.aspetta.length} chat con l'ospite altrove stanno lavorando qui: aspetto che finiscano il turno`)
      for (const s of piano.sposta) {
        const casa = deps.unaCasa.casaDi(s) as CasaChat
        const c = locali.find((x) => x.sessione === s)
        const r = await deps.unaCasa.riordina([s], {
          tipo: 'ospite',
          verso: { pc: casa.pc, nome: casa.pcNome, ...(c?.cwd !== undefined ? { cwd: c.cwd } : {}) },
          casaNuova: () => casa
        })
        chiestaChiusura.delete(s)
        log(`[ospite] la copia di qui di «${c?.titolo ?? s}» è nella cartella di recupero (${r.spostamenti.length} file, ${r.id}): l'ospite è ${casa.pcNome}`)
      }
      if (piano.sposta.length > 0) deps.avvisa()
    } catch (err) {
      log(`[ospite] giro non riuscito: ${String(err)}`)
    } finally {
      inGiro = false
    }
  }

  const manda = async (nuove: Record<string, CasaChat>): Promise<number> => {
    const esiti = await Promise.allSettled(deps.altriPc().map((p) => deps.chiamaPc(p.id, '/api/case', { case: nuove })))
    return esiti.filter((e) => e.status === 'fulfilled').length
  }

  return {
    casaAltroveDi,
    casaAltrovePerAutopilota(s, autopilota) {
      const io = deps.io()
      const prima = casaDi(s)
      const d = casaPerAutopilota({ casa: prima, io, autopilota, quando: adesso() })
      if (d.tipo === 'qui') return undefined
      if (d.tipo === 'altrove') return casaAltrove(prima, io.id)
      prese.set(s, d.casa)
      log(`[ospite] la chat ${s} è governata da un autopilota di questo PC: la sua casa era ${prima?.pcNome ?? '?'} per la regola, ora è questo PC`)
      void (async () => {
        try {
          await deps.unaCasa.memorizza({ [s]: d.casa })
          await manda({ [s]: d.casa }).catch(() => 0)
          deps.avvisa()
        } catch (err) {
          log(`[ospite] la casa presa per l'autopilota non è stata scritta: ${String(err)}`)
        }
      })()
      return undefined
    },
    casaQui: (s) => casaDi(s)?.pc === deps.io().id,
    async scegli(p) {
      const sessioni = [...new Set(p.sessioni.filter((s) => typeof s === 'string' && s !== ''))]
      if (sessioni.length === 0) return { ok: false, messaggio: 'Nessuna chat scelta.' }
      const io = deps.io()
      // Si cede una chat che lavorava qui: prima la copia di qui sale sul Drive
      // (finché la casa è qui può salire), così l'ospite nuovo la trova.
      const cedute = p.pc.id !== io.id && sessioni.some((s) => (deps.unaCasa.casaDi(s)?.pc ?? io.id) === io.id && deps.chatLocali().some((c) => c.sessione === s))
      let notaSalva = ''
      if (cedute) {
        try { await deps.salva() } catch (err) { notaSalva = ` Il salvataggio sul Drive prima di cedere non è riuscito (${String(err)}): la copia di qui resta comunque nella cartella di recupero.`; log(`[ospite] salvataggio prima di cedere non riuscito: ${String(err)}`) }
      }
      const quando = adesso()
      const nuove = p.workspace !== undefined
        ? sceltePerWorkspace({ workspace: p.workspace, sessioni, pc: p.pc, chi: io, quando })
        : Object.fromEntries(sessioni.map((s) => [s, sceltaOspite({ pc: p.pc, chi: io, quando })]))
      await deps.unaCasa.memorizza(nuove)
      const raggiunti = await manda(nuove).catch(() => 0)
      log(`[ospite] ${sessioni.length} chat ospitate da ${p.pc.nome}${p.workspace !== undefined ? ` (workspace «${p.workspace}»)` : ''}; avvisati subito ${raggiunti} PC, gli altri dal Drive`)
      deps.avvisa()
      void giro()
      const qui = p.pc.id === io.id
      return {
        ok: true,
        messaggio: qui
          ? `${sessioni.length === 1 ? 'La chat è ospitata' : `${sessioni.length} chat sono ospitate`} da questo PC (${io.nome}): si aprono qui, e sugli altri PC si guardano dal vivo.${notaSalva}`
          : `${sessioni.length === 1 ? 'La chat è ospitata' : `${sessioni.length} chat sono ospitate`} da ${p.pc.nome}: qui si aprono solo dal vivo su quel PC. La copia di qui va nella cartella di recupero appena la chat finisce il turno (si annulla da «Dove vive ogni chat»).${notaSalva}`
      }
    },
    dove() {
      const io = deps.io()
      const tutti = new Map<string, PcNoto>([[io.id, io]])
      for (const p of deps.altriPc()) tutti.set(p.id, p)
      for (const c of Object.values(deps.unaCasa.case().case)) if (!tutti.has(c.pc)) tutti.set(c.pc, { id: c.pc, nome: c.pcNome })
      return {
        io,
        pc: [...tutti.values()],
        gruppi: righeDove(deps.chatDeiWorkspace(), deps.unaCasa.case(), io),
        traslochi: deps.unaCasa.riordini().filter((r) => r.tipo === 'ospite').slice(0, 30)
      }
    },
    async ricevi(corpo) {
      const arrivate = leggiCase(corpo)
      const quante = Object.keys(arrivate.case).length
      if (quante === 0) return { ok: true, cambiate: 0 }
      const prima = deps.unaCasa.case()
      await deps.unaCasa.memorizza(arrivate.case)
      const dopo = deps.unaCasa.case()
      const cambiate = Object.keys(arrivate.case).filter((s) => prima.case[s]?.pc !== dopo.case[s]?.pc || prima.case[s]?.decisaIl !== dopo.case[s]?.decisaIl).length
      if (cambiate > 0) {
        log(`[ospite] un altro PC mi ha mandato ${quante} case, ${cambiate} nuove`)
        deps.avvisa()
        void giro()
      }
      return { ok: true, cambiate }
    },
    leggi: () => deps.unaCasa.case(),
    giro
  }
}
