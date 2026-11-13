import { confrontaVersioni } from './novita'
import type { Blocco, NotaResa, Pezzo } from './note-aggiornamento'

/**
 * **Il registro delle versioni** nella finestra degli aggiornamenti (13/11).
 *
 * Nicholas: «la finestra degli aggiornamenti potevi farla meglio, magari anche
 * con il changelog». Qui solo regole pure, provate senza Electron: da quali
 * versioni è fatto il registro (la nuova e tutte quelle saltate dalla
 * installata, oppure la installata e le ultime prima), che tipo è ogni
 * versione (novità o correzioni), come si legge una riga «**Titolo:** testo»,
 * e le frasi dello scaricamento (MB/s, tempo che manca).
 */

/** Una riga del registro: il titolo in grassetto (se la riga lo ha) e il testo. */
export type VoceRegistro = { titolo?: string; testo: Pezzo[] }

/**
 * - `novita`: cambia il secondo numero (0.106.0): funzioni nuove.
 * - `correzioni`: cambia solo il terzo (0.106.1): difetti corretti.
 * - `grande`: cambia il primo (1.0.0), lo decide Nicholas.
 */
export type TipoVersione = 'novita' | 'correzioni' | 'grande'

/** Che posto ha la versione rispetto a quella che c'è adesso. */
export type RuoloVersione = 'nuova' | 'saltata' | 'installata' | 'precedente'

export type VersioneRegistro = {
  versione: string
  /** ISO, quando si sa (le release di GitHub); altrimenti assente e non si mostra. */
  data?: string
  tipo: TipoVersione
  ruolo: RuoloVersione
  voci: VoceRegistro[]
}

const VERSIONE = /^(\d+)\.(\d+)\.(\d+)$/

/** Il tipo dal numero: x.0.0 grande, x.y.0 novità, x.y.z correzioni. */
export function tipoVersione(versione: string): TipoVersione {
  const m = VERSIONE.exec(versione.trim())
  if (m === null) return 'novita'
  if (m[3] !== '0') return 'correzioni'
  if (m[2] === '0' && m[1] !== '0') return 'grande'
  return 'novita'
}

export function etichettaTipo(t: TipoVersione): string {
  return t === 'correzioni' ? 'Correzioni' : t === 'grande' ? 'Versione grande' : 'Novità'
}

export function etichettaRuolo(r: RuoloVersione): string {
  return r === 'nuova' ? 'nuova' : r === 'saltata' ? 'saltata' : r === 'installata' ? 'installata' : ''
}

/**
 * Una riga in voce: se comincia con un grassetto che finisce con «:» (com'è
 * scritto ogni voce di `novita.ts`), quello è il titolo e il resto il testo.
 * Altrimenti tutta la riga è testo.
 */
export function voceDaPezzi(pezzi: Pezzo[]): VoceRegistro {
  const primo = pezzi[0]
  if (primo !== undefined && primo.grassetto === true && primo.codice === undefined && primo.link === undefined) {
    const t = primo.testo.trim()
    // «**Titolo:** testo» o «**Titolo**: testo»
    const dopo = pezzi[1]
    const dueDopo = dopo !== undefined && dopo.grassetto === undefined && /^\s*:/.test(dopo.testo)
    if (t.endsWith(':') || dueDopo) {
      const titolo = t.replace(/:$/, '').trim()
      const resto = pezzi.slice(1).map((p) => ({ ...p }))
      if (resto[0] !== undefined) {
        resto[0].testo = resto[0].testo.replace(dueDopo ? /^\s*:\s*/ : /^\s+/, '')
        if (resto[0].testo === '') resto.shift()
      }
      // Il testo va a capo sotto il titolo: comincia con la maiuscola («la 0.106.0…» → «La 0.106.0…»).
      const primoResto = resto[0]
      if (primoResto !== undefined && primoResto.codice === undefined && primoResto.link === undefined) {
        primoResto.testo = primoResto.testo.charAt(0).toLocaleUpperCase('it') + primoResto.testo.slice(1)
      }
      if (titolo !== '') return { titolo, testo: resto }
    }
  }
  return { testo: pezzi }
}

