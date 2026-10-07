/**
 * «Una chat, una casa» (0.42.0): le regole pure.
 *
 * Progetto: `.sierradeck/quaderno/2026-10-02-una-chat-una-casa-progetto.md`.
 * Ogni chat ha un PC di casa, dove gira il suo `claude.exe` e sta la sua
 * cartella. Il Drive è il salvataggio di ogni PC, non più il motore che
 * copiava le chat da un PC all'altro.
 *
 * Qui, senza disco né Drive:
 * - la decisione della casa e il suo motivo (`decidiCasa`);
 * - l'unione delle case scritte da più PC (`unisciCase`);
 * - quali chat di qui sono fuori casa, e il piano del riordino e del suo
 *   annullamento (`fuoriCasa`, `pianoRiordino`, `pianoAnnulla`);
 * - cosa sale e cosa scende con la sincronia (`saleDaQui`, `scendeQui`);
 * - la migrazione del manifesto, verificata (`manifestoConProprietari`,
 *   `verificaMigrazione`);
 * - i controlli e i passi di «Sposta progetto» (`controlliSposta`, `PASSI_SPOSTA`).
 */

/* ------------------------------------------------------------------ */
/* La casa.                                                            */
/* ------------------------------------------------------------------ */

/** Da dove viene una decisione: dice anche quanto pesa. */
export type FonteCasa = 'regola' | 'nascita' | 'nicholas' | 'sposta'

export type CasaChat = {
  pc: string
  pcNome: string
  motivo: string
  decisaIl: string
  da: FonteCasa
  /** Il PC dove Nicholas ha fatto la scelta (0.52.0, «Ospitata da»). */
  sceltaDa?: string
}

export type CaseChat = { versione: 1; case: Record<string, CasaChat> }

export function caseVuote(): CaseChat { return { versione: 1, case: {} } }

/** Quanto pesa una decisione: Nicholas e «Sposta» battono la regola e la nascita. */
function peso(f: FonteCasa): number { return f === 'nicholas' || f === 'sposta' ? 2 : 1 }

/**
 * Le case scritte da più PC, unite voce per voce. Vince la decisione più
 * forte; fra due della stessa forza, quella di Nicholas o di «Sposta» più
 * recente (è l'ultima scelta), quella della regola più vecchia (la prima
 * decisione non si ribalta da sola).
 *
 * Due PC che si dicono casa nello stesso istante (0.52.0): vince l'id di PC
 * più grande, così ogni PC arriva alla stessa risposta in qualunque ordine
 * unisca. Prima vinceva «l'ultima arrivata», e due PC potevano restare in
 * disaccordo per sempre.
 */
export function unisciCase(a: CaseChat, b: CaseChat): CaseChat {
  const fuori: Record<string, CasaChat> = { ...a.case }
  for (const [s, cb] of Object.entries(b.case)) {
    const ca = fuori[s]
    if (ca === undefined) { fuori[s] = cb; continue }
    if (peso(cb.da) !== peso(ca.da)) { if (peso(cb.da) > peso(ca.da)) fuori[s] = cb; continue }
    if (cb.decisaIl === ca.decisaIl) { if (cb.pc > ca.pc) fuori[s] = cb; continue }
    const piuRecente = cb.decisaIl > ca.decisaIl
    if (peso(cb.da) === 2 ? piuRecente : !piuRecente) fuori[s] = cb
  }
  return { versione: 1, case: fuori }
}

export function leggiCase(x: unknown): CaseChat {
  if (typeof x !== 'object' || x === null) return caseVuote()
  const c = (x as { case?: unknown }).case
  if (typeof c !== 'object' || c === null) return caseVuote()
  const fuori: Record<string, CasaChat> = {}
  for (const [s, v] of Object.entries(c as Record<string, unknown>)) {
    if (typeof v !== 'object' || v === null) continue
    const o = v as Record<string, unknown>
    if (typeof o.pc !== 'string' || o.pc === '' || typeof o.decisaIl !== 'string') continue
    const da: FonteCasa = o.da === 'nascita' || o.da === 'nicholas' || o.da === 'sposta' ? o.da : 'regola'
    fuori[s] = { pc: o.pc, pcNome: typeof o.pcNome === 'string' ? o.pcNome : o.pc, motivo: typeof o.motivo === 'string' ? o.motivo : '', decisaIl: o.decisaIl, da, ...(typeof o.sceltaDa === 'string' ? { sceltaDa: o.sceltaDa } : {}) }
  }
  return { versione: 1, case: fuori }
}

