import type { LayoutSalvato } from './workspace'

/**
 * Riconoscere un salvataggio che c'è già.
 *
 * Alla chiusura il programma salva da sé, e finora lo faceva senza guardare:
 * se avevi appena salvato «lavoro» con quelle sei chat, ne nasceva un secondo
 * identico chiamato «Ultima chiusura». Due voci nell'elenco per la stessa cosa,
 * e la sensazione — giusta — di un programma che non presta attenzione.
 *
 * Il confronto guarda **cosa c'è dentro**, non come si chiama: quali chat, in
 * quale disposizione. Gli identificatori dei riquadri no — cambiano a ogni
 * apertura e renderebbero ogni layout diverso da sé stesso un minuto dopo.
 */

/** La forma di un layout, ridotta a ciò che lo identifica davvero. */
export function improntaLayout(layout: LayoutSalvato): string {
  const chat = layout.panes
    .map((p) => `${p.sessionUuid}@${p.cwd.toLowerCase()}`)
    .sort()
    .join('|')
  return `${chat}::${formaAlbero(layout.root)}`
}

/**
 * La forma dell'albero senza gli identificatori.
 *
 * Due layout con le stesse chat ma divise in modo diverso — una sopra l'altra
 * invece che affiancate — sono due layout diversi, e vanno salvati entrambi.
 */
function formaAlbero(nodo: LayoutSalvato['root']): string {
  if (nodo === undefined) return 'vuoto'
  if (nodo.type === 'pane') return 'r'
  const figli = nodo.children.map((c) => formaAlbero(c)).join(',')
  return `${nodo.direction}(${figli})`
}

export function stessoContenuto(a: LayoutSalvato, b: LayoutSalvato): boolean {
  return improntaLayout(a) === improntaLayout(b)
}

/**
 * Il nome sotto cui questo layout è già salvato, se c'è.
 *
 * Restituisce il nome e non un `true`: all'utente non serve sapere che «esiste
 * già», gli serve sapere **dove** — è la differenza fra un avviso e
 * un'informazione.
 */
export function giaSalvatoCome(
  layout: LayoutSalvato,
  // Un salvataggio può contenere più finestre: basta che **una** sia questa
  // per non doverne fare una copia.
  istantanee: { nome: string; finestre: { layout: LayoutSalvato }[] }[]
): string | undefined {
  // Un layout vuoto non è un salvataggio: non c'è niente da ritrovare, e
  // considerarlo «già presente» nasconderebbe l'unico caso in cui salvare non
  // serve a niente.
  if (layout.panes.length === 0) return undefined
  const impronta = improntaLayout(layout)
  return istantanee.find((i) => i.finestre.some((f) => improntaLayout(f.layout) === impronta))?.nome
}
