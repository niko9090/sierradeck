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

export type SaluteDiPc = { pcId: string; nome: string; salute?: Salute; errore?: string }

export type Criticita = { pc: string; cosa: string; dettaglio: string }

/** Gli stati di un autopilota che vogliono uno sguardo. */
const STATI_CRITICI = new Set(['bloccata', 'bloccato', 'errore', 'fallito'])

/** Pura: le criticità di tutti i PC, in un ordine stabile. */
export function criticitaDi(saluti: readonly SaluteDiPc[], autopiloti: readonly AutopilotiDiPc[]): Criticita[] {
  const out: Criticita[] = []
  for (const s of saluti) {
    if (s.salute === undefined) {
      out.push({ pc: s.nome, cosa: 'non risponde', dettaglio: s.errore ?? 'nessuna risposta' })
      continue
    }
    for (const v of s.salute.voci) {
      // 0.89.0: le righe d'errore del registro arrivano già all'autopilota con gli errori
      // automatici (a lotti): qui sarebbero doppie, e spesso di una sessione già finita.
      if (v.tono === 'ok' || v.gruppo === 'errori') continue
      out.push({ pc: s.nome, cosa: `${v.tono === 'guasto' ? 'GUASTO' : 'attenzione'} · ${v.titolo}`, dettaglio: [v.spiegazione, v.cosaFare].filter((x) => x !== undefined && x !== '').join(' — Cosa fare: ') })
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
function unisci(c: readonly Criticita[]): Criticita[] {
  const per = new Map<string, Criticita>()
  for (const x of c) {
    const g = per.get(x.cosa)
    if (g === undefined) per.set(x.cosa, { ...x })
    else if (!g.pc.split(', ').includes(x.pc)) g.pc = `${g.pc}, ${x.pc}`
  }
  return [...per.values()]
}

/** L'impronta dell'insieme (senza i dettagli, che cambiano a ogni giro: orari, conteggi). */
export function firmaCriticita(c: readonly Criticita[]): string {
  return createHash('sha256').update(c.map((x) => `${x.pc}|${x.cosa}`).sort().join('\n')).digest('hex').slice(0, 16)
}

export function testoRapporto(p: { quando: string; saluti: readonly SaluteDiPc[]; criticita: readonly Criticita[] }): string {
  const righe = [`# Controllo di tutti i PC (${p.quando})`, '']
  righe.push('## I PC', '')
  for (const s of p.saluti) righe.push(`- **${s.nome}**: ${s.salute !== undefined ? `${s.salute.tono} — ${s.salute.riassunto}` : `non risponde (${s.errore ?? '?'})`}`)
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
  altri: () => Array<{ pcId: string; nome: string }>
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
    try { return { ...p, salute: await d.saluteDi(p.pcId) } } catch (e) { return { ...p, errore: e instanceof Error ? e.message : String(e) } }
  }))
  saluti.push(...altri)
  const autopiloti = await d.autopiloti().catch(() => [] as AutopilotiDiPc[])
  if (d.autopilotiQui !== undefined) {
    const qui = await d.autopilotiQui().catch(() => undefined)
    if (qui !== undefined) autopiloti.unshift({ pcId: io.id, nome: io.nome, autopiloti: qui })
  }
  const criticita = criticitaDi(saluti, autopiloti)
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
