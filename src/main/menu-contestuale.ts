import { BrowserWindow, Menu, type IpcMain, type MenuItemConstructorOptions } from 'electron'
import { eSeparatore, eSottomenu, testoVisibile, vociValide, type VoceMenu } from '@shared/menu-contestuale'

/**
 * Il tasto destro sulle cose del programma (13/11): il renderer manda le voci
 * (`@shared/menu-contestuale`), qui si apre il menu del sistema sotto il
 * puntatore e si risponde con l'id scelto, o `undefined` se si chiude senza
 * scegliere. Lo stesso menu di Copia/Incolla dei campi (`menu-modifica.ts`).
 */
export function modelloMenu(voci: readonly VoceMenu[], scegli: (id: string) => void): MenuItemConstructorOptions[] {
  return voci.map((v): MenuItemConstructorOptions => {
    if (eSeparatore(v)) return { type: 'separator' }
    if (eSottomenu(v)) return { label: v.testo, enabled: v.spenta !== true, submenu: modelloMenu(v.sotto, scegli) }
    return {
      label: testoVisibile(v),
      enabled: v.spenta !== true,
      ...(v.spunta === true ? { type: 'checkbox' as const, checked: true } : {}),
      click: () => scegli(v.id)
    }
  })
}

/** Quanto si aspetta, chiuso il menu, il clic che su Windows può arrivare dopo la chiusura. */
const DOPO_CHIUSURA_MS = 60

export function registraMenuContestuale(ipc: IpcMain): void {
  ipc.handle('menu:contestuale', (e, raw: unknown) => {
    const voci = vociValide(raw)
    const win = BrowserWindow.fromWebContents(e.sender)
    if (voci.length === 0 || win === null || win.isDestroyed()) return undefined
    return new Promise<string | undefined>((risolvi) => {
      let scelta: string | undefined
      let fatto = false
      const fine = (): void => { if (!fatto) { fatto = true; risolvi(scelta) } }
      const menu = Menu.buildFromTemplate(modelloMenu(voci, (id) => { scelta = id; fine() }))
      menu.popup({ window: win, callback: () => setTimeout(fine, DOPO_CHIUSURA_MS) })
    })
  })
}
