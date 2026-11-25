import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { prima, type Salute } from '@shared/salute'
import { SPENTO_DOPO_MS, statoPc, vistoConAiutante, vistoDelPc } from '@shared/stato-pc'
import { unBattitoPerNome, type AutopilotiDiPc } from '@shared/autopiloti-altri'
import { senzaAiutanti, type BattitoPc } from '@shared/posta'
import { accessoDalBattito, fraseAccessoPc, type AccessoClaudePc } from '@shared/accesso-claude-pc'

/**
 * k-196: la versione che un PC dice adesso (rotta leggera /api/pc), se risponde. Una sola fonte:
 * la usano la Salute e il pannello «Altri computer». Senza risposta valida: undefined.
 */
export async function versioneDalVivo(chiama: (pcId: string, percorso: string) => Promise<unknown>, pcId: string): Promise<string | undefined> {
  const r = await chiama(pcId, '/api/pc').catch(() => undefined) as { versione?: unknown } | undefined
  return typeof r?.versione === 'string' && /^\d+\.\d+\.\d+/.test(r.versione) ? r.versione : undefined
}

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

/**
 * k-163e: gli altri PC del controllo, dal postino. Una fonte sola per il segno più recente (`vistoConAiutante`
 * / `vistoDelPc`: SierraDeck e Aiutante dello stesso PC) e per le soglie (`statoPc`). I battiti si rileggono dal
 * Drive (`pc`), non da `pcSubito`: quello risponde con la memoria (anche quella letta dal disco all'avvio, o col
 * freno del Drive) e il controllo, ogni 6 ore, giudicava «non risponde» un PC che l'Aiutante aveva appena segnato.
 * Se il Drive non risponde si ripiega sulla memoria (`altrui`).
 */
export async function altriPcDelControllo(d: {
  postino: { pc: () => Promise<BattitoPc[]>; altrui: () => BattitoPc[] }
  ioId: string
  nome: (b: BattitoPc) => string
  adesso: () => number
}): Promise<Array<{ pcId: string; nome: string; battito?: string; soloAiutante?: boolean; accesso?: AccessoClaudePc }>> {
  const tutti = await d.postino.pc().catch(() => d.postino.altrui())
  const visti = vistoConAiutante(tutti, (b) => b.battito)
  const adesso = d.adesso()
  return unBattitoPerNome(senzaAiutanti(tutti).filter((b) => b.pcId !== d.ioId), d.nome).map((b) => ({
    pcId: b.pcId, nome: d.nome(b),
    ...(visti.get(b.pcId) !== undefined ? { battito: visti.get(b.pcId) as string } : {}),
    // Acceso solo grazie all'Aiutante: SierraDeck là è chiuso, non è un «non risponde».
    ...(vistoDelPc(tutti, b.pcId, adesso).soloAiutante ? { soloAiutante: true } : {}),
    // 25/11: l'accesso a Claude di quel PC adesso, dal suo battito (assente = versione vecchia: non si sa).
    ...(() => { const a = accessoDalBattito(b.accessoClaude); return a !== undefined ? { accesso: a } : {} })()
  }))
}

export type SaluteDiPc = { pcId: string; nome: string; salute?: Salute; errore?: string; battito?: string; /** Risponde, ma non ha finito in tempo (anche al secondo tentativo): lento, non spento. */ lento?: boolean; /** Il battito è dell'Aiutante: SierraDeck là è chiuso (`vistoDelPc`). */ soloAiutante?: boolean; /** 25/11: l'accesso a Claude di quel PC adesso (dal battito); assente = non si sa. */ accesso?: AccessoClaudePc }

/**
 * 0.94.1: un PC spento non è una criticità. Nicholas, 05/11: «lascia perdere il
 * pc NB-PROBOOK-TEC, è del lavoro e non lo accendo quasi mai». Un PC senza
 * battito sul Drive da più di così è spento, e va bene: lo si dice solo se il
 * battito è fresco (acceso) e non si raggiunge, perché quello è un guasto vero.
 */
export { SPENTO_DOPO_MS }

/** 19/11: non risponde, ma l'Aiutante di quel PC batte (SierraDeck là è chiuso): acceso, non una criticità. */
function soloAiutante(s: SaluteDiPc): boolean {
  return s.salute === undefined && s.soloAiutante === true
}

/** Non risponde e ha un battito sul Drive che non è fresco (o è illeggibile): spento. */
function pcSpento(s: SaluteDiPc, adesso: number): boolean {
  return s.salute === undefined && s.battito !== undefined && statoPc(s.battito, adesso).stato !== 'acceso'
}

export type Criticita ={ pc: string; cosa: string; dettaglio: string }

/** Gli stati di un autopilota che vogliono uno sguardo. */
const STATI_CRITICI = new Set(['bloccata', 'bloccato', 'errore', 'fallito'])

/** `chiave`: il PC di cui si parla, per tenere una riga per PC (non per testo). */
type Voce = Criticita & { chiave?: string; locale?: boolean }

