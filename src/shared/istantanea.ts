import {
  parseArchivio, unaChatUnWorkspace, VERSIONE_ARCHIVIO, NOME_PREDEFINITO, SLOT_PRIMO,
  type LayoutSalvato, type WorkspaceSalvato
} from './workspace'

/**
 * La versione della forma su disco. Va alzata solo insieme a una migrazione
 * scritta: un archivio di versione superiore viene rifiutato, non interpretato
 * a caso.
 */
export const VERSIONE_ISTANTANEE = 2

/**
 * Un autopilota così com'era quando l'istantanea è stata presa.
 *
 * Si salva **la richiesta**, non lo stato: al ricarico l'autopilota riparte da
 * capo sull'obiettivo, con la propria chat nuova. Rimettere in vita lo stato di
 * uno vecchio significherebbe farlo riprendere una sessione che nel frattempo
 * è morta con l'applicazione, e fingere una continuità che non c'è.
 */
export type AutopilotaSalvato = {
  nome: string
  obiettivo: string
  cwd: string
  criteri: { descrizione: string; comando?: string }[]
  tettoChat?: number
}

/**
 * Una finestra del Gestore così com'era.
 *
 * `monitor` dice su quale schermo stava, e serve a rimetterla dov'era quando
 * gli schermi sono ancora quelli. Ma la finestra resta l'unità: la forma
 * precedente teneva **un layout per monitor**, e due finestre sullo stesso
 * schermo si sovrascrivevano — chi ne aveva sei in due finestre se ne ritrovava
 * quattro.
 */
export type FinestraSalvata = {
  /** Su quale schermo stava: serve a **rimettercela**, non ad archiviare. */
  monitor: string
  /**
   * Lo slot di archiviazione della finestra (`1`, `2`, …).
   *
   * Prima il layout si archiviava sotto `monitor`, cioè sotto la geometria dello
   * schermo — mentre il salvataggio ordinario usava un'altra chiave, calcolata
   * altrove e in un altro istante. Le due divergevano, e un ripristino scriveva
   * le chat sotto una chiave che la finestra non avrebbe mai chiesto: il
   * ripristino sembrava riuscito e il lavoro non tornava.
   *
   * Assente nelle istantanee salvate prima: allora si numera per posizione.
   */
  slot?: string
  layout: LayoutSalvato
}

export type Istantanea = {
  nome: string
  salvataIl: string
  /** Le finestre aperte quando l'istantanea è stata presa, nell'ordine. */
  finestre: FinestraSalvata[]
  /**
   * **Tutti** i workspace, non solo quello che si aveva davanti.
   *
   * Le finestre raccontano il workspace attivo, ed era l'unica cosa che
   * finiva nel salvataggio: chi aveva tre workspace ne ritrovava uno. Un
   * salvataggio che dimentica due terzi del lavoro non è un salvataggio.
   *
   * Assente nelle istantanee prese prima che questo esistesse: quelle si
   * ricaricano come hanno sempre fatto.
   */
  workspace?: WorkspaceSalvato[]
  /**
   * Quale workspace si aveva davanti.
   *
   * Senza, un ripristino rimetteva a schermo le chat del workspace di allora
   * lasciando nell'archivio il nome di quello di adesso: il primo salvataggio
   * successivo le scriveva **dentro il workspace sbagliato**, dove comparivano
   * accanto alle sue — le stesse chat in due workspace diversi.
   *
   * Assente nelle istantanee vecchie: quelle non toccano il workspace attivo.
   */
  workspaceAttivo?: string
  autopiloti: AutopilotaSalvato[]
}

export function nuovaIstantanea(p: {
  nome: string
  salvataIl: string
  finestre: FinestraSalvata[]
  workspace?: WorkspaceSalvato[]
  workspaceAttivo?: string
  autopiloti: AutopilotaSalvato[]
}): Istantanea {
  return {
    nome: p.nome,
    salvataIl: p.salvataIl,
    finestre: p.finestre,
    ...(p.workspace !== undefined ? { workspace: p.workspace } : {}),
    ...(p.workspaceAttivo !== undefined && p.workspaceAttivo !== ''
      ? { workspaceAttivo: p.workspaceAttivo }
      : {}),
    autopiloti: p.autopiloti
  }
}

