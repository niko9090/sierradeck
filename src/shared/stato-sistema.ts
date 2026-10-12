import { stato, type StatoVista } from './stato-vista'

/**
 * Gli stati del sistema in una parola (0.70.0), uguali in Impostazioni, in
 * Account e Drive e nella Salute: la versione, il Drive, la cassaforte, i
 * telefoni accoppiati. Prima ognuno li diceva a modo suo («collegato ✓»,
 * «non collegato», «da creare» in grigio, un banner a parte).
 */

export function statoVersione(a: { fase?: string; versione?: string } | undefined): StatoVista {
  switch (a?.fase) {
    case 'disponibile': return stato('nuova', 'nuova', 'blu', a.versione !== undefined ? `c'è la ${a.versione}` : undefined)
    case 'scarico': return stato('scarico', 'scarico', 'blu')
    case 'pronto': return stato('pronta', 'pronta', 'blu', 'da installare con «Installa»')
    case 'installo': return stato('installo', 'installo', 'blu')
    case 'errore': return stato('errore', 'errore', 'rosso')
    case 'cerco': return stato('cerco', 'cerco', 'quieto')
    default: return stato('aggiornato', 'aggiornato', 'verde')
  }
}

export function statoDrive(d: { configurato: boolean; connesso: boolean } | undefined): StatoVista {
  if (d === undefined) return stato('leggo', '…', 'quieto')
  if (!d.configurato) return stato('assente', 'non configurato', 'ambra')
  return d.connesso ? stato('collegato', 'collegato', 'verde') : stato('scollegato', 'scollegato', 'rosso')
}

export function statoCassaforte(s: { haCassaforte: boolean; sbloccato: boolean; cassaforteDiversa?: boolean } | undefined): StatoVista {
  if (s === undefined) return stato('leggo', '…', 'quieto')
  if (s.cassaforteDiversa === true) return stato('diversa', 'diversa', 'rosso', 'sul Drive c’è un’altra cassaforte')
  if (!s.haCassaforte) return stato('da-creare', 'da creare', 'ambra')
  return s.sbloccato ? stato('aperta', 'aperta', 'verde') : stato('chiusa', 'chiusa', 'ambra')
}

export function statoTelefoni(n: number | undefined): StatoVista {
  if (n === undefined) return stato('leggo', '…', 'quieto')
  return n === 0 ? stato('nessuno', 'nessuno', 'quieto') : stato('accoppiati', n === 1 ? '1 accoppiato' : `${n} accoppiati`, 'verde')
}
