/**
 * File e Trasferimenti riprogettati (0.70.0). Senza server metà della finestra
 * diceva solo «Aggiungi un server»: adesso c'è un lato solo, a tutta larghezza,
 * e i due lati affiancati compaiono quando c'è un server.
 */
export function latiFile(p: { cwd?: string; server: boolean }): { due: boolean; cartella: string } {
  const pezzi = (p.cwd ?? '').split(/[\\/]/).filter((x) => x !== '')
  // In testata l'ultima parte del percorso: il nome del progetto, non tutto il percorso della macchina.
  return { due: p.server, cartella: pezzi.length === 0 ? '' : pezzi.slice(-2).join(' › ') }
}

/** Il piede di un elenco: «12 file · 3 scelti · +2 nascosti». */
export function contoPiede(p: { visibili: number; scelti: number; nascosti: number }): string {
  return [
    `${p.visibili} ${p.visibili === 1 ? 'elemento' : 'elementi'}`,
    p.scelti > 0 ? `${p.scelti} ${p.scelti === 1 ? 'scelto' : 'scelti'}` : '',
    p.nascosti > 0 ? `+${p.nascosti} ${p.nascosti === 1 ? 'nascosto' : 'nascosti'}` : ''
  ].filter((x) => x !== '').join(' · ')
}
