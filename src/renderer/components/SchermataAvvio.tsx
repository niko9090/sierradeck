import type { Avanzamento } from '@shared/types'
import { descriviAvanzamento } from '../avanzamento-vista'

/**
 * Quello che si vede mentre il programma si prepara.
 *
 * La prima lettura delle trascrizioni dura minuti — 776 MB sulla macchina di
 * riferimento — e finora l'unico segno era una riga di testo dentro una
 * finestra già piena: indistinguibile da un programma bloccato. Qui l'attesa ha
 * un numero che cresce, il nome di ciò che sta leggendo e la sua percentuale.
 *
 * Dalla seconda volta in poi quasi tutto viene ripreso dall'indice e questa
 * schermata passa in un lampo: è il segno che il lavoro di prima è servito.
 */
export function SchermataAvvio({ avanzamento }: { avanzamento: Avanzamento | undefined }): React.JSX.Element {
  const v = descriviAvanzamento(avanzamento ?? { fase: 'scansione', done: 0, total: 0, riusate: 0 })

  return (
    <div className="avvio">
      <div className="avvio__corpo">
        <div className="avvio__marchio">
          {/* Lo stesso simbolo dell'icona: chi ha lanciato il programma dal
              menu Start ritrova qui la cosa che ha premuto. */}
          <svg className="avvio__segno" viewBox="0 0 512 512" aria-hidden="true">
            <path d="M268 92 L392 306 L268 306 Z" fill="#dfe3e7"/>
            <path d="M268 92 L132 306 L268 306 Z" fill="#7d858d"/>
            <path d="M132 306 L268 306 L200 412 Z" fill="#525a62"/>
            <path d="M268 306 L392 306 L326 412 Z" fill="#363d44"/>
            <path d="M200 412 L326 412 L268 306 Z" fill="#252b31"/>
            <path d="M268 92 L312 168 L268 168 Z" fill="#54c07a"/>
          </svg>
          <span className="serigrafia avvio__nome">SierraDeck</span>
        </div>

        <p className="avvio__titolo">{v.titolo}</p>

        <div className="avvio__barra" role="progressbar" aria-valuenow={v.percento ?? undefined}>
          {/* Senza totale la barra non finge una posizione: scorre, e dice
              «sto lavorando» invece di «sono a un terzo». */}
          <span
            className={v.percento === undefined ? 'avvio__riempimento avvio__riempimento--incerto' : 'avvio__riempimento'}
            style={v.percento === undefined ? undefined : { width: `${v.percento}%` }}
          />
        </div>

        <div className="avvio__numeri">
          <span className="avvio__percento">{v.percento === undefined ? '—' : `${v.percento}%`}</span>
          <span className="misura">{v.conteggio ?? ''}</span>
          <span style={{ flex: 1 }} />
          {v.dettaglio !== undefined ? <span className="misura">{v.dettaglio}</span> : null}
        </div>

        {/* Il nome del progetto in lettura: è ciò che rende visibile che il
            lavoro avanza davvero, anche quando la percentuale si muove piano. */}
        <p className="avvio__dove">{v.dove ?? ' '}</p>
      </div>
    </div>
  )
}
