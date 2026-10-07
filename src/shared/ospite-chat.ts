import type { CasaChat, CaseChat } from './una-casa'
import { messaggioChatAltrove } from './posta'

/**
 * L'ospite di ogni chat (0.52.0): il PC dove gira il suo `claude.exe`,
 * scelto da Nicholas e fatto rispettare. Le regole pure; il disco e i
 * riquadri stanno in `src/main/una-casa.ts`, `src/main/ipc.ts` e nel
 * renderer. Scheda: `.sierradeck/quaderno/ospite-delle-chat.md`.
 *
 * Nicholas (07/10): «non riesco a lavorare su chat remote perché continua a
 * prenderle su entrambi i pc. Posso fare una selezione delle chat quali sono
 * i pc che la devono ospitare così negli altri si elimina e va solo da
 * remoto?»
 *
 * La regola dura: su un PC che non è la casa di una chat, **mai** un
 * `claude.exe` per quella chat, da nessuna strada (ripristino, «Riprendi»,
 * autopiloti, consegne, telefono, un clic). Si apre il riquadro remoto; se
 * l'ospite non risponde lo si dice, con «Porta qui la chat».
 */

export type PcNoto = { id: string; nome: string }

/** Le fonti di una casa che sono una scelta di Nicholas (e quindi si fanno rispettare anche spostando la copia). */
export function eScelta(c: CasaChat | undefined): boolean {
  return c !== undefined && (c.da === 'nicholas' || c.da === 'sposta')
}

/**
 * Il controllo prima di ogni avvio: la chat ha casa su un altro PC? Allora qui
 * non parte. Vale per **ogni** casa memorizzata, anche quella decisa dalla
 * regola nella 0.42: era la promessa di «una chat, una casa», mai fatta
 * rispettare all'apertura. Una chat senza casa (nuova, mai vista altrove) è
 * di questo PC.
 */
export function casaAltrove(c: CasaChat | undefined, io: string): (PcNoto & { motivo: string }) | undefined {
  if (c === undefined || c.pc === '' || c.pc === io) return undefined
  return { id: c.pc, nome: c.pcNome !== '' ? c.pcNome : c.pc, motivo: c.motivo }
}

/**
 * **La regola dura**, nel punto da cui passa ogni avvio di `claude.exe` per
 * una chat (`pty:spawn` in `src/main/ipc.ts`): se la chat ha casa su un altro
 * PC si ferma con il messaggio «chat di un altro PC», **anche con «apri qui
 * lo stesso»**. Il riquadro lo riconosce dal prefisso e diventa remoto. Si
 * sblocca solo cambiando la casa («Porta qui la chat», con la conferma).
 */
export function fermaSeCasaAltrove(req: { sessionUuid: string; cwd: string }, casa: (s: string) => (PcNoto & { motivo: string }) | undefined): void {
  const fuori = casa(req.sessionUuid)
  if (fuori === undefined) return
  throw new Error(messaggioChatAltrove({
    cwd: req.cwd,
    pc: { id: fuori.id, nome: fuori.nome },
    sessionUuid: req.sessionUuid,
    casa: true,
    perche: `la sua casa è ${fuori.nome}${fuori.motivo !== '' ? ` (${fuori.motivo})` : ''}`
  }))
}

/** La scelta «Ospitata da: PC», fatta da Nicholas su `chi` (il PC dove ha cliccato). */
export function sceltaOspite(p: { pc: PcNoto; chi: PcNoto; quando: string; workspace?: string }): CasaChat {
  const dove = p.workspace !== undefined ? ` per tutto il workspace «${p.workspace}»` : ''
  return {
    pc: p.pc.id,
    pcNome: p.pc.nome,
    motivo: `scelta di Nicholas${dove} (da ${p.chi.nome}, ${p.quando.slice(0, 16).replace('T', ' ')}): ospitata da ${p.pc.nome}`,
    decisaIl: p.quando,
    da: 'nicholas',
    sceltaDa: p.chi.id
  }
}

/** Le case cambiate fra due versioni (per sapere cosa fare rispettare dopo un arrivo). */
export function caseCambiate(prima: CaseChat, dopo: CaseChat): string[] {
  return Object.keys(dopo.case).filter((s) => prima.case[s]?.pc !== dopo.case[s]?.pc)
}

/* ------------------------------------------------------------------ */
/* Il trasloco della copia di qui.                                     */
/* ------------------------------------------------------------------ */

