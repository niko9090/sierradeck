import { useEffect, useState } from 'react'
import { voceMenu } from '@shared/menu-principale'
import { COMANDI_CHAT_WORKSPACE, GRUPPI_COMANDI, fraseStatoAltroPc, righeAltriPc, type IdComando, type PcVisto, type RigaAltroPc } from '@shared/chat-workspace'
import type { StatoSottofondo } from '@shared/sottofondo'
import { Aiuto } from './Aiuto'
import type { PannelloAperto } from './Console'

type Props = {
  /** I workspace: quanti sono e dove sei. */
  workspace: { nomi: string[]; attivo: string }
  onApriSessioni: () => void
  onApri: (quale: PannelloAperto) => void
  onChiudi: () => void
}

/** Le chat usate da altri PC: una riga ciascuna, con lo stato del PC e i due gesti. Niente DOM proprio: si prova con renderToStaticMarkup. */
export function ElencoChatAltriPc({ righe, onMostra, onChiudiChat }: {
  righe: readonly RigaAltroPc[]
  onMostra: (sessione: string) => void
  onChiudiChat: (sessione: string) => void
}): React.JSX.Element {
  if (righe.length === 0) return <p className="misura">Nessuna chat è usata da altri PC.</p>
  return (
    <ul className="hub__elenco">
      {righe.map((r) => (
        <li key={r.sessione} className="hub__voce">
          <span>
            <strong>{r.titolo}</strong> · {r.pc} · {r.cosa}
            <span className="misura"> · {fraseStatoAltroPc(r)}</span>
          </span>
          <button className="tasto" onClick={() => onMostra(r.sessione)}>Mostra qui</button>
          <button className="tasto" onClick={() => onChiudiChat(r.sessione)}>Chiudi</button>
        </li>
      ))}
    </ul>
  )
}

/**
 * **Chat e workspace**: l'unico posto dei comandi su chat e workspace (k-u4).
 * Ogni comando sta qui una volta sola; nella fascia in alto resta solo
 * «+ Nuova chat». Cosa fa ognuno si legge dal suo «?».
 */
export function PannelloChat({ workspace, onApriSessioni, onApri, onChiudi }: Props): React.JSX.Element {
  const [altri, setAltri] = useState<RigaAltroPc[]>([])
  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') onChiudi() }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi])
  useEffect(() => {
    let vivo = true
    const leggi = (): void => {
      const g = window.gestore
      if (typeof g?.sottofondo?.elenco !== 'function') return
      void Promise.all([
        g.sottofondo.elenco(),
        typeof g.remoto?.pc === 'function' ? g.remoto.pc().then((x) => x.pc, () => []) : Promise.resolve([])
      ]).then(([chat, pc]) => {
        if (vivo) setAltri(righeAltriPc(chat as StatoSottofondo[], pc as PcVisto[], Date.now()))
      }).catch(() => undefined)
    }
    leggi()
    const t = setInterval(leggi, 10_000)
    let off: (() => void) | undefined
    if (typeof window.gestore?.sottofondo?.suCambiato === 'function') off = window.gestore.sottofondo.suCambiato(leggi)
    return () => { vivo = false; clearInterval(t); off?.() }
  }, [])
  const v = voceMenu('chat')
  const esegui = (id: IdComando): void => {
    switch (id) {
      case 'nuova-chat': onChiudi(); window.dispatchEvent(new Event('sierradeck:nuova-chat')); return
      case 'riprendi': onChiudi(); onApriSessioni(); return
      case 'spazio': onChiudi(); window.dispatchEvent(new CustomEvent('sierradeck:gestione-chat', { detail: 'spazio' })); return
      case 'workspace': onApri('workspace'); return
      case 'panoramica': onChiudi(); window.dispatchEvent(new CustomEvent('sierradeck:vista-elenco', { detail: { nome: workspace.attivo } })); return
      case 'nuova-finestra': window.gestore.finestre.nuova(); return
      case 'negozio': onApri('negozio'); return
    }
  }
  return (
    <div className="pannello">
      <div className="pannello__testa">
        <span className="serigrafia">{v.icona} {v.nome}</span>
        <Aiuto di={v.nome}>{v.spiega}</Aiuto>
        <span className="misura">workspace «{workspace.attivo}» · {workspace.nomi.length} in tutto</span>
        <span style={{ flex: 1 }} />
        <button className="tasto" onClick={onChiudi}>Chiudi</button>
      </div>
      <div className="hub">
        {GRUPPI_COMANDI.map((g) => (
          <div key={g.id} className="hub__gruppo">
            <h4 className="hub__titolo">{g.titolo}</h4>
            {COMANDI_CHAT_WORKSPACE.filter((c) => c.gruppo === g.id).map((c) => (
              <div key={c.id} className="hub__voce">
                <button className={c.id === 'nuova-chat' ? 'tasto tasto--primario' : 'tasto'} onClick={() => esegui(c.id)}>{c.etichetta}</button>
                <Aiuto>{c.spiega}</Aiuto>
              </div>
            ))}
          </div>
        ))}
        <div className="hub__gruppo">
          <h4 className="hub__titolo">Chat degli altri PC</h4>
          <Aiuto>Chat di questo PC che un altro PC (o il telefono) sta usando. «Mostra qui» la porta in un riquadro senza riavviarla; «Chiudi» la ferma, la conversazione resta.</Aiuto>
          <ElencoChatAltriPc
            righe={altri}
            onMostra={(s) => { void window.gestore.sottofondo.mostra(s) }}
            onChiudiChat={(s) => { void window.gestore.sottofondo.chiudi(s) }}
          />
        </div>
      </div>
    </div>
  )
}
