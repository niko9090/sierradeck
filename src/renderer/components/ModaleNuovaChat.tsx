import { useEffect, useState } from 'react'
import {
  componiNuovaChat, nomeCartellaDaNome, unisciPercorso, validaNuovaChat,
  type BasiCartelle, type PostoChat, type PropostaChat
} from '../nuova-chat'

type Props = {
  proposta: PropostaChat
  onApri: (cartella: string, nome: string, opzioni: { sulDrive: boolean }) => void
  onAnnulla: () => void
}

/**
 * Come si chiama e dove sta, prima di aprire la chat.
 *
 * Prima si chiedeva **una cartella che doveva già esistere**, e il nome le
 * andava dietro: per una chat nuova voleva dire aprire Esplora risorse,
 * creare una cartella, tornare qui, sfogliare. Nicholas (2026-09-08): «le
 * chat di default si aprono nella cartella Documenti con il nome della chat;
 * se la cartella non esiste verrà creata; se si preme "fra i progetti" va in
 * Documenti nella cartella dei progetti SierraDeck».
 *
 * Adesso prima viene il nome, che diventa anche il nome della cartella, e poi
 * il posto, con tre scelte: Documenti (predefinita), la cartella dei progetti
 * SierraDeck (quella dove arrivano i progetti dal Drive, con la casella per
 * metterla subito sul Drive), o altrove — il campo libero con «Sfoglia…» di
 * prima, per chi ha già una cartella. Nei primi due casi la cartella si crea
 * al momento; nel terzo deve esistere, come prima: un percorso scritto a mano
 * con un errore non deve diventare una cartella a caso.
 */
