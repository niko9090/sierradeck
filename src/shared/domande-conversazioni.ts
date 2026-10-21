import type { Autopilota } from './autopilota'
import { conversazione } from './chat-autopilota'
import { SUPERATA, eSuperata, type OpzioneScelta, type VoceDomanda } from './domande-telefono'
import { chiDi, fraseDomanda, schedaDaParti, schedaDaTesto, scelteDiChat, type SchedaDomanda } from './scheda-domanda'

/**
 * La scheda «Domande» come conversazioni a messaggi (0.36.0).
 *
 * Nicholas (30/09): la scheda così com'era non gli piaceva — schede separate,
 * una casella per voce, niente storia. Deve essere una **chat**:
 * - dove c'e' un autopilota si parla con l'autopilota: la stessa conversazione
 *   della sua scheda (quello che gli hai chiesto, le sue domande, le tue
 *   risposte, il dialogo), e la casella risponde alla domanda aperta — o, se
 *   non ce n'e', gli scrive come nel dialogo;
 * - dove non c'e', e' la chat che aspetta a scrivere li' la sua domanda o il
 *   permesso (le righe del suo schermo), con le opzioni da toccare quando ci
 *   sono; si risponde da li' come in chat, e quello che hai scritto resta nel
 *   filo.
 *
 * Una funzione sola, pura, per il PC, la pagina servita e l'app Android: il
 * computer compone le conversazioni (`/api/domande` → `conversazioni`) e i tre
 * lati le disegnano uguali.
 */

export type MessaggioConversazione = {
  da: 'lui' | 'tu' | 'nota'
  testo: string
  quando?: string
  /** `domanda` = sta aspettando la tua risposta a questo messaggio. */
  tono?: string
  /** Le opzioni da toccare, sul messaggio della chat che chiede un permesso. */
  opzioni?: OpzioneScelta[]
}

/** Come si risponde: alla domanda di un autopilota, parlandogli, o scrivendo alla chat. */
export type ViaRisposta =
  | { via: 'rispondi'; domanda: string }
  | { via: 'dialogo'; autopilota: string }
  | { via: 'scrivi'; chat: string }

export type Conversazione = {
  /** `ap:<id>` o `chat:<id>`: stabile, per ricordare cosa si e' mandato. */
  chiave: string
  tipo: 'autopilota' | 'chat'
  titolo: string
  /** La riga sotto il titolo: la cartella, o «prima di partire». */
  sotto: string
  /** Aspetta una tua risposta adesso (una domanda, una scelta). */
  chiede: boolean
  messaggi: MessaggioConversazione[]
  risposta: ViaRisposta
  /** Le scelte toccabili (vanno a `/api/scegli`, con il testo dell'opzione). */
  scelte?: { chat: string; opzioni: OpzioneScelta[] }
  /** Il segnaposto della casella, scritto per quella conversazione. */
  segnaposto: string
  /**
   * Quante domande aspettano dentro questa conversazione (0.38.0): per un
   * autopilota anche quelle in coda. Il numerino del tasto le somma tutte.
   */
  quante?: number
  /** L'autopilota di questa conversazione: la colonna porta alla sua linguetta «Domande». */
  autopilota?: string
  /** La chat e' su un altro PC (0.39.3): «SU <PC>» nella colonna, nella pagina e nell'app. */
  suPc?: string
  /** La strada per quel PC (0.40.0): «SU <PC> · Tailscale». */
  viaPc?: string
  /**
   * La domanda essenziale (0.72.1): chi, la frase, le scelte, il resto nel
   * «?». PC, pagina e app la disegnano al posto della conversazione; con un
   * PC più vecchio non c'è e si disegna come prima.
   */
  scheda?: SchedaDomanda
}

/** Quanti messaggi della storia di un autopilota entrano nel filo. */
export const MESSAGGI_AUTOPILOTA = 30

/** Quello che hai mandato di recente a una chat, per tenerlo nel filo. */
export type Inviato = { quando: string; testo: string }