/** Quello che si sa di una chat per decidere la sua casa. */
export type IndiziChat = {
  sessione: string
  /** La cartella in cui lavora (dal suo `.jsonl`), se la si conosce. */
  cwd?: string
  /** La copia di qui, se c'è: lunghezza e quando ha scritto l'ultimo messaggio. */
  qui?: { size: number; ultimoMessaggio?: string }
  /** La cartella esiste su questo PC. */
  cartellaQui: boolean
  /** È aperta adesso qui (un riquadro con questa conversazione). */
  apertaQui?: boolean
  /** Gli altri PC noti: se hanno la cartella e se la chat è aperta là adesso. */
  altri: { pcId: string; nome: string; haCartella: boolean; aperta: boolean }[]
  /** La copia sul Drive, se c'è: lunghezza e chi l'ha caricata (dalla 0.42.0). */
  drive?: { size: number; pc?: string }
}

export type Decisione = { pc: string; pcNome: string; motivo: string; regola: 'memorizzata' | 'nascita' | 'cartella' | 'attivita' | 'unica' }

const corta = (p: string): string => (p.length > 70 ? `…${p.slice(-68)}` : p)

/**
 * La casa di una chat. Prima quella memorizzata; poi, in ordine: dove è nata,
 * la cartella, l'ultima attività reale, l'unica copia conosciuta.
 */
export function decidiCasa(i: IndiziChat, io: { id: string; nome: string }, memorizzata?: CasaChat): Decisione {
  if (memorizzata !== undefined) return { pc: memorizzata.pc, pcNome: memorizzata.pcNome, motivo: memorizzata.motivo, regola: 'memorizzata' }
  const dove = i.cwd !== undefined ? ` ${corta(i.cwd)}` : ''
  // 1. Nata qui: c'è solo qui, il Drive non l'ha mai vista.
  if (i.qui !== undefined && i.drive === undefined && !i.altri.some((a) => a.aperta)) {
    return { pc: io.id, pcNome: io.nome, motivo: `è nata su ${io.nome}: non è mai stata su nessun altro PC`, regola: 'nascita' }
  }
  // 2. La cartella c'è su un PC solo.
  const conCartella = [...(i.cartellaQui ? [{ pcId: io.id, nome: io.nome }] : []), ...i.altri.filter((a) => a.haCartella)]
  if (i.cwd !== undefined && conCartella.length === 1) {
    const c = conCartella[0] as { pcId: string; nome: string }
    return { pc: c.pcId, pcNome: c.nome, motivo: `la sua cartella${dove} c'è solo su ${c.nome}`, regola: 'cartella' }
  }
  // 3. L'ultima attività reale: aperta adesso da qualche parte, o la copia più avanti.
  const apertaAltrove = i.altri.find((a) => a.aperta)
  if (apertaAltrove !== undefined && i.apertaQui !== true) {
    return { pc: apertaAltrove.pcId, pcNome: apertaAltrove.nome, motivo: `è aperta adesso su ${apertaAltrove.nome}: è lì che lavora`, regola: 'attivita' }
  }
  if (i.apertaQui === true) return { pc: io.id, pcNome: io.nome, motivo: `è aperta adesso su ${io.nome}: è qui che lavora`, regola: 'attivita' }
  if (i.qui !== undefined && i.drive !== undefined) {
    if (i.qui.size >= i.drive.size) {
      return { pc: io.id, pcNome: io.nome, motivo: `la copia di ${io.nome} è la più avanti (${i.qui.size === i.drive.size ? 'uguale a quella sul Drive' : 'più lunga di quella sul Drive'})${i.qui.ultimoMessaggio !== undefined ? `, ultimo messaggio il ${i.qui.ultimoMessaggio.slice(0, 10)}` : ''}`, regola: 'attivita' }
    }
    const chi = i.drive.pc !== undefined ? i.altri.find((a) => a.pcId === i.drive?.pc) : conCartella.find((c) => c.pcId !== io.id) ?? i.altri[0]
    if (chi !== undefined && chi.pcId !== io.id) {
      return { pc: chi.pcId, pcNome: chi.nome, motivo: `la copia sul Drive è più avanti di quella di qui: ha continuato a lavorare su ${chi.nome}`, regola: 'attivita' }
    }
  }
  // 4. Resta dov'è.
  return { pc: io.id, pcNome: io.nome, motivo: `l'unica copia che conosco è su ${io.nome}`, regola: 'unica' }
}