/** I blocchi di una nota in voci: ogni voce d'elenco, ogni paragrafo, ogni titolo. */
export function vociDaBlocchi(blocchi: Blocco[]): VoceRegistro[] {
  const voci: VoceRegistro[] = []
  for (const b of blocchi) {
    if (b.tipo === 'elenco') for (const v of b.voci) voci.push(voceDaPezzi(v))
    else if (b.tipo === 'paragrafo') voci.push(voceDaPezzi(b.pezzi))
    else if (b.tipo === 'titolo') {
      const t = b.pezzi.map((p) => p.testo).join('').trim()
      // La parte dell'Aiutante, in coda a ogni release, riguarda l'altro programma: qui si ferma.
      if (/^SierraDeck Aiutante\b/i.test(t)) break
      // «## SierraDeck 0.106.1» ripete il numero che la scheda ha già.
      if (/^SierraDeck\s+v?\d+\.\d+\.\d+$/i.test(t)) continue
      // Le intestazioni generiche delle release («Novità», «Cosa cambia») non dicono niente: si saltano.
      if (t !== '' && !/^(novit[àa]|cosa cambia|cosa c.è di nuovo|changelog|note)(?=$|[\s:.,(])/i.test(t)) voci.push({ titolo: t, testo: [] })
    } else if (b.testo.trim() !== '') voci.push({ testo: [{ testo: b.testo, codice: true }] })
  }
  return voci.filter((v) => v.titolo !== undefined || v.testo.some((p) => p.testo.trim() !== ''))
}

/**
 * Il registro di un aggiornamento: la nuova versione e tutte quelle saltate
 * dopo la installata, dalla più recente. Le note fuori da quell'intervallo e
 * i doppioni non entrano (vale la prima che arriva).
 */
export function registroAggiornamento(note: (NotaResa & { data?: string })[], installata: string, nuova: string): VersioneRegistro[] {
  const viste = new Set<string>()
  const scelte: VersioneRegistro[] = []
  for (const n of note) {
    if (!VERSIONE.test(n.versione) || viste.has(n.versione)) continue
    if (installata !== '' && confrontaVersioni(n.versione, installata) <= 0) continue
    if (nuova !== '' && confrontaVersioni(n.versione, nuova) > 0) continue
    viste.add(n.versione)
    scelte.push({
      versione: n.versione,
      ...(n.data !== undefined ? { data: n.data } : {}),
      tipo: tipoVersione(n.versione),
      ruolo: n.versione === nuova ? 'nuova' : 'saltata',
      voci: vociDaBlocchi(n.blocchi)
    })
  }
  return scelte.sort((a, b) => confrontaVersioni(b.versione, a.versione))
}

/**
 * Il registro della versione installata («Sei aggiornato»): lei in cima e le
 * ultime `quante` prima, da `novita.ts` (le righe scritte per chi usa il
 * programma). Senza date: `novita.ts` non le ha.
 */
export function registroInstallata(
  novita: { versione: string; righe: string[] }[],
  installata: string,
  analizza: (riga: string) => Pezzo[],
  quante = 6
): VersioneRegistro[] {
  const prima = novita
    .filter((n) => VERSIONE.test(n.versione) && confrontaVersioni(n.versione, installata) <= 0)
    .sort((a, b) => confrontaVersioni(b.versione, a.versione))
    .slice(0, quante)
  return prima.map((n) => ({
    versione: n.versione,
    tipo: tipoVersione(n.versione),
    ruolo: n.versione === installata ? 'installata' as const : 'precedente' as const,
    voci: n.righe.map((r) => voceDaPezzi(analizza(r)))
  }))
}

/**
 * Quali schede sono aperte all'inizio. Sempre la prima. Prima di aggiornare
 * anche le saltate con novità (le correzioni restano chiuse, si aprono col
 * clic), al massimo 3 aperte; se le versioni sono fino a 3, tutte.
 */
export function aperteAllInizio(registro: VersioneRegistro[]): Set<string> {
  const aggiornamento = registro.some((v) => v.ruolo === 'nuova' || v.ruolo === 'saltata')
  if (!aggiornamento) return new Set(registro.slice(0, 1).map((v) => v.versione))
  if (registro.length <= 3) return new Set(registro.map((v) => v.versione))
  const aperte = registro.filter((v, i) => i === 0 || v.tipo !== 'correzioni').slice(0, 3)
  return new Set(aperte.map((v) => v.versione))
}

/** La riga sopra le schede: quante versioni, di che tipo. */
export function riassuntoRegistro(registro: VersioneRegistro[], installata: string): string {
  const aggiornamento = registro.filter((v) => v.ruolo === 'nuova' || v.ruolo === 'saltata')
  if (aggiornamento.length === 0) return registro.length > 1 ? `La versione installata e le ${registro.length - 1} prima` : 'La versione installata'
  const novita = aggiornamento.filter((v) => v.tipo !== 'correzioni').length
  const correzioni = aggiornamento.length - novita
  const parti = [
    ...(novita > 0 ? [`${novita} con novità`] : []),
    ...(correzioni > 0 ? [`${correzioni} di correzioni`] : [])
  ]
  const quante = aggiornamento.length === 1 ? '1 versione' : `${aggiornamento.length} versioni`
  return `${quante}${installata !== '' ? ` dopo la ${installata}` : ''}: ${parti.join(', ')}`
}

const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

/** «13 nov 2026», dall'ISO; `undefined` se non è una data. Senza `Intl`: uguale su ogni PC. */
export function dataBreve(iso: string | undefined): string | undefined {
  if (iso === undefined) return undefined
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return undefined
  return `${d.getDate()} ${MESI[d.getMonth()]} ${d.getFullYear()}`
}

/** 1536000 → «1,5 MB». Virgola italiana, una cifra decimale. */
export function megabyte(byte: number): string {
  const mb = byte / (1024 * 1024)
  return `${(mb >= 100 ? Math.round(mb).toString() : mb.toFixed(1)).replace('.', ',')} MB`
}

/** Secondi che mancano, detti a parole: «meno di 10 s», «circa 40 s», «circa 3 min». */
export function tempoRimasto(secondi: number): string {
  if (!Number.isFinite(secondi) || secondi < 0) return ''
  if (secondi < 10) return 'meno di 10 s'
  if (secondi < 60) return `circa ${Math.round(secondi / 5) * 5} s`
  if (secondi < 3600) return `circa ${Math.round(secondi / 60)} min`
  const ore = Math.floor(secondi / 3600)
  const min = Math.round((secondi - ore * 3600) / 60)
  return `circa ${ore} h${min > 0 ? ` ${min} min` : ''}`
}

/** Le misure dello scaricamento, quelle che ci sono: «32,1 di 71,4 MB · 2,3 MB/s · ancora circa 20 s». */
export function testoScaricamento(s: { scaricati?: number; totale?: number; velocita?: number }): string {
  const parti: string[] = []
  if (s.scaricati !== undefined && s.totale !== undefined && s.totale > 0) parti.push(`${megabyte(s.scaricati).replace(' MB', '')} di ${megabyte(s.totale)}`)
  if (s.velocita !== undefined && s.velocita > 0) {
    parti.push(`${megabyte(s.velocita)}/s`)
    if (s.scaricati !== undefined && s.totale !== undefined && s.totale > s.scaricati) {
      const t = tempoRimasto((s.totale - s.scaricati) / s.velocita)
      if (t !== '') parti.push(`ancora ${t}`)
    }
  }
  return parti.join(' · ')
}