export function conversazioniDomande(p: {
  voci: VoceDomanda[]
  autopiloti: Autopilota[]
  /** Chat → i messaggi mandati da qui (dal telefono o dal PC), piu' vecchi prima. */
  inviati?: Record<string, Inviato[]>
}): Conversazione[] {
  const perAp = new Map(p.autopiloti.map((a) => [a.id, a]))
  const fuori: Conversazione[] = []
  const gia = new Set<string>()

  for (const v of p.voci) {
    if (v.tipo === 'risolta') continue
    if (v.tipo === 'autopilota') {
      const chiave = `ap:${v.autopilotaId}`
      const a = perAp.get(v.autopilotaId)
      const storia = a === undefined ? [] : conversazione(a).slice(-MESSAGGI_AUTOPILOTA)
      const messaggi: MessaggioConversazione[] = storia.map((b) => ({
        da: b.da,
        testo: b.dettaglio !== undefined && b.da === 'nota' ? `${b.testo} — ${b.dettaglio}` : b.testo,
        quando: b.quando,
        ...(b.tono !== undefined ? { tono: b.tono } : {})
      }))
      // La domanda aperta sta **sempre** in fondo: con una flotta l'autopilota
      // resta «al lavoro» e la sua storia non la mostra da sola. Con le sue
      // opzioni, se ne propone: toccarne una e' rispondere con quel testo.
      const opzioni = (v.opzioni ?? []).map((testo, i) => ({ numero: i + 1, testo, scelta: false }))
      const conOpzioni = opzioni.length > 0 ? { opzioni } : {}
      const ultima = messaggi[messaggi.length - 1]
      if (ultima === undefined || ultima.testo !== v.testo) {
        // La domanda della preparazione sta anche nella sua storia, magari
        // tagliata: si toglie la copia vecchia e resta quella intera, in fondo.
        const copia = messaggi.findIndex((m) => m.tono === 'domanda' && v.testo.startsWith(m.testo.slice(0, 60)))
        if (copia >= 0) messaggi.splice(copia, 1)
        messaggi.push({ da: 'lui', testo: v.testo, tono: 'domanda', ...conOpzioni })
      } else {
        ultima.tono = 'domanda'
        Object.assign(ultima, conOpzioni)
      }
      if (gia.has(chiave)) {
        // Un'altra domanda aperta dello stesso autopilota: una chat sorella
        // della flotta, o «Pubblico adesso?» mentre ne aspetta un'altra. Nella
        // 0.37.2 aveva una conversazione a parte («· un'altra domanda»);
        // Nicholas (01/10): «se c'è l'autopilota non serve mettere le domande
        // divise! basta che le fai lì». Sta nella conversazione **del suo
        // autopilota**, in coda: subito prima della domanda a cui la casella
        // risponde adesso, che resta in fondo con le sue opzioni. Risposta
        // quella, la prossima diventa la domanda attiva.
        const sua = fuori.find((c) => c.chiave === chiave)
        if (sua !== undefined) {
          const inCoda: MessaggioConversazione = { da: 'lui', testo: `In coda, dopo quella qui sotto: ${v.testo}`, tono: 'domanda' }
          sua.messaggi.splice(Math.max(0, sua.messaggi.length - 1), 0, inCoda)
          sua.quante = (sua.quante ?? 1) + 1
          if (sua.scheda !== undefined) sua.scheda.poi = sua.quante - 1
          sua.sotto = `${a?.cwd ?? sua.sotto} · ${sua.messaggi.filter((m) => m.testo.startsWith('In coda, dopo')).length + 1} domande: rispondi a una alla volta, dall’ultima in fondo`
        }
        continue
      }
      gia.add(chiave)
      const chi = chiDi('autopilota', v.autopilota, a?.cwd)
      const segnapostoAp = v.origine === 'intervista' ? 'Scrivi tu: la preparazione riparte con la tua risposta' : 'Scrivi tu la risposta'
      const scheda: SchedaDomanda = v.parti !== undefined
        ? schedaDaParti(chi, v.parti, { ...(v.avvertenza !== undefined ? { avvertenza: v.avvertenza } : {}), segnaposto: segnapostoAp })
        : schedaDaTesto(chi, v.testo, (v.opzioni ?? []).map((testo) => ({ testo })), segnapostoAp)
      if (v.origine === 'intervista') scheda.dettagli.unshift({ etichetta: 'Quando', testo: 'Si sta preparando: senza la tua risposta non comincia.' })
      fuori.push({
        chiave,
        tipo: 'autopilota',
        autopilota: v.autopilotaId,
        quante: 1,
        scheda,
        titolo: v.autopilota,
        sotto: v.sotto ?? (v.origine === 'intervista'
          ? 'si prepara: ti fa una domanda prima di partire, e senza la tua risposta non comincia'
          : (a?.cwd ?? '')),
        chiede: true,
        messaggi,
        risposta: { via: 'rispondi', domanda: v.id },
        segnaposto: v.sotto !== undefined
          ? 'Tocca una risposta qui sopra, oppure scrivi «sì» o «no»'
          : v.origine === 'intervista'
            ? 'Rispondi (o tocca un’opzione): la preparazione riparte con la tua risposta'
            : 'Rispondi all’autopilota: arriva subito alla chat ferma'
      })
      continue
    }
    const chiave = `chat:${v.chat}`
    if (gia.has(chiave)) continue
    gia.add(chiave)
    const tuoi = (p.inviati?.[v.chat] ?? []).map((i) => ({ da: 'tu' as const, testo: i.testo, quando: i.quando }))
    const schermo = v.righe.join('\n').trim()
    const chi = chiDi('chat', v.titolo || v.cwd, v.cwd, v.tipo === 'chat' ? v.pcNome : undefined)
    if (v.tipo === 'scelta') {
      const { scelte, spiegazioni } = scelteDiChat(v.opzioni)
      fuori.push({
        chiave,
        tipo: 'chat',
        titolo: v.titolo || v.cwd,
        sotto: v.cwd,
        chiede: true,
        scheda: {
          chi,
          domanda: schermo !== '' ? fraseDomanda(schermo) || 'Aspetta che tu scelga.' : 'Aspetta che tu scelga.',
          scelte,
          dettagli: [...(spiegazioni !== undefined ? [spiegazioni] : []), ...(schermo !== '' ? [{ etichetta: 'Lo schermo della chat', testo: schermo }] : [])],
          segnaposto: 'Oppure scrivile tu'
        },
        messaggi: [
          ...tuoi,
          {
            da: 'lui',
            testo: schermo !== '' ? schermo : 'Aspetta che tu scelga una di queste opzioni.',
            tono: 'domanda',
            opzioni: v.opzioni
          }
        ],
        risposta: { via: 'scrivi', chat: v.chat },
        scelte: { chat: v.chat, opzioni: v.opzioni },
        segnaposto: 'Tocca un’opzione qui sopra, oppure scrivile qualcosa'
      })
    } else if (v.chiede === true) {
      // Una domanda scritta (0.71.1): aspetta te, come una scelta.
      fuori.push({
        chiave,
        tipo: 'chat',
        titolo: v.titolo || v.cwd,
        sotto: v.cwd,
        chiede: true,
        scheda: schedaDaTesto(chi, schermo !== '' ? schermo : 'Ti ha fatto una domanda: la trovi nella chat.', [], 'Scrivi tu la risposta', 'Quello che ha scritto'),
        messaggi: [...tuoi, { da: 'lui', testo: schermo !== '' ? schermo : 'Ti ha fatto una domanda: la trovi nella chat.', tono: 'domanda' }],
        risposta: { via: 'scrivi', chat: v.chat },
        ...(v.pcNome !== undefined ? { suPc: v.pcNome } : {}),
        ...(v.viaPc !== undefined ? { viaPc: v.viaPc } : {}),
        segnaposto: 'Rispondi alla chat: la risposta arriva nella sua casella'
      })
    } else {
      fuori.push({
        chiave,
        tipo: 'chat',
        titolo: v.titolo || v.cwd,
        sotto: v.cwd,
        chiede: false,
        scheda: {
          chi,
          domanda: 'Ha finito il turno: cosa le scrivi?',
          scelte: [],
          dettagli: schermo !== '' ? [{ etichetta: 'Le ultime righe', testo: schermo }] : [],
          segnaposto: 'Scrivi tu la prossima istruzione'
        },
        messaggi: [...tuoi, { da: 'lui', testo: schermo !== '' ? schermo : 'Ha finito il turno e aspetta la tua prossima istruzione.' }],
        risposta: { via: 'scrivi', chat: v.chat },
        ...(v.pcNome !== undefined ? { suPc: v.pcNome } : {}),
        ...(v.viaPc !== undefined ? { viaPc: v.viaPc } : {}),
        segnaposto: 'Scrivi alla chat la prossima istruzione'
      })
    }
  }
  // Gli autopiloti che si sono preparati e aspettano il via: non hanno una
  // domanda aperta, ma aspettano te. Si parla con loro come nella scheda
  // (il dialogo): «vai», «prima cambia questo», una domanda.
  for (const a of p.autopiloti) {
    if (a.stato !== 'pronto' || gia.has(`ap:${a.id}`)) continue
    gia.add(`ap:${a.id}`)
    fuori.push({
      chiave: `ap:${a.id}`,
      tipo: 'autopilota',
      autopilota: a.id,
      quante: 1,
      titolo: a.nome !== '' ? a.nome : a.obiettivo.slice(0, 60),
      sotto: `pronto: aspetta il tuo via · ${a.cwd}`,
      chiede: true,
      scheda: {
        chi: chiDi('autopilota', a.nome !== '' ? a.nome : a.obiettivo.slice(0, 60), a.cwd),
        domanda: 'Si è preparato: gli dai il via?',
        scelte: [{ testo: 'Vai', consigliata: true }],
        dettagli: [
          { etichetta: 'Obiettivo', testo: a.obiettivo },
          ...(a.criteri.length > 0 ? [{ etichetta: 'Finisce quando', testo: a.criteri.map((c) => `• ${c.descrizione}`).join('\n') }] : []),
          ...(a.compitiDaFare.length > 0 ? [{ etichetta: 'I compiti', testo: a.compitiDaFare.map((c) => `• ${c}`).join('\n') }] : [])
        ],
        segnaposto: 'Oppure scrivigli cosa cambiare prima di partire'
      },
      // Il suo «dammi il via» sta sempre in fondo, qualunque ora abbia.
      messaggi: [
        ...conversazione(a).filter((b) => b.tono !== 'pronto').slice(-MESSAGGI_AUTOPILOTA).map((b) => ({
          da: b.da,
          testo: b.dettaglio !== undefined && b.da === 'nota' ? `${b.testo} — ${b.dettaglio}` : b.testo,
          quando: b.quando,
          ...(b.tono !== undefined ? { tono: b.tono } : {})
        })),
        {
          da: 'lui' as const,
          testo: 'Mi sono preparato: i criteri e i compiti sono nella mia scheda. Dimmi «vai» per partire, o cosa cambiare prima.',
          tono: 'domanda'
        }
      ],
      risposta: { via: 'dialogo', autopilota: a.id },
      segnaposto: 'Scrivigli: «vai», oppure cosa cambiare prima di partire'
    })
  }
  // Le domande delle chat a cui l'autopilota ha risposto da solo (0.71.1):
  // restano nella sua conversazione, con la risposta. Senza una domanda
  // aperta la conversazione c'è lo stesso, e non aspetta te.
  for (const v of p.voci) {
    if (v.tipo !== 'risolta') continue
    const chiave = `ap:${v.autopilotaId}`
    // Una domanda superata (0.84.0) non ha avuto risposta: si dice che è
    // stata chiusa e perché (collaudo 0.84.1).
    const superata = eSuperata(v)
    const coppia: MessaggioConversazione[] = [
      { da: 'lui', testo: `${v.chatTitolo !== undefined ? `La chat «${v.chatTitolo}» ha chiesto` : 'La chat ha chiesto'}: ${v.domanda}`, quando: v.quando },
      superata
        ? { da: 'nota', testo: `chiusa senza risposta, non serve più: ${v.risposta.slice(SUPERATA.length)}`, quando: v.quando, tono: 'risolta' }
        : { da: 'nota', testo: `risposta dall’autopilota: ${v.risposta}`, quando: v.quando, tono: 'risolta' }
    ]
    let sua = fuori.find((c) => c.chiave === chiave)
    if (sua === undefined) {
      sua = {
        chiave,
        tipo: 'autopilota',
        autopilota: v.autopilotaId,
        titolo: v.autopilota,
        sotto: superata ? 'una domanda della sua chat non serve più' : 'ha risposto da solo a una domanda della sua chat',
        chiede: false,
        scheda: {
          chi: chiDi('autopilota', v.autopilota),
          domanda: fraseDomanda(v.domanda) || v.domanda,
          scelte: [],
          dettagli: [{ etichetta: v.chatTitolo !== undefined ? `La domanda della chat «${v.chatTitolo}»` : 'La domanda della sua chat', testo: v.domanda }],
          risposta: v.risposta,
          segnaposto: 'Scrivigli se la risposta non va bene'
        },
        messaggi: [],
        risposta: { via: 'dialogo', autopilota: v.autopilotaId },
        segnaposto: 'Scrivigli se la risposta non va bene'
      }
      fuori.push(sua)
    }
    // Prima della domanda aperta, se c'è: quella resta in fondo.
    const dove = sua.chiede ? Math.max(0, sua.messaggi.length - 1) : sua.messaggi.length
    sua.messaggi.splice(dove, 0, ...coppia)
  }
  // Prima chi chiede (domande e scelte), poi le chat che hanno solo finito.
  return [...fuori.filter((c) => c.chiede), ...fuori.filter((c) => !c.chiede)]
}