/** Una decisione da memorizzare. */
export function casaDa(d: Decisione, da: FonteCasa, quando: string): CasaChat {
  return { pc: d.pc, pcNome: d.pcNome, motivo: d.motivo, decisaIl: quando, da }
}

/* ------------------------------------------------------------------ */
/* I percorsi delle chat.                                              */
/* ------------------------------------------------------------------ */

/**
 * La conversazione di un percorso della sincronia o del disco:
 * `chat/<slug>/<uuid>.jsonl` → `<uuid>`; i file dei sotto-agenti
 * (`chat/<slug>/<uuid>/subagents/…`) appartengono alla conversazione `<uuid>`.
 */
export function sessioneDiPercorso(p: string): string {
  const parti = p.replace(/\\/g, '/').split('/').filter((x) => x !== '')
  const i = parti[0] === 'chat' ? 1 : 0
  const resto = parti.slice(i + 1)
  if (resto.length >= 2) return resto[0] as string
  const nome = resto[0] ?? parti[parti.length - 1] ?? ''
  return nome.endsWith('.jsonl') ? nome.slice(0, -'.jsonl'.length) : nome
}

/* ------------------------------------------------------------------ */
/* La sincronia: cosa sale, cosa scende.                               */
/* ------------------------------------------------------------------ */

/**
 * Sale da questo PC? Solo le chat di cui è la casa, o senza casa (nate qui:
 * le altre senza casa le decide la migrazione). Tutto ciò che non è una chat
 * sale come prima.
 */
export function saleDaQui(percorso: string, cc: CaseChat, io: string): boolean {
  if (!percorso.startsWith('chat/')) return true
  const c = cc.case[sessioneDiPercorso(percorso)]
  return c === undefined || c.pc === io
}

/**
 * Scende da sola su questo PC? Solo le chat la cui casa è questo PC (per
 * esempio dopo una reinstallazione). Le chat degli altri PC non scendono più
 * in automatico: si guardano dal vivo, o si spostano con «Sposta progetto».
 */
export function scendeQui(percorso: string, cc: CaseChat, io: string): boolean {
  if (!percorso.startsWith('chat/')) return true
  return cc.case[sessioneDiPercorso(percorso)]?.pc === io
}

/* ------------------------------------------------------------------ */
/* La migrazione del manifesto.                                        */
/* ------------------------------------------------------------------ */

export type VoceMan = { nome: string; size: number; mtime: number; sha?: string; pc?: string }
export type Man = { versione: 1; creatoIl: string; file: Record<string, VoceMan> }

/** Il manifesto con il proprietario su ogni chat di cui si sa la casa. Niente si toglie. */
export function manifestoConProprietari(m: Man, cc: CaseChat): Man {
  const file: Record<string, VoceMan> = {}
  for (const [p, v] of Object.entries(m.file)) {
    const c = p.startsWith('chat/') ? cc.case[sessioneDiPercorso(p)] : undefined
    file[p] = c !== undefined && v.pc === undefined ? { ...v, pc: c.pc } : v
  }
  return { ...m, file }
}

