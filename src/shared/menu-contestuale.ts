/**
 * **Il tasto destro** (13/11). Nicholas: «il tasto destro deve aprire un menu
 * semi-completo delle azioni da fare sulle varie cose».
 *
 * Un menu solo, quello del sistema (lo stesso di Copia/Incolla nei campi): il
 * renderer manda le voci, il main apre il `Menu` di Electron sotto il puntatore
 * e risponde con la voce scelta. Così il menu non si taglia sui bordi della
 * finestra, non finisce sotto un terminale, e si usa anche con la tastiera.
 *
 * Qui solo regole pure: le voci di ogni cosa (workspace, chat, autopilota,
 * scheda della Panoramica, altri PC, progetti, specialisti, domande, file
 * mandati al telefono) e il controllo di quello che arriva al main. Ogni voce è
 * un'azione che il programma ha già: il menu la rende raggiungibile, non ne
 * inventa di nuove. Le azioni che cancellano passano dalle loro conferme.
 */

export type VoceMenu =
  | { id: string; testo: string; spenta?: boolean; pericolo?: boolean; spunta?: boolean }
  | { separatore: true }
  /** Un sottomenu, di un livello solo («Sposta in ▸»). */
  | { testo: string; sotto: VoceMenu[]; spenta?: boolean }

export const SEPARATORE: VoceMenu = { separatore: true }
/** Oltre questo il menu non si legge più: il resto si taglia. */
export const VOCI_MAX = 40
export const TESTO_MAX = 120

export function eSeparatore(v: VoceMenu): v is { separatore: true } {
  return 'separatore' in v
}
export function eSottomenu(v: VoceMenu): v is { testo: string; sotto: VoceMenu[]; spenta?: boolean } {
  return 'sotto' in v
}

function corto(t: string): string {
  return t.length > TESTO_MAX ? `${t.slice(0, TESTO_MAX - 1)}…` : t
}

/**
 * Quello che arriva al main dal renderer: solo voci ben fatte, testi corti,
 * niente separatori in testa, in coda o doppi, sottomenu di un livello solo e
 * non vuoti. Ogni altra cosa si scarta.
 */
export function vociValide(raw: unknown, livello = 0): VoceMenu[] {
  if (!Array.isArray(raw)) return []
  const fuori: VoceMenu[] = []
  for (const x of raw.slice(0, VOCI_MAX * 2)) {
    if (typeof x !== 'object' || x === null) continue
    const o = x as Record<string, unknown>
    if (o.separatore === true) {
      if (fuori.length > 0 && !eSeparatore(fuori[fuori.length - 1] as VoceMenu)) fuori.push(SEPARATORE)
      continue
    }
    if (typeof o.testo !== 'string' || o.testo.trim() === '') continue
    if (Array.isArray(o.sotto)) {
      if (livello > 0) continue
      const sotto = vociValide(o.sotto, livello + 1)
      if (sotto.length === 0) continue
      fuori.push({ testo: corto(o.testo), sotto, ...(o.spenta === true ? { spenta: true } : {}) })
    } else {
      if (typeof o.id !== 'string' || o.id === '' || o.id.length > 200) continue
      fuori.push({
        id: o.id,
        testo: corto(o.testo),
        ...(o.spenta === true ? { spenta: true } : {}),
        ...(o.pericolo === true ? { pericolo: true } : {}),
        ...(o.spunta === true ? { spunta: true } : {})
      })
    }
    if (fuori.filter((v) => !eSeparatore(v)).length >= VOCI_MAX) break
  }
  while (fuori.length > 0 && eSeparatore(fuori[fuori.length - 1] as VoceMenu)) fuori.pop()
  return fuori
}

/** Il testo che si vede: le azioni che cancellano o chiedono conferma finiscono con «…». */
export function testoVisibile(v: { testo: string; pericolo?: boolean }): string {
  return v.pericolo === true && !v.testo.endsWith('…') ? `${v.testo}…` : v.testo
}

/** Senza separatori doppi o in fondo, come il main li tratterebbe. */
function pulisci(voci: VoceMenu[]): VoceMenu[] {
  return vociValide(voci)
}

