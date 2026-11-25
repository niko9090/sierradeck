import { memoriaBreve } from '@shared/memoria-breve'
import { stessaVoce, type Manifesto, type VoceManifesto } from './incrementale'
import { parseRegistro, type RegistroProgetti } from '../progetti/registro'

/** Il registro dei progetti sul Drive, dentro il manifesto. */
export const FILE_REGISTRO_PANNELLO = 'sierradeck/progetti-drive.json'
/** Fresco per un minuto: dentro il minuto non si chiede niente al Drive. */
export const QUADRO_FRESCO_MS = 60_000
/**
 * Fino a quanto un quadro vecchio si mostra subito, rileggendo intanto in
 * sottofondo (25/11). Era 10 minuti, e il giro dei workspace dei progetti
 * (ogni 10 minuti) lo chiedeva sempre fresco: a ogni giro il pannello
 * aspettava il manifesto del Drive (2 MB, 3–10 s). Oltre l'ora (il PC
 * dormiva) si aspetta la lettura vera.
 */
export const QUADRO_VECCHIO_FINO_MS = 60 * 60_000

export type QuadroPannello = { manifesto: Manifesto; registro?: RegistroProgetti }

/**
 * Il manifesto del Drive e il registro dei progetti per il pannello (solo per
 * guardare: chi scrive il manifesto lo rilegge fresco da sé, con
 * `aggiornaManifesto`, e non passa mai da qui).
 *
 * Il manifesto lo legge `manifestoDrive`, che chiede prima a Drive se e'
 * cambiato (una chiamata piccola) e lo riscarica solo se si'. Il registro dei
 * progetti si riscarica solo se la sua voce nel manifesto e' cambiata.
 */
export function creaQuadroPannello(deps: {
  manifestoDrive: () => Promise<Manifesto | undefined>
  leggiFileDrive: (percorso: string, manifesto: Manifesto) => Promise<Buffer | undefined>
  adesso?: () => number
}): (ancheVecchio?: boolean) => Promise<QuadroPannello | undefined> {
  let ultimoRegistro: { voce: VoceManifesto; registro: RegistroProgetti } | undefined
  return memoriaBreve(async (): Promise<QuadroPannello | undefined> => {
    const manifesto = await deps.manifestoDrive().catch(() => undefined)
    if (manifesto === undefined) return undefined
    const voce = manifesto.file[FILE_REGISTRO_PANNELLO]
    let registro: RegistroProgetti | undefined
    if (voce !== undefined && ultimoRegistro !== undefined && stessaVoce(voce, ultimoRegistro.voce)) {
      registro = ultimoRegistro.registro
    } else {
      const grezzo = await deps.leggiFileDrive(FILE_REGISTRO_PANNELLO, manifesto).catch(() => undefined)
      try { registro = grezzo === undefined ? undefined : parseRegistro(JSON.parse(grezzo.toString('utf8'))) } catch { registro = undefined }
      ultimoRegistro = voce !== undefined && registro !== undefined ? { voce, registro } : undefined
    }
    return { manifesto, ...(registro !== undefined ? { registro } : {}) }
  }, QUADRO_FRESCO_MS, deps.adesso ?? (() => Date.now()), QUADRO_VECCHIO_FINO_MS)
}
