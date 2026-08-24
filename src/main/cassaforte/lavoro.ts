import { cifra, decifra } from './cifratura'
import { componiPacchetto, leggiPacchetto } from './pacchetto'
import { raccogliFlusso, ripristina, radiciDaSincronizzare } from './raccolta'
import type { Progresso } from './motore'

/**
 * Il **lavoro pesante** della sincronizzazione, separato dalla rete.
 *
 * Sono le due metà che costano — CPU e disco — e che, girando nel processo
 * principale, bloccavano l'interfaccia: `preparaBlocco` (raccogli i file →
 * comprimi → cifra) e `applicaBlocco` (decifra → rileggi → scrivi i file).
 * Prendono `dati` e `radiceClaude` (non le `radici` già fatte) perché le radici
 * contengono funzioni, e le funzioni non attraversano il confine di un worker:
 * qui si ricalcolano dai due percorsi.
 *
 * La **rete** (caricare/scaricare sul Drive) non sta qui: la fa il processo
 * principale, che ha il token. Così questo modulo è puro CPU/disco, si prova da
 * solo, e può girare tale e quale dentro un thread separato.
 */

export type RichiestaPrepara = { dati: string; radiceClaude: string; maestra: Buffer; adesso: string }
export type RichiestaApplica = { dati: string; radiceClaude: string; maestra: Buffer; blocco: Buffer }

export type EsitoApplica = {
  scritti: number
  saltati: string[]
  creatoIl: string
  /** Il blocco non si è decifrato/riletto: chiave sbagliata o dati corrotti. */
  illeggibile: boolean
}

export async function preparaBlocco(
  req: RichiestaPrepara,
  onProgresso?: (p: Progresso) => void
): Promise<{ cifrato: Buffer; voci: number }> {
  const radici = radiciDaSincronizzare(req.dati, req.radiceClaude)
  // A flusso: i file entrano nella compressione uno alla volta, senza tenerli
  // tutti in memoria. `conteggio` segue quanti ne sono passati (per l'esito).
  let conteggio = 0
  const flusso = raccogliFlusso(radici, (fatto, totale) => {
    conteggio = fatto
    onProgresso?.({ fase: 'comprimo', fatto, totale })
  })
  const pacchetto = await componiPacchetto(flusso, req.adesso)
  onProgresso?.({ fase: 'cifro' })
  const cifrato = await cifra(req.maestra, pacchetto, (fatto, totale) => onProgresso?.({ fase: 'cifro', fatto, totale }))
  return { cifrato, voci: conteggio }
}

export async function applicaBlocco(
  req: RichiestaApplica,
  onProgresso?: (p: Progresso) => void
): Promise<EsitoApplica> {
  onProgresso?.({ fase: 'decifro' })
  const inChiaro = await decifra(req.maestra, req.blocco, (fatto, totale) => onProgresso?.({ fase: 'decifro', fatto, totale }))
  if (inChiaro === undefined) return { scritti: 0, saltati: [], creatoIl: '', illeggibile: true }
  const pacchetto = await leggiPacchetto(inChiaro)
  if (pacchetto === undefined) return { scritti: 0, saltati: [], creatoIl: '', illeggibile: true }
  const radici = radiciDaSincronizzare(req.dati, req.radiceClaude)
  const { scritti, saltati } = await ripristina(pacchetto.voci, radici, (fatto, totale) => onProgresso?.({ fase: 'ripristino', fatto, totale }))
  return { scritti, saltati, creatoIl: pacchetto.creatoIl, illeggibile: false }
}