// ── workspace ──────────────────────────────────────────────────────────────

/**
 * Un workspace della fascia (o del menu dei workspace): le azioni del suo «⋯»
 * (`azioniMenuWorkspace`), più il PIN e «Gestisci», che stavano già sul tasto
 * destro del nome.
 */
export function vociWorkspace(p: {
  azioni: readonly { azione: string; etichetta: string; spenta?: string; pericolo?: boolean }[]
  /** Assente: il PIN non si offre (il menu dei workspace non l'ha mai avuto). */
  pin?: { acceso: boolean; protetto: boolean }
  nome: string
  gestisci?: boolean
}): VoceMenu[] {
  const azioni: VoceMenu[] = p.azioni.map((a) => ({
    id: a.azione,
    testo: a.etichetta.replace(/ ✓$/, ''),
    ...(a.spenta !== undefined ? { spenta: true } : {}),
    ...(a.pericolo === true ? { pericolo: true } : {}),
    ...(a.etichetta.endsWith(' ✓') ? { spunta: true } : {})
  }))
  // L'elimina in fondo, separata: la si prende solo apposta.
  const elimina = azioni.filter((v) => 'id' in v && v.id === 'elimina')
  const altre = azioni.filter((v) => !('id' in v) || v.id !== 'elimina')
  return pulisci([
    ...altre,
    SEPARATORE,
    ...(p.pin === undefined ? [] : [p.pin.protetto
      ? { id: 'pin-togli', testo: 'Togli il PIN' }
      : { id: 'pin-metti', testo: p.pin.acceso ? 'Proteggi con il PIN' : 'Proteggi con il PIN (spento nelle Impostazioni)', spenta: !p.pin.acceso }]),
    ...(p.gestisci !== false ? [{ id: 'gestisci', testo: 'Crea, rinomina o elimina…' }] : []),
    SEPARATORE,
    ...elimina
  ])
}

// ── chat (riquadro del mosaico) ────────────────────────────────────────────

/**
 * Una chat nel mosaico: le azioni della sua testata, nell'ordine in cui servono.
 * `sposta` sono le destinazioni (altre finestre, altri workspace); `eliminaNo`
 * il motivo per cui il PC non la elimina adesso (lavora, aspetta…).
 */
export function vociChat(p: {
  remota: boolean
  ibernata: boolean
  /** Il PIN delle chat è acceso nelle Impostazioni. */
  pinAcceso: boolean
  protetta: boolean
  sposta?: { finestre: readonly { id: number; titolo: string }[]; workspace: readonly string[] }
  eliminaNo?: string
}): VoceMenu[] {
  const dove = p.sposta === undefined ? [] : [
    ...p.sposta.finestre.map((f): VoceMenu => ({ id: `finestra:${f.id}`, testo: f.titolo })),
    ...(p.sposta.finestre.length > 0 && p.sposta.workspace.length > 0 ? [SEPARATORE] : []),
    ...p.sposta.workspace.map((w): VoceMenu => ({ id: `ws:${w}`, testo: `Workspace «${w}»` }))
  ]
  const sposta: VoceMenu = dove.length > 0
    ? { testo: 'Sposta in', sotto: dove }
    : { id: 'sposta-nulla', testo: 'Sposta in (nessuna altra finestra o workspace)', spenta: true }
  if (p.remota) {
    return pulisci([
      { id: 'rinomina', testo: 'Rinomina' },
      sposta,
      SEPARATORE,
      { id: 'chiudi-riquadro', testo: 'Chiudi il riquadro' }
    ])
  }
  return pulisci([
    { id: 'rinomina', testo: 'Rinomina' },
    { id: 'cartella', testo: 'Apri la cartella' },
    sposta,
    p.ibernata ? { id: 'sveglia', testo: 'Sveglia' } : { id: 'iberna', testo: 'Metti a dormire' },
    SEPARATORE,
    p.protetta
      ? { id: 'pin-togli', testo: 'Togli il PIN' }
      : { id: 'pin-metti', testo: p.pinAcceso ? 'Proteggi con il PIN' : 'Proteggi con il PIN (spento nelle Impostazioni)', spenta: !p.pinAcceso },
    SEPARATORE,
    { id: 'chiudi', testo: 'Chiudi', pericolo: true },
    { id: 'archivia', testo: 'Archivia', pericolo: true },
    p.eliminaNo !== undefined
      ? { id: 'elimina', testo: `Elimina dal PC (${p.eliminaNo})`, spenta: true }
      : { id: 'elimina', testo: 'Elimina dal PC', pericolo: true }
  ])
}

