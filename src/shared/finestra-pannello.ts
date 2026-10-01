/**
 * Le linguette della scheda dell'autopilota **staccate in una finestra vera**
 * (0.38.0): una «finestra pannello» del sistema operativo, da portare anche su
 * un altro schermo. Nicholas (01/10): «si su un altro schermo esatto non come
 * chat».
 *
 * Qui la parte pura: dove aprirla (schermo, posizione, grandezza), riportata
 * sullo schermo principale se il suo non c'e' piu' o se e' fuori dall'area
 * visibile, e quali riaprire al riavvio. La crea il main
 * (`finestre-pannello.ts`), che **non** la tratta come una finestra di chat.
 */

export type LinguettaStaccabile = 'domande' | 'lavoro' | 'file' | 'obiettivo' | 'criteri' | 'compiti' | 'diario'
export const LINGUETTE_STACCABILI: LinguettaStaccabile[] = ['domande', 'lavoro', 'file', 'obiettivo', 'criteri', 'compiti', 'diario']

export function eLinguettaStaccabile(x: unknown): x is LinguettaStaccabile {
  return typeof x === 'string' && (LINGUETTE_STACCABILI as string[]).includes(x)
}

export type Rettangolo = { x: number; y: number; width: number; height: number }

/** Dove sta una finestra pannello: lo schermo (chiave stabile del monitor) e il rettangolo. */
export type PosizionePannello = { schermo: string } & Rettangolo

/** Uno schermo, come lo dice `screen.getAllDisplays()`: l'area visibile (senza barre). */
export type SchermoPannello = { chiave: string; area: Rettangolo; principale: boolean }

export const GRANDEZZA_MINIMA = { width: 320, height: 240 } as const
export const GRANDEZZA_PREDEFINITA = { width: 520, height: 640 } as const

export function chiavePannello(autopilota: string, linguetta: LinguettaStaccabile): string {
  return `${autopilota}|${linguetta}`
}

/**
 * Dove aprire la finestra. Le regole:
 * - lo schermo salvato, se c'e' ancora; altrimenti il principale (o il primo);
 * - la grandezza mai sotto il minimo, mai oltre l'area dello schermo;
 * - la finestra intera dentro l'area visibile: se era fuori (schermo
 *   rimpicciolito, risoluzione cambiata) la si riporta dentro;
 * - senza posizione salvata, o su uno schermo sparito, al centro del principale.
 */
export function sistemaPosizione(salvata: PosizionePannello | undefined, schermi: SchermoPannello[]): PosizionePannello {
  const principale = schermi.find((s) => s.principale) ?? schermi[0]
  if (principale === undefined) {
    return { schermo: salvata?.schermo ?? '', x: salvata?.x ?? 0, y: salvata?.y ?? 0, ...grandezza(salvata, undefined) }
  }
  const suo = salvata !== undefined ? schermi.find((s) => s.chiave === salvata.schermo) : undefined
  const dove = suo ?? principale
  const g = grandezza(salvata, dove.area)
  if (suo === undefined || salvata === undefined) {
    return {
      schermo: dove.chiave,
      x: dove.area.x + Math.round((dove.area.width - g.width) / 2),
      y: dove.area.y + Math.round((dove.area.height - g.height) / 2),
      ...g
    }
  }
  const x = Math.min(Math.max(salvata.x, dove.area.x), dove.area.x + dove.area.width - g.width)
  const y = Math.min(Math.max(salvata.y, dove.area.y), dove.area.y + dove.area.height - g.height)
  return { schermo: dove.chiave, x, y, ...g }
}

function grandezza(s: Partial<Rettangolo> | undefined, area: Rettangolo | undefined): { width: number; height: number } {
  const w = Math.max(GRANDEZZA_MINIMA.width, Math.round(s?.width ?? GRANDEZZA_PREDEFINITA.width))
  const h = Math.max(GRANDEZZA_MINIMA.height, Math.round(s?.height ?? GRANDEZZA_PREDEFINITA.height))
  return area === undefined
    ? { width: w, height: h }
    : { width: Math.min(w, Math.max(GRANDEZZA_MINIMA.width, area.width)), height: Math.min(h, Math.max(GRANDEZZA_MINIMA.height, area.height)) }
}

/** Lo schermo che contiene di piu' quel rettangolo (o il principale). */
export function schermoDi(r: Rettangolo, schermi: SchermoPannello[]): SchermoPannello | undefined {
  let migliore: SchermoPannello | undefined
  let area = 0
  for (const s of schermi) {
    const w = Math.max(0, Math.min(r.x + r.width, s.area.x + s.area.width) - Math.max(r.x, s.area.x))
    const h = Math.max(0, Math.min(r.y + r.height, s.area.y + s.area.height) - Math.max(r.y, s.area.y))
    if (w * h > area) { area = w * h; migliore = s }
  }
  return migliore ?? schermi.find((s) => s.principale) ?? schermi[0]
}

export type ArchivioPannelli = {
  /** Per autopilota e linguetta: dove stava la sua finestra. */
  posizioni: Record<string, PosizionePannello>
  /** Le finestre aperte, da riaprire al riavvio. */
  aperti: { autopilota: string; linguetta: LinguettaStaccabile }[]
}

/** Oltre queste, le posizioni piu' vecchie si dimenticano. */
export const POSIZIONI_RICORDATE = 120

export function ricordaPosizione(a: ArchivioPannelli, chiave: string, p: PosizionePannello): ArchivioPannelli {
  const { [chiave]: _vecchia, ...resto } = a.posizioni
  const voci = Object.entries(resto).slice(-(POSIZIONI_RICORDATE - 1))
  return { ...a, posizioni: { ...Object.fromEntries(voci), [chiave]: p } }
}

export function segnaAperto(a: ArchivioPannelli, autopilota: string, linguetta: LinguettaStaccabile, aperto: boolean): ArchivioPannelli {
  const senza = a.aperti.filter((x) => !(x.autopilota === autopilota && x.linguetta === linguetta))
  return { ...a, aperti: aperto ? [...senza, { autopilota, linguetta }] : senza }
}

/** Al riavvio: solo quelle di autopiloti che esistono ancora. */
export function daRiaprire(a: ArchivioPannelli, autopilotiEsistenti: string[]): { autopilota: string; linguetta: LinguettaStaccabile }[] {
  const esistono = new Set(autopilotiEsistenti)
  return a.aperti.filter((x) => esistono.has(x.autopilota))
}

/** L'archivio letto con prudenza: cio' che non si capisce si scarta. */
export function leggiArchivioPannelli(raw: unknown): ArchivioPannelli {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const posizioni: Record<string, PosizionePannello> = {}
  if (typeof o.posizioni === 'object' && o.posizioni !== null) {
    for (const [k, v] of Object.entries(o.posizioni as Record<string, unknown>)) {
      const p = v as Record<string, unknown>
      if (typeof p?.schermo === 'string' && [p.x, p.y, p.width, p.height].every((n) => typeof n === 'number' && Number.isFinite(n))) {
        posizioni[k] = { schermo: p.schermo, x: p.x as number, y: p.y as number, width: p.width as number, height: p.height as number }
      }
    }
  }
  const aperti = Array.isArray(o.aperti)
    ? o.aperti.flatMap((x) => {
        const v = x as Record<string, unknown>
        return typeof v?.autopilota === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v.autopilota) && eLinguettaStaccabile(v.linguetta)
          ? [{ autopilota: v.autopilota, linguetta: v.linguetta }]
          : []
      })
    : []
  return { posizioni, aperti }
}