/**
 * Nessuna perdita: ogni voce di prima c'è ancora dopo, con lo stesso file e
 * la stessa dimensione. Torna le voci perse o cambiate (vuoto = si può scrivere).
 */
export function verificaMigrazione(prima: Man, dopo: Man): string[] {
  const perse: string[] = []
  for (const [p, v] of Object.entries(prima.file)) {
    const d = dopo.file[p]
    if (d === undefined || d.nome !== v.nome || d.size !== v.size || d.sha !== v.sha) perse.push(p)
  }
  return perse
}

/* ------------------------------------------------------------------ */
/* Il riordino.                                                        */
/* ------------------------------------------------------------------ */

export type ChatQui = {
  sessione: string
  /** La cartella di Claude Code dove sta (lo slug). */
  slug: string
  titolo: string
  cwd?: string
  byte: number
  aperta: boolean
}

export type FuoriCasa = ChatQui & { casa: Decisione }

/** Le chat di qui che hanno casa altrove, con la casa proposta e il motivo. */
export function fuoriCasa(chat: ChatQui[], decidi: (c: ChatQui) => Decisione, io: string): FuoriCasa[] {
  return chat.map((c) => ({ ...c, casa: decidi(c) })).filter((c) => c.casa.pc !== io)
}

/** Raggruppate per PC di casa, per la finestra. */
export function perCasa(v: FuoriCasa[]): { pc: string; nome: string; chat: FuoriCasa[] }[] {
  const g = new Map<string, { pc: string; nome: string; chat: FuoriCasa[] }>()
  for (const c of v) {
    const x = g.get(c.casa.pc) ?? { pc: c.casa.pc, nome: c.casa.pcNome, chat: [] }
    x.chat.push(c)
    g.set(c.casa.pc, x)
  }
  return [...g.values()].sort((a, b) => a.nome.localeCompare(b.nome))
}

export type Spostamento = { sessione: string; da: string; a: string }
export type RegistroRiordino = {
  id: string
  /** `ospite` (0.52.0): la copia di qui spostata perché Nicholas ha scelto un altro PC come ospite. */
  tipo: 'riordino' | 'sposta' | 'ospite'
  quando: string
  /** Per «Sposta progetto»: dove è andato. */
  verso?: { pc: string; nome: string; cwd?: string }
  spostamenti: Spostamento[]
  /** Le case di prima, per l'annullamento. */
  casePrima: Record<string, CasaChat | null>
  annullatoIl?: string
}

const unisci = (...p: string[]): string => p.join('/').replace(/\\/g, '/').replace(/\/+/g, '/')

/**
 * Dove va ogni file nel riordino: dalla cartella dei progetti di Claude Code
 * alla cartella di recupero di questo riordino, con la stessa struttura
 * (`<slug>/<file>`). Solo percorsi relativi sicuri: niente `..`.
 */
export function pianoRiordino(p: { id: string; radiceProgetti: string; recupero: string; file: { sessione: string; relativo: string }[] }): Spostamento[] {
  return p.file
    .filter((f) => f.relativo !== '' && !f.relativo.split(/[\\/]/).includes('..'))
    .map((f) => ({ sessione: f.sessione, da: unisci(p.radiceProgetti, f.relativo), a: unisci(p.recupero, p.id, f.relativo) }))
}

/**
 * L'annullamento: ogni file torna dov'era, **se lì non c'è già qualcosa**. In
 * quel caso la copia di recupero resta e lo si dice: niente si sovrascrive.
 */
export function pianoAnnulla(r: RegistroRiordino, esiste: (percorso: string) => boolean): { rimetti: Spostamento[]; restano: { sessione: string; perche: string; dove: string }[] } {
  const rimetti: Spostamento[] = []
  const restano: { sessione: string; perche: string; dove: string }[] = []
  for (const s of r.spostamenti) {
    if (!esiste(s.a)) { restano.push({ sessione: s.sessione, perche: 'la copia di recupero non c’è più', dove: s.a }); continue }
    if (esiste(s.da)) { restano.push({ sessione: s.sessione, perche: 'al suo posto c’è già un’altra copia: non la sovrascrivo', dove: s.a }); continue }
    rimetti.push({ sessione: s.sessione, da: s.a, a: s.da })
  }
  return { rimetti, restano }
}