/**
 * Le finestre da riaprire davvero, quando si ricarica un salvataggio.
 *
 * Due difetti, e tutt'e due si vedono su un file vero trovato sul disco:
 *
 * 1. **Una finestra senza riquadri non si riapre.** Comparirebbe bianca, e
 *    peggio: nel giro del ripristino prende il posto di una che avrebbe
 *    dovuto riempirsi.
 * 2. **Se sono vuote tutte, si pesca dal workspace che si aveva davanti.**
 *    «Ultima chiusura» era stata salvata con la sua unica finestra vuota — al
 *    ricarico non tornava **niente**, mentre le chat erano lì dentro, nello
 *    stesso file, nell'archivio dei workspace. Un salvataggio che contiene il
 *    lavoro e non lo restituisce è la forma peggiore di guasto: sembra che il
 *    lavoro sia perduto, e invece è lì.
 *
 * Non inventa niente: se non ci sono chat da nessuna parte, torna vuoto.
 */
export function finestreDaRiaprire(i: Istantanea): FinestraSalvata[] {
  const conChat = i.finestre.filter((f) => f.layout.panes.length > 0)
  if (conChat.length > 0) return conChat

  const salvati = i.workspace ?? []
  const davanti = salvati.find((w) => w.nome === i.workspaceAttivo) ?? salvati[0]
  if (davanti === undefined) return []
  return Object.entries(davanti.perSlot)
    .filter(([, layout]) => layout.panes.length > 0)
    .map(([slot, layout]) => ({ monitor: slot, slot, layout }))
}

/**
 * I workspace da mettere nel salvataggio, con quello attivo aggiornato.
 *
 * L'archivio su disco conosce tutti i workspace, ma la sua copia di quello
 * **attivo** è vecchia di quanto tempo è passato dall'ultimo cambio: le chat
 * aperte adesso stanno nelle finestre, non lì. Si prende quindi l'archivio per
 * gli altri e le finestre per l'attivo — che è l'unico modo perché il
 * salvataggio contenga insieme il lavoro di là e quello che si ha davanti.
 */
export function workspaceDaSalvare(
  archivio: { attivo: string; workspace: WorkspaceSalvato[] },
  finestre: FinestraSalvata[]
): WorkspaceSalvato[] {
  const perSlotVivo: Record<string, LayoutSalvato> = {}
  // Lo slot, non il monitor: era qui che il ripristino archiviava sotto una
  // chiave diversa da quella che la finestra chiede. Le istantanee vecchie non
  // ce l'hanno, e allora si numerano per posizione — la prima finestra è la 1.
  finestre.forEach((f, i) => { perSlotVivo[f.slot ?? String(i + 1)] = f.layout })

  const aggiornato: WorkspaceSalvato = {
    nome: archivio.attivo,
    // Quello che si ha davanti vince sulla copia su disco, ma solo per gli
    // slot che hanno davvero una finestra aperta: gli altri restano come
    // erano, invece di sparire perché in questo momento nessuno li guarda.
    perSlot: {
      ...(archivio.workspace.find((w) => w.nome === archivio.attivo)?.perSlot ?? {}),
      ...perSlotVivo
    }
  }

  const altri = archivio.workspace.filter((w) => w.nome !== archivio.attivo)
  // Prima di salvare, l'invariante «una chat, un workspace»: se una
  // conversazione risultasse in più workspace — dati vecchi già incrociati, o un
  // salvataggio finito sotto il nome sbagliato — nel salvataggio deve stare in
  // uno solo, altrimenti al ricarico ricompare di là e di qua (ed è il conteggio
  // «1 chat, 2 workspace» su una chat sola). Vince l'attivo, che è quello che si
  // ha davvero davanti.
  return archivio.attivo === ''
    ? unaChatUnWorkspace(archivio.workspace)
    : unaChatUnWorkspace([...altri, aggiornato], archivio.attivo)
}

