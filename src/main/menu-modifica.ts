import type { MenuItemConstructorOptions } from 'electron'

/**
 * Copia e incolla nei campi e nei testi della finestra.
 *
 * Nicholas (30/09): «nella chat con l'autopilota non riesco né a copiare quello
 * che è scritto né a incollare nella casella». Tre cause insieme:
 *
 * 1. il foglio di stile mette `user-select: none` sul `body` (serve a non
 *    selezionare etichette mentre si trascinano i riquadri), e la chat con
 *    l'autopilota non lo riapriva: il testo non si poteva nemmeno selezionare;
 * 2. il programma non dichiarava nessun menu dell'applicazione. I tasti
 *    Ctrl+C / Ctrl+V / Ctrl+X / Ctrl+A in Electron passano dai **ruoli** del
 *    menu Modifica: senza un menu con quei ruoli dipendevano da quello
 *    predefinito, che non c'e' in tutte le configurazioni;
 * 3. il tasto destro fuori dal terminale non apriva niente: nessun «Copia» o
 *    «Incolla» da scegliere con il mouse.
 *
 * Qui stanno le voci, pure: il menu dell'applicazione (nascosto, come prima —
 * torna premendo Alt) e quello contestuale, che dipende da cosa c'e' sotto il
 * puntatore.
 */
export function vociMenuApplicazione(): MenuItemConstructorOptions[] {
  return [
    {
      label: 'Modifica',
      submenu: [
        { role: 'undo', label: 'Annulla' },
        { role: 'redo', label: 'Ripeti' },
        { type: 'separator' },
        { role: 'cut', label: 'Taglia' },
        { role: 'copy', label: 'Copia' },
        { role: 'paste', label: 'Incolla' },
        { role: 'selectAll', label: 'Seleziona tutto' }
      ]
    },
    {
      // Ctrl+R e F12 restano: servono alle verifiche, e il menu di sistema che
      // li portava prima non c'e' piu' una volta che se ne dichiara uno nostro.
      label: 'Vista',
      submenu: [
        { role: 'reload', label: 'Ricarica' },
        { role: 'forceReload', label: 'Ricarica da capo' },
        { role: 'toggleDevTools', label: 'Strumenti di sviluppo' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Dimensione normale' },
        { role: 'zoomIn', label: 'Ingrandisci' },
        { role: 'zoomOut', label: 'Riduci' }
      ]
    }
  ]
}

/** Quello che serve sapere del punto dove si e' premuto il tasto destro. */
export type PuntoContestuale = {
  /** Un campo in cui si scrive: casella, area di testo. */
  isEditable: boolean
  /** Il testo selezionato, se c'e'. */
  selectionText: string
  editFlags: { canCut: boolean; canCopy: boolean; canPaste: boolean; canSelectAll: boolean }
}

/**
 * Il menu del tasto destro, o nessuno.
 *
 * In un campo: Taglia, Copia, Incolla, Seleziona tutto (ognuno attivo solo se
 * ha senso). Su un testo selezionato fuori da un campo: Copia. Altrove niente,
 * cosi' il tasto destro sul mosaico resta muto come prima. Il terminale ha il
 * suo (copia se c'e' una selezione, altrimenti incolla) e ferma l'evento prima
 * che arrivi qui.
 */
export function vociMenuContestuale(p: PuntoContestuale): MenuItemConstructorOptions[] {
  if (p.isEditable) {
    return [
      { role: 'cut', label: 'Taglia', enabled: p.editFlags.canCut },
      { role: 'copy', label: 'Copia', enabled: p.editFlags.canCopy },
      { role: 'paste', label: 'Incolla', enabled: p.editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', label: 'Seleziona tutto', enabled: p.editFlags.canSelectAll }
    ]
  }
  if (p.selectionText.trim() !== '') return [{ role: 'copy', label: 'Copia' }]
  return []
}