/* ------------------------------------------------------------------ */
/* «Sposta progetto».                                                  */
/* ------------------------------------------------------------------ */

export const PASSI_SPOSTA = [
  {
    id: 'scelta',
    titolo: 'Scelta',
    testo: 'Scegli il progetto da spostare (una cartella di questo PC, con le sue chat) e il PC dove deve andare a vivere. Da lì in poi le sue chat lavoreranno su quel PC: qui le potrai guardare dal vivo, come quelle di ogni altro PC.'
  },
  {
    id: 'controlli',
    titolo: 'Controlli',
    testo: 'Prima di toccare qualcosa controllo che si possa fare senza perdere niente: nessuna chat del progetto aperta o al lavoro qui, nessun autopilota sulla cartella, il lavoro salvato (con git: niente modifiche fuori da un commit), Drive e cassaforte aperti, il PC di destinazione raggiungibile e con la 0.42.0. Se qualcosa non va te lo dico, con cosa fare, e non proseguo.'
  },
  {
    id: 'trasferimento',
    titolo: 'Trasferimento',
    testo: 'Salvo sul Drive le chat del progetto e la sua cartella (se la cartella non è ancora un progetto sul Drive la metto sul Drive: è il modo in cui viaggia). Poi chiedo al PC di destinazione di portarlo da sé, con il suo «Porta qui». Qui non cambia ancora niente.'
  },
  {
    id: 'verifica',
    titolo: 'Verifica',
    testo: 'Il PC di destinazione mi dice dimensione e impronta di ogni chat che ha ricevuto, e le confronto con quelle di qui. Se anche una sola non torna mi fermo: niente è cambiato, la casa resta qui.'
  },
  {
    id: 'casa',
    titolo: 'Cambio della casa',
    testo: 'Le chat del progetto hanno casa sul PC di destinazione. Da qui in poi lì salgono sul Drive e da lì si comandano; questo PC non le carica più.'
  },
  {
    id: 'archivio',
    titolo: 'Copia archiviata',
    testo: 'Le chat di qui vanno nella cartella di recupero di SierraDeck: non si cancellano, e «Annulla lo spostamento» le rimette al loro posto e riporta la casa qui. La cartella del codice resta dov’è, intatta.'
  }
] as const

export type StatoPerSposta = {
  chatAperte: number
  chatAlLavoro: number
  autopilotiAlLavoro: number
  git?: { repo: boolean; modifiche: number }
  driveCollegato: boolean
  cassaforteAperta: boolean
  destinazione?: { raggiungibile: boolean; strada?: string; versione?: string; nome: string }
  chatDaSpostare: number
}

export type Controllo = { id: string; ok: boolean; titolo: string; cosaFare?: string }

/** Confronta due versioni `x.y.z` (senza dipendere da novita.ts). */
function almeno(v: string | undefined, minima: string): boolean {
  if (v === undefined || !/^\d+\.\d+\.\d+/.test(v)) return false
  const a = v.split('.').map((x) => Number.parseInt(x, 10) || 0)
  const b = minima.split('.').map((x) => Number.parseInt(x, 10) || 0)
  for (let i = 0; i < 3; i += 1) { if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0) }
  return true
}