/** Il percorso e il corpo con cui si risponde a una conversazione: uguali sui tre lati. */
export function richiestaRisposta(r: ViaRisposta, testo: string): { percorso: string; corpo: Record<string, string> } {
  if (r.via === 'rispondi') return { percorso: '/api/rispondi', corpo: { domanda: r.domanda, risposta: testo } }
  if (r.via === 'dialogo') return { percorso: '/api/autopilota/dialogo', corpo: { autopilota: r.autopilota, testo } }
  return { percorso: '/api/scrivi', corpo: { chat: r.chat, testo } }
}

/**
 * Quante conversazioni aspettano una tua risposta (0.37.2): il numero sul tasto
 * «Domande» del PC, nella colonna, nella pagina e nell'app. Uno solo, dalla
 * stessa lista: prima il telefono contava «domande + scelte» e lasciava fuori
 * gli autopiloti pronti che aspettano il via, e i numeri non tornavano.
 */
export function quanteAspettano(conversazioni: Pick<Conversazione, 'chiede' | 'quante'>[]): number {
  // Tutte le domande (0.38.0): un autopilota con tre domande ne conta tre.
  return conversazioni.filter((c) => c.chiede).reduce((n, c) => n + (c.quante ?? 1), 0)
}

/**
 * L'identita' della **domanda** di una conversazione, non della conversazione:
 * cambia quando arriva una domanda nuova (un'altra domanda dello stesso
 * autopilota, un altro permesso della stessa chat). Serve alla colonna per
 * aprirsi da sola solo per le domande nuove, non per quelle gia' viste.
 */
