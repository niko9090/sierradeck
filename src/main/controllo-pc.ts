import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { Salute } from '@shared/salute'
import type { AutopilotiDiPc } from '@shared/autopiloti-altri'

/**
 * Il controllo di tutti i PC (0.88.9). Nicholas (31/10): «comunica con tutti i
 * SierraDeck e controlla ogni criticità». Prima ogni PC mandava solo i suoi
 * errori; lo stato (Drive, aggiornamento, autopiloti fermi, PC che non
 * rispondono) restava chiuso su quel PC e nessuno lo guardava.
 *
 * Sul PC di sviluppo, all'avvio e ogni 6 ore: la salute di questo PC e di ogni
 * altro PC (`/api/salute`, chiesta a ognuno con la chiave di casa), gli
 * autopiloti di tutti. Le criticità — una voce di salute non «ok», un
 * autopilota bloccato o in errore, un PC che non risponde — vanno in un
 * rapporto (`.sierradeck/errori-arrivati/controllo-<quando>.md`) affidato
 * all'autopilota di SierraDeck: corregge quello che sta nel codice, dice a
 * Nicholas quello che si fa solo a mano (un'installazione, un PC da accendere).
 * Lo stesso insieme di criticità non si riaffida: si affida solo quando cambia.
 */

export const CONTROLLO_PC_OGNI_MS = 6 * 60 * 60_000
export const PRIMO_CONTROLLO_MS = 15 * 60_000

export type SaluteDiPc = { pcId: string; nome: string; salute?: Salute; errore?: string; battito?: string }

/**
 * 0.94.1: un PC spento non è una criticità. Nicholas, 05/11: «lascia perdere il
 * pc NB-PROBOOK-TEC, è del lavoro e non lo accendo quasi mai». Un PC senza
 * battito sul Drive da più di così è spento, e va bene: lo si dice solo se il
 * battito è fresco (acceso) e non si raggiunge, perché quello è un guasto vero.
 */
export const SPENTO_DOPO_MS = 10 * 60_000

export type Criticita = { pc: string; cosa: string; dettaglio: string }

/** Gli stati di un autopilota che vogliono uno sguardo. */
const STATI_CRITICI = new Set(['bloccata', 'bloccato', 'errore', 'fallito'])

/** `chiave`: il PC di cui si parla, per tenere una riga per PC (non per testo). */
type Voce = Criticita & { chiave?: string; locale?: boolean }

/** Pura: le criticità di tutti i PC, in un ordine stabile. */
export function criticitaDi(saluti: readonly SaluteDiPc[], autopiloti: readonly AutopilotiDiPc[], adesso?: number): Criticita[] {
  const out: Voce[] = []
  // I PC spenti: non rispondono e il loro battito sul Drive è vecchio. Né la riga di
  // qui né quelle che ne danno gli altri PC (`pc:<id>`).
  const spenti = new Set(saluti.filter((s) => s.salute === undefined && adesso !== undefined && s.battito !== undefined && adesso - Date.parse(s.battito) > SPENTO_DOPO_MS).map((s) => s.pcId))
  for (const s of saluti) {
    if (s.salute === undefined) {
      if (spenti.has(s.pcId)) continue
      // Una riga per PC: due PC che non rispondono hanno due motivi, non uno.
      out.push({ pc: s.nome, cosa: 'non risponde', dettaglio: s.errore ?? 'nessuna risposta', chiave: `pc:${s.pcId}`, locale: true })
      continue
    }
    // Un PC con una versione vecchia (o una risposta malformata) può non avere `voci`: nessuna voce, il giro continua.
    const vociDi = Array.isArray(s.salute.voci) ? s.salute.voci : []
    for (const v of vociDi) {
      // 0.89.0: le righe d'errore del registro arrivano già all'autopilota con gli errori
      // automatici (a lotti): qui sarebbero doppie, e spesso di una sessione già finita.
      if (v.tono === 'ok' || v.gruppo === 'errori') continue
      if (v.chiave.startsWith('pc:') && spenti.has(v.chiave.slice(3))) continue
      out.push({
        pc: s.nome, cosa: `${v.tono === 'guasto' ? 'GUASTO' : 'attenzione'} · ${v.titolo}`,
        dettaglio: [v.spiegazione, v.cosaFare].filter((x) => x !== undefined && x !== '').join(' — Cosa fare: '),
        // La voce di un altro PC (`pc:<id>`): più PC la vedono, la riga è una per quel PC.
        ...(v.chiave.startsWith('pc:') ? { chiave: v.chiave } : {})
      })
    }
  }
  for (const p of autopiloti) {
    if (p.errore !== undefined) continue // il PC che non risponde è già contato dalla salute
    for (const a of p.autopiloti) {
      if (!STATI_CRITICI.has(a.stato)) continue
      out.push({ pc: p.nome, cosa: `autopilota «${a.nome}» ${a.stato}`, dettaglio: typeof a.motivo === 'string' ? a.motivo : (a.obiettivo ?? '') })
    }
  }
  return unisci(out)
}

