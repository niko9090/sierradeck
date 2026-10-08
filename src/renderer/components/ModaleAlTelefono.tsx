import { createPortal } from 'react-dom'
import { useCallback, useEffect, useState } from 'react'
import { inCorso, misura, type EsitoMandaAlTelefono, type StatoAlTelefono } from '@shared/file-telefono'

/**
 * «📱 Manda al telefono» (0.54.0): da qui un file del PC va al telefono.
 *
 * Il file si copia in una coda per **quel** telefono: arriva quando l'app si
 * collega a questo PC (aperta, o al controllo in sottofondo), anche se adesso
 * il telefono è spento o fuori casa. Sotto, la coda con lo stato di ogni file
 * e «Annulla» finché non è arrivato. Senza file (`nome` assente) è solo la coda.
 */
export function ModaleAlTelefono({
  nome,
  manda,
  onChiudi
}: {
  /** Il file da mandare, come lo si legge; assente = solo la coda. */
  nome?: string
  manda?: (telefono: string, nota: string) => Promise<EsitoMandaAlTelefono>
  onChiudi: () => void
}): React.JSX.Element {
  const [stato, setStato] = useState<StatoAlTelefono | undefined>(undefined)
  const [telefono, setTelefono] = useState<string | undefined>(undefined)
  const [nota, setNota] = useState('')
  const [lavoro, setLavoro] = useState(false)
  const [esito, setEsito] = useState<{ ok: boolean; testo: string } | undefined>(undefined)

  const leggi = useCallback((): void => {
    window.gestore.alTelefono.stato().then((s) => {
      setStato(s)
      // Il predefinito: quello che si è fatto vivo per ultimo.
      setTelefono((t) => t ?? [...s.telefoni].sort((a, b) => (b.ultimoAccesso ?? '').localeCompare(a.ultimoAccesso ?? ''))[0]?.chiave)
    }).catch(() => undefined)
  }, [])
  useEffect(() => {
    leggi()
    return window.gestore.alTelefono.quandoCambia(leggi)
  }, [leggi])
  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') onChiudi() }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi])

  const invia = (): void => {
    if (manda === undefined || telefono === undefined) return
    setLavoro(true)
    setEsito(undefined)
    manda(telefono, nota.trim())
      .then((e) => setEsito(e.ok ? { ok: true, testo: 'In coda: arriva quando l’app si collega a questo PC. Lo stato è qui sotto.' } : { ok: false, testo: e.errore }))
      .catch((e: unknown) => setEsito({ ok: false, testo: e instanceof Error ? e.message : String(e) }))
      .finally(() => setLavoro(false))
  }

  const finite = stato?.elenco.filter((c) => !inCorso(c)).length ?? 0

  return createPortal(
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget) onChiudi() }}>
      <div className="dialogo dialogo--medio al-tel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialogo__testa">
          <span className="serigrafia">📱 {nome !== undefined ? `Manda al telefono: ${nome}` : 'File per il telefono'}</span>
          <span style={{ flex: 1 }} />
          <button className="tasto tasto--mini" onClick={onChiudi} aria-label="Chiudi">×</button>
        </div>
        {nome !== undefined ? (
          <>
            <p className="misura" style={{ lineHeight: 1.5 }}>
              Il file si copia in una coda per il telefono che scegli e arriva quando l’app SierraDeck si collega a questo PC: subito se è aperta,
              altrimenti al prossimo controllo in sottofondo. Se il telefono è spento o fuori casa, aspetta qui (fino a due settimane) e arriva dopo.
              Sul telefono compare una notifica con Apri, Salva e Condividi. Limite: 100 MB per file, 30 file in attesa per telefono.
            </p>
            {stato !== undefined && stato.telefoni.length === 0 ? (
              <div className="avviso">Nessun telefono accoppiato a questo PC. Collega l’app da Impostazioni → Client (il codice o il QR), poi riprova.</div>
            ) : null}
            <div className="al-tel__telefoni" role="radiogroup" aria-label="A quale telefono">
              {stato?.telefoni.map((t) => (
                <label key={t.chiave} className="al-tel__telefono">
                  <input type="radio" name="al-tel" checked={telefono === t.chiave} onChange={() => setTelefono(t.chiave)} />
                  <b>{t.nome}</b>
                  <span className="misura">
                    {t.via === 'accoppiato' ? ' · accoppiato a questo PC' : ' · accoppiato a un altro PC: lo riceve passando da lì'}
                    {t.ultimoAccesso !== undefined ? ` · visto l’ultima volta ${new Date(t.ultimoAccesso).toLocaleString('it-IT')}` : ''}
                  </span>
                </label>
              ))}
            </div>
            <input
              className="campo"
              placeholder="Una nota, facoltativa: compare nella notifica (per esempio cosa contiene)"
              value={nota}
              maxLength={500}
              onChange={(e) => setNota(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') invia() }}
              style={{ width: '100%', margin: '8px 0' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="tasto" onClick={onChiudi}>Chiudi</button>
              <button className="tasto tasto--primario" disabled={lavoro || telefono === undefined} onClick={invia}>
                {lavoro ? 'Copio il file…' : '📱 Manda'}
              </button>
            </div>
            {esito !== undefined ? <div className={esito.ok ? 'misura' : 'avviso'} style={{ marginTop: 8 }}>{esito.ok ? '✓ ' : '⚠ '}{esito.testo}</div> : null}
          </>
        ) : null}
        <div className="al-tel__coda">
          <div className="dialogo__testa" style={{ marginTop: 12 }}>
            <span className="serigrafia">La coda</span>
            <span style={{ flex: 1 }} />
            {finite > 0 ? <button className="tasto tasto--mini" onClick={() => { window.gestore.alTelefono.pulisci().then(setStato).catch(() => undefined) }}>Togli le finite ({finite})</button> : null}
          </div>
          {stato === undefined ? <p className="misura">Leggo la coda…</p> : null}
          {stato !== undefined && stato.elenco.length === 0 ? <p className="misura">Nessun file mandato al telefono nell’ultima settimana.</p> : null}
          <ul className="al-tel__elenco">
            {stato?.elenco.map((c) => (
              <li key={c.id} className={`al-tel__voce al-tel__voce--${c.stato}`}>
                <div>
                  <b>{c.nome}</b> <span className="misura">· {misura(c.byte)} · {c.da === 'chat' ? `chiesto dalla chat «${c.daChat ?? ''}»` : 'dal PC'}</span>
                </div>
                <div className="misura">{c.testo}</div>
                <div className="misura" title={c.origine}>da {c.origine}</div>
                {inCorso(c) ? (
                  <button className="tasto tasto--mini" onClick={() => { window.gestore.alTelefono.annulla(c.id).then(setStato).catch(() => undefined) }}>
                    Annulla
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  , document.body)
}
