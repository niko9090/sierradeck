import type { VistaAttesa } from '@shared/attesa-specialisti'
import type { EsitoUnione, StatoDopoLavoro } from '@shared/dati-pannello-agenti'
import { daQuanto, nomeWorkspace } from '@shared/attesa-vista'

/**
 * **Il pannello degli agenti** (k-176a): la parte pura, senza DOM. Filtri,
 * raggruppamenti ed etichette stanno qui e li provano i test; `PannelloAgenti.tsx`
 * li disegna soltanto. Tutto arriva da `VistaAttesa` (stessa fonte della lista).
 */

type Voce = VistaAttesa['alLavoro'][number]

const norma = (t: string): string => String(t).replace(/\\/g, '/').replace(/\/+$/, '').replace(/^cartella:/, '').toLowerCase()

/** Il workspace è uno di quelli dell'autopilota scelto? Senza riferimenti, tutti. */
export function delWorkspace(workspace: string, riferimenti: readonly string[]): boolean {
  const miei = riferimenti.filter((r) => r !== '').map(norma)
  return miei.length === 0 || miei.includes(norma(workspace))
}

/** Quanto è durato o dura, in parole corte: «meno di 1 min», «12 min», «2 h 10 min». */
export function testoDurata(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return ''
  const min = Math.floor(Math.max(0, ms) / 60_000)
  if (min < 1) return 'meno di 1 min'
  if (min < 60) return `${min} min`
  const ore = Math.floor(min / 60)
  const resto = min % 60
  return `${ore} h${resto > 0 ? ` ${resto} min` : ''}`
}

/** Dove lavora, senza mai dire il nome di questo PC. */
export function testoPc(v: Pick<Voce, 'perPc' | 'suPc' | 'pannello'>): string {
  const p = v.pannello?.pc
  const altro = v.suPc ?? p?.nome
  if (altro !== undefined && altro !== '') return `su ${altro}`
  const per = v.perPc ?? p?.perConto
  if (per !== undefined && per !== '') return `qui, per ${per}`
  return 'questo PC'
}

export type RigaAgente = {
  id: string
  /** Il ruolo (tipo di specialista). */
  ruolo: string
  /** Il compito del piano («k-40»), se c'è. */
  compito?: string
  /** Cosa deve fare, in parole semplici. */
  titolo: string
  file: string[]
  fileAltri: number
  pc: string
  durata: string
  /** L'ultima cosa fatta (l'ultimo strumento usato); vuoto se non si sa. */
  adesso: string
  /** Il tasto «Ferma» vale solo per un Agent del flusso o un lavoro affidato: non per una chat, non per un lavoro ospitato. */
  puoFermare: boolean
  fermaRichiesta: boolean
  /** Ha finito e sta rimandando il ramo qui. */
  invio: boolean
}

/**
 * Solo chi lavora davvero adesso, del workspace scelto: via chi sta arrivando o
 * si prepara (non lavora ancora) e via chi è in fila. Le chat compaiono solo se
 * il servizio le dà come vive (una chat adottata ferma non è nell'elenco);
 * `chatAperte`, se c'è, tiene solo quelle.
 */
export function agentiAlLavoro(vista: VistaAttesa, riferimenti: readonly string[], adesso: number, chatAperte?: ReadonlySet<string>): RigaAgente[] {
  return vista.alLavoro
    .filter((v) => v.fase === undefined && delWorkspace(v.workspace, riferimenti))
    .filter((v) => v.chat !== true || chatAperte === undefined || chatAperte.has(v.id))
    .map((v) => {
      const durata = v.pannello?.durataMs !== undefined ? testoDurata(v.pannello.durataMs) : daQuanto(v.dal, adesso)
      const adessoTesto = (v.pannello?.azione.ultima ?? v.cosaFa ?? '').trim()
      return {
        id: v.id,
        ruolo: v.tipo,
        ...(v.compito !== undefined ? { compito: v.compito } : {}),
        titolo: (v.titolo ?? v.pannello?.azione.titolo ?? v.descrizione).trim(),
        file: v.pannello?.file ?? [],
        fileAltri: v.pannello?.fileAltri ?? 0,
        pc: testoPc(v),
        durata,
        adesso: adessoTesto,
        puoFermare: v.chat !== true && v.perPc === undefined && v.fermaRichiesta !== true,
        fermaRichiesta: v.fermaRichiesta === true,
        invio: v.pannello?.invio === 'invio'
      }
    })
}

/** I file in una riga corta: i primi tre e «+ N altri». */
export function testoFile(file: readonly string[], altri: number): string {
  if (file.length === 0) return ''
  const mostrati = file.slice(0, 3)
  const resto = file.length - mostrati.length + altri
  return `${mostrati.join(', ')}${resto > 0 ? ` + ${resto} altri` : ''}`
}

