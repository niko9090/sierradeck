import { useCallback, useEffect, useState } from 'react'
import { MappaPc } from './MappaPc'
import type { AzioneSalute, Salute, VoceSalute } from '@shared/salute'
import { inCorso, type AvanzamentoInstallaLa } from '@shared/installa-la'
import type { NoteAggiornamento } from '@shared/note-aggiornamento'
import { ModaleNote } from './ModaleNote'

/**
 * «Salute del sistema» (0.44.0): com'è messo SierraDeck, in un posto solo.
 *
 * Il Drive (collegato o no, perché, da quando), gli altri PC (ultimo
 * battito, la strada con cui si raggiungono, la versione), l'aggiornamento
 * non riuscito, gli errori delle ultime ore dal registro, le istruzioni degli
 * autopiloti non partite. Ogni voce spiega cosa guarda e cosa fare, e ha il
 * tasto che lo fa quando si può. Le regole stanno in `src/shared/salute.ts`
 * (uguali per il telefono).
 */

type Props = {
  onChiudi: () => void
  onApriDrive: () => void
  onInstalla: () => void
  onApriAutopiloti: () => void
}

const GRUPPI: { id: VoceSalute['gruppo']; nome: string }[] = [
  { id: 'drive', nome: 'Drive' },
  { id: 'pc', nome: 'Gli altri PC' },
  { id: 'aggiornamento', nome: 'Aggiornamento' },
  { id: 'errori', nome: 'Errori delle ultime ore' },
  { id: 'consegne', nome: 'Istruzioni degli autopiloti non partite' }
]