// ── scheda della Panoramica ────────────────────────────────────────────────

/** Una scheda (o chat ferma, o finita) della Panoramica. */
export function vociSchedaPanoramica(p: {
  apribile: boolean
  /** La chat vive su un altro PC: niente Chiudi/Archivia/Elimina da qui. */
  remota: boolean
  /** «Solo mia» si offre solo dove c'è già il suo tasto; assente = la voce non c'è. */
  soloMia?: boolean
  gestibile: boolean
  /** Perché il PC non la chiude o non la elimina adesso. */
  chiudiNo?: string
  eliminaNo?: string
}): VoceMenu[] {
  const conMotivo = (id: string, testo: string, no: string | undefined): VoceMenu =>
    no !== undefined ? { id, testo: `${testo} (${no})`, spenta: true } : { id, testo, pericolo: true }
  return pulisci([
    { id: 'apri', testo: 'Apri a tutta larghezza', spenta: !p.apribile },
    ...(p.soloMia !== undefined ? [{ id: 'solo-mia', testo: 'Solo mia (l’autopilota non la tocca)', spunta: p.soloMia } as VoceMenu] : []),
    ...(p.gestibile && !p.remota ? [
      SEPARATORE,
      conMotivo('chiudi', 'Chiudi', p.chiudiNo),
      { id: 'archivia', testo: 'Archivia', pericolo: true } as VoceMenu,
      conMotivo('elimina', 'Elimina dal PC', p.eliminaNo)
    ] : [])
  ])
}

// ── autopilota ─────────────────────────────────────────────────────────────

/** L'autopilota: nella sua colonna o in una riga del pannello Autopiloti. */
export function vociAutopilota(p: { dove: 'colonna' | 'elenco'; scelto?: boolean; remoto?: boolean }): VoceMenu[] {
  if (p.dove === 'colonna') {
    return pulisci([
      { id: 'autopiloti', testo: 'Apri Autopiloti' },
      { id: 'domande', testo: 'Apri le Domande' },
      { id: 'specialisti', testo: 'Apri Specialisti' },
      ...(p.remoto === true ? [] : [{ id: 'cartella', testo: 'Apri la cartella del workspace' } as VoceMenu]),
      SEPARATORE,
      { id: 'misura', testo: 'Larghezza iniziale della colonna' },
      { id: 'chiudi-colonna', testo: 'Chiudi la colonna' }
    ])
  }
  return pulisci([
    p.scelto === true ? { id: 'nascondi', testo: 'Chiudi il dettaglio' } : { id: 'dettaglio', testo: 'Mostra il dettaglio' },
    { id: 'cartella', testo: 'Apri la cartella' },
    SEPARATORE,
    { id: 'aggiorna', testo: 'Aggiorna l’elenco' }
  ])
}

// ── altri PC ───────────────────────────────────────────────────────────────

/** Un altro PC della sezione «Altri PC». */
export function vociAltroPc(p: { nome: string; aperto: boolean }): VoceMenu[] {
  return pulisci([
    { id: 'mostra', testo: p.aperto ? `Chiudi i workspace di ${p.nome}` : `I workspace di ${p.nome}` },
    { id: 'rileggi', testo: 'Rileggi' }
  ])
}

