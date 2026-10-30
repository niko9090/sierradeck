import {
  idChatNuova, nuovoAutopilota,
  type Autopilota, type ChatAdottata, type ChatGovernata, type Criterio, type MessaggioAdottata, type MessaggioPerLaChat
} from '@shared/autopilota'
import { aggiungi, type Coda, type EventoCoda, type Modifica } from '@shared/coda-richieste'

/**
 * **Il passaggio all'autopilota unico** (P3): quando l'interruttore si
 * accende su un workspace che ha già autopiloti.
 *
 * - Nasce l'autopilota unico (`unico: true`), nella cartella degli
 *   autopiloti di quel workspace, con il ramo principale e la regola di
 *   pubblicazione che avevano.
 * - Le **chat vive** di ogni autopilota diventano specialisti dell'unico: con
 *   la loro sessione, la loro copia (worktree) e il loro ramo. Prendono un id
 *   nuovo (due autopiloti avevano entrambi una c-1) e ricordano quello di prima
 *   (`origine`): gli hook che mandano ancora con l'id vecchio arrivano a lei.
 *   I messaggi in coda per loro le seguono.
 * - Le chat adottate (0.78.0) passano all'unico, **«solo mia» compresa**.
 * - Ogni autopilota di prima resta in sola lettura fra i «Precedenti»:
 *   archiviato, con `passatoA`, senza più chat vive né messaggi in coda.
 *
 * Le richieste e i compiti in coda li ha già portati la P1 (`migraAutopiloti`);
 * qui si aggiungono gli obiettivi degli autopiloti che non erano ancora partiti
 * (in preparazione o pronti), che la P1 non vedeva. Tutto puro.
 */

export type Adozione = { da: string; chat: string; nuova: string }

export type EsitoPassaggio = {
  unico: Autopilota
  precedenti: Autopilota[]
  adottate: Adozione[]
}

/** La chat è viva: non finita, non in chiusura, non conclusa. */
const viva = (c: ChatGovernata): boolean => c.stato !== 'finita' && c.fine === undefined && c.conclusa === undefined && c.nelRecupero === undefined

/** Un autopilota «a chat sola» con la sua chat accesa: la chat è lui. */
const chatSola = (a: Autopilota): boolean => a.chats.length === 0 && a.sessionId !== undefined && (a.stato === 'lavoro' || a.stato === 'attesa')

/** La cartella del workspace: quella dell'autopilota più recente fra quelli non archiviati (o di tutti). */
export function cartellaDelWorkspace(autopiloti: Autopilota[]): string | undefined {
  const ordinati = [...autopiloti].sort((a, b) => b.iniziatoIl.localeCompare(a.iniziatoIl))
  return (ordinati.find((a) => a.archiviato !== true) ?? ordinati[0])?.cwd
}

export function nomeUnico(ws: string): string {
  const nome = ws.startsWith('cartella:') ? ws.slice('cartella:'.length).split(/[\\/]/u).filter((x) => x !== '').pop() ?? 'workspace' : ws
  return `Autopilota · ${nome}`.slice(0, 60)
}

export const OBIETTIVO_UNICO = 'Portare a termine le richieste di Nicholas nella coda di questo workspace, una per una, con specialisti e criteri verificati.'

/** L'autopilota unico, nuovo: senza chat, al lavoro (aspetta i messaggi). */
export function nuovoUnico(p: { id: string; ws: string; cwd: string; adesso: string; base?: Partial<Pick<Autopilota, 'ramoBase' | 'commitBase' | 'pubblicazione' | 'vaSulCloud' | 'consegna' | 'cloud' | 'criteri'>> }): Autopilota {
  const a = nuovoAutopilota({
    id: p.id,
    nome: nomeUnico(p.ws),
    obiettivo: OBIETTIVO_UNICO,
    cwd: p.cwd,
    ...(p.ws.startsWith('cartella:') ? {} : { workspace: p.ws }),
    criteri: p.base?.criteri ?? [],
    iniziatoIl: p.adesso,
    tettoChat: 4,
    stato: 'lavoro',
    ...(p.base?.pubblicazione !== undefined ? { pubblicazione: p.base.pubblicazione } : {}),
    ...(p.base?.vaSulCloud === true ? { vaSulCloud: true } : {})
  })
  return {
    ...a,
    unico: true,
    ...(p.base?.ramoBase !== undefined ? { ramoBase: p.base.ramoBase } : {}),
    ...(p.base?.commitBase !== undefined ? { commitBase: p.base.commitBase } : {}),
    ...(p.base?.consegna !== undefined ? { consegna: p.base.consegna } : {}),
    ...(p.base?.cloud !== undefined ? { cloud: p.base.cloud } : {})
  }
}

