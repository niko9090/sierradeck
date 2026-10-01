/**
 * La linguetta «File» dell'autopilota (0.38.0): i file che ha cambiato, per
 * chat, con lo stato, le righe +/− e se sono gia' salvati in un commit.
 *
 * Nicholas (01/10): serve a controllare i file che l'autopilota cambia. Qui
 * stanno i pezzi puri — la lettura dell'uscita di git e il raggruppamento —
 * provati senza git; chi chiama git sta nel main (`file-autopilota.ts`).
 *
 * **Contro cosa si confronta:** il commit da cui l'autopilota e' partito
 * (`commitBase`, salvato dalla 0.38.0); per quelli partiti prima, il ramo
 * principale del progetto (`ramoBase`); se non c'e' nemmeno quello, solo le
 * modifiche non ancora salvate (contro `HEAD`).
 */

export type StatoFile = 'nuovo' | 'modificato' | 'cancellato' | 'rinominato'

export type FileCambiato = {
  percorso: string
  /** Il nome di prima, per un file rinominato. */
  vecchio?: string
  stato: StatoFile
  piu: number
  meno: number
  /** `true` = gia' in un commit sul ramo della chat; `false` = ancora da salvare. */
  salvato: boolean
  /** File binario: le righe non si contano. */
  binario?: boolean
}

export type GruppoChat = {
  /** `principale` per la cartella dell'autopilota, o l'id della chat. */
  chiave: string
  nome: string
  cartella: string
  ramo?: string
  /** Contro cosa si e' confrontato, detto per chi legge. */
  base: string
  file: FileCambiato[]
  /** Un errore di git per questa cartella (non e' un repository, …). */
  errore?: string
}

/** `R100\told\tnew`, `M\tfile`… → mappa percorso → stato. */
export function leggiNameStatus(uscita: string): Map<string, { stato: StatoFile; vecchio?: string }> {
  const fuori = new Map<string, { stato: StatoFile; vecchio?: string }>()
  for (const riga of uscita.split(/\r?\n/)) {
    if (riga.trim() === '') continue
    const parti = riga.split('\t')
    const codice = parti[0] ?? ''
    if (codice.startsWith('R') || codice.startsWith('C')) {
      const nuovo = parti[2]
      if (nuovo !== undefined) fuori.set(nuovo, { stato: 'rinominato', ...(parti[1] !== undefined ? { vecchio: parti[1] } : {}) })
      continue
    }
    const percorso = parti[1]
    if (percorso === undefined) continue
    fuori.set(percorso, { stato: codice.startsWith('A') ? 'nuovo' : codice.startsWith('D') ? 'cancellato' : 'modificato' })
  }
  return fuori
}

/**
 * `git status --porcelain=v1 -uall`: `XY percorso` o `XY vecchio -> nuovo`.
 * Le virgolette di git (percorsi con spazi o accenti) si tolgono.
 */
