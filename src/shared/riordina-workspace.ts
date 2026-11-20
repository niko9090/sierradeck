import { chiaveNomeWorkspace } from './workspace'

/**
 * Riordinare i workspace (k-166w3): funzioni pure, le stesse per il trascinamento
 * e per i tasti su/giù. Lavorano sull'elenco intero dei nomi e restituiscono
 * l'elenco intero nel nuovo ordine (lo stesso elenco se non cambia niente).
 *
 * `visibili` sono i nomi della stessa riga di gruppo (per esempio «Questo PC»):
 * un «su» scambia con il vicino che si vede, non con uno nascosto altrove.
 */

/** Sposta `nome` di un posto verso l'alto o il basso, rispetto ai vicini visibili. */
export function spostaDiUno(nomi: readonly string[], nome: string, verso: 'su' | 'giu', visibili?: readonly string[]): string[] {
  const elenco = [...nomi]
  const fra = (visibili ?? nomi).filter((n) => elenco.includes(n))
  const i = fra.indexOf(nome)
  const vicino = fra[verso === 'su' ? i - 1 : i + 1]
  if (i < 0 || vicino === undefined) return elenco
  const a = elenco.indexOf(nome)
  const b = elenco.indexOf(vicino)
  elenco[a] = vicino
  elenco[b] = nome
  return elenco
}

/** Mette `nome` subito prima di `davantiA` (trascinamento); `davantiA` assente: in fondo. */
export function spostaPrima(nomi: readonly string[], nome: string, davantiA: string | undefined): string[] {
  if (!nomi.includes(nome) || nome === davantiA) return [...nomi]
  const senza = nomi.filter((n) => n !== nome)
  const punto = davantiA === undefined ? -1 : senza.indexOf(davantiA)
  if (davantiA !== undefined && punto < 0) return [...nomi]
  if (punto < 0) return [...senza, nome]
  return [...senza.slice(0, punto), nome, ...senza.slice(punto)]
}

/**
 * Il trascinamento di `nome` su `bersaglio`: trascinando verso il basso va dopo
 * il bersaglio, verso l'alto prima. Così con un rilascio si arriva anche in fondo.
 */
export function trascinaSu(nomi: readonly string[], nome: string, bersaglio: string): string[] {
  const da = nomi.indexOf(nome)
  const a = nomi.indexOf(bersaglio)
  if (da < 0 || a < 0 || da === a) return [...nomi]
  return spostaPrima(nomi, nome, da < a ? nomi[a + 1] : bersaglio)
}

/** I due elenchi sono nello stesso ordine? */
export function stessoOrdine(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((n, i) => n === b[i])
}

/**
 * Il nuovo ordine chiesto da un'interfaccia, ripulito: solo nomi che esistono
 * (senza doppioni, anche per spazi e maiuscole), e quelli che mancano in coda
 * nell'ordine di prima. Cosi' un riordino arrivato in ritardo non perde mai un workspace.
 */
export function ordineValido(esistenti: readonly string[], chiesto: readonly string[]): string[] {
  const visti = new Set<string>()
  const fuori: string[] = []
  for (const n of chiesto) {
    const esatto = esistenti.find((e) => e === n) ?? esistenti.find((e) => chiaveNomeWorkspace(e) === chiaveNomeWorkspace(n))
    if (esatto === undefined || visti.has(esatto)) continue
    visti.add(esatto)
    fuori.push(esatto)
  }
  return [...fuori, ...esistenti.filter((e) => !visti.has(e))]
}
