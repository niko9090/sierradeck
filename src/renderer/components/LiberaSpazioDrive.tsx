import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Aiuto } from './Aiuto'
import {
  FRASE_GROSSO_FUORI, drivePienoDa, eseguiPasso, grossoFuoriDaSierraDeck, passiDa, percentualeDrive, ripartizioneDrive, righeDa, riepilogoFinale,
  type ApiLiberaSpazio, type EsitoMemoria, type InSospesoVista, type RigaPasso, type StatoPasso
} from '@shared/libera-spazio'
import { ETICHETTA_SPAZIO, RECUPERO_DRIVE_PIENO_DEFAULT, TIPI_SPAZIO, byteLeggibili, type QuotaMisurata, type StatoSpazio } from '@shared/spazio-drive'

const PAROLA: Record<StatoPasso, string> = { 'da-fare': 'da fare', 'in-corso': 'in corso…', fatto: 'fatto', saltato: 'saltato', errore: 'errore' }
const COLORE: Record<StatoPasso, string> = { 'da-fare': 'var(--testo-quieto, #9aa1a9)', 'in-corso': 'var(--blu)', fatto: 'var(--verde)', saltato: 'var(--testo-quieto, #9aa1a9)', errore: 'var(--rosso)' }

/** Lo stesso `api` che usa la pagina del telefono, qui sopra l'IPC del PC. */
const apiDelPc: ApiLiberaSpazio = {
  stato: (forza) => window.gestore.casa.spazio.stato(forza),
  quota: (forza) => window.gestore.casa.spazio.quota(forza),
  azione: (corpo) => window.gestore.casa.azione(corpo)
}

function Barra({ percentuale }: { percentuale: number | undefined }): React.JSX.Element {
  const p = percentuale ?? 0
  const colore = p >= 95 ? 'var(--rosso)' : p >= 80 ? 'var(--ambra)' : 'var(--verde)'
  return (
    <span style={{ display: 'block', height: 10, background: 'var(--bordo, #333)', borderRadius: 5, overflow: 'hidden' }} role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ display: 'block', height: '100%', width: `${Math.max(percentuale === undefined ? 0 : 1, p)}%`, background: colore }} />
    </span>
  )
}