/**
 * I workspace dell'archivio dopo aver ripristinato un salvataggio.
 *
 * Tre regole, e ognuna toglie un guasto vero visto sul disco:
 *
 * 1. **I workspace di adesso che il salvataggio non nomina restano.** Un
 *    ripristino non deve cancellare il lavoro fatto dopo averlo salvato.
 * 2. **Una chat, un workspace.** Un salvataggio poteva contenere la stessa
 *    conversazione in due workspace — un «Predefinito» che teneva il doppione di
 *    una chat di un altro workspace. Si tiene in quello che torna davanti e la si
 *    toglie dagli altri, o al ricarico ricompare di qua e di là.
 * 3. **Un workspace del salvataggio rimasto vuoto dopo il dedup non si
 *    reintroduce**, se non c'era già: la sua unica chat viveva anche altrove e ha
 *    vinto quell'altro. È così che ripristinare un salvataggio vecchio non
 *    resuscita un «Predefinito» cancellato che conteneva solo un doppione.
 *
 * `attivo` torna a quello che si aveva davanti quando si è salvato — dedotto da
 * dove stanno le chat, per i salvataggi vecchi che non lo dicono — a meno che
 * quel workspace non sia stato potato: allora resta l'attivo di adesso.
 */
export function workspaceDopoRipristino(
  archivio: { attivo: string; workspace: WorkspaceSalvato[] },
  istantanea: Istantanea
): { workspace: WorkspaceSalvato[]; attivo: string } {
  const salvati = istantanea.workspace ?? []
  const nomiSalvati = new Set(salvati.map((w) => w.nome))
  const nomiPrima = new Set(archivio.workspace.map((w) => w.nome))
  const davanti =
    istantanea.workspaceAttivo ?? workspaceDelleFinestre(istantanea.finestre, salvati)

  const fusi = unaChatUnWorkspace(
    [...archivio.workspace.filter((w) => !nomiSalvati.has(w.nome)), ...salvati],
    davanti
  )
  const finale = fusi.filter((w) => {
    const introdotto = nomiSalvati.has(w.nome) && !nomiPrima.has(w.nome)
    const vuoto = Object.values(w.perSlot).every((l) => l.panes.length === 0)
    return !(introdotto && vuoto)
  })

  const attivo =
    davanti !== undefined && finale.some((w) => w.nome === davanti) ? davanti : archivio.attivo
  return { workspace: finale, attivo }
}

/**
 * A chi va ogni layout salvato, quando le finestre aperte non sono quelle di
 * allora.
 *
 * Prima si riempiono le finestre che ci sono già — quella sullo stesso monitor
 * se c'è, altrimenti una qualunque — e solo per quello che avanza se ne apre di
 * nuove. Aprirne una per ogni finestra salvata, come si faceva, lasciava vive
 * anche quelle di prima con dentro le chat di prima: **le stesse chat comparivano
 * due volte**, in due finestre, e le si credeva perse quando invece erano di
 * troppo.
 *
 * Le finestre aperte che il salvataggio non prevede finiscono in `daSvuotare`,
 * ma chi ripristina **non le azzera**: toglie solo le chat che il salvataggio
 * rimette altrove — quelle sì comparirebbero due volte — e lascia il resto. Una
 * finestra che mostra una chat viva non contenuta nel salvataggio la
 * conserverebbe: azzerarla del tutto è il «ho dovuto riaprirla» dopo aver ripreso
 * un salvataggio parziale. Il doppione lo si evita col dedup, non con la ruspa.
 */
/**
 * In quale workspace vivono le chat che un salvataggio rimette a schermo.
 *
 * I salvataggi presi prima che questo campo esistesse non lo dicono, e sono
 * quelli che la gente ha già sul disco. Senza saperlo, il ripristino rimette a
 * schermo le chat di allora lasciando nell'archivio il nome del workspace di
 * adesso: il primo salvataggio automatico le scrive **là dentro**, sopra le sue.
 * Un salvataggio che corrompe il lavoro che trova è peggio di un salvataggio
 * che non funziona.
 *
 * Si deduce da dove stanno: il workspace che contiene le stesse conversazioni
 * che il salvataggio rimette a schermo. È una risposta certa quando c'è, perché
 * una chat vive in un workspace solo.
 */
export function workspaceDelleFinestre(
  finestre: FinestraSalvata[],
  workspace: WorkspaceSalvato[]
): string | undefined {
  const aSchermo = new Set(finestre.flatMap((f) => f.layout.panes.map((p) => p.sessionUuid)))
  if (aSchermo.size === 0) return undefined
  for (const w of workspace) {
    for (const layout of Object.values(w.perSlot)) {
      if (layout.panes.some((p) => aSchermo.has(p.sessionUuid))) return w.nome
    }
  }
  return undefined
}

