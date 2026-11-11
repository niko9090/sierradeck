/**
 * I modelli fra cui scegliere, con il nome per intero.
 *
 * Un elenco solo, usato dalla fascia e da ogni riquadro: erano due, e quello
 * dei riquadri era rimasto alle famiglie — «opus», «sonnet» — mentre l'altro
 * aveva già i nomi veri. Due elenchi della stessa cosa divergono sempre, e
 * quello che nessuno guarda invecchia per primo.
 *
 * Gli alias di famiglia restano in cima perché seguono da soli quando esce una
 * versione nuova: chi non vuole pensarci li sceglie e non ci pensa più. Sotto,
 * i nomi precisi per chi vuole *proprio quello*.
 */
export type Modello = { valore: string; etichetta: string }

export const MODELLI_FISSI: Modello[] = [
  { valore: 'default', etichetta: 'Predefinito (quello del tuo account)' },
  { valore: 'opus', etichetta: 'Opus — sempre l’ultimo' },
  { valore: 'sonnet', etichetta: 'Sonnet — sempre l’ultimo' },
  { valore: 'haiku', etichetta: 'Haiku — sempre l’ultimo' },
  { valore: 'opusplan', etichetta: 'Opus per pianificare, Sonnet per fare' },
  { valore: 'claude-fable-5-2', etichetta: 'Fable 5.2' },
  { valore: 'claude-opus-5-5', etichetta: 'Opus 5.5' },
  { valore: 'claude-opus-5-5[1m]', etichetta: 'Opus 5.5 — contesto da 1M' },
  { valore: 'claude-sonnet-5-5', etichetta: 'Sonnet 5.5' },
  { valore: 'claude-haiku-5-5', etichetta: 'Haiku 5.5' },
  { valore: 'claude-fable-5', etichetta: 'Fable 5' },
  { valore: 'claude-opus-5', etichetta: 'Opus 5' },
  { valore: 'claude-opus-5[1m]', etichetta: 'Opus 5 — contesto da 1M' },
  { valore: 'claude-sonnet-5', etichetta: 'Sonnet 5' },
  { valore: 'claude-opus-4-8', etichetta: 'Opus 4.8' },
  { valore: 'claude-sonnet-4-5', etichetta: 'Sonnet 4.5' },
  { valore: 'claude-haiku-4-5-20251001', etichetta: 'Haiku 4.5' }
]

/** L'elenco fisso: la ricaduta quando la scoperta non risponde. */
export const MODELLI: Modello[] = MODELLI_FISSI

/** Gli alias che il comando `claude` capisce da solo. */
export const ALIAS_MODELLI = ['default', 'opus', 'sonnet', 'haiku', 'opusplan'] as const

/**
 * Un modello che si può passare al comando: un alias, o un id nuovo con forma
 * `claude-…`. La forma è stretta (niente spazi né simboli di shell) perché il
 * valore finisce in un argomento di riga di comando.
 */
export function modelloValido(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > 80) return false
  return (ALIAS_MODELLI as readonly string[]).includes(v) || /^claude-[a-z0-9][a-z0-9.-]*(\[1m\])?$/i.test(v)
}

/** `claude-opus-5-5` → «Opus 5.5»; `…[1m]` aggiunge il contesto. */
export function etichettaModello(id: string): string {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(\[1m\])?$/i.exec(id.trim())
  if (m === null) return id
  const f = (m[1] ?? '').charAt(0).toUpperCase() + (m[1] ?? '').slice(1)
  return `${f} ${m[3] !== undefined ? `${m[2]}.${m[3]}` : m[2]}${m[4] !== undefined ? ' — contesto da 1M' : ''}`
}

/**
 * L'elenco fisso più i modelli scoperti che non ci sono ancora: i nuovi vanno
 * in cima ai nomi precisi, sotto gli alias.
 */
export function unisciModelli(scoperti: readonly string[], fissi: Modello[] = MODELLI_FISSI): Modello[] {
  const noti = new Set(fissi.map((m) => m.valore))
  const nuovi: Modello[] = []
  for (const id of scoperti) {
    if (!modelloValido(id) || noti.has(id)) continue
    noti.add(id)
    nuovi.push({ valore: id, etichetta: etichettaModello(id) })
  }
  const primoPreciso = fissi.findIndex((m) => m.valore.startsWith('claude-'))
  const dove = primoPreciso < 0 ? fissi.length : primoPreciso
  return [...fissi.slice(0, dove), ...nuovi, ...fissi.slice(dove)]
}

/** Quelli che l'autopilota può usare per coordinare: Opus, Sonnet, Fable. */
export function modelliAutopilota(elenco: readonly Modello[]): Modello[] {
  return elenco.filter((m) => modelloAutopilotaAmmesso(m.valore))
}

/** Chi può coordinare: gli alias Opus e Sonnet, o un id preciso Opus, Sonnet o Fable (senza il contesto da 1M). */
export function modelloAutopilotaAmmesso(v: unknown): v is string {
  return typeof v === 'string' && modelloValido(v) && (v === 'opus' || v === 'sonnet' || (/^claude-(opus|sonnet|fable)-/.test(v) && !v.endsWith('[1m]')))
}