/** La misura: la barra del Drive, Google contro SierraDeck, SierraDeck per tipo. */
function Misura({ q, titolo }: { q: QuotaMisurata | undefined; titolo: string }): React.JSX.Element {
  if (q === undefined) return <div className="account__nota">Non riesco a leggere la quota del Drive.</div>
  const p = percentualeDrive(q)
  const r = ripartizioneDrive(q)
  const massimo = Math.max(1, ...TIPI_SPAZIO.map((t) => q.sierraDeck.perTipo[t].byte))
  return (
    <div style={{ marginTop: 4 }}>
      <div className="account__nota"><b>{titolo}</b>: {p !== undefined ? <b style={{ fontSize: 15 }}>{String(p).replace('.', ',')}%</b> : 'limite non noto'} · {byteLeggibili(q.usato)}{q.limite !== undefined ? ` di ${byteLeggibili(q.limite)}` : ''}</div>
      <Barra percentuale={p} />
      <div className="account__nota" style={{ marginTop: 4 }}>
        Google (Gmail, Foto, altri file): <b>{byteLeggibili(r.fuori)}</b> · SierraDeck: <b>{byteLeggibili(r.sierraDeck)}</b> in {q.sierraDeck.file} file
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '2px 8px', alignItems: 'center', marginTop: 4 }}>
        {TIPI_SPAZIO.filter((t) => q.sierraDeck.perTipo[t].file > 0).map((t) => (
          <div key={t} style={{ display: 'contents' }}>
            <span className="account__nota">{ETICHETTA_SPAZIO[t]}</span>
            <span style={{ height: 6, background: 'var(--bordo, #333)', borderRadius: 3, overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${Math.max(1, (q.sierraDeck.perTipo[t].byte / massimo) * 100)}%`, background: 'var(--verde)' }} />
            </span>
            <span className="account__nota" style={{ textAlign: 'right' }}>{byteLeggibili(q.sierraDeck.perTipo[t].byte)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * «Libera spazio sul Drive» (0.99): la procedura guidata. Misura, poi i passi
 * in ordine (versioni vecchie, chat non usate, doppie, recupero), ognuno con
 * la sua conferma, il suo stato e i byte prima e dopo; in fondo la nuova
 * misura. Le regole sono in `@shared/libera-spazio` (le usa anche la pagina
 * del telefono). Si apre da «Spazio sul Drive» e dall'avviso «Drive pieno».
 */
export function LiberaSpazioDrive({ onChiudi, drivePieno = false, api = apiDelPc }: { onChiudi: () => void; drivePieno?: boolean; api?: ApiLiberaSpazio }): React.JSX.Element {
  const [iniziale, setIniziale] = useState<QuotaMisurata | undefined>(undefined)
  const [quota, setQuota] = useState<QuotaMisurata | undefined>(undefined)
  const [stato, setStato] = useState<StatoSpazio | undefined>(undefined)
  const [letto, setLetto] = useState(false)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const [memoria, setMemoria] = useState<Record<string, EsitoMemoria | undefined>>({})
  const [contate, setContate] = useState(false)
  const [confermaDi, setConfermaDi] = useState<string | undefined>(undefined)
  const [occupato, setOccupato] = useState(false)
  const [sospese, setSospese] = useState<InSospesoVista[]>([])
  const [esitoRiprova, setEsitoRiprova] = useState<string | undefined>(undefined)
  const primaVolta = useRef(true)

  const misura = useCallback(async (): Promise<void> => {
    try {
      const q = await api.quota(true)
      const st = await api.stato(false)
      setQuota(q)
      setStato(st)
      if (primaVolta.current) { primaVolta.current = false; setIniziale(q) }
      setErrore(st?.errore)
      setSospese(await window.gestore.casa.spazio.inSospeso().catch(() => []))
    } catch (e) { setErrore(`Non riesco a misurare il Drive: ${e instanceof Error ? e.message : String(e)}`) } finally { setLetto(true) }
  }, [api])
  useEffect(() => { void misura() }, [misura])
  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape' && !occupato) onChiudi() }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi, occupato])

  const piena = drivePienoDa(quota, drivePieno)
  const passi = useMemo(() => passiDa(stato, { contate, drivePieno: piena, recupero: RECUPERO_DRIVE_PIENO_DEFAULT }), [stato, contate, piena])
  const righe = useMemo(() => righeDa(passi, memoria), [passi, memoria])
  const fuori = grossoFuoriDaSierraDeck(quota)

  const fai = async (r: RigaPasso): Promise<void> => {
    setConfermaDi(undefined)
    setOccupato(true)
    setMemoria((m) => ({ ...m, [r.id]: { stato: 'in-corso', passo: r } }))
    const e = await eseguiPasso(r, api, { recupero: RECUPERO_DRIVE_PIENO_DEFAULT })
    if (e.contate === true) setContate(true)
    setMemoria((m) => ({ ...m, [r.id]: { ...e, passo: r } }))
    await misura()
    setOccupato(false)
  }

  const riprova = async (): Promise<void> => {
    setOccupato(true)
    try {
      const e = await window.gestore.casa.spazio.riprendi()
      setEsitoRiprova(e.ancoraInSospeso === 0 ? 'Finito tutto.' : `${e.riprese} finite, ${e.ancoraInSospeso} ancora in attesa: il Drive non accetta ancora scritture.`)
    } catch (err) { setEsitoRiprova(`Non riuscito: ${err instanceof Error ? err.message : String(err)}`) }
    await misura()
    setOccupato(false)
  }

  const fine = riepilogoFinale(iniziale, quota, sospese.length)
  const toccato = Object.values(memoria).some((m) => m !== undefined && (m.stato === 'fatto' || m.stato === 'errore'))

  return (
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget && !occupato) onChiudi() }}>
      <div className="dialogo dialogo--medio" onMouseDown={(e) => e.stopPropagation()} style={{ maxHeight: '86vh', display: 'flex', flexDirection: 'column' }}>
        <div className="dialogo__testa" style={{ alignItems: 'baseline', gap: 10 }}>
          <span className="led led--lavoro" />
          <span className="serigrafia">Libera spazio sul Drive</span>
          <Aiuto di="Libera spazio sul Drive">
            Prima misura quanto è pieno il Drive del tuo account Google e quanto ne usa SierraDeck. Poi propone dei passi, uno alla volta,
            dal più sicuro: ognuno dice cosa fa, quanto libera (una stima), se si può annullare, e chiede la tua conferma.
            Le chat tolte dal Drive restano sul PC. Quello che va nel recupero si può annullare per 30 giorni, ma lo spazio si libera
            solo quando il recupero si svuota. A Drive pieno il recupero non libera niente: per questo, di solito, i file si cancellano subito dal Drive
            (la copia resta sul PC). Una pulizia lasciata a metà, perché il Drive non accetta ancora scritture, si finisce da sola appena si può.
          </Aiuto>
        </div>

        <div style={{ overflowY: 'auto', paddingRight: 6, margin: '4px 0 8px' }}>
          {!letto ? <div className="account__nota">Misuro il Drive…</div> : null}
          {errore !== undefined ? <div className="account__nota" style={{ color: 'var(--ambra)' }}>{errore}</div> : null}
          {letto ? <Misura q={iniziale ?? quota} titolo={toccato ? 'Prima' : 'Adesso'} /> : null}
          {piena ? <div className="account__nota" style={{ color: 'var(--ambra)', marginTop: 6 }}>Il Drive è pieno: non accetta scritture.</div> : null}
          {fuori ? (
            <div className="account__nota" style={{ marginTop: 6, color: 'var(--ambra)' }}>
              {FRASE_GROSSO_FUORI}
              {quota?.nelCestino !== undefined && quota.nelCestino > 0 ? ` Nel cestino di Google: ${byteLeggibili(quota.nelCestino)}.` : ''}
            </div>
          ) : null}

          {letto && righe.length === 0 && stato !== undefined ? <div className="account__nota" style={{ marginTop: 8 }}>Niente da liberare da qui.</div> : null}
          {righe.map((r, i) => (
            <div key={r.id} className="dove__riga" style={{ display: 'block', marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span className="riordina__testo" style={{ flex: 1 }}>
                  <b>{i + 1}. {r.titolo}</b> <span className="account__nota">· {r.breve}</span>
                </span>
                <Aiuto di={r.titolo}>{r.spiega}</Aiuto>
                <span className="progetti__pillola" style={{ color: COLORE[r.stato], borderColor: COLORE[r.stato] }}>{PAROLA[r.stato]}</span>
              </div>
              <div className="account__nota">
                {r.azione === 'conta' ? 'Non libera ancora niente' : `Libera ${r.circa ? 'circa ' : ''}${byteLeggibili(r.stima)}${r.liberaSubito ? '' : ' dopo «Svuota il recupero»'}`}
                {' · '}{r.annullabile ? 'si annulla' : 'non si annulla'}
              </div>
              {r.stato === 'fatto' || r.stato === 'errore' || r.stato === 'saltato' ? (
                <div className="account__nota" style={{ color: r.stato === 'errore' ? 'var(--rosso)' : undefined }}>
                  {r.motivo !== undefined && r.motivo !== '' ? r.motivo : null}
                  {r.prima !== undefined && r.dopo !== undefined ? ` SierraDeck sul Drive: ${byteLeggibili(r.prima)} → ${byteLeggibili(r.dopo)}.` : null}
                  {r.stato === 'fatto' && r.inSospeso === true ? ' Indice e registro si aggiornano da soli appena il Drive accetta scritture.' : null}
                </div>
              ) : null}
              {r.stato === 'da-fare' || r.stato === 'errore' ? (
                <div style={{ marginTop: 4 }}>
                  {confermaDi === r.id ? (
                    <>
                      <span className="account__nota">{r.conferma} </span>
                      <button className="tasto tasto--mini tasto--acceso" disabled={occupato} onClick={() => { void fai(r) }}>Sì: {r.bottone.toLowerCase()}</button>
                      <button className="tasto tasto--mini" onClick={() => setConfermaDi(undefined)}>No</button>
                    </>
                  ) : (
                    <button className="tasto tasto--mini" disabled={occupato} onClick={() => { if (r.azione === 'conta') void fai(r); else setConfermaDi(r.id) }}>{r.stato === 'errore' ? 'Riprova…' : `${r.bottone}${r.azione === 'conta' ? '' : '…'}`}</button>
                  )}
                </div>
              ) : null}
            </div>
          ))}

          {letto ? (
            <div style={{ marginTop: 12, borderTop: '1px solid var(--bordo, #333)', paddingTop: 8 }}>
              <Misura q={quota} titolo={toccato ? 'Adesso' : 'Misura attuale'} />
              {toccato && fine.prima !== undefined && fine.dopo !== undefined ? (
                <div className="account__nota" style={{ marginTop: 4 }}>
                  <b>Dal {String(fine.prima).replace('.', ',')}% al {String(fine.dopo).replace('.', ',')}%</b>
                  {fine.liberatiSierraDeck !== undefined ? ` · SierraDeck ha liberato ${byteLeggibili(fine.liberatiSierraDeck)}` : ''}
                  {'. Google aggiorna la quota con un po’ di ritardo.'}
                </div>
              ) : null}
              {sospese.length > 0 ? (
                <div style={{ marginTop: 6 }}>
                  <div className="account__nota" style={{ color: 'var(--ambra)' }}>
                    {sospese.length === 1 ? '1 pulizia' : `${sospese.length} pulizie`} in sospeso: {sospese.map((s) => `${s.titolo} (${byteLeggibili(s.byte)})`).join(', ')}.
                    {' '}Si finiscono da sole appena il Drive accetta scritture.
                  </div>
                  <button className="tasto tasto--mini" disabled={occupato} onClick={() => { void riprova() }}>Riprova ora</button>
                  {esitoRiprova !== undefined ? <span className="account__nota"> {esitoRiprova}</span> : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <button className="tasto" disabled={occupato} onClick={() => { void misura() }}>Misura di nuovo</button>
          <button className="tasto tasto--primario" disabled={occupato} onClick={onChiudi}>Chiudi</button>
        </div>
      </div>
    </div>
  )
}