export function distribuisci(
  finestre: FinestraSalvata[],
  aperte: { id: number; monitor: string }[]
): {
  aFinestre: { id: number; layout: LayoutSalvato }[]
  daAprire: LayoutSalvato[]
  daSvuotare: number[]
} {
  const libere = [...aperte]
  const aFinestre: { id: number; layout: LayoutSalvato }[] = []
  const senzaCasa: FinestraSalvata[] = []

  // Primo giro, il monitor: una finestra che torna sullo schermo dove stava è
  // l'unico esito che non sposta niente sotto gli occhi di chi guarda.
  for (const f of finestre) {
    const i = libere.findIndex((a) => a.monitor === f.monitor)
    const presa = libere[i]
    if (presa === undefined) {
      senzaCasa.push(f)
      continue
    }
    aFinestre.push({ id: presa.id, layout: f.layout })
    libere.splice(i, 1)
  }

  // Secondo giro, quello che resta: un monitor scollegato non deve far sparire
  // le sue chat, e una finestra qualunque è meglio di nessuna finestra.
  const daAprire: LayoutSalvato[] = []
  for (const f of senzaCasa) {
    const presa = libere.shift()
    if (presa === undefined) daAprire.push(f.layout)
    else aFinestre.push({ id: presa.id, layout: f.layout })
  }

  return { aFinestre, daAprire, daSvuotare: libere.map((a) => a.id) }
}

function stringaNonVuota(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.trim() !== '' ? raw : undefined
}

/**
 * Riusa il parser dei workspace per i layout.
 *
 * Due validatori per la stessa forma divergerebbero, ed è il genere di
 * divergenza che si scopre quando è tardi: un layout che il gestore accetta e
 * l'istantanea rifiuta, o il contrario.
 */
function parseLayout(raw: unknown, scartati: string[]): LayoutSalvato | undefined {
  const { archivio, scartati: loro } = parseArchivio({
    versione: VERSIONE_ARCHIVIO,
    attivo: NOME_PREDEFINITO,
    workspace: [{ nome: NOME_PREDEFINITO, perSlot: { [SLOT_PRIMO]: raw } }]
  })
  for (const motivo of loro) scartati.push(motivo)
  return archivio.workspace[0]?.perSlot[SLOT_PRIMO]
}

function parseAutopilota(raw: unknown, scartati: string[]): AutopilotaSalvato | undefined {
  if (typeof raw !== 'object' || raw === null) {
    scartati.push('autopilota salvato non oggetto')
    return undefined
  }
  const o = raw as Record<string, unknown>
  const obiettivo = stringaNonVuota(o.obiettivo)
  const cwd = stringaNonVuota(o.cwd)
  if (obiettivo === undefined || cwd === undefined) {
    scartati.push(`autopilota salvato senza obiettivo o cartella: ${String(o.nome)}`)
    return undefined
  }

  const criteri: { descrizione: string; comando?: string }[] = []
  if (Array.isArray(o.criteri)) {
    for (const c of o.criteri) {
      if (typeof c !== 'object' || c === null) continue
      const co = c as Record<string, unknown>
      const descrizione = stringaNonVuota(co.descrizione)
      if (descrizione === undefined) continue
      const comando = stringaNonVuota(co.comando)
      criteri.push({ descrizione, ...(comando !== undefined ? { comando } : {}) })
    }
  }
  // I criteri possono mancare: da quando l'autopilota si configura da sé, è la
  // preparazione a produrli, e al ricarico riparte proprio da lì. Scartarlo qui
  // faceva sparire dal salvataggio un autopilota ancora in preparazione — cioè
  // quello appena creato, il caso più probabile di tutti.

  const tetto = typeof o.tettoChat === 'number' && Number.isInteger(o.tettoChat) && o.tettoChat > 1
    ? o.tettoChat
    : undefined

  return {
    nome: stringaNonVuota(o.nome) ?? obiettivo.slice(0, 40),
    obiettivo,
    cwd,
    criteri,
    ...(tetto !== undefined ? { tettoChat: tetto } : {})
  }
}