export type ChatApertaQui = { sessione: string; alLavoro: boolean }

export type PianoTrasloco = {
  /** Copie di qui da spostare nella cartella di recupero adesso (la chat non è aperta qui). */
  sposta: string[]
  /** Aperte qui e ferme sul prompt: si chiude il loro claude.exe (il riquadro diventa remoto), poi si spostano. */
  chiudi: string[]
  /** Aperte qui e al lavoro: si aspetta che finiscano il turno. Mai a metà. */
  aspetta: string[]
}

/**
 * Cosa fare delle copie di qui delle chat che hanno l'ospite altrove per
 * **scelta** (Nicholas, «Sposta»). Le case decise dalla regola non spostano
 * niente da sole: per quelle c'è «Riordina le chat», con la conferma.
 */
export function pianoTrasloco(p: { case: CaseChat; io: string; copieQui: string[]; aperte: ChatApertaQui[] }): PianoTrasloco {
  const fuori: PianoTrasloco = { sposta: [], chiudi: [], aspetta: [] }
  const aperte = new Map(p.aperte.map((a) => [a.sessione, a]))
  const copie = new Set(p.copieQui)
  const tutte = new Set([...copie, ...aperte.keys()])
  for (const s of [...tutte].sort()) {
    const c = p.case.case[s]
    if (!eScelta(c) || casaAltrove(c, p.io) === undefined) continue
    const a = aperte.get(s)
    if (a === undefined) { if (copie.has(s)) fuori.sposta.push(s); continue }
    if (a.alLavoro) fuori.aspetta.push(s)
    else fuori.chiudi.push(s)
  }
  return fuori
}

/* ------------------------------------------------------------------ */
/* «Dove vive ogni chat».                                              */
/* ------------------------------------------------------------------ */

export type ChatDiWorkspace = { workspace: string; sessione: string; titolo: string; cwd: string }

export type RigaDove = {
  sessione: string
  titolo: string
  cwd: string
  /** Il PC ospite (vuoto = nessuna casa ancora: è di questo PC finché non la scegli). */
  pc: string
  pcNome: string
  /** `scelta` = l'ha scelta Nicholas (o «Sposta»); `regola` = decisa da sola nella 0.42; `nessuna` = mai decisa. */
  fonte: 'scelta' | 'regola' | 'nessuna'
  motivo: string
  qui: boolean
}

export type GruppoDove = {
  workspace: string
  righe: RigaDove[]
  /** L'ospite di tutto il workspace, se tutte le sue chat stanno sullo stesso PC. */
  ospiteComune?: string
}

/** Le chat dei workspace, una riga ciascuna con il suo ospite, nell'ordine dell'archivio. */
export function righeDove(chat: ChatDiWorkspace[], cc: CaseChat, io: PcNoto): GruppoDove[] {
  const gruppi = new Map<string, RigaDove[]>()
  for (const c of chat) {
    const casa = cc.case[c.sessione]
    const riga: RigaDove = {
      sessione: c.sessione,
      titolo: c.titolo,
      cwd: c.cwd,
      pc: casa?.pc ?? io.id,
      pcNome: casa?.pcNome ?? io.nome,
      fonte: casa === undefined ? 'nessuna' : eScelta(casa) ? 'scelta' : 'regola',
      motivo: casa?.motivo ?? `non ha ancora una casa: si apre su ${io.nome}, dove è nata`,
      qui: (casa?.pc ?? io.id) === io.id
    }
    const g = gruppi.get(c.workspace) ?? []
    g.push(riga)
    gruppi.set(c.workspace, g)
  }
  return [...gruppi.entries()].map(([workspace, righe]) => {
    const pcs = new Set(righe.map((r) => r.pc))
    return { workspace, righe, ...(pcs.size === 1 && righe.length > 0 ? { ospiteComune: righe[0]?.pc as string } : {}) }
  })
}

/** La scelta per un workspace intero: la stessa casa per ognuna delle sue chat. */
export function sceltePerWorkspace(p: { workspace: string; sessioni: string[]; pc: PcNoto; chi: PcNoto; quando: string }): Record<string, CasaChat> {
  const fuori: Record<string, CasaChat> = {}
  for (const s of p.sessioni) fuori[s] = sceltaOspite({ pc: p.pc, chi: p.chi, quando: p.quando, workspace: p.workspace })
  return fuori
}