/** Pura: le criticità di tutti i PC, in un ordine stabile. */
export function criticitaDi(saluti: readonly SaluteDiPc[], autopiloti: readonly AutopilotiDiPc[], adesso?: number): Criticita[] {
  const out: Voce[] = []
  // I PC spenti: non rispondono e il loro battito sul Drive è vecchio. Né la riga di
  // qui né quelle che ne danno gli altri PC (`pc:<id>`).
  const spenti = new Set(saluti.filter((s) => adesso !== undefined && pcSpento(s, adesso)).map((s) => s.pcId))
  for (const s of saluti) {
    if (s.salute === undefined) {
      if (spenti.has(s.pcId) || soloAiutante(s)) continue
      // Risponde ma è lento: non è «non risponde». Il prossimo giro riprova.
      if (s.lento === true) continue
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
      // Quel PC è acceso con il solo Aiutante: un altro PC che lo dice «non si raggiunge» parla di SierraDeck, chiuso là.
      if (v.chiave.startsWith('pc:') && saluti.some((x) => x.pcId === v.chiave.slice(3) && soloAiutante(x))) continue
      // Scheda video di un PC spento (voce di un PC con una versione vecchia): dato vecchio, non criticità.
      if (v.chiave.startsWith('gpu:') && spenti.has(v.chiave.slice(4))) continue
      // «Non risponde a nessuna strada» detto da un PC, ma quel PC ha risposto a chi controlla: è la strada
      // fra i due che non va, non un guasto del PC.
      const raggiuntoDaChiControlla = v.chiave.startsWith('pc:') && saluti.some((x) => x.pcId === v.chiave.slice(3) && x.salute !== undefined)
      const tono = v.tono === 'guasto' && raggiuntoDaChiControlla ? 'attenzione' : v.tono
      // k-191: «Aggiorna X» detto da un PC che ha la versione di X dal battito (o da una versione
      // vecchia del programma): se X stesso ha detto adesso una versione non più vecchia, è falso.
      if (v.chiave.startsWith('pc:')) {
        const nuova = v.azioni?.find((a) => a.id === 'installa-la') as { versione?: string } | undefined
        const sua = saluti.find((x) => x.pcId === v.chiave.slice(3))?.salute?.versione
        if (nuova?.versione !== undefined && typeof sua === 'string' && !prima(sua, nuova.versione)) continue
      }
      // k-202: «Quanto lavora SierraDeck» ha i numeri (CPU, RAM, richieste) nel titolo, che cambiano a ogni giro:
      // la chiave è per PC e il titolo senza numeri, i numeri restano nel dettaglio.
      const risorse = v.chiave === 'risorse'
      const titolo = risorse ? v.titolo.split(':')[0] ?? v.titolo : v.titolo
      out.push({
        pc: s.nome, cosa: `${tono === 'guasto' ? 'GUASTO' : 'attenzione'} · ${titolo}`,
        dettaglio: [v.spiegazione, v.cosaFare].filter((x) => x !== undefined && x !== '').join(' — Cosa fare: '),
        // La voce di un altro PC (`pc:<id>`): più PC la vedono, la riga è una per quel PC.
        ...(v.chiave.startsWith('pc:') ? { chiave: v.chiave } : risorse ? { chiave: `risorse:${s.pcId}` } : {})
      })
    }
  }
  // 25/11: l'accesso a Claude scaduto, dal battito di quel PC (lo stato di adesso, non un errore arrivato vecchio).
  // Una riga per PC, con il PC: si rinnova solo sul suo schermo.
  for (const s of saluti) {
    if (s.accesso?.stato !== 'scaduto' || spenti.has(s.pcId)) continue
    out.push({ pc: s.nome, cosa: 'accesso a Claude scaduto', dettaglio: fraseAccessoPc(s.nome, { esito: 'scaduto', dal: s.accesso.dal }), chiave: `accesso:${s.pcId}` })
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
  const generica = (cosa: string): boolean => cosa.includes('non so se è acceso') || cosa.includes(' · spento') ||cosa.includes('acceso secondo il Drive, ma non si raggiunge')
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

export function testoRapporto(p: { quando: string; saluti: readonly SaluteDiPc[]; criticita: readonly Criticita[]; adesso?: number }): string {
  const righe = [`# Controllo di tutti i PC (${p.quando})`, '']
  const adesso = p.adesso ?? Date.parse(p.quando)
  // I PC spenti: una riga corta ciascuno, con la frase di `statoPc` (da quanto, fra quanto si toglie).
  const spentiRiga = p.saluti.filter((s) => pcSpento(s, adesso))
  const idSpenti = new Set(spentiRiga.map((s) => s.pcId))
  righe.push('## I PC', '')
  for (const s of p.saluti) {
    if (idSpenti.has(s.pcId)) continue
    // 0.94.0: quali sono le voci da guardare, non solo quante (05/11: «Z2-TECNICO: 9 da guardare» e basta).
    const voci = (Array.isArray(s.salute?.voci) ? s.salute.voci : []).filter((v) => v.tono !== 'ok' && !(v.chiave.startsWith('pc:') && idSpenti.has(v.chiave.slice(3)))).map((v) => v.titolo) ?? []
    const quali = voci.length > 0 ? ` (${voci.slice(0, 6).join('; ')}${voci.length > 6 ? `; e altre ${voci.length - 6}` : ''})` : ''
    // k-191: la versione di chi risponde è quella che dice lui adesso; per chi non risponde, il battito, segnato come vecchio.
    const versione = s.salute?.versione !== undefined ? ` · versione ${s.salute.versione} (detta dal PC adesso)`
      : s.battito !== undefined ? ` · versione ignota adesso (ultimo battito sul Drive: ${s.battito}, ${statoPc(s.battito, adesso).stato === 'acceso' ? statoPc(s.battito, adesso).frase : 'dato vecchio'})` : ''
    const accesso = s.accesso === undefined ? ' · accesso a Claude: non so (il battito non lo dice)' : s.accesso.stato === 'scaduto' ? ` · accesso a Claude: SCADUTO dal ${s.accesso.dal}` : ` · accesso a Claude: va${s.accesso.rinnovatoIl !== undefined ? ` (rinnovato il ${s.accesso.rinnovatoIl})` : ''}`
    righe.push(`- **${s.nome}**${versione}${accesso}: ${s.salute !== undefined ? `${s.salute.tono} — ${s.salute.riassunto}${quali}` : soloAiutante(s) ? 'acceso, lavora solo l’Aiutante (SierraDeck non è aperto)' : s.lento === true ? `lento, riprovo (${s.errore ?? '?'})` : `non risponde (${s.errore ?? '?'})`}`)
  }
  if (spentiRiga.length > 0) {
    righe.push('', `## PC spenti (${spentiRiga.length})`, '')
    for (const s of spentiRiga) righe.push(`- **${s.nome}**: ${statoPc(s.battito, adesso).frase}`)
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
    'Non riaprire le criticità già corrette in main: dillo e basta.',
    'Accesso a Claude: vale lo stato di ogni PC nel rapporto (dal suo battito), non gli errori arrivati prima. È per PC: se è scaduto, di’ a Nicholas quale PC e che si rinnova sullo schermo di quel PC; se va o non si sa, non chiedergli di rinnovarlo.'
  ].join(' ')
}

type StatoControllo = { firma?: string; il?: string }

export async function giroControlloPc(d: {
  radice: () => string | undefined
  io: () => { id: string; nome: string }
  altri: () => Array<{ pcId: string; nome: string; battito?: string; soloAiutante?: boolean; accesso?: AccessoClaudePc }>
  /** 25/11: l'accesso a Claude di questo PC adesso. */
  accessoQui?: () => AccessoClaudePc | undefined
  saluteQui: () => Promise<Salute>
  saluteDi: (pcId: string) => Promise<Salute>
  autopiloti: () => Promise<AutopilotiDiPc[]>
  /** 0.89.0: anche gli autopiloti di questo PC (prima solo quelli degli altri). */
  autopilotiQui?: () => Promise<AutopilotiDiPc['autopiloti']>
  affida: (p: { testo: string; cwd: string }) => Promise<void>
  adesso: () => number
  log: (riga: string) => void
  /** Pausa prima del secondo tentativo con un PC lento (predefinita 3 s). */
  riprovaMs?: number
}): Promise<{ criticita: number; affidato: boolean }> {
  const radice = d.radice()
  if (radice === undefined) return { criticita: 0, affidato: false }
  const io = d.io()
  const accessoQui = (() => { try { return d.accessoQui?.() } catch { return undefined } })()
  const saluti: SaluteDiPc[] = [{ pcId: io.id, nome: io.nome, salute: await d.saluteQui(), ...(accessoQui !== undefined ? { accesso: accessoQui } : {}) }]
  const altri = await Promise.all(d.altri().map(async (p): Promise<SaluteDiPc> => {
    // Un PC che risponde ma non finisce in tempo (stato 504) si riprova una volta.
    const scaduta = (e: unknown): boolean => (e as { stato?: unknown } | null)?.stato === 504
    const chiedi = async (): Promise<Salute> => {
      try { return await d.saluteDi(p.pcId) } catch (e) {
        if (!scaduta(e)) throw e
        await new Promise((r) => setTimeout(r, d.riprovaMs ?? 3000))
        return await d.saluteDi(p.pcId)
      }
    }
    try {
      const salute = await chiedi()
      // La risposta di un altro PC non è fidata: senza `voci` (versione vecchia?) è come un PC che non risponde bene.
      if (salute === null || typeof salute !== 'object' || !Array.isArray(salute.voci)) return { ...p, errore: 'risposta non leggibile, versione vecchia?' }
      return { ...p, salute }
    } catch (e) { return { ...p, errore: e instanceof Error ? e.message : String(e), ...(scaduta(e) ? { lento: true } : {}) } }
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
  writeFileSync(file, testoRapporto({ quando, saluti, criticita, adesso: d.adesso() }))
  await d.affida({ testo: richiestaControllo(file, criticita.length), cwd: radice })
  writeFileSync(fileStato, JSON.stringify({ firma, il: quando }))
  return { criticita: criticita.length, affidato: true }
}
