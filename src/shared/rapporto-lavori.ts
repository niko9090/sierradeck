/**
 * Il rapporto dei lavori di un PC verso il PC di riferimento (k-193a).
 *
 * Nicholas: «ogni sierradeck deve mandarti i report dei suoi lavori oltre che i
 * log, così li analizzi e cerchi di migliorare». Il rapporto è fatto dalle righe
 * dei registri (`sierradeck-AAAA-MM-GG.log`): unioni di prova, criteri, compiti
 * affidati, fermate, avvii. Solo numeri, esiti e motivi: mai i testi delle chat
 * né il contenuto dei file dei progetti (le righe di registro che dicono altro
 * si ignorano, e i motivi si riducono a una frase corta senza percorsi).
 */

/** I conti di un workspace (o di «generale», per le righe che non lo dicono). */
export type LavoriWorkspace = {
  unioni: { prove: number; attesaMs: number; attesaMaxMs: number; provaMs: number; provaMaxMs: number; scadute: number; inFila: number; motivi: Record<string, number> }
  criteri: { finiti: number; riusciti: number; rossi: number; durataMs: number; durataMaxMs: number; scaduti: number; inAttesa: number }
  compiti: { affidati: number; restatiQui: number; inFila: number; rifiuti: number; ruoli: Record<string, number> }
  avanzamento: { svegli: number; limiteDelPiano: number; criterioRosso: number }
  fermate: { fermo: number; fermoMaxMs: number; riavvii: number }
}

export type RapportoLavori = {
  /** Chi manda (nome da mostrare, come per gli errori). */
  da: string
  versione?: string
  /** Il giorno (UTC, AAAA-MM-GG) dell'ultima riga contata. */
  giorno: string
  /** Da quale riga (ISO, esclusa) a quale (inclusa). Identifica il rapporto: lo stesso non si conta due volte. */
  dal: string
  al: string
  workspace: Record<string, LavoriWorkspace>
}

export const WORKSPACE_GENERALE = 'generale'
/** Dove si contano gli affidamenti di cui la riga non dice il ruolo. */
export const RUOLO_NON_NOTO = 'ruolo non noto'
/** Un ruolo è una parola (sviluppatore, revisore…); un id di compito (k-178e) ha cifre e non lo è. */
export const ruoloDi = (testo: string): string => (/^[a-zà-ù]+(?:-[a-zà-ù]+)*$/i.test(testo) ? testo : RUOLO_NON_NOTO)
/** Quanti workspace, al più, in un rapporto, e quanti motivi diversi per workspace. */
export const MAX_WORKSPACE = 40
export const MAX_MOTIVI = 12
/** Quanto pesa un rapporto, al più: lo stesso tetto della posta degli errori. */
export const BYTE_RAPPORTO = 48 * 1024

export const idRapporto = (r: Pick<RapportoLavori, 'da' | 'dal' | 'al'>): string => `${r.da}|${r.dal}|${r.al}`

export function lavoriVuoti(): LavoriWorkspace {
  return {
    unioni: { prove: 0, attesaMs: 0, attesaMaxMs: 0, provaMs: 0, provaMaxMs: 0, scadute: 0, inFila: 0, motivi: {} },
    criteri: { finiti: 0, riusciti: 0, rossi: 0, durataMs: 0, durataMaxMs: 0, scaduti: 0, inAttesa: 0 },
    compiti: { affidati: 0, restatiQui: 0, inFila: 0, rifiuti: 0, ruoli: {} },
    avanzamento: { svegli: 0, limiteDelPiano: 0, criterioRosso: 0 },
    fermate: { fermo: 0, fermoMaxMs: 0, riavvii: 0 }
  }
}

export function eVuoto(l: LavoriWorkspace): boolean {
  return JSON.stringify(l) === JSON.stringify(lavoriVuoti())
}

/** Un motivo corto, senza percorsi né numeri che cambiano a ogni riga. */
export function motivoBreve(testo: string): string {
  return testo
    .replace(/[A-Za-z]:[\\/][^\s,;)]*|(?:\/[\w.-]+){2,}/g, '…')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

/** k-193e: il segno del workspace nelle righe `[unione di prova]` e `[criterio]`: `[ws: NOME] ` (senza `]` né a capo nel nome). */
export function segnoWorkspace(workspace: string): string {
  const nome = workspace.replace(/[\]\r\n]+/g, ' ').trim().slice(0, 80)
  return nome === '' ? '' : `[ws: ${nome}] `
}

const SEGNO = /^(\[(?:unione di prova|criterio)\]) \[ws: ([^\]]+)\] /

const ORA =/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z) \[[^\]]+\] \[[^\]]+\] (.*)$/

function aggiungiMotivo(l: LavoriWorkspace, motivo: string): void {
  const m = motivoBreve(motivo)
  if (m === '') return
  const k = m in l.unioni.motivi || Object.keys(l.unioni.motivi).length < MAX_MOTIVI ? m : 'altro'
  l.unioni.motivi[k] = (l.unioni.motivi[k] ?? 0) + 1
}