/**
 * I workspace di un salvataggio, riletti dal file.
 *
 * Un layout vuoto qui **si tiene**, al contrario di quelli delle finestre: là
 * significa «una finestra vuota da non riaprire», qui significa «questo monitor
 * di questo workspace non ha niente», che è un'informazione vera e va
 * conservata com'era.
 */
function parseWorkspace(raw: unknown, scartati: string[]): WorkspaceSalvato[] | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) {
    scartati.push('workspace del salvataggio non e un elenco')
    return undefined
  }
  const letti: WorkspaceSalvato[] = []
  for (const w of raw) {
    if (typeof w !== 'object' || w === null) continue
    const o = w as Record<string, unknown>
    const nome = stringaNonVuota(o.nome)
    if (nome === undefined) {
      scartati.push('workspace senza nome')
      continue
    }
    const perSlot: Record<string, LayoutSalvato> = {}
    if (typeof o.perSlot === 'object' && o.perSlot !== null) {
      for (const [chiave, layout] of Object.entries(o.perSlot as Record<string, unknown>)) {
        const letto = parseLayout(layout, scartati)
        if (letto !== undefined) perSlot[chiave] = letto
      }
    }
    letti.push({ nome, perSlot })
  }
  return letti
}

/**
 * Legge l'archivio delle istantanee da un valore qualunque.
 *
 * Non solleva mai. Due istantanee con lo stesso nome sono un **aggiornamento**,
 * non un duplicato: resta la più recente, così l'elenco non cresce a ogni
 * salvataggio e la scelta al riavvio resta corta.
 */
export function parseIstantanee(raw: unknown): { istantanee: Istantanea[]; scartati: string[] } {
  const scartati: string[] = []

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    scartati.push('archivio delle istantanee non e un oggetto')
    return { istantanee: [], scartati }
  }
  const o = raw as Record<string, unknown>

  if (typeof o.versione !== 'number' || o.versione > VERSIONE_ISTANTANEE) {
    scartati.push(`versione non gestita: ${String(o.versione)} (attesa <= ${VERSIONE_ISTANTANEE})`)
    return { istantanee: [], scartati }
  }

  const perNome = new Map<string, Istantanea>()
  if (Array.isArray(o.istantanee)) {
    for (const grezza of o.istantanee) {
      if (typeof grezza !== 'object' || grezza === null) {
        scartati.push('istantanea non oggetto')
        continue
      }
      const g = grezza as Record<string, unknown>
      const nome = stringaNonVuota(g.nome)
      if (nome === undefined) {
        scartati.push('istantanea senza nome')
        continue
      }

      const finestre: FinestraSalvata[] = []
      if (Array.isArray(g.finestre)) {
        for (const f of g.finestre) {
          if (typeof f !== 'object' || f === null) continue
          const fo = f as Record<string, unknown>
          const letto = parseLayout(fo.layout, scartati)
          // Una finestra senza riquadri non e' una finestra da riaprire: e'
          // una finestra vuota che comparirebbe sullo schermo senza contenere
          // niente, e va scartata invece che ricreata.
          if (letto !== undefined && letto.panes.length > 0) {
            const slot = stringaNonVuota(fo.slot)
            finestre.push({
              monitor: stringaNonVuota(fo.monitor) ?? '',
              ...(slot !== undefined ? { slot } : {}),
              layout: letto
            })
          }
        }
      } else if (typeof g.perSlot === 'object' && g.perSlot !== null) {
        // La forma precedente: un layout per monitor, cioè una finestra per
        // schermo. Chi ha già dei salvataggi non deve perderli.
        for (const [chiave, layout] of Object.entries(g.perSlot as Record<string, unknown>)) {
          const letto = parseLayout(layout, scartati)
          if (letto !== undefined && letto.panes.length > 0) finestre.push({ monitor: chiave, layout: letto })
        }
      }

      const autopiloti: AutopilotaSalvato[] = []
      if (Array.isArray(g.autopiloti)) {
        for (const a of g.autopiloti) {
          const letto = parseAutopilota(a, scartati)
          if (letto !== undefined) autopiloti.push(letto)
        }
      }

      // I workspace **vanno riletti**: senza questo venivano scritti sul disco
      // e buttati via alla prima rilettura, e chi salvava tre workspace ne
      // ritrovava uno appena riaperto il programma. Il campo c'era nel tipo e
      // nel file, e non lo leggeva nessuno.
      const workspace = parseWorkspace(g.workspace, scartati)

      const istantanea: Istantanea = {
        nome,
        salvataIl: stringaNonVuota(g.salvataIl) ?? new Date(0).toISOString(),
        finestre,
        ...(workspace !== undefined ? { workspace } : {}),
        ...(stringaNonVuota(g.workspaceAttivo) !== undefined
          ? { workspaceAttivo: g.workspaceAttivo as string }
          : {}),
        autopiloti
      }
      const esistente = perNome.get(nome)
      if (esistente === undefined || esistente.salvataIl <= istantanea.salvataIl) {
        perNome.set(nome, istantanea)
      }
    }
  } else if (o.istantanee !== undefined) {
    scartati.push('istantanee non e un elenco')
  }

  const istantanee = [...perNome.values()].sort((a, b) => b.salvataIl.localeCompare(a.salvataIl))
  return { istantanee, scartati }
}

