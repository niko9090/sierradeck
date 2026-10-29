import type { Criterio } from '@shared/autopilota'
import type { GitAsincrono } from './worktree'

/**
 * **Il riscontro con la prova** (0.85.0, c-128).
 *
 * Nicholas, 23/10: quando una sua richiesta è fatta vuole vederlo con la
 * prova, non con un «fatto» a parole. Quando un criterio passa da rosso a
 * verde nella cartella principale (cioè dopo l'unione del ramo che lo
 * soddisfa), l'autopilota scrive nella sua conversazione **una riga**: cosa è
 * cambiato, il commit, il test che lo dimostra, la versione che lo contiene.
 * Se la versione non è ancora uscita scrive «nella prossima versione» e la
 * corregge quando compare il tag. La lista dei lavori
 * (`.sierradeck/quaderno/lista-lavori.md`) si legge per trovare la richiesta,
 * ma dal 29/10 non si scrive più: niente commit automatici di sole note nel
 * principale (il 27/10 erano 121 degli ultimi 300).
 *
 * **L'identificativo della richiesta** è il `#` della sua riga nella lista
 * dei lavori («0t», «6c»): esiste già, lo usano le chat e Nicholas lo legge.
 * Un criterio lo porta scritto fra quadre («[0t] …»); se non lo porta, si
 * cerca la riga della lista che gli somiglia di più, solo se la somiglianza
 * è netta. Il registro delle richieste della 0.85.0 (c-127) può riusare
 * `idRichiestaDi` e `rigaRiscontro` così come sono.
 *
 * Qui solo regole e git: il server mette insieme i pezzi.
 */

export const LISTA_LAVORI = '.sierradeck/quaderno/lista-lavori.md'
export const PROSSIMA_VERSIONE = 'nella prossima versione'
/** Il segno che apre il riscontro dentro la cella dello stato. */
export const SEGNO_RISCONTRO = '**Riscontro:**'

export type Riscontro = {
  richiesta: string
  /** Cosa è cambiato, in parole semplici (dal titolo del commit). */
  cosa: string
  commit: string
  /** Il file di test che lo dimostra; assente se non se n'è trovato uno. */
  test?: string
  /** «0.84.4», assente finché la versione non è pubblicata. */
  versione?: string
}

/** Una richiesta della lista: il suo `#` e il testo della richiesta. */
export type RigaRichiesta = { id: string; richiesta: string }

const ID = /^[0-9]+[a-z]?$/

export function rigaRiscontro(r: Riscontro): string {
  return `Fatto [${r.richiesta}]: ${r.cosa} — commit ${r.commit} · test ${r.test ?? 'nessuno trovato'} · ${r.versione !== undefined ? `nella ${r.versione}` : PROSSIMA_VERSIONE}`
}

/** Le richieste con un `#` della lista dei lavori (non le righe delle release, non «Già fatte»). */
export function righeRichieste(lista: string): RigaRichiesta[] {
  return lista.split(/\r?\n/).flatMap((linea) => {
    const m = /^\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|/.exec(linea)
    return m !== null && ID.test(m[1]!) ? [{ id: m[1]!, richiesta: m[2]! }] : []
  })
}

const VUOTE = new Set(['della', 'delle', 'dello', 'degli', 'nella', 'nelle', 'sulla', 'sono', 'come', 'anche', 'quando', 'quello', 'questa', 'questo', 'senza', 'prima', 'dopo', 'ogni', 'tutte', 'tutti', 'fatto', 'fatta'])

function parole(testo: string): Set<string> {
  return new Set(
    (testo.toLowerCase().match(/[a-zàèéìòù]{4,}/g) ?? [])
      .filter((p) => !VUOTE.has(p))
      // Le prime cinque lettere: «domanda» e «domande» sono la stessa cosa.
      .map((p) => p.slice(0, 5))
  )
}

/** Quanto deve somigliare un criterio alla sua richiesta, e di quanto staccare la seconda. */
const SOGLIA = 0.6
const STACCO = 0.15

/**
 * La richiesta di un criterio: «[0t]» nel testo, altrimenti la riga della
 * lista che contiene la maggior parte delle sue parole, se è netta.
 */
export function idRichiestaDi(criterio: Pick<Criterio, 'descrizione'>, righe: RigaRichiesta[]): string | undefined {
  const tag = /\[([0-9]+[a-z]?)\]/.exec(criterio.descrizione)
  if (tag !== null && righe.some((r) => r.id === tag[1])) return tag[1]
  const sue = parole(criterio.descrizione)
  if (sue.size === 0) return undefined
  const punti = righe
    .map((r) => {
      const della = parole(r.richiesta)
      return { id: r.id, punti: [...sue].filter((p) => della.has(p)).length / sue.size }
    })
    .sort((a, b) => b.punti - a.punti)
  const primo = punti[0]
  if (primo === undefined || primo.punti < SOGLIA) return undefined
  return primo.punti - (punti[1]?.punti ?? 0) >= STACCO ? primo.id : undefined
}

/** I criteri passati da rosso a verde fra due misure. */
export function diventatiVerdi(prima: Criterio[], dopo: Criterio[]): Criterio[] {
  return dopo.filter((c) => c.soddisfatto && prima.some((p) => p.descrizione === c.descrizione && !p.soddisfatto))
}

/** «fix(autopilota): oltre i rifacimenti decide il programma (0.84.4, c-125)» → «oltre i rifacimenti decide il programma». */
export function cosaDalTitolo(titolo: string): string {
  return titolo.replace(/^[a-z]+(\([^)]*\))?!?:\s*/i, '').replace(/\s*\([^()]*\)\s*$/, '').trim() || titolo.trim()
}