export function ModaleNuovaChat({ proposta, onApri, onAnnulla }: Props): React.JSX.Element {
  const [nome, setNome] = useState('')
  const [posto, setPosto] = useState<PostoChat>('documenti')
  const [altrove, setAltrove] = useState(proposta.cartella)
  const [basi, setBasi] = useState<BasiCartelle | undefined>(undefined)
  const [esiste, setEsiste] = useState<boolean | undefined>(undefined)
  const [drivePronto, setDrivePronto] = useState(false)
  const [sulDrive, setSulDrive] = useState(false)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const [apro, setApro] = useState(false)

  useEffect(() => {
    void window.gestore.sistema.cartelleBase().then(setBasi).catch(() => undefined)
    void window.gestore.sync.stato().then((s) => {
      const pronto = s.driveConnesso && s.sbloccato
      setDrivePronto(pronto)
      setSulDrive(pronto)
    }).catch(() => undefined)
  }, [])

  const esito = basi === undefined
    ? { ok: false as const, motivo: 'Un attimo…' }
    : componiNuovaChat({ nome, posto, altrove, basi })
  const daControllare = esito.ok && posto === 'altrove' ? esito.cartella : undefined

  // Solo «altrove» si controlla: le altre due si creano. L'ultima risposta
  // vince, perche' digitando in fretta tornano fuori ordine.
  useEffect(() => {
    if (daControllare === undefined) { setEsiste(undefined); return }
    let annullato = false
    window.gestore.sistema
      .cartellaEsiste(daControllare)
      .then((c) => { if (!annullato) setEsiste(c) })
      .catch(() => { if (!annullato) setEsiste(undefined) })
    return () => { annullato = true }
  }, [daControllare])

  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') onAnnulla() }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onAnnulla])

  const pronta = esito.ok && (posto !== 'altrove' || esiste === true) && !apro

  const apri = (): void => {
    if (!esito.ok || !pronta) return
    const { cartella, nome: titolo } = esito
    setErrore(undefined)
    if (posto === 'altrove') {
      onApri(cartella, titolo, { sulDrive: false })
      return
    }
    setApro(true)
    void window.gestore.sistema.creaCartella(cartella).then((fatta) => {
      setApro(false)
      if (!fatta) { setErrore('Non sono riuscito a creare la cartella: controlla il nome.'); return }
      onApri(cartella, titolo, { sulDrive: posto === 'progetti' && drivePronto && sulDrive })
    }).catch((e: unknown) => { setApro(false); setErrore(String(e)) })
  }

  const sfoglia = (): void => {
    void window.gestore.sistema
      .scegliCartella()
      .then((scelta) => {
        if (scelta === undefined) return
        setAltrove(scelta)
        setPosto('altrove')
      })
      .catch(() => undefined)
  }

  const cartellaNome = nomeCartellaDaNome(nome)
  const anteprima = (p: PostoChat): string => {
    if (basi === undefined) return '…'
    if (p === 'documenti') return unisciPercorso(basi.documenti, cartellaNome)
    if (p === 'progetti') return unisciPercorso(basi.progetti, cartellaNome)
    return validaNuovaChat({ cartella: altrove, nome }).ok ? altrove.trim() : ''
  }
  const scelta = (p: PostoChat, titolo: string, sotto: string): React.JSX.Element => (
    <label className={`nuova-chat__posto${posto === p ? ' nuova-chat__posto--scelto' : ''}`}>
      <input type="radio" name="nuova-chat-posto" checked={posto === p} onChange={() => setPosto(p)} />
      <span>
        <span className="nuova-chat__posto-titolo">{titolo}</span>
        <span className="nuova-chat__posto-sotto">{sotto}</span>
      </span>
    </label>
  )

  return (
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget) onAnnulla() }}>
      <div className="dialogo dialogo--medio" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialogo__testa">
          <span className="serigrafia">Nuova chat</span>
          <span style={{ flex: 1 }} />
          <button className="tasto" onClick={onAnnulla}>Annulla</button>
        </div>

        <label className="serigrafia" htmlFor="nuova-chat-nome">Come si chiama</label>
        <input
          id="nuova-chat-nome"
          className="campo"
          style={{ width: '100%', margin: '4px 0 2px' }}
          value={nome}
          autoFocus
          placeholder="Il nome della chat, che è anche quello della cartella"
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') apri() }}
        />
        <div className="misura" style={{ minHeight: 18, marginBottom: 10 }}>
          {posto === 'altrove' ? 'Lasciandolo vuoto prende il nome della cartella.' : `La cartella si chiamerà «${cartellaNome}».`}
        </div>

        <span className="serigrafia">Dove sta</span>
        <div className="nuova-chat__posti">
          {scelta('documenti', 'In Documenti', anteprima('documenti'))}
          {scelta('progetti', 'Fra i progetti SierraDeck', anteprima('progetti'))}
          {scelta('altrove', 'Altrove', posto === 'altrove' ? '' : (anteprima('altrove') || 'una cartella che esiste già'))}
        </div>
        {posto === 'progetti' ? (
          <label className="account__toggle" style={{ margin: '4px 0 6px 26px' }} title={drivePronto ? 'La cartella viaggia con le sue chat sugli altri PC' : 'Serve il Drive collegato e la cassaforte sbloccata'}>
            <input type="checkbox" checked={drivePronto && sulDrive} disabled={!drivePronto} onChange={(e) => setSulDrive(e.target.checked)} />
            <span>e mettila sul Drive{drivePronto ? '' : ' (Drive non pronto)'}</span>
          </label>
        ) : null}
        {posto === 'altrove' ? (
          <div style={{ display: 'flex', gap: 6, margin: '4px 0 2px 26px' }}>
            <input
              id="nuova-chat-cartella"
              className="campo"
              style={{ flex: 1 }}
              value={altrove}
              spellCheck={false}
              placeholder="C:\Progetti\il-mio-progetto"
              onChange={(e) => setAltrove(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') apri() }}
            />
            <button className="tasto" onClick={sfoglia}>Sfoglia…</button>
          </div>
        ) : null}
        <div className="misura" style={{ minHeight: 18, margin: '4px 0 12px' }}>
          {errore !== undefined
            ? <span style={{ color: 'var(--ambra)' }}>{errore}</span>
            : !esito.ok
              ? <span style={{ color: 'var(--ambra)' }}>{esito.motivo}</span>
              : posto === 'altrove'
                ? (esiste === false
                    ? <span style={{ color: 'var(--ambra)' }}>Questa cartella non esiste.</span>
                    : esiste === true ? <span>La chat vivrà qui, e ci resterà legata.</span> : <span>Controllo…</span>)
                : <span>La chat vivrà in <b>{esito.cartella}</b>{esito.daCreare ? ' (la creo adesso)' : ''}, e ci resterà legata.</span>}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="tasto tasto--primario" onClick={apri} disabled={!pronta}>
            {apro ? 'Creo la cartella…' : 'Apri la chat'}
          </button>
        </div>
      </div>
    </div>
  )
}