/**
 * 0.89.0: la stessa criticità vista da più PC (NB-PROBOOK spento, detto da tre PC)
 * è una riga sola, con i PC che la vedono.
 */
function unisci(c: readonly Voce[]): Criticita[] {
  const per = new Map<string, { riga: Criticita; pcs: string[]; locale?: Voce }>()
  // La diagnosi generica «non so se è acceso» cede a quella che viene dal bussare (chiave, rifiutato, altro).
  const generica = (cosa: string): boolean => cosa.includes('non so se è acceso')
  for (const x of c) {
    const k = x.chiave ?? x.cosa
    const g = per.get(k)
    if (g === undefined) {
      const { chiave: _chiave, locale, ...riga } = x
      per.set(k, { riga, pcs: [x.pc], ...(locale === true ? { locale: x } : {}) })
      continue
    }
    if (!g.pcs.includes(x.pc)) g.pcs.push(x.pc)
    if (x.locale === true) g.locale = x
    else if (x.cosa !== g.riga.cosa && generica(g.riga.cosa) && !generica(x.cosa) && g.locale === undefined) { g.riga.cosa = x.cosa; g.riga.dettaglio = x.dettaglio }
  }
  return [...per.values()].map((g) => {
    // Il bussare di questo PC è la diagnosi più precisa: vince. Il PC stesso non è fra quelli che lo vedono.
    if (g.locale === undefined) return { ...g.riga, pc: g.pcs.join(', ') }
    const altri = g.pcs.filter((n) => n !== g.locale?.pc)
    return { pc: (altri.length > 0 ? altri : g.pcs).join(', '), cosa: g.locale.cosa, dettaglio: g.locale.dettaglio }
  })
}

/**
 * L'impronta dell'insieme (senza i dettagli, che cambiano a ogni giro: orari, conteggi).
 * 0.89.4: i PC di una riga in ordine. Arrivano nell'ordine in cui rispondono, e
 * «DESKTOP, LAPTOP» dopo «LAPTOP, DESKTOP» faceva riaffidare ogni 6 ore lo stesso
 * rapporto su NB-PROBOOK (31/10-01/11, quattro volte).
 */
export function firmaCriticita(c: readonly Criticita[]): string {
  return createHash('sha256').update(c.map((x) => `${x.pc.split(', ').sort().join(', ')}|${x.cosa}`).sort().join('\n')).digest('hex').slice(0, 16)
}

export function testoRapporto(p: { quando: string; saluti: readonly SaluteDiPc[]; criticita: readonly Criticita[] }): string {
  const righe = [`# Controllo di tutti i PC (${p.quando})`, '']
  righe.push('## I PC', '')
  for (const s of p.saluti) {
    // 0.94.0: quali sono le voci da guardare, non solo quante (05/11: «Z2-TECNICO: 9 da guardare» e basta).
    const voci = (Array.isArray(s.salute?.voci) ? s.salute.voci : []).filter((v) => v.tono !== 'ok').map((v) => v.titolo) ?? []
    const quali = voci.length > 0 ? ` (${voci.slice(0, 6).join('; ')}${voci.length > 6 ? `; e altre ${voci.length - 6}` : ''})` : ''
    righe.push(`- **${s.nome}**: ${s.salute !== undefined ? `${s.salute.tono} — ${s.salute.riassunto}${quali}` : `non risponde (${s.errore ?? '?'})`}`)
  }
  righe.push('', `## Criticità (${p.criticita.length})`, '')
  for (const c of p.criticita) righe.push(`- **${c.pc}** · ${c.cosa}${c.dettaglio !== '' ? `\n  ${c.dettaglio.replace(/\s+/g, ' ').slice(0, 600)}` : ''}`)
  return righe.join('\n') + '\n'
}

