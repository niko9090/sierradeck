import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { StatoAggiornamento } from '../../main/aggiornamenti'
import type { NoteAggiornamento } from '@shared/note-aggiornamento'
import type { VistaNovita } from '@shared/finestra-novita'
import { VistaAggiornamenti, type MarchioAggiornamenti } from '../../renderer/components/FinestraAggiornamenti'
import { novitaDaTesto } from '../novita-aiutante'
import sorgenteNovita from '../novita-aiutante.txt?raw'
import logo from '../../../build/icon.png'
import '../../renderer/console.css'
import '../../renderer/studio.css'

/**
 * La finestra degli aggiornamenti dell'Aiutante (13/11, 1.0.3): la stessa del
 * programma completo (`VistaAggiornamenti`), con il nome, il simbolo e il
 * registro dell'Aiutante. Lo stato arriva già nella forma della finestra
 * (`perLaFinestra` in `regole.ts`).
 */

type Risposta = { agg: StatoAggiornamento; versione: string; scaricaAuto: boolean; inCorso: number; tavolozza: Record<string, string> }
type Api = {
  stato: () => Promise<Risposta>
  suStato: (f: (s: Risposta) => void) => () => void
  note: () => Promise<NoteAggiornamento | undefined>
  installa: (confermato: boolean) => Promise<{ esito: 'installa' } | { esito: 'conferma'; domanda: string } | { esito: 'no'; motivo: string }>
  scarica: () => Promise<unknown>
  cerca: () => Promise<unknown>
  nascondi: () => Promise<unknown>
  letto: () => Promise<unknown>
  apriPagina: (url: string) => Promise<unknown>
}

const api = (window as unknown as { aiutanteAggiornamenti: Api }).aiutanteAggiornamenti
// I link nelle note (`Pezzi`) aprono la pagina con il ponte del programma completo: qui c'è solo questo.
;(window as unknown as { gestore: unknown }).gestore = { sistema: { apriEsterno: (url: string) => api.apriPagina(url) } }

const NOVITA_AIUTANTE = novitaDaTesto(sorgenteNovita)
const VISTA: VistaNovita = { tipo: 'aggiornamento' }

function marchio(inCorso: number): MarchioAggiornamenti {
  return {
    nome: 'SierraDeck Aiutante',
    logo: <img className="fnov__segno" src={logo} alt="" />,
    testoInstalla: 'Installa adesso',
    notaPronto: inCorso > 0
      ? `Scaricata. Si installa da sola appena finiscono i lavori (${inCorso} in corso), o subito con «Installa adesso».`
      : 'Scaricata. Si installa da sola fra poco, o subito con «Installa adesso».',
    aiutoInstalla: <>Smetto di prendere lavori nuovi, chiudo l’Aiutante, installo e riparto da solo. I lavori in corso si fermano: li riprende un altro PC della rete. «Più tardi»: si installa da sola appena non gira nessun lavoro.</>,
    novita: NOVITA_AIUTANTE,
    riapri: 'Si riapre dalla finestra dell’Aiutante o dal menu dell’icona'
  }
}

function Finestra(): React.JSX.Element {
  const [r, setR] = useState<Risposta>({ agg: { fase: 'fermo' }, versione: '', scaricaAuto: true, inCorso: 0, tavolozza: {} })
  const [note, setNote] = useState<{ per: string; note: NoteAggiornamento } | undefined>(undefined)
  useEffect(() => {
    const applica = (x: Risposta): void => {
      setR(x)
      for (const [nome, valore] of Object.entries(x.tavolozza)) document.documentElement.style.setProperty(nome, valore)
    }
    api.stato().then(applica).catch(() => undefined)
    const via = api.suStato(applica)
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') void api.nascondi() }
    window.addEventListener('keydown', suTasto)
    return () => { via(); window.removeEventListener('keydown', suTasto) }
  }, [])
  const nuova = ['disponibile', 'scarico', 'pronto', 'installo'].includes(r.agg.fase) ? r.agg.versione ?? '' : ''
  useEffect(() => {
    if (nuova === '') return
    let vivo = true
    api.note().then((n) => { if (vivo && n !== undefined) setNote({ per: nuova, note: n }) }).catch(() => undefined)
    return () => { vivo = false }
  }, [nuova])
  const installa = async (): Promise<void> => {
    const e = await api.installa(false)
    if (e.esito === 'conferma' && window.confirm(e.domanda)) await api.installa(true)
  }
  return (
    <div onPointerDown={() => { void api.letto() }} style={{ display: 'contents' }}>
      <VistaAggiornamenti
        agg={r.agg}
        vista={VISTA}
        versione={r.versione}
        scaricaAuto={r.scaricaAuto}
        note={note !== undefined && note.per === nuova ? note.note : undefined}
        marchio={marchio(r.inCorso)}
        azioni={{
          chiudi: () => { void api.nascondi() },
          installa: () => { void installa() },
          aggiornaAdesso: () => { void installa() },
          scarica: () => { void api.scarica() },
          cerca: () => { void api.cerca() },
          apri: (url) => { void api.apriPagina(url) }
        }}
      />
    </div>
  )
}

const el = document.getElementById('root')
if (el !== null) createRoot(el).render(<Finestra />)
