import type { ConsumiPerChat as Modello, Rimasto } from '@shared/consumi-chat'
import { formattaToken } from '@shared/consumi'
import { oraDi } from '@shared/polso-chat'
import { Aiuto } from './Aiuto'

/**
 * Consumi per chat (k-con2): in alto quanto resta nelle 5 ore, nella settimana
 * e oggi; sotto l'elenco delle chat, dalla più alta.
 *
 * Quanto resta si LEGGE dai limiti che manda Claude, non si calcola. Per la
 * giornata Claude non dà un limite: resta «non noto». Un dato che manca si
 * scrive «non noto», mai un numero inventato.
 */

const NON_NOTO = 'non noto'

type Grande = { valore: string; sotto: string; livello: '' | 'ambra' | 'rosso' }

/** Il numero grande di una finestra e la riga sotto (azzeramento). Puro, per i test. */
export function grandeDaRimasto(r: Rimasto, adesso: number): Grande {
  if (!r.noto || r.percentoRimasto === undefined) return { valore: NON_NOTO, sotto: '', livello: '' }
  const quando = r.azzeraIl !== undefined ? oraDi(r.azzeraIl, adesso) : r.azzeraEtichetta
  const parti = [quando !== undefined ? `si azzera ${quando}` : 'azzeramento non noto']
  if (r.vecchia === true) parti.push('lettura vecchia')
  const usato = r.percentoUsato ?? 100 - r.percentoRimasto
  return { valore: `${r.percentoRimasto}%`, sotto: parti.join(' · '), livello: usato >= 95 ? 'rosso' : usato >= 80 ? 'ambra' : '' }
}

function Riquadro({ titolo, g, aiuto, di }: { titolo: string; g: Grande; aiuto: string; di: string }): React.JSX.Element {
  const noto = g.valore !== NON_NOTO
  return (
    <div className="consumi-alto__riquadro">
      <div className="serigrafia con-aiuto">{titolo}<Aiuto di={di}>{aiuto}</Aiuto></div>
      <div className={`consumi-alto__numero${noto ? '' : ' consumi-alto__numero--spento'}${g.livello !== '' ? ` consumi-alto__numero--${g.livello}` : ''}`}>{g.valore}</div>
      {g.sotto !== '' ? <div className="misura">{g.sotto}</div> : null}
    </div>
  )
}

export function ConsumiPerChatVista({ dati, adesso }: { dati: Modello | undefined; adesso: number }): React.JSX.Element {
  const cinque = dati === undefined ? undefined : grandeDaRimasto(dati.rimasto.cinqueOre, adesso)
  const sett = dati === undefined ? undefined : grandeDaRimasto(dati.rimasto.settimana, adesso)
  const vuoto: Grande = { valore: NON_NOTO, sotto: '', livello: '' }
  const motivo = (r: Rimasto | undefined): string => (r !== undefined && !r.noto && r.motivo !== undefined ? ` Ora: ${r.motivo}.` : '')
  return (
    <section className="consumi-alto">
      <div className="consumi-alto__riga">
        <Riquadro
          titolo="Resta nelle 5 ore"
          g={cinque ?? vuoto}
          di="resta nelle 5 ore"
          aiuto={`È la finestra mobile di cinque ore di Claude: la percentuale che manca al 100%, letta dai limiti che Claude manda, non calcolata. Al 100% le chat aspettano l’azzeramento.${motivo(dati?.rimasto.cinqueOre)}`}
        />
        <Riquadro
          titolo="Resta questa settimana"
          g={sett ?? vuoto}
          di="resta questa settimana"
          aiuto={`È il tetto settimanale di Claude: la percentuale che manca al 100%, letta dai limiti che Claude manda, non calcolata.${motivo(dati?.rimasto.settimana)}`}
        />
        <Riquadro
          titolo="Oggi"
          g={vuoto}
          di="oggi"
          aiuto="Claude non dà un limite per la giornata: dà solo la finestra di 5 ore e la settimana. Per non scrivere un numero inventato, qui resta «non noto». I consumi di oggi, chat per chat, sono qui sotto."
        />
      </div>

      <div className="serigrafia con-aiuto consumi-alto__titolo">Per chat
        <Aiuto di="consumi per chat">Token (entrata + uscita) di ogni chat, dalla più alta. «Oggi» e «Settimana» (da lunedì) contano quello che si vede salire mentre il programma è acceso e restano salvati dopo la chiusura. Se la chat è stata usata prima di questa versione, il primo valore è una stima sulla data dell’ultima risposta.</Aiuto>
      </div>
      {dati === undefined ? (
        <p className="misura">Leggo i consumi…</p>
      ) : dati.chat.length === 0 ? (
        <p className="misura">Nessuna chat ha consumato oggi o in questa settimana.</p>
      ) : (
        <div className="consumi-chat" role="table" aria-label="Consumi per chat">
          <div className="consumi-chat__riga consumi-chat__riga--testa" role="row">
            <span role="columnheader">Chat</span>
            <span role="columnheader" className="consumi-chat__num">Oggi</span>
            <span role="columnheader" className="consumi-chat__num">Settimana</span>
          </div>
          {dati.chat.map((c) => (
            <div key={c.chiave} className="consumi-chat__riga" role="row">
              <span className="consumi-chat__chat" role="cell">
                <span className="consumi-chat__nome" title={c.chat}>{c.chat}</span>
                <span className="misura">{[c.workspace, c.pc].filter((x) => x !== '').join(' · ')}</span>
              </span>
              <span className="consumi-chat__num" role="cell">{formattaToken(c.oggi)}</span>
              <span className="consumi-chat__num" role="cell">{formattaToken(c.settimana)}</span>
            </div>
          ))}
          <div className="consumi-chat__riga consumi-chat__riga--totale" role="row">
            <span role="cell">Totale · {dati.chat.length} chat</span>
            <span className="consumi-chat__num" role="cell">{formattaToken(dati.complessivo.oggi)}</span>
            <span className="consumi-chat__num" role="cell">{formattaToken(dati.complessivo.settimana)}</span>
          </div>
        </div>
      )}
    </section>
  )
}
