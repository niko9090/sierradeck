import type { VoceFusione, Azione } from '../main/cassaforte/fusione'

/**
 * Le scelte del pannello «Fondi con il Drive», fuori da React.
 *
 * I tasti di gruppo («unisci», «solo dal PC al Drive», «lascia tutto com'è»)
 * cambiavano le tendine di ogni riga, ma le righe stavano in sezioni chiuse:
 * si premeva e non si vedeva cambiare niente, e il tasto non diceva se era
 * quello attivo. Qui c'è la regola in chiaro — cosa imposta un tasto, se è
 * già quello in vigore, e il conto di cosa succede — così il pannello la
 * mostra e un test la verifica.
 */

/** Le azioni che hanno senso per una voce, a seconda di dove sta. */
export function azioniPossibili(v: VoceFusione, conCopia: boolean): Azione[] {
  if (v.dove === 'pc') return ['carica', 'salta']
  if (v.dove === 'drive') return ['scarica', 'salta']
  if (!v.diverse) return ['salta']
  return conCopia ? ['carica', 'scarica', 'copia', 'salta'] : ['carica', 'scarica', 'salta']
}

/** Un tasto di gruppo: l'azione per tutte, o le predefinite del piano. */
export type AzioneDiGruppo = Azione | 'predefinite'

/**
 * Cosa imposta un tasto di gruppo su queste voci.
 *
 * Un'azione impossibile per una voce (portare sul Drive una chat che c'è solo
 * sul Drive) diventa «lascia com'è»: non si inventa un verso che non esiste.
 * «tieni tutte e due» tocca solo le voci diverse che lo ammettono, e lascia
 * le altre come stanno.
 */
export function sceltePerTutte(
  voci: VoceFusione[],
  conCopia: boolean,
  a: AzioneDiGruppo,
  attuali: Record<string, Azione>
): Record<string, Azione> {
  const n: Record<string, Azione> = {}
  for (const v of voci) {
    const possibili = azioniPossibili(v, conCopia)
    if (a === 'predefinite') n[v.percorso] = v.predefinita
    else if (a === 'copia') n[v.percorso] = v.diverse && conCopia ? 'copia' : (attuali[v.percorso] ?? 'salta')
    else if (possibili.includes(a)) n[v.percorso] = a
    else n[v.percorso] = 'salta'
  }
  return n
}

/** Il tasto è quello in vigore: premerlo non cambierebbe niente. */
export function gruppoInVigore(
  voci: VoceFusione[],
  conCopia: boolean,
  a: AzioneDiGruppo,
  attuali: Record<string, Azione>
): boolean {
  if (voci.length === 0) return false
  const sarebbe = sceltePerTutte(voci, conCopia, a, attuali)
  return voci.every((v) => (attuali[v.percorso] ?? 'salta') === sarebbe[v.percorso])
}

export type Riassunto = { carica: number; scarica: number; copia: number; salta: number }

/** Quante voci vanno dove, con le scelte di adesso. */
export function riassunto(voci: VoceFusione[], attuali: Record<string, Azione>): Riassunto {
  const r: Riassunto = { carica: 0, scarica: 0, copia: 0, salta: 0 }
  for (const v of voci) r[attuali[v.percorso] ?? 'salta'] += 1
  return r
}

/** Il riassunto detto in parole, corto, per stare accanto a un titolo. */
export function riassuntoInParole(r: Riassunto): string {
  const pezzi: string[] = []
  if (r.carica > 0) pezzi.push(`${r.carica} sul Drive`)
  if (r.scarica > 0) pezzi.push(`${r.scarica} qui`)
  if (r.copia > 0) pezzi.push(`${r.copia} in due versioni`)
  if (r.salta > 0) pezzi.push(`${r.salta} come sono`)
  return pezzi.length === 0 ? 'niente' : pezzi.join(' · ')
}