/**
 * Legge le righe di registro dopo `dopo` (ISO, esclusa) e ne fa i conti per
 * workspace. Le righe che non conosce si saltano. Torna anche l'istante
 * dell'ultima riga letta (da ricordare per riprendere da lì).
 */
export function contaLavori(righe: readonly string[], dopo?: string): { workspace: Record<string, LavoriWorkspace>; ultima?: string; righe: number } {
  const ws: Record<string, LavoriWorkspace> = {}
  const di = (nome: string): LavoriWorkspace => {
    const k = nome in ws || Object.keys(ws).length < MAX_WORKSPACE ? nome : 'altri'
    return (ws[k] ??= lavoriVuoti())
  }
  let ultima: string | undefined
  let lette = 0
  for (const r of righe) {
    const m = ORA.exec(r)
    if (m === null) continue
    const quando = m[1] as string
    if (dopo !== undefined && quando <= dopo) continue
    ultima = ultima === undefined || quando > ultima ? quando : ultima
    let t = m[2] as string
    // Il segno del workspace si toglie dalla riga (le righe vecchie non l'hanno: restano «generale»).
    let wsRiga = WORKSPACE_GENERALE
    const s = SEGNO.exec(t)
    if (s !== null) { wsRiga = (s[2] as string).trim(); t = `${s[1]} ${t.slice(s[0].length)}` }
    let x: RegExpExecArray | null
    // Unione di prova: «[unione di prova] RAMO: attesa del turno N s, prova N s (scaduta mentre stava per X)»
    if ((x = /^\[unione di prova\] [^:]+: attesa del turno (\d+) s, prova (\d+) s(?: \(scaduta mentre stava per ([^)]*)\))?/.exec(t)) !== null) {
      const u = di(wsRiga).unioni
      const att = Number(x[1]) * 1000
      const prova = Number(x[2]) * 1000
      u.prove += 1; u.attesaMs += att; u.provaMs += prova
      u.attesaMaxMs = Math.max(u.attesaMaxMs, att); u.provaMaxMs = Math.max(u.provaMaxMs, prova)
      if (x[3] !== undefined) { u.scadute += 1; aggiungiMotivo(di(wsRiga), `scaduta: ${x[3]}`) }
      lette += 1
    } else if ((x = /^\[criterio\] finito con (-?\d+) in (\d+) s/.exec(t)) !== null) {
      const c = di(wsRiga).criteri
      const ms = Number(x[2]) * 1000
      c.finiti += 1; c.durataMs += ms; c.durataMaxMs = Math.max(c.durataMaxMs, ms)
      if (Number(x[1]) === 0) c.riusciti += 1; else c.rossi += 1
      lette += 1
    } else if (/^\[criterio\] .*rosso per tempo scaduto/.test(t)) {
      di(wsRiga).criteri.scaduti += 1; lette += 1
    } else if (/^\[criterio\] aspetta il suo turno/.test(t)) {
      di(wsRiga).criteri.inAttesa += 1; lette += 1
    } else if ((x = /^\[orchestratore\] (.+?) — .*unione in fila, (\d+)ª/.exec(t)) !== null) {
      di(x[1] as string).unioni.inFila += 1; lette += 1
    } else if ((x = /^\[orchestratore\] (.+?) — .*criterio rosso senza correzione/.exec(t)) !== null) {
      di(x[1] as string).avanzamento.criterioRosso += 1; lette += 1
    } else if ((x = /^\[orchestratore\] (.+?) — lavoro fermo da (\d+) minuti/.exec(t)) !== null) {
      const l = di(x[1] as string)
      l.avanzamento.svegli += 1; l.fermate.fermo += 1
      l.fermate.fermoMaxMs = Math.max(l.fermate.fermoMaxMs, Number(x[2]) * 60_000)
      lette += 1
    } else if ((x = /^\[orchestratore\] (.+?) — limite del piano raggiunto/.exec(t)) !== null) {
      di(x[1] as string).avanzamento.limiteDelPiano += 1; lette += 1
    } else if ((x = /^\[aiuto\] (.+?) — (\S+) affidato a /.exec(t)) !== null) {
      const c = di(x[1] as string).compiti
      c.affidati += 1
      // Le righe vecchie dicevano l'id del compito (k-178e) al posto del ruolo: un id non è un ruolo.
      const ruolo = ruoloDi(x[2] as string)
      c.ruoli[ruolo] = (c.ruoli[ruolo] ?? 0) + 1
      lette += 1
    } else if ((x = /^\[aiuto\] (.+?) — .*resta su questo PC/.exec(t)) !== null) {
      di(x[1] as string).compiti.restatiQui += 1; lette += 1
    } else if ((x = /^\[attesa\] (.+?) — tetto di specialisti pieno/.exec(t)) !== null) {
      di(x[1] as string).compiti.inFila += 1; lette += 1
    } else if ((x = /^\[orchestratore\] (.+?) — permesso negato dal programma/.exec(t)) !== null) {
      di(x[1] as string).compiti.rifiuti += 1; lette += 1
    } else if ((x = /^\[servizio\] fermo ([\d.]+) s senza rispondere/.exec(t)) !== null) {
      const f = di(WORKSPACE_GENERALE).fermate
      f.fermo += 1; f.fermoMaxMs = Math.max(f.fermoMaxMs, Math.round(Number(x[1]) * 1000))
      lette += 1
    } else if (/^━━━ sessione avviata/.test(t)) {
      di(WORKSPACE_GENERALE).fermate.riavvii += 1; lette += 1
    }
  }
  return { workspace: ws, ...(ultima !== undefined ? { ultima } : {}), righe: lette }
}

