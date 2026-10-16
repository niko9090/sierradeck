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

/**
 * L'elenco stabile (0.75.4). Nicholas, 16/10: «la parte di sinistra con
 * l'elenco delle chat ogni tanto scazza». Le cause:
 * - le righe seguivano l'ordine in cui i riquadri erano entrati nello store,
 *   che cambia quando un riquadro si riapre o si rilancia: le righe saltavano;
 * - la stessa chat poteva comparire due volte (due specialisti sulla stessa
 *   sessione), con la stessa chiave di React;
 * - la chat davanti, se non l'avevi scelta tu, seguiva «chi chiede, poi chi
 *   lavora»: a ogni cambio di stato la chat a destra cambiava da sola, e la
 *   scelta di un workspace si perdeva passando a un altro.
 *
 * Ordine: quello del layout del workspace (non cambia se non lo cambi tu),
 * poi le voci che il layout non ha ancora, per titolo e id. Mai doppioni.
 */
export function vociInOrdine(voci: VoceElenco[], ordineLayout: string[]): VoceElenco[] {
  const posto = new Map(ordineLayout.map((id, i) => [id, i]))
  const viste = new Set<string>()
  const uniche = voci.filter((v) => (viste.has(v.paneId) ? false : (viste.add(v.paneId), true)))
  return [...uniche].sort((a, b) => {
    const pa = posto.get(a.paneId)
    const pb = posto.get(b.paneId)
    if (pa !== undefined && pb !== undefined) return pa - pb
    if (pa !== undefined) return -1
    if (pb !== undefined) return 1
    return a.titolo.localeCompare(b.titolo) || a.paneId.localeCompare(b.paneId)
  })
}

/**
 * La chat davanti, stabile (0.75.4): quella scelta per **questo** workspace, se
 * c'è ancora; altrimenti quella che stava già davanti; solo se non c'è più
 * nessuna delle due si sceglie (chi chiede, chi lavora, la prima) — e da lì
 * resta, finché non la cambi tu o non si chiude.
 */
export function chatDavantiStabile(voci: VoceElenco[], scelta: string | undefined, precedente: string | undefined): string | undefined {
  if (scelta !== undefined && voci.some((v) => v.paneId === scelta)) return scelta
  if (precedente !== undefined && voci.some((v) => v.paneId === precedente)) return precedente
  return chatDavanti(voci, undefined)
}

/**
 * L'autopilota del workspace, per il suo pannello fisso a sinistra (0.76.0).
 * Nicholas, 16/10: il pannello (dialogo, specialisti, domande) «deve restare
 * sempre visibile a sinistra nel workspace»; stava nel riquadro della chat
 * governata e spariva portando davanti un'altra chat. Con più autopiloti nello
 * stesso workspace: prima chi aspetta te, poi chi lavora, poi il più recente.
 */
export function autopilotaDelWorkspace<A extends { id: string; workspace?: string; archiviato?: boolean; stato: string; iniziatoIl?: string }>(autopiloti: A[], workspace: string): A | undefined {
  const qui = autopiloti.filter((a) => a.workspace === workspace && a.archiviato !== true)
  const peso = (a: A): number => (a.stato === 'attesa' ? 0 : a.stato === 'lavoro' ? 1 : a.stato === 'intervista' || a.stato === 'pronto' ? 2 : 3)
  return [...qui].sort((x, y) => peso(x) - peso(y) || (y.iniziatoIl ?? '').localeCompare(x.iniziatoIl ?? '') || x.id.localeCompare(y.id))[0]
}
