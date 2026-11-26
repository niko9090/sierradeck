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
  unioni: { prove: number; attesaMs: number; attesaMaxMs: number; provaMs: number; provaMaxMs: number; scadute: number; inFila: number; motivi: Record<string, number>; /** Prove che non sono partite (cartella con file non salvati…): non sono prove. */ nonPartite: number; motiviNonPartite?: Record<string, number> }
  /** `nonMisurati` (k-199c): ambiente rotto, comando assente, codice 126: non sono rossi. */
  criteri: { finiti: number; riusciti: number; rossi: number; nonMisurati: number; durataMs: number; durataMaxMs: number; scaduti: number; inAttesa: number }
  compiti: { affidati: number; restatiQui: number; inFila: number; rifiuti: number; ruoli: Record<string, number> }
  /** `lavoroFermoMaxMin`: l'età del lavoro fermo più lungo, in minuti. `spinteSospese`: spinte senza effetto (k-199d). */
  avanzamento: { svegli: number; limiteDelPiano: number; criterioRosso: number; lavoroFermoMaxMin: number; spinteSospese: number }
  /** `fermo`: rallentamenti del servizio con più di 1 s di ritardo (soglia della spia, ogni volta conta), `fermoMaxMs` il più lungo. `motiviRiavvio`: perché il servizio è ripartito (motivo breve → quante volte). */
  fermate: { fermo: number; fermoMaxMs: number; riavvii: number; motiviRiavvio?: Record<string, number> }
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
    unioni: { prove: 0, attesaMs: 0, attesaMaxMs: 0, provaMs: 0, provaMaxMs: 0, scadute: 0, inFila: 0, motivi: {}, nonPartite: 0 },
    criteri: { finiti: 0, riusciti: 0, rossi: 0, nonMisurati: 0, durataMs: 0, durataMaxMs: 0, scaduti: 0, inAttesa: 0 },
    compiti: { affidati: 0, restatiQui: 0, inFila: 0, rifiuti: 0, ruoli: {} },
    avanzamento: { svegli: 0, limiteDelPiano: 0, criterioRosso: 0, lavoroFermoMaxMin: 0, spinteSospese: 0 },
    fermate: { fermo: 0, fermoMaxMs: 0, riavvii: 0 }
  }
}

export function eVuoto(l: LavoriWorkspace): boolean {
  return JSON.stringify(l) === JSON.stringify(lavoriVuoti())
}

/** Una unione è «lenta» se in media, o al massimo, supera queste soglie (un punto solo: analisi e intoppi). */
export const UNIONE_LENTA_ATTESA_MS = 60_000
export const UNIONE_LENTA_PROVA_MS = 5 * 60_000

/**
 * Un rallentamento del servizio è un intoppo solo se è serio: il più lungo supera 5 s, oppure sono molti
 * (5 o più nello stesso rapporto: un servizio che a ripetizione non risponde non è un caso). Ma i «molti»
 * contano solo se non sono tutti piccolissimi: se il più lungo è sotto 2 s servono 20 o più rallentamenti.
 * Pochi ritardi di circa 1 s restano nei numeri del rapporto ma non fanno partire l'analisi.
 */
export const RALLENTAMENTO_SERIO_MS = 5000
export const RALLENTAMENTI_MOLTI = 5
export const RALLENTAMENTO_PICCOLO_MS = 2000
export const RALLENTAMENTI_MOLTISSIMI = 20

const numero = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0)

/** Le unioni di prova di questo workspace sono lente (i campi che mancano valgono 0). */
export function unioniLente(u: Partial<LavoriWorkspace['unioni']> | undefined): boolean {
  const prove = numero(u?.prove)
  if (prove <= 0) return false
  const mediaAttesa = Math.round(numero(u?.attesaMs) / prove)
  const mediaProva = Math.round(numero(u?.provaMs) / prove)
  return mediaAttesa > UNIONE_LENTA_ATTESA_MS || numero(u?.attesaMaxMs) > UNIONE_LENTA_ATTESA_MS || mediaProva > UNIONE_LENTA_PROVA_MS || numero(u?.provaMaxMs) > UNIONE_LENTA_PROVA_MS
}

/** Un riavvio è normale se è un avvio con versione nota o un aggiornamento (lo dice il motivo scritto da `contaLavori`). */
const riavvioNormale = (motivo: string): boolean => motivo.startsWith('avvio con la versione ') || motivo.startsWith('aggiornamento da ')

/**
 * k-int: c'è un intoppo da riferire? Unioni scadute, non partite o lente; criteri scaduti per tempo o
 * rossi senza correzione; spinte sospese; limite del piano; lavoro fermo; permessi negati; fermate o
 * rallentamenti del servizio; riavvii che non sono un avvio normale né un aggiornamento. NON sono
 * intoppi: criteri rossi normali (si correggono da soli), non misurati, attesa del turno, compiti
 * affidati, ruoli. Un campo che manca vale 0 (rapporti dei PC vecchi).
 */
