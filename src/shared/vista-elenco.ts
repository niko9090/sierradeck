import { RUOLI } from './ruoli-agenti'

/**
 * La vista a elenco di un workspace (0.74.0). Nicholas, 15/10: «impostiamo di
 * lavorare sempre con l'autopilota e il workspace è l'ambiente in cui opera,
 * così ci evitiamo di aprire autopilota più una chat e sprecare risorse».
 *
 * A sinistra l'autopilota del workspace con i suoi specialisti e le altre
 * chat; a destra **una** chat, grande. Le altre restano vive dietro, alla
 * stessa misura (niente terminali ristretti a zero colonne), e si portano
 * davanti con un clic nell'elenco.
 *
 * Qui le regole pure: quali workspace hanno la vista, il nome nuovo dopo una
 * rinomina, quale chat sta davanti.
 */

/** La lista dopo una rinomina (`nuovo`) o un'eliminazione (`undefined`) di un workspace. */
export function rinominaInElenco(lista: string[], vecchio: string, nuovo: string | undefined): string[] {
  if (!lista.includes(vecchio)) return lista
  const senza = lista.filter((n) => n !== vecchio)
  return nuovo === undefined || senza.includes(nuovo) ? senza : [...senza, nuovo]
}

/** Accende o spegne la vista a elenco per un workspace. */
export function cambiaVistaElenco(lista: string[], nome: string, accesa: boolean): string[] {
  const senza = lista.filter((n) => n !== nome)
  return accesa ? [...senza, nome] : senza
}

/** Un nome di workspace libero per un autopilota nuovo: il suo nome, poi «#2», «#3»… */
export function nomeWorkspacePerAutopilota(nome: string, esistenti: string[]): string {
  const base = (nome.trim() === '' ? 'Autopilota' : nome.trim()).replace(/\s+/g, ' ').slice(0, 54).trim()
  if (!esistenti.includes(base)) return base
  for (let i = 2; i < 100; i++) if (!esistenti.includes(`${base} #${i}`)) return `${base} #${i}`
  return `${base.slice(0, 50)} ${Date.now().toString(36)}`
}

export type VoceElenco = {
  paneId: string
  titolo: string
  /** «Sviluppo», «Revisione»… quando è di un autopilota con il ruolo nel titolo. */
  ruolo?: string
  /** L'autopilota che la guida, se c'è. */
  autopilota?: string
  lavora: boolean
  chiede: boolean
}

/**
 * Quale chat sta davanti. Quella scelta, se c'è ancora; altrimenti quella che
 * ti chiede qualcosa, poi quella che lavora, poi la prima.
 */
export function chatDavanti(voci: VoceElenco[], scelta: string | undefined): string | undefined {
  if (scelta !== undefined && voci.some((v) => v.paneId === scelta)) return scelta
  return (voci.find((v) => v.chiede) ?? voci.find((v) => v.lavora) ?? voci[0])?.paneId
}

/** Il ruolo dal titolo di un riquadro di specialista («Sviluppo · Notte» → «Sviluppo»). */
export function ruoloDalTitolo(titolo: string): string | undefined {
  const nome = titolo.split(' · ')[0]
  return titolo.includes(' · ') && Object.values(RUOLI).some((r) => r.nome === nome) ? nome : undefined
}