export function richiestaControllo(file: string, n: number): string {
  return [
    `Controllo di tutti i PC: ${n} criticità. Il rapporto è in ${file}.`,
    'Per ognuna: se la causa sta nel codice di SierraDeck, correggila con i suoi test (una release sola, mai installata: installa Nicholas);',
    'se si risolve solo a mano (un PC da accendere o da installare a mano, una scelta di Nicholas), scrivila in una lista corta per Nicholas, con il PC e cosa fare.',
    'Non riaprire le criticità già corrette in main: dillo e basta.'
  ].join(' ')
}

type StatoControllo = { firma?: string; il?: string }

export async function giroControlloPc(d: {
  radice: () => string | undefined
  io: () => { id: string; nome: string }
  altri: () => Array<{ pcId: string; nome: string; battito?: string }>
  saluteQui: () => Promise<Salute>
  saluteDi: (pcId: string) => Promise<Salute>
  autopiloti: () => Promise<AutopilotiDiPc[]>
  /** 0.89.0: anche gli autopiloti di questo PC (prima solo quelli degli altri). */
  autopilotiQui?: () => Promise<AutopilotiDiPc['autopiloti']>
  affida: (p: { testo: string; cwd: string }) => Promise<void>
  adesso: () => number
  log: (riga: string) => void
}): Promise<{ criticita: number; affidato: boolean }> {
  const radice = d.radice()
  if (radice === undefined) return { criticita: 0, affidato: false }
  const io = d.io()
  const saluti: SaluteDiPc[] = [{ pcId: io.id, nome: io.nome, salute: await d.saluteQui() }]
  const altri = await Promise.all(d.altri().map(async (p): Promise<SaluteDiPc> => {
    try {
      const salute = await d.saluteDi(p.pcId)
      // La risposta di un altro PC non è fidata: senza `voci` (versione vecchia?) è come un PC che non risponde bene.
      if (salute === null || typeof salute !== 'object' || !Array.isArray(salute.voci)) return { ...p, errore: 'risposta non leggibile, versione vecchia?' }
      return { ...p, salute }
    } catch (e) { return { ...p, errore: e instanceof Error ? e.message : String(e) } }
  }))
  saluti.push(...altri)
  const autopiloti = await d.autopiloti().catch(() => [] as AutopilotiDiPc[])
  if (d.autopilotiQui !== undefined) {
    const qui = await d.autopilotiQui().catch(() => undefined)
    if (qui !== undefined) autopiloti.unshift({ pcId: io.id, nome: io.nome, autopiloti: qui })
  }
  const criticita = criticitaDi(saluti, autopiloti, d.adesso())
  const cartella = join(radice, '.sierradeck', 'errori-arrivati')
  const fileStato = join(cartella, '.controllo-pc.json')
  let stato: StatoControllo = {}
  try { if (existsSync(fileStato)) stato = JSON.parse(readFileSync(fileStato, 'utf8')) as StatoControllo } catch { stato = {} }
  const firma = firmaCriticita(criticita)
  d.log(`[controllo PC] ${saluti.length} PC, ${criticita.length} criticità${firma === stato.firma ? ' (le stesse dell’ultima volta)' : ''}`)
  if (criticita.length === 0 || firma === stato.firma) {
    if (criticita.length === 0 && stato.firma !== firma) { mkdirSync(cartella, { recursive: true }); writeFileSync(fileStato, JSON.stringify({ firma, il: new Date(d.adesso()).toISOString() })) }
    return { criticita: criticita.length, affidato: false }
  }
  const quando = new Date(d.adesso()).toISOString()
  const file = join(cartella, `controllo-${quando.replace(/[-:]/g, '').slice(0, 15)}.md`)
  mkdirSync(cartella, { recursive: true })
  writeFileSync(file, testoRapporto({ quando, saluti, criticita }))
  await d.affida({ testo: richiestaControllo(file, criticita.length), cwd: radice })
  writeFileSync(fileStato, JSON.stringify({ firma, il: quando }))
  return { criticita: criticita.length, affidato: true }
}