const FILE_TEST = /(?:^|[\s"'])((?:tests|android\/app\/src\/test)\/[^\s"']+?(?:\.test\.tsx?|Test\.kt))(?=$|[\s"'])/

/** Il file di test nominato dal comando del criterio, se ce n'è uno. */
export function testDalComando(comando: string | undefined): string | undefined {
  return comando === undefined ? undefined : FILE_TEST.exec(comando)?.[1]
}

/** «v0.84.4» → «0.84.4»: la prima versione pubblicata che contiene il commit. */
export async function versioneDi(git: GitAsincrono, cwd: string, commit: string): Promise<string | undefined> {
  const r = await git(['tag', '--contains', commit, '--sort=version:refname'], cwd)
  if (r.codice !== 0) return undefined
  const tag = r.uscita.split(/\r?\n/).map((t) => t.trim()).find((t) => /^v\d+\.\d+\.\d+$/.test(t))
  return tag?.slice(1)
}

/**
 * La prova di un criterio appena diventato verde nella cartella principale:
 * il commit che ha toccato per ultimo il test del criterio, se il comando ne
 * nomina uno; altrimenti l'ultimo commit vero (non un'unione) e il suo test.
 */
export async function provaDi(git: GitAsincrono, cwd: string, criterio: Pick<Criterio, 'comando'>): Promise<Omit<Riscontro, 'richiesta'> | undefined> {
  const nominato = testDalComando(criterio.comando)
  const log = await git(['log', '-1', '--no-merges', '--format=%h%x09%s', ...(nominato !== undefined ? ['--', nominato] : [])], cwd)
  if (log.codice !== 0 || log.uscita === '') return undefined
  const [commit, ...titolo] = log.uscita.split(/\r?\n/)[0]!.split('\t')
  if (commit === undefined || commit === '') return undefined
  let test = nominato
  if (test === undefined) {
    const file = await git(['show', '--name-only', '--format=', commit], cwd)
    if (file.codice === 0) {
      const tutti = file.uscita.split(/\r?\n/).map((f) => f.trim()).filter((f) => FILE_TEST.test(f))
      // Il test nuovo del lavoro, non quello grande ritoccato insieme (server.test.ts).
      test = tutti.find((f) => /\d+-\d+-\d+/.test(f)) ?? tutti[0]
    }
  }
  const versione = await versioneDi(git, cwd, commit)
  return { cosa: cosaDalTitolo(titolo.join('\t')), commit, ...(test !== undefined ? { test } : {}), ...(versione !== undefined ? { versione } : {}) }
}

/**
 * La lista con il riscontro nella cella dello stato della richiesta: in coda
 * alla cella, al posto di un riscontro di prima. Il resto della riga resta.
 */
export function conRiscontroInLista(lista: string, r: Riscontro): string {
  const nuovo = `${SEGNO_RISCONTRO} ${rigaRiscontro(r)}`
  return lista.split('\n').map((linea) => {
    const m = /^\|\s*([^|]+?)\s*\|/.exec(linea)
    if (m === null || m[1] !== r.richiesta) return linea
    const fine = /\s*\|\s*(\r?)$/.exec(linea)
    if (fine === null) return linea
    const corpo = linea.slice(0, fine.index)
    const segno = corpo.indexOf(SEGNO_RISCONTRO)
    const senza = segno >= 0 ? corpo.slice(0, segno).replace(/\s*·?\s*$/, '') : corpo
    return `${senza} · ${nuovo} |${fine[1]}`
  }).join('\n')
}

/** I commit dei riscontri ancora «nella prossima versione» dentro un testo. */
export function commitInAttesa(testo: string): string[] {
  const visti = new Set<string>()
  for (const m of testo.matchAll(/commit ([0-9a-f]{7,40}) · test [^·\n|]+· nella prossima versione/g)) visti.add(m[1]!)
  return [...visti]
}

/** «nella prossima versione» → «nella 0.84.4» nei riscontri di quel commit. */
export function conVersione(testo: string, commit: string, versione: string): string {
  return testo.split(`commit ${commit} · `).map((pezzo, i) => i === 0 ? pezzo : pezzo.replace(/^(test [^·\n|]+· )nella prossima versione/, `$1nella ${versione}`)).join(`commit ${commit} · `)
}

/**
 * I riscontri nuovi di un giro: per ogni criterio diventato verde che ha una
 * richiesta nella lista e non è già stato detto nella conversazione.
 */
export async function riscontriNuovi(p: {
  git: GitAsincrono
  cwd: string
  verdi: Criterio[]
  lista: string | undefined
  /** Il testo già detto (conversazione), per non ripetere un riscontro. */
  giaDetto: string
}): Promise<Riscontro[]> {
  if (p.lista === undefined || p.verdi.length === 0) return []
  const righe = righeRichieste(p.lista)
  const fuori: Riscontro[] = []
  for (const c of p.verdi) {
    const richiesta = idRichiestaDi(c, righe)
    if (richiesta === undefined || p.giaDetto.includes(`Fatto [${richiesta}]`) || fuori.some((r) => r.richiesta === richiesta)) continue
    const prova = await provaDi(p.git, p.cwd, c)
    if (prova !== undefined) fuori.push({ richiesta, ...prova })
  }
  return fuori
}

/** Le versioni uscite per i riscontri ancora in attesa: commit → versione. */
export async function versioniUscite(git: GitAsincrono, cwd: string, testi: string[]): Promise<Map<string, string>> {
  const uscite = new Map<string, string>()
  for (const commit of new Set(testi.flatMap(commitInAttesa))) {
    const v = await versioneDi(git, cwd, commit)
    if (v !== undefined) uscite.set(commit, v)
  }
  return uscite
}