/** I controlli del secondo passo, ognuno con cosa fare se non va. */
export function controlliSposta(s: StatoPerSposta): Controllo[] {
  const d = s.destinazione
  return [
    { id: 'chat', ok: s.chatDaSpostare > 0, titolo: s.chatDaSpostare > 0 ? `${s.chatDaSpostare} chat da spostare` : 'Nessuna chat di questo progetto su questo PC', ...(s.chatDaSpostare > 0 ? {} : { cosaFare: 'Scegli un progetto che abbia chat qui.' }) },
    { id: 'aperte', ok: s.chatAperte === 0, titolo: s.chatAperte === 0 ? 'Nessuna chat del progetto aperta qui' : `${s.chatAperte} chat del progetto aperte qui`, ...(s.chatAperte === 0 ? {} : { cosaFare: 'Chiudi i loro riquadri (la conversazione non si perde): una chat aperta scrive nel suo file mentre lo sposto.' }) },
    { id: 'lavoro', ok: s.chatAlLavoro === 0 && s.autopilotiAlLavoro === 0, titolo: s.chatAlLavoro === 0 && s.autopilotiAlLavoro === 0 ? 'Niente al lavoro sulla cartella' : `Al lavoro sulla cartella: ${s.chatAlLavoro} chat, ${s.autopilotiAlLavoro} autopiloti`, ...(s.chatAlLavoro === 0 && s.autopilotiAlLavoro === 0 ? {} : { cosaFare: 'Aspetta che finiscano o fermali: spostare un lavoro a metà lo spezzerebbe in due.' }) },
    ...(s.git?.repo === true
      ? [{ id: 'git', ok: s.git.modifiche === 0, titolo: s.git.modifiche === 0 ? 'Lavoro salvato: niente modifiche fuori da un commit' : `${s.git.modifiche} file modificati fuori da un commit`, ...(s.git.modifiche === 0 ? {} : { cosaFare: 'Fai un commit (o chiedilo a una chat) prima di spostare: così sul PC di destinazione arriva lo stesso lavoro che vedi qui.' }) }]
      : [{ id: 'git', ok: true, titolo: 'La cartella non è un repository git: la porto com’è, attraverso il Drive' }]),
    { id: 'drive', ok: s.driveCollegato && s.cassaforteAperta, titolo: s.driveCollegato && s.cassaforteAperta ? 'Drive collegato e cassaforte aperta' : !s.driveCollegato ? 'Il Drive di questo PC non è collegato' : 'La cassaforte è chiusa', ...(s.driveCollegato && s.cassaforteAperta ? {} : { cosaFare: !s.driveCollegato ? 'Account → Drive → Collega: il progetto viaggia attraverso il Drive.' : 'Account → Cassaforte: aprila con la passphrase.' }) },
    d === undefined
      ? { id: 'destinazione', ok: false, titolo: 'Nessun PC di destinazione scelto', cosaFare: 'Scegli dove spostarlo, al primo passo.' }
      : !d.raggiungibile
        ? { id: 'destinazione', ok: false, titolo: `${d.nome} non risponde`, cosaFare: `Accendi ${d.nome} con SierraDeck aperto e il Drive collegato; deve essere raggiungibile (rete di casa, Tailscale o collegamento diretto).` }
        : !almeno(d.versione, '0.42.0')
          ? { id: 'destinazione', ok: false, titolo: `${d.nome} ha la ${d.versione ?? 'versione sconosciuta'}`, cosaFare: `Aggiorna ${d.nome} alla 0.42.0 o successiva: le versioni prima non sanno ricevere un progetto.` }
          : { id: 'destinazione', ok: true, titolo: `${d.nome} risponde${d.strada !== undefined ? ` (${d.strada})` : ''} e ha la ${d.versione ?? ''}` }
  ]
}

export function sipuoSpostare(c: Controllo[]): boolean { return c.every((x) => x.ok) }

/**
 * La verifica del quarto passo: ogni chat di qui deve essere arrivata là con
 * la stessa dimensione e la stessa impronta.
 */
export function verificaSposta(qui: Record<string, { size: number; sha: string }>, la: Record<string, { size: number; sha?: string } | undefined>): { ok: boolean; diverse: string[] } {
  const diverse = Object.entries(qui).filter(([s, v]) => { const x = la[s]; return x === undefined || x.size !== v.size || (x.sha !== undefined && x.sha !== v.sha) }).map(([s]) => s)
  return { ok: diverse.length === 0, diverse }
}
