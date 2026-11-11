import type { Dispositivi } from './dispositivi'

/**
 * **Il telefono si toglie da solo dall'elenco del PC** (11/11, `POST
 * /api/scollega`). Prima, per scollegare un telefono, bisognava andare sul PC
 * (Impostazioni → Client → Revoca); dall'app «Scollega» dimenticava il PC solo
 * sul telefono, e sul PC restava una chiave buona di un telefono che non c'era più.
 *
 * Solo un dispositivo accoppiato qui toglie **sé stesso**: mai un altro (non
 * c'è un parametro per sceglierlo), mai un altro PC o un telefono che passa
 * dal ponte di un altro PC (quella chiave non è di questo PC), mai lo schermo
 * del PC stesso.
 */
export function scollegaTelefono(dispositivo: string | undefined, altroPc: boolean, d: Pick<Dispositivi, 'elenca' | 'revoca'>): { stato: number; corpo: unknown } {
  if (dispositivo === undefined || dispositivo === 'locale' || altroPc) {
    return { stato: 403, corpo: { errore: 'Si scollega solo un telefono accoppiato a questo PC, e solo da sé.' } }
  }
  if (!d.elenca().some((x) => x.id === dispositivo)) return { stato: 404, corpo: { errore: 'Questo telefono non è nell’elenco del PC.' } }
  d.revoca(dispositivo)
  console.info('[client] un telefono si è tolto da solo dall’elenco dei dispositivi')
  return { stato: 200, corpo: { fatto: true } }
}