export function pesoRapporto(r: RapportoLavori): number {
  return new TextEncoder().encode(JSON.stringify(r)).length
}

/** Il rapporto dentro `maxByte`: si tolgono i motivi, poi i workspace meno attivi. */
export function rapportoPerLInvio(r: RapportoLavori, maxByte: number = BYTE_RAPPORTO): RapportoLavori {
  let out = r
  if (pesoRapporto(out) > maxByte) {
    out = { ...out, workspace: Object.fromEntries(Object.entries(out.workspace).map(([k, v]) => [k, { ...v, unioni: { ...v.unioni, motivi: {} } }])) }
  }
  if (pesoRapporto(out) > maxByte) {
    const attivita = (l: LavoriWorkspace): number => l.unioni.prove + l.criteri.finiti + l.compiti.affidati + l.fermate.fermo + l.fermate.riavvii
    const ordinati = Object.entries(out.workspace).sort((a, b) => attivita(b[1]) - attivita(a[1]))
    while (ordinati.length > 1 && pesoRapporto({ ...out, workspace: Object.fromEntries(ordinati) }) > maxByte) ordinati.pop()
    out = { ...out, workspace: Object.fromEntries(ordinati) }
  }
  return out
}

const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0)
const conti = (x: unknown): Record<string, number> => {
  const o = typeof x === 'object' && x !== null ? x as Record<string, unknown> : {}
  return Object.fromEntries(Object.entries(o).slice(0, MAX_MOTIVI * 2).map(([k, v]) => [motivoBreve(k), num(v)] as const).filter(([k]) => k !== ''))
}

/** Il corpo di `POST /api/rapporti/arrivati`: si rilegge campo per campo, solo numeri e motivi corti. */
export function leggiRapportoLavori(x: unknown): { ok: true; rapporto: RapportoLavori } | { ok: false; errore: string } {
  const o = typeof x === 'object' && x !== null ? x as Record<string, unknown> : undefined
  if (o === undefined) return { ok: false, errore: 'Il rapporto non è arrivato intero (troppo grande o rotto).' }
  const da = typeof o.da === 'string' ? o.da.trim().slice(0, 80) : ''
  if (da === '') return { ok: false, errore: 'Manca chi manda il rapporto.' }
  const iso = (v: unknown): string | undefined => (typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v)) ? v : undefined)
  const dal = iso(o.dal)
  const al = iso(o.al)
  if (dal === undefined || al === undefined) return { ok: false, errore: 'Nel rapporto mancano le ore di inizio e fine.' }
  const grezzi = typeof o.workspace === 'object' && o.workspace !== null ? Object.entries(o.workspace as Record<string, unknown>).slice(0, MAX_WORKSPACE) : []
  const workspace: Record<string, LavoriWorkspace> = {}
  for (const [nome, v] of grezzi) {
    const w = typeof v === 'object' && v !== null ? v as Record<string, Record<string, unknown> | undefined> : {}
    const u = w.unioni ?? {}, c = w.criteri ?? {}, k = w.compiti ?? {}, a = w.avanzamento ?? {}, f = w.fermate ?? {}
    workspace[nome.slice(0, 80)] = {
      unioni: { prove: num(u.prove), attesaMs: num(u.attesaMs), attesaMaxMs: num(u.attesaMaxMs), provaMs: num(u.provaMs), provaMaxMs: num(u.provaMaxMs), scadute: num(u.scadute), inFila: num(u.inFila), motivi: conti(u.motivi) },
      criteri: { finiti: num(c.finiti), riusciti: num(c.riusciti), rossi: num(c.rossi), durataMs: num(c.durataMs), durataMaxMs: num(c.durataMaxMs), scaduti: num(c.scaduti), inAttesa: num(c.inAttesa) },
      compiti: { affidati: num(k.affidati), restatiQui: num(k.restatiQui), inFila: num(k.inFila), rifiuti: num(k.rifiuti), ruoli: conti(k.ruoli) },
      avanzamento: { svegli: num(a.svegli), limiteDelPiano: num(a.limiteDelPiano), criterioRosso: num(a.criterioRosso) },
      fermate: { fermo: num(f.fermo), fermoMaxMs: num(f.fermoMaxMs), riavvii: num(f.riavvii) }
    }
  }
  const giorno = typeof o.giorno === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.giorno) ? o.giorno : al.slice(0, 10)
  return { ok: true, rapporto: { da, ...(typeof o.versione === 'string' ? { versione: o.versione.slice(0, 40) } : {}), giorno, dal, al, workspace } }
}