export function identitaDomanda(c: Conversazione): string | undefined {
  if (!c.chiede) return undefined
  if (c.risposta.via === 'rispondi') return `d:${c.risposta.domanda}`
  if (c.risposta.via === 'dialogo') return `via:${c.risposta.autopilota}`
  const ultima = [...c.messaggi].reverse().find((m) => m.da === 'lui')
  const opzioni = (c.scelte?.opzioni ?? []).map((o) => o.testo).join('|')
  return `k:${c.risposta.chat}:${(ultima?.testo ?? '').slice(-200)}:${opzioni}`
}

/**
 * Le domande nuove rispetto a quelle gia' viste, nell'ordine dell'elenco. La
 * colonna si apre (se chiusa) e mette in evidenza la prima; quelle viste non la
 * riaprono, nemmeno dopo che l'hai chiusa.
 */
export function domandeNuove(conversazioni: Conversazione[], viste: ReadonlySet<string>): { chiave: string; identita: string }[] {
  const fuori: { chiave: string; identita: string }[] = []
  for (const c of conversazioni) {
    const id = identitaDomanda(c)
    if (id !== undefined && !viste.has(id)) fuori.push({ chiave: c.chiave, identita: id })
  }
  return fuori
}

/**
 * Una conversazione che sta nella **colonna**: quelle delle chat. Le domande di
 * un autopilota stanno nella linguetta «Domande» della sua scheda (0.38.0), e
 * dalla 0.39.1 non aprono piu' la colonna.
 */
