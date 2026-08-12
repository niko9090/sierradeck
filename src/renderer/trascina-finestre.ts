/**
 * Le finestre di SierraDeck si prendono per la testa e si spostano.
 *
 * I pannelli erano bande orizzontali incollate sotto la fascia: occupavano
 * tutta la larghezza per mostrare un elenco stretto, coprivano le chat proprio
 * dove si guarda, e non si potevano scansare. Una finestra che si sposta è
 * un'altra cosa: la metti dove non dà fastidio e continui a lavorare.
 *
 * Il trascinamento vive qui, in un posto solo, e si aggancia per delega: ogni
 * pannello presente e futuro diventa mobile senza saperlo, senza che nessuno si
 * ricordi di aggiungere un `useDrag` al componente nuovo.
 */

/** Di quanto si può spingere una finestra oltre il bordo prima che si fermi. */
const MARGINE = 24
/** La striscia sul bordo destro che allarga invece di spostare. */
const MANIGLIA = 10
/** Sotto questa larghezza una finestra smette di poter mostrare qualcosa. */
const LARGHEZZA_MIN = 320

export type Punto = { x: number; y: number }

/**
 * Dove finisce la finestra dopo lo spostamento.
 *
 * Fuori dallo schermo non ci va: una finestra trascinata oltre il bordo non
 * tornerebbe più indietro, perché la maniglia per riprenderla sarebbe fuori.
 */
export function posizioneLimitata(
  desiderata: Punto,
  finestra: { larghezza: number; altezza: number },
  schermo: { larghezza: number; altezza: number }
): Punto {
  const xMax = Math.max(MARGINE, schermo.larghezza - finestra.larghezza - MARGINE)
  const yMax = Math.max(MARGINE, schermo.altezza - finestra.altezza - MARGINE)
  return {
    x: Math.min(Math.max(desiderata.x, MARGINE), xMax),
    y: Math.min(Math.max(desiderata.y, MARGINE), yMax)
  }
}

/**
 * Rende mobili tutti i pannelli del documento.
 *
 * Restituisce la funzione che stacca tutto: senza, un secondo montaggio
 * lascerebbe due ascoltatori a spostare la stessa finestra del doppio.
 */
/**
 * Chiude la finestra quando si preme fuori.
 *
 * È il gesto che tutti conoscono, e finora funzionava solo per alcuni pannelli:
 * chi lo prova sull'uno e non sull'altro non impara la regola, impara che il
 * programma è imprevedibile.
 *
 * Un clic dentro la finestra, o su un tasto della fascia, non chiude niente: il
 * tasto della fascia è quello che l'ha aperta, e chiuderla da qui la farebbe
 * riaprire subito dopo.
 */
export function attivaChiusuraFuori(chiudi: () => void, doc: Document = document): () => void {
  const premuto = (e: MouseEvent): void => {
    const bersaglio = e.target as HTMLElement | null
    if (bersaglio === null) return
    if (bersaglio.closest('.pannello') !== null) return
    if (bersaglio.closest('.fascia') !== null) return
    chiudi()
  }
  doc.addEventListener('mousedown', premuto)
  return () => doc.removeEventListener('mousedown', premuto)
}

export function attivaTrascinamento(doc: Document = document): () => void {
  let mobile: HTMLElement | undefined
  let scarto: Punto = { x: 0, y: 0 }
  let allargando: HTMLElement | undefined
  let larghezzaIniziale = 0
  let xIniziale = 0

  const premuto = (e: MouseEvent): void => {
    const bersaglio = e.target as HTMLElement | null

    // Il bordo destro allarga invece di spostare: chi ha molte chat o un
    // diario lungo vuole più spazio, e trascinare la finestra non gliene dà.
    const daAllargare = bersaglio?.closest('.pannello') as HTMLElement | null
    if (daAllargare !== null && daAllargare !== undefined) {
      const bordi = daAllargare.getBoundingClientRect()
      if (e.clientX > bordi.right - MANIGLIA) {
        allargando = daAllargare
        larghezzaIniziale = bordi.width
        xIniziale = e.clientX
        daAllargare.classList.add('pannello--in-mano')
        e.preventDefault()
        return
      }
    }

    const testa = bersaglio?.closest('.pannello__testa')
    if (testa === null || testa === undefined) return
    // Un tasto dentro la testa resta un tasto: chi preme «Chiudi» vuole
    // chiudere, non trascinare di due pixel.
    if (bersaglio?.closest('button, input, select, textarea, a') !== null) return

    const pannello = testa.closest('.pannello') as HTMLElement | null
    if (pannello === null) return
    const bordi = pannello.getBoundingClientRect()
    mobile = pannello
    scarto = { x: e.clientX - bordi.left, y: e.clientY - bordi.top }
    // Da qui in poi la posizione la decidiamo noi: senza questo, la finestra
    // salterebbe al primo movimento perché il CSS la tiene ancora centrata.
    pannello.style.position = 'fixed'
    pannello.style.margin = '0'
    pannello.style.transform = 'none'
    pannello.classList.add('pannello--in-mano')
    e.preventDefault()
  }

  const mosso = (e: MouseEvent): void => {
    if (allargando !== undefined) {
      const larghezza = larghezzaIniziale + (e.clientX - xIniziale)
      allargando.style.width = `${Math.min(Math.max(larghezza, LARGHEZZA_MIN), doc.documentElement.clientWidth - 32)}px`
      return
    }
    if (mobile === undefined) return
    const bordi = mobile.getBoundingClientRect()
    const dove = posizioneLimitata(
      { x: e.clientX - scarto.x, y: e.clientY - scarto.y },
      { larghezza: bordi.width, altezza: bordi.height },
      { larghezza: doc.documentElement.clientWidth, altezza: doc.documentElement.clientHeight }
    )
    mobile.style.left = `${dove.x}px`
    mobile.style.top = `${dove.y}px`
    mobile.style.right = 'auto'
    mobile.style.bottom = 'auto'
  }

  const lasciato = (): void => {
    mobile?.classList.remove('pannello--in-mano')
    allargando?.classList.remove('pannello--in-mano')
    mobile = undefined
    allargando = undefined
  }

  doc.addEventListener('mousedown', premuto)
  doc.addEventListener('mousemove', mosso)
  doc.addEventListener('mouseup', lasciato)
  return () => {
    doc.removeEventListener('mousedown', premuto)
    doc.removeEventListener('mousemove', mosso)
    doc.removeEventListener('mouseup', lasciato)
  }
}
