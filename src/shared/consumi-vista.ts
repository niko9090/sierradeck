import { stato, type StatoVista } from './stato-vista'
import { quotaCache, type Quota } from './consumi'

/**
 * I Consumi riprogettati (0.70.0): la finestra di 5 ore e la settimana con una
 * parola e un colore, il contesto di ogni chat con la sua parola, i token in
 * una riga che si legge. Prima: «0 in entrata0 in uscita0 dalla cache» tutto
 * attaccato, «contesto contesto non ancora letto», le due finestre grigie.
 */

/** Una finestra del piano: libero, attento (≥80%), pieno (≥95%), vecchia, attesa. */
export function vistaFinestra(f: { percento: number; stato?: string; etichetta?: string } | undefined): StatoVista & { percento?: number } {
  if (f === undefined) return { ...stato('attesa', 'attesa', 'quieto', 'non ancora letta: arriva alla prossima risposta di una chat') }
  if (f.stato === 'azzerata') return { ...stato('attesa', 'azzerata', 'quieto', f.etichetta), percento: 0 }
  const p = Math.round(f.percento)
  if (f.stato === 'vecchia') return { ...stato('vecchia', 'vecchia', 'ambra', f.etichetta), percento: p }
  if (p >= 95) return { ...stato('pieno', 'pieno', 'rosso', f.etichetta), percento: p }
  if (p >= 80) return { ...stato('attento', 'attento', 'ambra', f.etichetta), percento: p }
  return { ...stato('libero', 'libero', 'verde', f.etichetta), percento: p }
}

/** Il contesto di una chat: libera (<70%), piena (<90%), riassumi (≥90%), o «—» se non letto. */
export function vistaContesto(percento: number | undefined): StatoVista {
  if (percento === undefined) return stato('non-letto', '—', 'quieto', 'non ancora letto: arriva alla prossima risposta')
  if (percento >= 90) return stato('riassumi', 'riassumi', 'rosso', 'conviene farle riassumere dove è arrivata')
  if (percento >= 70) return stato('piena', 'piena', 'ambra')
  return stato('libera', 'libera', 'verde')
}

const k = (t: number): string => (t >= 1_000_000 ? `${(t / 1_000_000).toFixed(1).replace(/\.0$/, '').replace('.', ',')}M` : t >= 1000 ? `${Math.round(t / 1000)}k` : String(t))

/** «↑1,2M · ↓80k · cache 64% · 5 chat»: una riga sola, con i separatori. */
export function testoQuota(q: Quota): string {
  const perc = quotaCache(q)
  return [`↑${k(q.ingresso)} in entrata`, `↓${k(q.uscita)} in uscita`, `cache ${perc}%`, q.chat === 1 ? '1 chat' : `${q.chat} chat`].join(' · ')
}

/**
 * Il PC mette le parole sui consumi (0.70.0): ogni finestra del piano e ogni
 * chat aperta. Pagina e app le mostrano senza rifare i conti.
 */
export function conVistaConsumi<C extends { limiti?: { cinqueOre?: { percento: number; stato?: string; etichetta?: string }; settimana?: { percento: number; stato?: string; etichetta?: string } }; chatAperte?: Array<{ contestoPercento?: number; contesto?: { percento: number } }> }>(c: C): C {
  const l = c.limiti
  return {
    ...c,
    ...(l !== undefined ? { limiti: {
      ...l,
      ...(l.cinqueOre !== undefined ? { cinqueOre: { ...l.cinqueOre, vista: vistaFinestra(l.cinqueOre) } } : {}),
      ...(l.settimana !== undefined ? { settimana: { ...l.settimana, vista: vistaFinestra(l.settimana) } } : {})
    } } : {}),
    ...(c.chatAperte !== undefined ? { chatAperte: c.chatAperte.map((x) => ({ ...x, vista: vistaContesto(x.contestoPercento ?? x.contesto?.percento) })) } : {})
  }
}
