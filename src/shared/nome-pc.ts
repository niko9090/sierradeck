/**
 * Il nome di un PC da mostrare (0.52.4).
 *
 * Nicholas (07/10): nell'app, in alto e nel cambio di computer, compariva il
 * nome tecnico della macchina (l'hostname, tipo «DESKTOP-…») invece di quello
 * che le aveva dato lui. Da qui in poi ogni PC ha un **nome scelto**
 * (modificabile in «Altri computer» sul PC o dal telefono), che viaggia nel
 * battito e in `/api/stato`; l'hostname resta solo come sottotitolo piccolo.
 *
 * Le stesse regole stanno in `NomePc.kt` (app) e nella pagina servita
 * (`client-pagina.ts`): i test le confrontano.
 */
export type PcConNome = {
  /** Il nome scelto da chi usa il PC. Vuoto o assente: non l'ha scelto. */
  nomeScelto?: string | null
  /** Il nome come lo manda il PC: dalla 0.52.4 è già quello scelto, prima era l'hostname. */
  nome?: string | null
  /** Il nome tecnico della macchina (hostname). */
  host?: string | null
}

/** Quanto può essere lungo un nome scelto. */
export const NOME_PC_MAX = 40

/**
 * Senza caratteri di controllo e senza spazi doppi, in testa o in coda.
 * Scritta senza espressioni regolari apposta: la stessa identica sta nella
 * pagina servita (dove le barre rovesciate sono una trappola) e in Kotlin.
 */
export function pulitoPc(s: string | null | undefined): string {
  if (typeof s !== 'string') return ''
  let t = ''
  for (const ch of s) {
    const c = ch.charCodeAt(0)
    t += c < 32 || c === 127 ? ' ' : ch
  }
  return t.split(' ').filter((x) => x !== '').join(' ')
}

/** Il nome da mostrare: quello scelto, poi quello che dice il PC, poi l'hostname. Mai vuoto se c'è qualcosa. */
export function nomeDaMostrare(pc: PcConNome | null | undefined): string {
  if (pc === null || pc === undefined) return ''
  return pulitoPc(pc.nomeScelto) || pulitoPc(pc.nome) || pulitoPc(pc.host)
}

/**
 * Il sottotitolo piccolo: l'hostname, ma solo se dice qualcosa in più del
 * nome mostrato (uguale a parte maiuscole e minuscole = niente sottotitolo).
 */
export function sottotitoloPc(pc: PcConNome | null | undefined): string | undefined {
  if (pc === null || pc === undefined) return undefined
  const h = pulitoPc(pc.host)
  if (h === '') return undefined
  return h.toLowerCase() === nomeDaMostrare(pc).toLowerCase() ? undefined : h
}

/**
 * Un nome scelto da salvare: pulito, al massimo `NOME_PC_MAX` caratteri.
 * Vuoto vuol dire «torna all'hostname».
 */
export function nomeSceltoValido(s: string | null | undefined): string {
  return pulitoPc(pulitoPc(s).slice(0, NOME_PC_MAX))
}
