import type { Autopilota, Decisione } from '@shared/autopilota'
import { senzaUtente, titoloScheda } from './scheda-lavoro'

/**
 * Lo storico di un lavoro nel quaderno (0.84.0).
 *
 * Il diario dell'autopilota (`decisioni`) è scritto per il programma: ogni
 * giro, ogni pausa, ogni criterio rimisurato. Nicholas voleva sapere, a lavoro
 * aperto e da qualunque posto (PC, pagina, app), solo le cose che contano:
 * quali chat sono state aperte, cosa è stato dato da fare, cosa è stato unito,
 * cosa si è chiuso, cosa è stato pubblicato e cosa ha deciso lui.
 *
 * Qui si sceglie dal diario quelle righe e si riscrivono in italiano piano, una
 * volta sola ciascuna. Il file è `.sierradeck/quaderno/storico-<lavoro>.md`:
 * una scheda del quaderno come le altre, quindi la leggono già il Quaderno del
 * PC, quello della pagina e quello dell'app.
 */

export type TipoStorico = 'chat' | 'consegna' | 'unione' | 'chiusura' | 'release' | 'decisione'

export type VoceStorico = { quando: string; tipo: TipoStorico; testo: string }

/** Come si chiama ogni tipo nella scheda. */
export const NOME_TIPO: Record<TipoStorico, string> = {
  chat: 'Chat aperta',
  consegna: 'Consegna',
  unione: 'Unione',
  chiusura: 'Chiusura',
  release: 'Release',
  decisione: 'Decisione di Nicholas'
}

/** Una riga del diario non è un romanzo: oltre, si taglia. */
const TESTO_MAX = 240

const maiuscola = (t: string): string => (t === '' ? t : t[0]!.toUpperCase() + t.slice(1))

/**
 * Le regole, in ordine: la prima che riconosce la riga decide tipo e testo.
 * Ogni regola riscrive la riga tecnica in una frase per una persona.
 */
const REGOLE: { tipo: TipoStorico; trova: RegExp; testo: (m: RegExpMatchArray) => string }[] = [
  // Chat aperte (e riaperte per una nuova Revisione).
  { tipo: 'chat', trova: /^apro la chat (\S+)((?: \((?!ramo )[^)]*\))*)(?: \(ramo [^)]*\))?: ([\s\S]*)$/, testo: (m) => `aperta la chat ${m[1]}${m[2] ?? ''}: ${m[3]}` },
  { tipo: 'chat', trova: /^riuso la chat (\S+) \(Revisione\) per rivedere di nuovo: ([\s\S]*)$/, testo: (m) => `riaperta la Revisione ${m[1]} per rivedere: ${m[2]}` },
  // Consegne: il lavoro diviso, i compiti nuovi, i rimandi indietro.
  { tipo: 'consegna', trova: /^(?:alla ripresa )?divido il lavoro (?:in \d+ compiti|fra specialisti): ([\s\S]*?)(?:\. La chat di prima[\s\S]*)?$/, testo: (m) => `lavoro diviso in compiti: ${m[1]}` },
  { tipo: 'consegna', trova: /^nuovo compito in coda: ([\s\S]*)$/, testo: (m) => `nuovo compito: ${m[1]}` },
  { tipo: 'consegna', trova: /^Revisione \S+: da rifare per (\S+) — ([\s\S]*)$/, testo: (m) => `la Revisione rimanda indietro il lavoro di ${m[1]}: ${m[2]}` },
  { tipo: 'consegna', trova: /^(\S+) ha finito il suo compito: il ramo (\S+) passa alla Revisione/, testo: (m) => `${m[1]} ha finito: il ramo ${m[2]} passa alla Revisione` },
  // Unioni.
  { tipo: 'unione', trova: /^unito il ramo (\S+) in (\S+)/, testo: (m) => `unito il ramo ${m[1]} in ${m[2]}` },
  { tipo: 'unione', trova: /^Revisione \S+: OK per (\S+) \(([^)]*)\), ([^.]*)\./, testo: (m) => `la Revisione approva ${m[1]} (${m[2]}): ${m[3]}` },
  { tipo: 'unione', trova: /^mandato su (\S+)/, testo: (m) => `lavoro mandato su ${m[1]}` },
  // Chiusure.
  { tipo: 'chiusura', trova: /^chiudo la chat (\S+)(?: da sola)?: ([\s\S]*)$/, testo: (m) => `chiusa la chat ${m[1]}: ${m[2]}` },
  { tipo: 'chiusura', trova: /^(\S+): il ramo (\S+) non c'è più, il suo lavoro era già unito/, testo: (m) => `chiusa la chat ${m[1]}: il ramo ${m[2]} era già unito` },
  // Release.
  { tipo: 'release', trova: /^pubblico (?:\(regola beta\)|secondo la regola del progetto)/, testo: () => 'pubblicazione avviata secondo la regola del progetto' },
  // Le decisioni di Nicholas.
  { tipo: 'decisione', trova: /^pubblicazione: hai detto sì \(([\s\S]*)\)$/, testo: (m) => `sì alla pubblicazione: «${m[1]}»` },
  { tipo: 'decisione', trova: /^non pubblico: hai risposto «([\s\S]*)»$/, testo: (m) => `niente pubblicazione: «${m[1]}»` },
  { tipo: 'decisione', trova: /^risposta dell utente \([^)]*\): ([\s\S]*)$/, testo: (m) => `ha risposto: «${m[1]}»` },
  { tipo: 'decisione', trova: /^risposta tardiva \(([^)]*)\): ([\s\S]*)$/, testo: (m) => `ha risposto più tardi, a ${m[1]}: «${m[2]}»` },
  { tipo: 'decisione', trova: /^su tua richiesta: ([\s\S]*)$/, testo: (m) => `ha chiesto: ${m[1]}` },
  { tipo: 'decisione', trova: /^ripreso su tua richiesta \(«Riprendi»\)/, testo: () => 'ha ripreso il lavoro con «Riprendi»' },
  { tipo: 'decisione', trova: /^modificato a mano dall utente$/, testo: () => 'ha cambiato a mano obiettivo o criteri' },
  { tipo: 'decisione', trova: /^disfatto: ([\s\S]*)$/, testo: (m) => `ha disfatto: ${m[1]}` }
]