/** I criteri dei lavori ancora aperti nella stessa cartella, senza doppioni: il cancello misura questi. */
function criteriComuni(autopiloti: Autopilota[], cwd: string): Criterio[] {
  const visti = new Set<string>()
  const fuori: Criterio[] = []
  for (const a of autopiloti) {
    if (a.cwd !== cwd || a.stato === 'finito' || a.stato === 'fallito' || a.archiviato === true) continue
    for (const c of a.criteri) {
      if (c.comando === undefined || c.giudicato !== undefined || visti.has(c.descrizione)) continue
      visti.add(c.descrizione)
      fuori.push({ descrizione: c.descrizione, comando: c.comando, soddisfatto: c.soddisfatto })
    }
  }
  return fuori
}

/**
 * Il passaggio: l'unico (nuovo, o quello che c'è già) adotta le chat vive e
 * le adottate di tutti gli altri autopiloti del workspace.
 */
export function passaAllUnico(p: { ws: string; autopiloti: Autopilota[]; id: string; adesso: string; unico?: Autopilota }): EsitoPassaggio {
  const altri = p.autopiloti.filter((a) => a.unico !== true && a.id !== p.unico?.id)
  const cwd = p.unico?.cwd ?? cartellaDelWorkspace(altri) ?? ''
  const conBase = [...altri].sort((a, b) => b.iniziatoIl.localeCompare(a.iniziatoIl)).find((a) => a.cwd === cwd && a.ramoBase !== undefined)
  let unico: Autopilota = p.unico ?? nuovoUnico({
    id: p.id, ws: p.ws, cwd, adesso: p.adesso,
    base: {
      criteri: criteriComuni(altri, cwd),
      ...(conBase?.ramoBase !== undefined ? { ramoBase: conBase.ramoBase } : {}),
      ...(conBase?.commitBase !== undefined ? { commitBase: conBase.commitBase } : {}),
      ...(conBase?.pubblicazione !== undefined ? { pubblicazione: conBase.pubblicazione } : {}),
      ...(conBase?.vaSulCloud === true ? { vaSulCloud: true } : {}),
      ...(conBase?.consegna !== undefined ? { consegna: conBase.consegna } : {}),
      ...(conBase?.cloud !== undefined ? { cloud: conBase.cloud } : {})
    }
  })
  const adottate: Adozione[] = []
  const precedenti: Autopilota[] = []
  for (const a of [...altri].sort((x, y) => x.iniziatoIl.localeCompare(y.iniziatoIl))) {
    const nuoveId = new Map<string, string>()
    const nuove: ChatGovernata[] = []
    for (const c of a.chats) {
      if (!viva(c)) continue
      const id = idChatNuova(unico, nuove.length)
      nuoveId.set(c.id, id)
      nuove.push({ ...c, id, origine: { autopilota: a.id, chat: c.id } })
    }
    if (chatSola(a)) {
      const id = idChatNuova(unico, nuove.length)
      nuoveId.set(a.id, id)
      nuove.push({
        id, compito: a.obiettivoTuo ?? a.obiettivo, stato: 'lavoro', cicli: a.cicli, sessionId: a.sessionId!,
        ...(a.cwd !== unico.cwd ? { cartella: a.cwd } : {}),
        ...(a.ultimaAzioneChat !== undefined ? { ultimaAzione: a.ultimaAzioneChat } : {}),
        origine: { autopilota: a.id, chat: a.id }
      })
    }
    for (const [da, nuova] of nuoveId) adottate.push({ da: a.id, chat: da, nuova })
    // I messaggi in coda per le chat adottate le seguono, con l'id nuovo.
    const seguono: MessaggioPerLaChat[] = a.daConsegnare.flatMap((m) => {
      const chats = m.chats.flatMap((k) => (nuoveId.has(k) ? [nuoveId.get(k)!] : []))
      return chats.length > 0 ? [{ ...m, chats }] : []
    })
    const dalVolo: MessaggioPerLaChat[] = (a.inVolo ?? []).flatMap((v) => v.messaggi.flatMap((m) => {
      const chats = m.chats.flatMap((k) => (nuoveId.has(k) ? [nuoveId.get(k)!] : []))
      return chats.length > 0 ? [{ ...m, chats }] : []
    }))
    const adottateDiPrima: ChatAdottata[] = (a.adottate ?? []).filter((x) => !(unico.adottate ?? []).some((y) => y.sessionId === x.sessionId))
    const perAdottate: MessaggioAdottata[] = (a.perAdottate ?? []).filter((x) => !(unico.perAdottate ?? []).some((y) => y.id === x.id))
    unico = {
      ...unico,
      chats: [...unico.chats, ...nuove],
      daConsegnare: [...unico.daConsegnare, ...seguono, ...dalVolo],
      ...(adottateDiPrima.length > 0 || (unico.adottate ?? []).length > 0 ? { adottate: [...(unico.adottate ?? []), ...adottateDiPrima] } : {}),
      ...(perAdottate.length > 0 || (unico.perAdottate ?? []).length > 0 ? { perAdottate: [...(unico.perAdottate ?? []), ...perAdottate] } : {}),
      decisioni: [
        ...unico.decisioni,
        ...nuove.map((c) => ({ quando: p.adesso, cosa: `adotto ${c.origine!.chat} di «${a.nome}» come specialista ${c.id}${c.ramo !== undefined ? ` (ramo ${c.ramo})` : ''}: ${c.compito.slice(0, 120)}`, traguardo: { chat: c.id, esito: 'aperta' as const } }))
      ]
    }
    const restano = a.chats.filter((c) => !nuoveId.has(c.id))
    const { sessionId: _s, pausaLimitiFinoA: _p, fermatoPerAggiornamento: _f, ...senza } = a
    const prima: Autopilota = {
      ...(chatSola(a) ? senza : { ...senza, ...(a.sessionId !== undefined ? { sessionId: a.sessionId } : {}) }),
      chats: restano,
      daConsegnare: [],
      inVolo: [],
      adottate: [],
      perAdottate: [],
      archiviato: true,
      passatoA: unico.id,
      riprendiAlRiavvio: false,
      stato: a.stato === 'finito' || a.stato === 'fallito' ? a.stato : 'sospeso',
      motivoSospensione: a.stato === 'finito' || a.stato === 'fallito' ? a.motivoSospensione : 'passato all’autopilota unico del workspace',
      decisioni: [...a.decisioni, { quando: p.adesso, cosa: nuoveId.size > 0 ? `passo all’autopilota unico del workspace: ${nuoveId.size === 1 ? 'la chat viva continua' : `le ${nuoveId.size} chat vive continuano`} lì (${[...nuoveId].map(([x, y]) => `${x} → ${y}`).join(', ')})` : 'passo all’autopilota unico del workspace: resto fra i precedenti, in sola lettura' }]
    }
    if (prima.motivoSospensione === undefined) delete prima.motivoSospensione
    precedenti.push(prima)
  }
  return { unico, precedenti, adottate }
}

