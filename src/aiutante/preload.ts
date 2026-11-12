import { contextBridge, ipcRenderer } from 'electron'

/**
 * Il ponte fra la finestra dell'Aiutante e il processo principale (12/11):
 * solo le poche cose che la finestra fa. Niente accesso a file o processi.
 */
contextBridge.exposeInMainWorld('aiutante', {
  stato: (): Promise<unknown> => ipcRenderer.invoke('aiutante:stato'),
  cambia: (cambio: Record<string, unknown>): Promise<unknown> => ipcRenderer.invoke('aiutante:cambia', cambio),
  collegaDrive: (): Promise<unknown> => ipcRenderer.invoke('aiutante:collegaDrive'),
  sblocca: (passphrase: string): Promise<unknown> => ipcRenderer.invoke('aiutante:sblocca', passphrase),
  mandaErrori: (): Promise<unknown> => ipcRenderer.invoke('aiutante:mandaErrori'),
  cercaAggiornamenti: (): Promise<unknown> => ipcRenderer.invoke('aiutante:cercaAggiornamenti'),
  apriRegistro: (): Promise<unknown> => ipcRenderer.invoke('aiutante:apriRegistro')
})