/** Due cartelle scritte in modi diversi sono la stessa cartella. */
function chiaveLavoro(cwd: string, obiettivo: string): string {
  const cartella = cwd.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase()
  return `${cartella}|${obiettivo.replace(/\s+/g, ' ').trim().toLowerCase()}`
}

/**
 * Quali autopiloti salvati vanno davvero rimessi in moto.
 *
 * Il ripristino li ricreava tutti, ogni volta. Ricaricare due volte lo stesso
 * salvataggio produceva due copie dello stesso autopilota, che ripartivano
 * dalla preparazione e rifacevano all'utente le domande a cui aveva già
 * risposto: da uno solo se ne sono trovati sei, nati a coppie a sei secondi di
 * distanza. Un autopilota è identificato da **cosa fa e dove**: se uno così
 * c'è già, non se ne fa un altro.
 */
export function daRiavviare(
  salvati: AutopilotaSalvato[],
  esistenti: { cwd: string; obiettivo: string }[]
): AutopilotaSalvato[] {
  const gia = new Set(esistenti.map((e) => chiaveLavoro(e.cwd, e.obiettivo)))
  const risultato: AutopilotaSalvato[] = []
  for (const a of salvati) {
    const chiave = chiaveLavoro(a.cwd, a.obiettivo)
    if (gia.has(chiave)) continue
    gia.add(chiave)
    risultato.push(a)
  }
  return risultato
}

/**
 * Quali autopiloti vale la pena mettere in un salvataggio.
 *
 * Uno che ha **finito** non si riprende: il suo lavoro è fatto, e rimetterlo in
 * moto al prossimo ricarico vuol dire una chat nuova che gira per scoprire che
 * non c'è niente da fare. Stessa cosa per uno fallito. Restano quelli fermi a
 * metà — al lavoro, in attesa, in preparazione, sospesi — che sono esattamente
 * il motivo per cui si salva una sessione.
 */
export function daSalvare<T extends { stato: string }>(autopiloti: T[]): T[] {
  return autopiloti.filter((a) => a.stato !== 'finito' && a.stato !== 'fallito')
}

/**
 * Quante chat contiene un salvataggio, in tutti i workspace.
 *
 * Contare i riquadri delle finestre — l'unica cosa che si faceva — dice quante
 * chat si avevano *davanti*, non quante ne contiene il salvataggio: chi ne
 * aveva sei divise in tre workspace leggeva «2 chat» e pensava, giustamente,
 * che gli altri quattro fossero andati persi.
 *
 * La stessa chat aperta in due monitor si conta una volta sola: è una
 * conversazione, non due.
 */
export function contaChat(i: Istantanea): number {
  const viste = new Set<string>()
  for (const f of i.finestre) for (const p of f.layout.panes) viste.add(p.sessionUuid)
  for (const w of i.workspace ?? []) {
    for (const layout of Object.values(w.perSlot)) {
      for (const p of layout.panes) viste.add(p.sessionUuid)
    }
  }
  return viste.size
}

/** Quanti workspace contiene: si dice solo quando sono più d'uno. */
export function contaWorkspace(i: Istantanea): number {
  return i.workspace?.length ?? 0
}