/** Un workspace di un altro PC, nella tendina della sezione «Altri PC». */
export function vociWorkspaceRemoto(p: { nome: string; pc: string; aperto: boolean; davanti: boolean; occupato: boolean }): VoceMenu[] {
  return pulisci([
    p.aperto
      ? { id: 'apri', testo: p.davanti ? `«${p.nome}» è davanti` : `Passa a «${p.nome}»`, spenta: p.davanti || p.occupato }
      : { id: 'apri', testo: `Apri qui, con l’autopilota di ${p.pc}`, spenta: p.occupato },
    { id: 'porta-qui', testo: 'Porta qui…' }
  ])
}

// ── progetti ───────────────────────────────────────────────────────────────

/** Un progetto nella vista Progetti: il dettaglio e le sue azioni, con le loro conferme. */
export function vociProgetto(p: { scelto: boolean; azioni: readonly { id: string; titolo: string; conferma?: string }[]; quaderno: boolean }): VoceMenu[] {
  return pulisci([
    p.scelto ? { id: 'nascondi', testo: 'Chiudi il dettaglio' } : { id: 'dettaglio', testo: 'Mostra il dettaglio' },
    ...(p.azioni.length > 0 ? [SEPARATORE] : []),
    ...p.azioni.map((a): VoceMenu => ({ id: `azione:${a.id}`, testo: a.titolo, ...(a.conferma !== undefined ? { pericolo: true } : {}) })),
    ...(p.quaderno ? [SEPARATORE, { id: 'quaderno', testo: 'Quaderno del progetto' } as VoceMenu] : [])
  ])
}

// ── specialisti ────────────────────────────────────────────────────────────

/** Uno specialista nella lista: al lavoro o in fila, con le mosse che ha già. */
export function vociSpecialista(p:
  | { stato: 'lavora'; perPc?: string; fermaRichiesta: boolean }
  | { stato: 'fila'; primo: boolean; ultimo: boolean }
): VoceMenu[] {
  if (p.stato === 'lavora') {
    if (p.perPc !== undefined) return [{ id: 'nulla', testo: `Lo segue ${p.perPc}`, spenta: true }]
    return pulisci([
      { id: 'cima', testo: 'Precedenza' },
      { id: 'ferma', testo: 'Ferma', pericolo: true, spenta: p.fermaRichiesta }
    ])
  }
  return pulisci([
    { id: 'su', testo: 'Più in alto', spenta: p.primo },
    { id: 'giu', testo: 'Più in basso', spenta: p.ultimo },
    { id: 'cima', testo: 'In cima', spenta: p.primo },
    SEPARATORE,
    { id: 'togli', testo: 'Togli dalla fila', pericolo: true }
  ])
}

// ── domande ────────────────────────────────────────────────────────────────

/** Una conversazione della colonna Domande. */
export function vociDomanda(p: { aperta: boolean; filtro: 'aspettano' | 'tutte' }): VoceMenu[] {
  return pulisci([
    { id: 'apri', testo: 'Apri', spenta: p.aperta },
    SEPARATORE,
    p.filtro === 'aspettano' ? { id: 'tutte', testo: 'Mostra tutte' } : { id: 'aspettano', testo: 'Mostra solo quelle che aspettano te' },
    { id: 'chiudi-colonna', testo: 'Chiudi la colonna' }
  ])
}

// ── file mandati al telefono ───────────────────────────────────────────────

/** Un file in coda verso il telefono: «Annulla» finché non è arrivato, «Togli le finite» se ce ne sono. */
export function vociFileTelefono(p: { inCorso: boolean; quanteFinite: number }): VoceMenu[] {
  return pulisci([
    { id: 'annulla', testo: p.inCorso ? 'Annulla l’invio' : 'Annulla l’invio (già finito)', spenta: !p.inCorso },
    ...(p.quanteFinite > 0 ? [SEPARATORE, { id: 'pulisci', testo: `Togli le finite (${p.quanteFinite})` } as VoceMenu] : [])
  ])
}

// ── divisori ───────────────────────────────────────────────────────────────

/** Il tasto destro su un divisore: la misura iniziale, come il doppio clic. */
export function vociDivisore(nome: string): VoceMenu[] {
  return [{ id: 'iniziale', testo: `Misura iniziale per ${nome}` }]
}