function dellaColonna(c: Conversazione): boolean {
  return c.tipo !== 'autopilota' || c.autopilota === undefined
}

/**
 * Cosa fa la colonna Domande del PC a ogni lettura (0.37.3, cambiata nella 0.39.1).
 *
 * Nicholas (01/10, 13:52 UTC): «NON VEDO LE DOMANDEEEE!!!!». Nella 0.37.2 la
 * colonna si apriva da sola **solo** per una domanda mai vista: una domanda
 * gia' in attesa all'avvio e gia' «vista» restava segnalata solo dal numero sul
 * tasto. Dalla 0.37.3:
 * - **all'avvio**, se c'e' qualcosa che aspetta una tua risposta, si mette in
 *   vista la prima domanda, vista o no;
 * - durante il lavoro, ogni domanda **nuova** (diversa da quelle gia' viste) si
 *   mette in vista: chiusa a mano, la colonna resta chiusa solo finche' non ne
 *   arriva una diversa;
 * - finche' ci sono domande in attesa e la colonna e' chiusa, il tasto
 *   «Domande» chiama (`richiamo`): lampeggia d'ambra con il numero.
 *
 * **Dove** si mette in vista (Nicholas, 02/10: «quando c'è l'autopilota non
 * deve aprirsi la parte domande a destra ma visualizzarsi nel tab domande
 * sotto»):
 * - una domanda di una **chat** apre la colonna (`apri`) e si evidenzia lì;
 * - una domanda di un **autopilota** non tocca la colonna, chiusa resta chiusa:
 *   si fa avanti la linguetta «Domande» della sua scheda (`linguette`, gli id
 *   degli autopiloti), o la sua finestra pannello se e' staccata.
 * Il numero sul tasto conta tutto, come prima.
 */
