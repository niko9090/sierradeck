import { limitaMisura, misuraTrascinata, passoMisura, suggerimentoBordo, type LatoBordo } from '@shared/misure-pannelli'
import { vociDivisore } from '@shared/menu-contestuale'
import { apriMenuContestuale } from '../menu-contestuale'

/**
 * Il bordo da trascinare di una sezione (13/11): col mouse si allarga o si
 * stringe, il doppio clic (o il tasto destro) torna alla misura iniziale, le
 * frecce la spostano a passi. Dove sta lo decide il foglio di stile con
 * `classe`; qui solo il gesto. La misura la tiene chi lo monta
 * (`useMisuraTrascinabile`): durante il trascinamento `fine` è falso, al
 * rilascio vero (si salva una volta sola).
 */
export function Divisore({ chiave, lato, nome, misura, misuraAttuale, spazio, onMisura, classe, passo = 20 }: {
  chiave: string
  lato: LatoBordo
  /** «la colonna dell’autopilota»: per il suggerimento e il menu. */
  nome: string
  /** La misura salvata; `undefined` = quella del foglio di stile. */
  misura: number | undefined
  /** Quanto è larga adesso la sezione: da qui parte il trascinamento senza una misura salvata. */
  misuraAttuale: () => number
  /** Lo spazio massimo adesso (per non schiacciare il resto), se si sa. */
  spazio?: () => number | undefined
  onMisura: (v: number | undefined, fine: boolean) => void
  classe?: string
  passo?: number
}): React.JSX.Element {
  const trascina = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    e.preventDefault()
    const bersaglio = e.currentTarget
    bersaglio.setPointerCapture?.(e.pointerId)
    const partenza = e.clientX
    const iniziale = misura ?? misuraAttuale()
    const tetto = spazio?.()
    let ultima = iniziale
    const muovi = (ev: PointerEvent): void => {
      ultima = misuraTrascinata({ chiave, lato, iniziale, partenza, posizione: ev.clientX, ...(tetto !== undefined ? { spazio: tetto } : {}) })
      onMisura(ultima, false)
    }
    const molla = (): void => {
      bersaglio.removeEventListener('pointermove', muovi)
      bersaglio.removeEventListener('pointerup', molla)
      bersaglio.removeEventListener('pointercancel', molla)
      document.body.classList.remove('divisore-in-mano')
      onMisura(ultima, true)
    }
    document.body.classList.add('divisore-in-mano')
    bersaglio.addEventListener('pointermove', muovi)
    bersaglio.addEventListener('pointerup', molla)
    bersaglio.addEventListener('pointercancel', molla)
  }
  const tasti = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Home' || e.key === 'Enter') { e.preventDefault(); onMisura(undefined, true); return }
    const d = passoMisura(lato, e.key, passo)
    if (d === 0) return
    e.preventDefault()
    const tetto = spazio?.()
    onMisura(limitaMisura(chiave, (misura ?? misuraAttuale()) + d, tetto), true)
  }
  return (
    <div
      className={`divisore divisore--${lato}${classe !== undefined ? ` ${classe}` : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Larghezza di ${nome}`}
      {...(misura !== undefined ? { 'aria-valuenow': misura } : {})}
      tabIndex={0}
      title={suggerimentoBordo(nome)}
      onPointerDown={trascina}
      onDoubleClick={() => onMisura(undefined, true)}
      onKeyDown={tasti}
      onContextMenu={(e) => apriMenuContestuale(e, vociDivisore(nome), { iniziale: () => onMisura(undefined, true) })}
    />
  )
}
