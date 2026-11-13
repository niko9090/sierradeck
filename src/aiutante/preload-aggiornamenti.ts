import { contextBridge, ipcRenderer } from 'electron'

/**
 * Il ponte della finestra degli aggiornamenti dell'Aiutante (13/11, 1.0.3):
 * solo gli aggiornamenti, niente altro (né impostazioni né rete).
 */
contextBridge.exposeInMainWorld('aiutanteAggiornamenti', {
  /** Lo stato nella forma della finestra del programma completo, la versione installata e se scarica da solo. */
  stato: (): Promise<unknown> => ipcRenderer.invoke('aiutante-agg:stato'),
  suStato: (f: (s: unknown) => void): (() => void) => {
    const h = (_e: unknown, s: unknown): void => f(s)
    ipcRenderer.on('aiutante-agg:stato', h)
    return () => { ipcRenderer.removeListener('aiutante-agg:stato', h) }
  },
  note: (): Promise<unknown> => ipcRenderer.invoke('aiutante-agg:note'),
  installa: (confermato: boolean): Promise<unknown> => ipcRenderer.invoke('aiutante-agg:installa', confermato),
  scarica: (): Promise<unknown> => ipcRenderer.invoke('aiutante-agg:scarica'),
  cerca: (): Promise<unknown> => ipcRenderer.invoke('aiutante-agg:cerca'),
  nascondi: (): Promise<unknown> => ipcRenderer.invoke('aiutante-agg:nascondi'),
  letto: (): Promise<unknown> => ipcRenderer.invoke('aiutante-agg:letto'),
  apriPagina: (url: string): Promise<unknown> => ipcRenderer.invoke('aiutante-agg:apriPagina', url)
})