export function PannelloSalute({ onChiudi, onApriDrive, onInstalla, onApriAutopiloti }: Props): React.JSX.Element {
  const [salute, setSalute] = useState<Salute | undefined>(undefined)
  const [leggo, setLeggo] = useState(false)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const leggi = useCallback((): void => {
    setLeggo(true)
    window.gestore.salute.leggi().then((s) => { setSalute(s); setErrore(undefined) })
      .catch((e: unknown) => setErrore(String(e))).finally(() => setLeggo(false))
  }, [])
  useEffect(() => {
    leggi()
    const t = setInterval(leggi, 60_000)
    return () => clearInterval(t)
  }, [leggi])

  // «Installa là» (0.46.0): l'avanzamento di ogni PC che si sta aggiornando da qui.
  const [installazioni, setInstallazioni] = useState<Record<string, AvanzamentoInstallaLa>>({})
  const [conferma, setConferma] = useState<{ pc: string; nome: string; versione: string; note?: NoteAggiornamento } | undefined>(undefined)
  useEffect(() => {
    void window.gestore.salute.installaLaStato().then((l) => setInstallazioni(Object.fromEntries(l.map((a) => [a.pcId, a]))))
    return window.gestore.salute.suInstallaLa((a) => {
      setInstallazioni((p) => ({ ...p, [a.pcId]: a }))
      if (a.fase === 'fatto') leggi()
    })
  }, [leggi])
  const chiediConferma = (pc: string, versione: string): void => {
    const nome = salute?.voci.find((v) => v.chiave === `pc:${pc}`)?.titolo.split(' · ')[0] ?? pc
    setConferma({ pc, nome, versione })
    window.gestore.salute.noteInstallaLa(pc)
      .then((note) => setConferma((c) => (c?.pc === pc ? { ...c, note } : c)))
      .catch((e: unknown) => setConferma((c) => (c?.pc === pc ? { ...c, note: { versione, installata: '', note: [], fonte: 'nessuna', dove: 'https://github.com/niko9090/sierradeck/releases', avviso: `Non sono riuscito a leggere le note (${String(e)}): le trovi nella pagina delle versioni, https://github.com/niko9090/sierradeck/releases. Puoi installare lo stesso.` } } : c)))
  }

  const esegui = (a: AzioneSalute): void => {
    switch (a.id) {
      case 'apri-drive': onApriDrive(); break
      case 'apri-registro': void window.gestore.log.apri(); break
      case 'installa': onInstalla(); break
      case 'scarica-a-mano': void window.gestore.sistema.apriEsterno(a.url); break
      case 'apri-autopilota': onApriAutopiloti(); break
      case 'riprova-pc': leggi(); break
      case 'installa-la': chiediConferma(a.pc, a.versione); break
    }
  }

  return (
    <div className="pannello pannello--largo">
      <div className="pannello__testa">
        <span className="serigrafia">Salute del sistema</span>
        {salute !== undefined ? <span className={`salute__tono salute__tono--${salute.tono}`}>{salute.riassunto}</span> : null}
        <span style={{ flex: 1 }} />
        <button className="tasto tasto--mini" onClick={leggi} disabled={leggo}>{leggo ? 'Guardo…' : 'Aggiorna'}</button>
        <button className="tasto tasto--mini" onClick={onChiudi}>Chiudi</button>
      </div>
      <p className="account__nota">
        Com’è messo SierraDeck su questo PC, in un posto solo: il Drive (collegato o no, perché e da quando), gli altri PC (quando si sono fatti vivi l’ultima volta, con quale strada si raggiungono adesso, che versione hanno), un aggiornamento che non si è installato, gli errori delle ultime ore scritti nel registro, le istruzioni degli autopiloti che non sono partite. Ogni voce dice cosa vuol dire e cosa fare; dove si può, il tasto lo fa. Si rilegge da solo ogni minuto; «Aggiorna» bussa di nuovo agli altri PC adesso.
      </p>
      {errore !== undefined ? <div className="avviso">⚠ Non riesco a leggere lo stato: {errore}</div> : null}
      {salute === undefined && errore === undefined ? <p className="account__nota">Guardo il Drive, busso agli altri PC e leggo il registro…</p> : null}
      <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {salute?.mappa !== undefined ? <MappaPc mappa={salute.mappa} /> : null}
        {GRUPPI.map((g) => {
          const voci = (salute?.voci ?? []).filter((v) => v.gruppo === g.id)
          if (voci.length === 0) return null
          return (
            <section key={g.id} className="salute__gruppo">
              <div className="serigrafia">{g.nome}</div>
              {voci.map((v) => (
                <div key={v.chiave} className={`salute__voce salute__voce--${v.tono}`}>
                  <div className="salute__titolo"><span className={`led ${v.tono === 'ok' ? 'led--lavoro' : v.tono === 'attenzione' ? 'led--attesa' : 'led--fermo'}`} /> {v.titolo}</div>
                  <div className="salute__testo">{v.spiegazione}</div>
                  {v.cosaFare !== undefined ? <div className="salute__testo"><b>Cosa fare:</b> {v.cosaFare}</div> : null}
                  {(() => {
                    const inst = v.chiave.startsWith('pc:') ? installazioni[v.chiave.slice(3)] : undefined
                    if (inst === undefined) return null
                    const tono = inst.fase === 'fatto' ? 'ok' : inCorso(inst) ? 'attenzione' : 'guasto'
                    return (
                      <div className={`salute__voce salute__voce--${tono}`} style={{ marginTop: 6 }}>
                        <div className="salute__titolo">
                          <span className={`led ${tono === 'ok' ? 'led--lavoro' : tono === 'attenzione' ? 'led--attesa' : 'led--fermo'}`} />
                          {' '}Installa là{inst.a !== undefined ? ` la ${inst.a}` : ''}: {inst.fase === 'fatto' ? 'fatto' : inst.fase === 'fallito' ? 'non riuscita' : inst.fase === 'errore' ? 'fermata' : 'in corso'}
                        </div>
                        <div className="salute__testo">{inst.messaggio}</div>
                        {inst.cosaFare !== undefined ? <div className="salute__testo"><b>Cosa fare:</b> {inst.cosaFare}</div> : null}
                        {inst.pagina !== undefined ? (
                          <div className="salute__azioni"><button className="tasto tasto--mini" onClick={() => { void window.gestore.sistema.apriEsterno(inst.pagina as string) }}>Pagina della versione</button></div>
                        ) : null}
                      </div>
                    )
                  })()}
                  {v.azioni.length > 0 ? (
                    <div className="salute__azioni">
                      {v.azioni.map((a) => {
                        const occupato = a.id === 'installa-la' && inCorso(installazioni[a.pc])
                        return <button key={a.id + a.testo} className="tasto tasto--mini" disabled={occupato} onClick={() => esegui(a)}>{occupato ? 'Installazione in corso…' : a.testo}</button>
                      })}
                    </div>
                  ) : null}
                </div>
              ))}
            </section>
          )
        })}
      </div>
      {conferma !== undefined ? (
        <ModaleNote
          titolo={`Installa là: ${conferma.nome} alla ${conferma.note?.versione !== undefined && conferma.note.versione !== '' ? conferma.note.versione : conferma.versione}`}
          {...(conferma.note !== undefined && conferma.note.installata !== '' ? { sotto: `${conferma.nome} adesso ha la ${conferma.note.installata}` } : {})}
          note={conferma.note?.note}
          etichetta={(n, i) => (i === 0 ? `La ${n.versione} (quella che si installa)` : `Saltata: ${n.versione}`)}
          {...(conferma.note?.avviso !== undefined ? { avviso: conferma.note.avviso } : {})}
          spiegazione={<>Premendo «Installa su {conferma.nome}», {conferma.nome} scarica la versione (se non l’ha già), poi <b>aspetta che le sue chat finiscano il turno</b> e il lavoro con il Drive, si chiude, installa e riparte; le chat là riprendono da sole. Qui sotto la sua voce vedi ogni passo e com’è finita, anche se l’installazione non riesce. Su {conferma.nome} non devi fare niente; se c’è qualcuno davanti, vedrà l’aggiornamento in corso.</>}
          tasti={<>
            <button className="tasto" onClick={() => setConferma(undefined)}>Non ora</button>
            <button className="tasto tasto--primario" autoFocus onClick={() => {
              const pc = conferma.pc
              setConferma(undefined)
              void window.gestore.salute.installaLa(pc).then((a) => setInstallazioni((p) => ({ ...p, [a.pcId]: a })))
            }}>Installa su {conferma.nome}</button>
          </>}
          onChiudi={() => setConferma(undefined)}
        />
      ) : null}
    </div>
  )
}