export function decidiColonnaDomande(p: {
  conversazioni: Conversazione[]
  viste: ReadonlySet<string>
  aperta: boolean
  /** Prima lettura dopo l'avvio (con le preferenze gia' lette). */
  avvio: boolean
  /** Le domande brevi di qui (0.76.0): stanno a lato della chat, la colonna non si apre per loro. */
  aLato?: ReadonlySet<string>
}): { apri: boolean; evidenzia?: string; nuove: string[]; richiamo: boolean; linguette: string[] } {
  const nuove = domandeNuove(p.conversazioni, p.viste)
  const perChiave = new Map(p.conversazioni.map((c) => [c.chiave, c]))
  const inAttesa = p.conversazioni.filter((c) => c.chiede)
  const aLato = p.aLato ?? new Set<string>()
  const nuoveColonna = nuove.filter((n) => { const c = perChiave.get(n.chiave); return c !== undefined && dellaColonna(c) && !aLato.has(c.chiave) })
  const attesaColonna = inAttesa.filter((c) => dellaColonna(c) && !aLato.has(c.chiave))
  const evidenzia = nuoveColonna[0]?.chiave ?? (p.avvio ? attesaColonna[0]?.chiave : undefined)
  const apri = !p.aperta && (nuoveColonna.length > 0 || (p.avvio && attesaColonna.length > 0))
  const linguette: string[] = []
  const daMostrare = [
    ...nuove.map((n) => perChiave.get(n.chiave)),
    ...(p.avvio ? inAttesa : [])
  ]
  for (const c of daMostrare) {
    if (c === undefined || dellaColonna(c) || c.autopilota === undefined) continue
    if (!linguette.includes(c.autopilota)) linguette.push(c.autopilota)
  }
  return {
    apri,
    ...(evidenzia !== undefined ? { evidenzia } : {}),
    nuove: nuove.map((n) => n.identita),
    richiamo: inAttesa.length > 0 && !p.aperta && !apri,
    linguette
  }
}