export function leggiStatusPorcelain(uscita: string): Map<string, { stato: StatoFile; vecchio?: string }> {
  const fuori = new Map<string, { stato: StatoFile; vecchio?: string }>()
  const togli = (p: string): string => (p.startsWith('"') && p.endsWith('"') ? p.slice(1, -1).replace(/\\"/g, '"') : p)
  for (const riga of uscita.split(/\r?\n/)) {
    if (riga.length < 4) continue
    const xy = riga.slice(0, 2)
    const resto = riga.slice(3)
    if (xy === '??') { fuori.set(togli(resto), { stato: 'nuovo' }); continue }
    if (xy.includes('R') || xy.includes('C')) {
      const [vecchio, nuovo] = resto.split(' -> ')
      if (nuovo !== undefined) fuori.set(togli(nuovo), { stato: 'rinominato', ...(vecchio !== undefined ? { vecchio: togli(vecchio) } : {}) })
      continue
    }
    fuori.set(togli(resto), { stato: xy.includes('A') ? 'nuovo' : xy.includes('D') ? 'cancellato' : 'modificato' })
  }
  return fuori
}

/**
 * `git diff --numstat`: `piu\tmeno\tpercorso`, `-\t-\tpercorso` per i binari,
 * e per i rinominati `percorso` come `dir/{vecchio => nuovo}` o `vecchio => nuovo`.
 */
export function leggiNumstat(uscita: string): Map<string, { piu: number; meno: number; binario: boolean }> {
  const fuori = new Map<string, { piu: number; meno: number; binario: boolean }>()
  for (const riga of uscita.split(/\r?\n/)) {
    const parti = riga.split('\t')
    if (parti.length < 3) continue
    const [p, m] = parti
    let percorso = parti.slice(2).join('\t')
    const graffe = /^(.*)\{(.*) => (.*)\}(.*)$/.exec(percorso)
    if (graffe !== null) percorso = `${graffe[1]}${graffe[3]}${graffe[4]}`.replace(/\/\//g, '/')
    else if (percorso.includes(' => ')) percorso = percorso.split(' => ')[1] ?? percorso
    const binario = p === '-' || m === '-'
    fuori.set(percorso, { piu: binario ? 0 : Number(p) || 0, meno: binario ? 0 : Number(m) || 0, binario })
  }
  return fuori
}

/**
 * Unisce quello che e' gia' in commit (dalla base al ramo) e quello ancora da
 * salvare (nella cartella). Un file che sta in tutti e due e' «da salvare»,
 * con lo stato di adesso e le righe sommate.
 */
export function unisciFile(p: {
  salvati: Map<string, { stato: StatoFile; vecchio?: string }>
  righeSalvati: Map<string, { piu: number; meno: number; binario: boolean }>
  daSalvare: Map<string, { stato: StatoFile; vecchio?: string }>
  righeDaSalvare: Map<string, { piu: number; meno: number; binario: boolean }>
}): FileCambiato[] {
  const tutti = new Set([...p.salvati.keys(), ...p.daSalvare.keys()])
  const fuori: FileCambiato[] = []
  for (const percorso of tutti) {
    const ora = p.daSalvare.get(percorso)
    const prima = p.salvati.get(percorso)
    const s = ora ?? prima!
    const r1 = p.righeSalvati.get(percorso)
    const r2 = p.righeDaSalvare.get(percorso)
    // Nuovo in un commit e poi modificato: resta «nuovo» rispetto alla base.
    const stato: StatoFile = prima?.stato === 'nuovo' && ora?.stato === 'modificato' ? 'nuovo' : s.stato
    const vecchio = s.vecchio ?? prima?.vecchio
    fuori.push({
      percorso,
      ...(vecchio !== undefined ? { vecchio } : {}),
      stato,
      piu: (r1?.piu ?? 0) + (r2?.piu ?? 0),
      meno: (r1?.meno ?? 0) + (r2?.meno ?? 0),
      salvato: ora === undefined,
      ...(r1?.binario === true || r2?.binario === true ? { binario: true } : {})
    })
  }
  // Prima quelli da salvare, poi in ordine di nome: è quello che si guarda prima.
  return fuori.sort((a, b) => Number(a.salvato) - Number(b.salvato) || a.percorso.localeCompare(b.percorso))
}

/** Le cartelle da guardare: quella dell'autopilota e i worktree delle sue chat. */
export function cartelleDaGuardare(a: {
  cwd: string
  commitBase?: string
  ramoBase?: string
  chats: { id: string; compito: string; cartella?: string; ramo?: string }[]
}): { chiave: string; nome: string; cartella: string; ramo?: string; base: string; spiegaBase: string }[] {
  const base = a.commitBase ?? a.ramoBase ?? 'HEAD'
  const spiega = a.commitBase !== undefined
    ? `dal commit da cui è partito (${a.commitBase.slice(0, 8)})`
    : a.ramoBase !== undefined
      ? `dal ramo principale «${a.ramoBase}» (partito prima della 0.38.0: il commit di partenza non era salvato)`
      : 'solo le modifiche non ancora salvate (il punto di partenza non è noto)'
  const fuori = [{ chiave: 'principale', nome: 'Cartella del progetto', cartella: a.cwd, base, spiegaBase: spiega }]
  a.chats.forEach((c, i) => {
    if (c.cartella === undefined || c.cartella === a.cwd) return
    fuori.push({
      chiave: c.id,
      nome: `Chat ${i + 1}: ${c.compito.slice(0, 60)}`,
      cartella: c.cartella,
      ...(c.ramo !== undefined ? { ramo: c.ramo } : {}),
      base,
      spiegaBase: spiega
    })
  })
  return fuori
}

export type RigaDiff = { tipo: 'piu' | 'meno' | 'contesto' | 'blocco' | 'testa'; testo: string }

/** Un diff unificato in righe da colorare; le intestazioni di file a parte. */
export function leggiDiff(testo: string, max = 4000): { righe: RigaDiff[]; tagliato: boolean } {
  const tutte = testo.split(/\r?\n/)
  const righe: RigaDiff[] = []
  for (const r of tutte) {
    if (righe.length >= max) return { righe, tagliato: true }
    if (r.startsWith('diff --git') || r.startsWith('index ') || r.startsWith('--- ') || r.startsWith('+++ ') || r.startsWith('new file') || r.startsWith('deleted file') || r.startsWith('similarity') || r.startsWith('rename ')) {
      righe.push({ tipo: 'testa', testo: r })
    } else if (r.startsWith('@@')) righe.push({ tipo: 'blocco', testo: r })
    else if (r.startsWith('+')) righe.push({ tipo: 'piu', testo: r.slice(1) })
    else if (r.startsWith('-')) righe.push({ tipo: 'meno', testo: r.slice(1) })
    else if (r !== '' || righe.length > 0) righe.push({ tipo: 'contesto', testo: r.startsWith(' ') ? r.slice(1) : r })
  }
  return { righe, tagliato: false }
}

/** Un percorso relativo sicuro: niente risalite, niente assoluti. */
export function percorsoSicuro(p: string): boolean {
  return p !== '' && !p.includes('\0') && !/^([a-zA-Z]:|[\\/])/.test(p) && !p.split(/[\\/]/).includes('..')
}