/** La voce dello storico per una riga del diario, o niente se non è fra quelle che contano. */
export function voceDi(d: Decisione): VoceStorico | undefined {
  const cosa = d.cosa.trim()
  for (const r of REGOLE) {
    const m = cosa.match(r.trova)
    if (m === null) continue
    const testo = senzaUtente(maiuscola(r.testo(m).replace(/\s+/g, ' ').trim()))
    return { quando: d.quando, tipo: r.tipo, testo: testo.length > TESTO_MAX ? `${testo.slice(0, TESTO_MAX - 1)}…` : testo }
  }
  return undefined
}

/** La chiave di un doppione: stesso tipo e stessa frase, maiuscole e spazi a parte. */
const chiave = (v: VoceStorico): string => `${v.tipo}|${v.testo.toLowerCase().replace(/\s+/g, ' ')}`

/**
 * Le voci dello storico di un lavoro, in ordine di tempo e senza doppioni: la
 * stessa cosa detta due volte (il sì alla pubblicazione arriva da due strade,
 * la stessa chat chiusa a due giri) resta una volta, alla prima.
 */
export function vociStorico(a: Pick<Autopilota, 'decisioni'>): VoceStorico[] {
  const viste = new Set<string>()
  const voci: VoceStorico[] = []
  for (const d of [...a.decisioni].sort((x, y) => x.quando.localeCompare(y.quando))) {
    const v = voceDi(d)
    if (v === undefined) continue
    const k = chiave(v)
    if (viste.has(k)) continue
    viste.add(k)
    voci.push(v)
  }
  return voci
}

/** Il nome del file: `storico-<lavoro>-<id corto>.md`, perché due lavori possono chiamarsi uguale. */
export function fileStorico(a: Pick<Autopilota, 'id' | 'nome' | 'obiettivo'>): string {
  const slug = titoloScheda(a as Autopilota)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '')
  const corto = a.id.replace(/^ap-/, '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8)
  return `storico-${slug === '' ? 'lavoro' : slug}${corto !== '' ? `-${corto}` : ''}.md`
}

export function titoloStorico(a: Pick<Autopilota, 'nome' | 'obiettivo'>): string {
  return `Storico — ${titoloScheda(a as Autopilota)}`
}

const due = (n: number): string => String(n).padStart(2, '0')

/** Il giorno e l'ora dell'orologio del PC: chi legge pensa nella sua ora, non in UTC. */
function giornoEOra(quando: string): { giorno: string; ora: string } {
  const t = new Date(quando)
  if (Number.isNaN(t.getTime())) return { giorno: quando.slice(0, 10), ora: quando.slice(11, 16) }
  return {
    giorno: `${due(t.getDate())}/${due(t.getMonth() + 1)}/${t.getFullYear()}`,
    ora: `${due(t.getHours())}:${due(t.getMinutes())}`
  }
}

/** Il corpo della scheda: l'obiettivo in breve, poi le voci giorno per giorno. */
export function corpoStorico(a: Pick<Autopilota, 'obiettivo' | 'decisioni'>, voci: VoceStorico[] = vociStorico(a)): string {
  const righe: string[] = [
    'Le cose che contano di questo lavoro, scritte dall\'autopilota man mano che succedono: chat aperte, consegne, unioni, chiusure, release e decisioni di Nicholas. Il diario completo resta nella scheda dell\'autopilota.',
    '',
    `**Obiettivo:** ${senzaUtente(a.obiettivo.replace(/\s+/g, ' ').trim()).slice(0, 300)}`
  ]
  if (voci.length === 0) {
    righe.push('', '_Ancora niente da raccontare._')
    return righe.join('\n')
  }
  let giorno = ''
  for (const v of voci) {
    const g = giornoEOra(v.quando)
    if (g.giorno !== giorno) {
      giorno = g.giorno
      righe.push('', `## ${giorno}`, '')
    }
    righe.push(`- ${g.ora} · **${NOME_TIPO[v.tipo]}** — ${v.testo}`)
  }
  return righe.join('\n')
}
