/**
 * Chi è il programma per Windows (0.57.0).
 *
 * `APP_ID` è lo stesso `appId` di `electron-builder.yml`: l'installer lo scrive
 * come AppUserModelID nei collegamenti del menu Start e del desktop, e il
 * programma lo dichiara all'avvio con `app.setAppUserModelId`. Se i due non
 * coincidono, Windows tratta la finestra e il collegamento come due programmi
 * diversi: un'icona in più sulla barra delle applicazioni, e il collegamento
 * fissato che non raccoglie la finestra aperta.
 *
 * `GUID_INSTALLAZIONE` è la chiave con cui Windows conosce l'installazione
 * (la voce in «App installate» e la cartella scelta). Nella 0.57.0 l'appId è
 * cambiato, ma questa resta quella delle installazioni di prima: electron-builder
 * la ricaverebbe dall'appId nuovo, e l'aggiornamento diventerebbe un secondo
 * programma accanto al primo, con due voci in «App installate». Non va cambiata.
 */
export const APP_ID = 'it.ferrariconsulenze.sierradeck'
export const GUID_INSTALLAZIONE = '8e5eec75-f025-512f-b3e4-78d055eb2b1f'

/**
 * Le porte di una copia di prova (`SIERRADECK_PROVA`): mai quelle predefinite
 * del programma vero, 47640 e 47630. Con quelle la copia parlerebbe con il
 * servizio degli autopiloti vero, ne ritirerebbe le consegne e, a versione
 * diversa, lo spegnerebbe per sostituirlo.
 */
export function portePerLaProva(p: { portaClient: number; portaAutopiloti: number }): { portaClient: number; portaAutopiloti: number } {
  return {
    portaClient: p.portaClient === 47640 ? 47650 : p.portaClient,
    portaAutopiloti: p.portaAutopiloti === 47630 ? 47651 : p.portaAutopiloti
  }
}