export function haIntoppi(l: LavoriWorkspace): boolean {
  const u: Partial<LavoriWorkspace['unioni']> = l.unioni ?? {}
  const c: Partial<LavoriWorkspace['criteri']> = l.criteri ?? {}
  const k: Partial<LavoriWorkspace['compiti']> = l.compiti ?? {}
  const a: Partial<LavoriWorkspace['avanzamento']> = l.avanzamento ?? {}
  const f: Partial<LavoriWorkspace['fermate']> = l.fermate ?? {}
  if (numero(u.scadute) > 0 || numero(u.nonPartite) > 0 || unioniLente(u)) return true
  if (numero(c.scaduti) > 0) return true
  if (numero(a.criterioRosso) > 0 || numero(a.spinteSospese) > 0 || numero(a.limiteDelPiano) > 0 || numero(a.svegli) > 0) return true
  if (numero(k.rifiuti) > 0) return true
  const piuLungo = numero(f.fermoMaxMs)
  const sogliaMolti = piuLungo < RALLENTAMENTO_PICCOLO_MS ? RALLENTAMENTI_MOLTISSIMI : RALLENTAMENTI_MOLTI
  if (piuLungo > RALLENTAMENTO_SERIO_MS || numero(f.fermo) >= sogliaMolti) return true
  const normali = Object.entries(f.motiviRiavvio ?? {}).filter(([m]) => riavvioNormale(m)).reduce((s, [, n]) => s + numero(n), 0)
  return numero(f.riavvii) > normali
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

/** Gruppi: l'istante, chi ha scritto la riga (`app`, `servizio`), il messaggio. */
const ORA =/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z) \[[^\]]+\] \[([^\]]+)\] (.*)$/

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
export function contaLavori(righe: readonly string[], dopo?: string, versionePrima?: string): { workspace: Record<string, LavoriWorkspace>; ultima?: string; righe: number; versioneAvviata?: string } {
  const ws: Record<string, LavoriWorkspace> = {}
  const di = (nome: string): LavoriWorkspace => {
    const k = nome in ws || Object.keys(ws).length < MAX_WORKSPACE ? nome : 'altri'
    return (ws[k] ??= lavoriVuoti())
  }
  let ultima: string | undefined
  let lette = 0
  // `versionePrima`: l'ultima versione avviata vista nei giri passati (l'avvio di prima sta in righe già lette, fuori dalla finestra).
  let versioneAvvio: string | undefined = versionePrima
  // D1: l'ultimo criterio finito non verde. Se poi arriva «rosso per tempo scaduto» (si rimisura), quel finito non è l'esito: si toglie.
  let pendente: { ws: string; nonMisurato: boolean; ms: number } | undefined
  for (const r of righe) {
    const m = ORA.exec(r)
    if (m === null) continue
    const quando = m[1] as string
    if (dopo !== undefined && quando <= dopo) continue
    ultima = ultima === undefined || quando > ultima ? quando : ultima
    const chi = m[2] as string
    let t = m[3] as string
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
    } else if ((x = /^\[unione di prova\] [^:]+: non partita \((.*)\)\s*$/.exec(t)) !== null) {
      // k-bloc: la prova non è nemmeno partita (cartella con file non salvati…): non è una prova, non entra nelle medie.
      const l = di(wsRiga)
      l.unioni.nonPartite += 1
      const m = motivoBreve(x[1] as string)
      if (m !== '') { const mp = (l.unioni.motiviNonPartite ??= {}); const k = m in mp || Object.keys(mp).length < MAX_MOTIVI ? m : 'altro'; mp[k] = (mp[k] ?? 0) + 1 }
      lette += 1
    } else if ((x = /^\[criterio\] finito con (-?\d+) in (\d+) s(?: \(non misurato: [^)]*\))?/.exec(t)) !== null) {
      const c = di(wsRiga).criteri
      const ms = Number(x[2]) * 1000
      // Le righe vecchie non portano il flag: restano rosse come prima.
      const nonMisurato = /^\[criterio\] finito con -?\d+ in \d+ s \(non misurato:/.test(t)
      c.finiti += 1; c.durataMs += ms; c.durataMaxMs = Math.max(c.durataMaxMs, ms)
      if (Number(x[1]) === 0) { c.riusciti += 1; pendente = undefined }
      else {
        if (nonMisurato) c.nonMisurati += 1; else c.rossi += 1
        pendente = { ws: wsRiga, nonMisurato, ms }
      }
      lette += 1
    } else if (/^\[criterio\] .*non misurabile su questo PC/.test(t)) {
      di(wsRiga).criteri.nonMisurati += 1; lette += 1
    } else if (/^\[criterio\] .*rosso per tempo scaduto/.test(t)) {
      const c = di(wsRiga).criteri
      c.scaduti += 1
      // Il finito di prima era il tempo scaduto, non l'esito: l'esito è quello della rimisura.
      if (pendente !== undefined && (pendente.ws === wsRiga || wsRiga === WORKSPACE_GENERALE)) {
        const p = di(pendente.ws).criteri
        p.finiti = Math.max(0, p.finiti - 1); p.durataMs = Math.max(0, p.durataMs - pendente.ms)
        if (pendente.nonMisurato) p.nonMisurati = Math.max(0, p.nonMisurati - 1); else p.rossi = Math.max(0, p.rossi - 1)
      }
      pendente = undefined
      lette += 1
    } else if (/^\[criterio\] aspetta il suo turno/.test(t)) {
      di(wsRiga).criteri.inAttesa += 1; lette += 1
    } else if ((x = /^\[orchestratore\] (.+?) — .*unione in fila, (\d+)ª/.exec(t)) !== null) {
      di(x[1] as string).unioni.inFila += 1; lette += 1
    } else if ((x = /^\[orchestratore\] (.+?) — .*criterio rosso senza correzione/.exec(t)) !== null) {
      di(x[1] as string).avanzamento.criterioRosso += 1; lette += 1
    } else if ((x = /^\[orchestratore\] (.+?) — lavoro fermo da (\d+) minuti/.exec(t)) !== null) {
      const l = di(x[1] as string)
      // D6: il lavoro fermo ha il suo campo (minuti), fuori dalle fermate del servizio (ms).
      l.avanzamento.svegli += 1
      l.avanzamento.lavoroFermoMaxMin = Math.max(l.avanzamento.lavoroFermoMaxMin, Number(x[2]))
      lette += 1
    } else if ((x = /^\[orchestratore\] (.+?) — .*spinte sospese: (\d+)/.exec(t)) !== null) {
      di(x[1] as string).avanzamento.spinteSospese += Number(x[2]); lette += 1
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
    } else if ((x = /^\[servizio\] fermo ([\d.]+) s senza rispondere(?: \((\d+) vol)?/.exec(t)) !== null) {
      const f = di(WORKSPACE_GENERALE).fermate
      // D5: la spia scrive al più una riga al minuto con «(N volte …)»: si sommano le N (le righe vecchie senza N valgono 1).
      f.fermo += x[2] !== undefined ? Math.max(1, Number(x[2])) : 1
      f.fermoMaxMs = Math.max(f.fermoMaxMs, Math.round(Number(x[1]) * 1000))
      lette += 1
    } else if ((x = /^━━━ sessione avviata · SierraDeck v(\S+)/.exec(t)) !== null) {
      // D4 + k-199h: ogni avvio scrive una riga per il programma e una per il servizio: si conta solo il servizio
      // (un riavvio del servizio, non la finestra riaperta), e si dice perché (versione cambiata o no).
      lette += 1
      if (chi === 'servizio') {
        const f = di(WORKSPACE_GENERALE).fermate
        f.riavvii += 1
        const v = x[1] as string
        const motivo = versioneAvvio === undefined ? `avvio con la versione ${v} (la precedente non è nota)`
          : versioneAvvio === v ? `riavvio senza aggiornamento (versione ${v})` : `aggiornamento da ${versioneAvvio} a ${v}`
        const m = (f.motiviRiavvio ??= {})
        m[motivo] = (m[motivo] ?? 0) + 1
        versioneAvvio = v
      }
    }
  }
  return { workspace: ws, ...(ultima !== undefined ? { ultima } : {}), righe: lette, ...(versioneAvvio !== undefined ? { versioneAvviata: versioneAvvio } : {}) }
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
      unioni: { prove: num(u.prove), attesaMs: num(u.attesaMs), attesaMaxMs: num(u.attesaMaxMs), provaMs: num(u.provaMs), provaMaxMs: num(u.provaMaxMs), scadute: num(u.scadute), inFila: num(u.inFila), motivi: conti(u.motivi), nonPartite: num(u.nonPartite), ...(Object.keys(conti(u.motiviNonPartite)).length > 0 ? { motiviNonPartite: conti(u.motiviNonPartite) } : {}) },
      criteri: { finiti: num(c.finiti), riusciti: num(c.riusciti), rossi: num(c.rossi), nonMisurati: num(c.nonMisurati), durataMs: num(c.durataMs), durataMaxMs: num(c.durataMaxMs), scaduti: num(c.scaduti), inAttesa: num(c.inAttesa) },
      compiti: { affidati: num(k.affidati), restatiQui: num(k.restatiQui), inFila: num(k.inFila), rifiuti: num(k.rifiuti), ruoli: conti(k.ruoli) },
      avanzamento: { svegli: num(a.svegli), limiteDelPiano: num(a.limiteDelPiano), criterioRosso: num(a.criterioRosso), lavoroFermoMaxMin: num(a.lavoroFermoMaxMin), spinteSospese: num(a.spinteSospese) },
      fermate: { fermo: num(f.fermo), fermoMaxMs: num(f.fermoMaxMs), riavvii: num(f.riavvii), ...(Object.keys(conti(f.motiviRiavvio)).length > 0 ? { motiviRiavvio: conti(f.motiviRiavvio) } : {}) }
    }
  }
  const giorno = typeof o.giorno === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.giorno) ? o.giorno : al.slice(0, 10)
  return { ok: true, rapporto: { da, ...(typeof o.versione === 'string' ? { versione: o.versione.slice(0, 40) } : {}), giorno, dal, al, workspace } }
}