/**
 * Gli obiettivi degli autopiloti mai partiti (in preparazione, o pronti ad
 * aspettare il via) che non hanno richieste: entrano nella coda con le loro
 * parole. Una volta sola: un obiettivo già fra gli originali non rientra.
 */
export function obiettiviInCoda(coda: Coda, autopiloti: Autopilota[]): Modifica {
  let c = coda
  const eventi: EventoCoda[] = []
  const gia = new Set(coda.richieste.flatMap((r) => r.originali.map((o) => o.testo.trim())))
  for (const a of autopiloti) {
    if (a.unico === true || (a.stato !== 'intervista' && a.stato !== 'pronto') || (a.richieste ?? []).length > 0) continue
    const testo = (a.obiettivoTuo ?? a.obiettivo).trim()
    if (testo === '' || gia.has(testo)) continue
    gia.add(testo)
    const m = aggiungi(c, { testo, quando: a.iniziatoIl, collegate: [{ autopilota: a.id }] })
    c = m.coda
    eventi.push(...m.eventi)
  }
  return { coda: c, eventi }
}

/** Dove va un hook che arriva con l'id di prima: l'unico e la chat adottata, se c'è. */
export function hookAdottato(prima: Autopilota | undefined, unico: Autopilota | undefined, chatId: string | undefined): { id: string; chat: string } | undefined {
  if (prima === undefined || prima.passatoA === undefined || unico === undefined || unico.id !== prima.passatoA) return undefined
  const chi = chatId ?? prima.id
  const c = unico.chats.find((x) => x.origine?.autopilota === prima.id && x.origine.chat === chi)
  return c === undefined ? undefined : { id: unico.id, chat: c.id }
}
