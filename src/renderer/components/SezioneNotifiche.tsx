import type { Preferenze } from '@shared/preferenze'
import { Aiuto } from './Aiuto'

/**
 * «Notifiche» nelle Impostazioni del PC (k-47). Nicholas, 06/11: «nelle
 * impostazioni c'è la voce Notifiche ma non c'è nulla come menu». La voce a
 * sinistra c'era per tutti, ma le scelte erano scritte solo per app e pagina:
 * sul PC la sezione si apriva vuota.
 *
 * Qui ci sono solo scelte che il programma legge davvero: il fumetto del
 * salvataggio automatico sul Drive e la notifica di Windows per
 * l'aggiornamento che aspetta. Senza stato né effetti: le preferenze arrivano
 * dal pannello, che le salva.
 */
export function SezioneNotifiche({ p, cambia, vede }: { p: Preferenze; cambia: (x: Partial<Preferenze>) => void; vede?: (...id: string[]) => boolean }): React.JSX.Element {
  const mostra = vede ?? (() => true)
  return (
    <>
      {mostra('avviso-windows-aggiornamento') ? (
        <label className="impostazioni__riga impostazioni__riga--spunta">
          <input type="checkbox" checked={p.avvisoWindowsAggiornamento} onChange={(e) => cambia({ avvisoWindowsAggiornamento: e.target.checked })} />
          <span className="con-aiuto">Avvisa con Windows se l’aggiornamento aspetta
            {/* Dentro la <label>: senza preventDefault un clic sulla spiegazione cambierebbe la spunta. */}
            <span onClick={(e) => e.preventDefault()}><Aiuto di="Avviso di Windows per l’aggiornamento">
              Acceso: se una versione nuova è pronta e le chat non finiscono il turno per molto tempo, Windows mostra «SierraDeck aspetta per aggiornarsi». Spento: Windows non dice niente; l’attesa si vede lo stesso in Aggiornamenti e nel registro. Non cambia mai quando si installa.
            </Aiuto></span>
          </span>
        </label>
      ) : null}
      {mostra('fumetti-sincronia') ? (
        <label className="impostazioni__riga impostazioni__riga--spunta">
          <input type="checkbox" checked={p.fumettiSincroniaAutomatica} onChange={(e) => cambia({ fumettiSincroniaAutomatica: e.target.checked })} />
          <span className="con-aiuto">Mostra un fumetto anche per il salvataggio automatico sul Drive
            <span onClick={(e) => e.preventDefault()}><Aiuto di="Fumetti del salvataggio automatico">
              I fumetti sono in basso a destra, compaiono e spariscono senza spostare i riquadri. Il lavoro che chiedi tu (Fondi, Ripristina, Porta qui) ha sempre il suo fumetto con la barra, «Dettagli» e «Annulla». Il lavoro automatico (il salvataggio ogni cinque minuti, l’arrivo delle chat) spento non si vede: se ne parla solo se va male. Acceso, mostra una riga piccola con la percentuale, senza tasti.
            </Aiuto></span>
          </span>
        </label>
      ) : null}
    </>
  )
}