export type RigaFilaUnione = { id: string; titolo: string; inCorso: boolean; posizione: number; parole: string }
export type RigaEsito = { id: string; titolo: string; verde: boolean; parole: string; quando: string; comando: string }

/** La fila delle unioni: quella in corso per prima, poi le successive in ordine. */
export function filaUnioni(vista: VistaAttesa, riferimenti: readonly string[]): RigaFilaUnione[] {
  return (vista.inUnione ?? [])
    .filter((u) => delWorkspace(u.workspace, riferimenti))
    .map((u, i) => ({ u, i }))
    .sort((a, b) => Number(b.u.inCorso) - Number(a.u.inCorso) || (a.u.posizione ?? 999) - (b.u.posizione ?? 999) || a.i - b.i)
    .map(({ u }, n) => ({ id: u.id, titolo: u.titolo, inCorso: u.inCorso, posizione: n + 1, parole: u.inCorso ? 'in prova adesso' : 'aspetta il suo turno' }))
}

const PAROLE_ESITO: Record<EsitoUnione['esito'], string> = { verde: 'unita, criterio verde', rosso: 'criterio rosso', conflitto: 'conflitto', 'non-unita': 'non unita' }

/** Gli esiti recenti dei workspace scelti, il più recente prima; verde solo se l'unione è riuscita con il criterio verde. */
export function esitiRecenti(vista: VistaAttesa, riferimenti: readonly string[], max = 5): RigaEsito[] {
  return Object.entries(vista.esitiUnioni ?? {})
    .filter(([ws]) => delWorkspace(ws, riferimenti))
    .flatMap(([, lista]) => lista)
    .sort((a, b) => Date.parse(b.quando) - Date.parse(a.quando))
    .slice(0, max)
    .map((e) => ({ id: `${e.id}|${e.quando}`, titolo: e.titolo, verde: e.esito === 'verde' && e.verde !== false, parole: PAROLE_ESITO[e.esito], quando: e.quando, comando: e.comando ?? '' }))
}

export type ColoreStato = 'verde' | 'ambra' | 'rosso'
const STATI_DOPO: Record<StatoDopoLavoro, { parole: string; colore: ColoreStato }> = {
  'in-fila': { parole: 'in fila per l’unione', colore: 'ambra' },
  'in-unione': { parole: 'in prova', colore: 'ambra' },
  unito: { parole: 'unito', colore: 'verde' },
  'criterio-rosso': { parole: 'rimandato indietro: criterio rosso', colore: 'rosso' },
  conflitto: { parole: 'rimandato indietro: conflitto', colore: 'rosso' }
}

export type RigaDopoFinito = { id: string; titolo: string; durata: string; stato: StatoDopoLavoro; parole: string; colore: ColoreStato }

/** Cosa è successo al lavoro dopo il «finito»: durata e dove è arrivato. */
export function dopoFinito(vista: VistaAttesa, riferimenti: readonly string[]): RigaDopoFinito[] {
  return (vista.dopoLavoro ?? [])
    .filter((d) => delWorkspace(d.workspace, riferimenti))
    .map((d) => ({ id: d.id, titolo: d.titolo, durata: testoDurata(d.durataMs), stato: d.stato, parole: STATI_DOPO[d.stato].parole, colore: STATI_DOPO[d.stato].colore }))
}

/** Il nome corto del workspace, per chi ne guarda più d'uno. */
export const nomeCorto = nomeWorkspace

/** L'etichetta del tasto «Ferma» e la domanda di conferma. */
export const TESTO_FERMA = { tasto: 'Ferma', domanda: 'Fermarlo? Il lavoro fatto resta salvato.', si: 'Sì, ferma', no: 'No' } as const

/** Il «?» spiega tutto: nel pannello restano frasi corte. */
export const SPIEGA_PANNELLO =
  'Qui vedi solo gli agenti che lavorano adesso. Per ognuno: il ruolo, cosa deve fare, i file toccati, il PC su cui lavora, da quanto e l’ultima cosa fatta. «Ferma» lo interrompe: il lavoro già fatto non si cancella e il compito resta da fare. Una chat compare solo se è aperta a parte, non se è un’adottata ferma.'

export const SPIEGA_UNIONI =
  'Quando uno specialista finisce, il programma prova il suo lavoro e lo unisce, una unione alla volta. In fila: quella in corso e le successive. Gli esiti recenti sono verdi se il criterio è passato, rossi se no: in quel caso il lavoro torna indietro.'