/**
 * Il tasto «Domande» della console (0.39.1). Con la colonna aperta la chiude;
 * chiusa, la apre — tranne quando ad aspettare sono **solo** autopiloti: le loro
 * domande non stanno nella colonna, e il tasto porta alla linguetta «Domande»
 * del primo. Il numerino sul tasto resta il conto di tutto.
 */
export function azioneTastoDomande(conversazioni: Conversazione[], aperta: boolean): { tipo: 'colonna' } | { tipo: 'linguetta'; autopilota: string } {
  if (aperta) return { tipo: 'colonna' }
  const chiedono = conversazioni.filter((c) => c.chiede)
  const primo = chiedono[0]
  if (primo !== undefined && primo.autopilota !== undefined && chiedono.every((c) => !dellaColonna(c))) {
    return { tipo: 'linguetta', autopilota: primo.autopilota }
  }
  return { tipo: 'colonna' }
}

/** Una domanda breve (0.76.0): al massimo 200 caratteri, al massimo 4 scelte, niente di tagliato. */
export const BREVE_CARATTERI = 200
export const BREVE_SCELTE = 4
/** Oltre questo il «?» è un documento, non una domanda breve. */
export const DETTAGLI_MAX = 1500

/**
 * Le domande a lato (0.76.0). Nicholas, 16/10: se sei nella chat (o nel suo
 * workspace) e la domanda è breve, compare in una colonna a lato con i tasti e
 * «Scrivi tu»; le domande lunghe restano solo nella sezione Domande. La stessa
 * regola su PC, pagina e app.
 */
export function domandaBreve(c: Pick<Conversazione, 'chiede' | 'scheda'>): boolean {
  const s = c.scheda
  if (!c.chiede || s === undefined || s.risposta !== undefined) return false
  // «Scrivi tu» (la scelta libera) non conta fra le scelte. I dettagli stanno dietro il «?»:
  // non contano, tranne un tetto largo contro i casi enormi (provato nella copia: 415 caratteri
  // di contesto dello schermo per «Preferisci il rosso o il blu?»).
  const scelte = s.scelte.filter((x) => x.libera !== true).length
  const dettagli = s.dettagli.reduce((n, d) => n + d.testo.length, 0)
  return s.domanda.length <= BREVE_CARATTERI && !s.domanda.endsWith('…') && scelte <= BREVE_SCELTE && dettagli <= DETTAGLI_MAX
}

/**
 * Quali domande vanno a lato: quelle brevi delle chat (o dell'autopilota) che
 * hai davanti. `qui` sono le chiavi delle conversazioni del workspace aperto
 * (sul telefono, della chat aperta).
 */
export function domandeALato(conversazioni: Conversazione[], qui: ReadonlySet<string>): Conversazione[] {
  return conversazioni.filter((c) => qui.has(c.chiave) && domandaBreve(c))
}
