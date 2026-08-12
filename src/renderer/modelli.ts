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

export const MODELLI: Modello[] = [
  { valore: 'default', etichetta: 'Predefinito (quello del tuo account)' },
  { valore: 'opus', etichetta: 'Opus — sempre l’ultimo' },
  { valore: 'sonnet', etichetta: 'Sonnet — sempre l’ultimo' },
  { valore: 'haiku', etichetta: 'Haiku — sempre l’ultimo' },
  { valore: 'opusplan', etichetta: 'Opus per pianificare, Sonnet per fare' },
  { valore: 'claude-fable-5', etichetta: 'Fable 5' },
  { valore: 'claude-opus-5', etichetta: 'Opus 5' },
  { valore: 'claude-opus-5[1m]', etichetta: 'Opus 5 — contesto da 1M' },
  { valore: 'claude-sonnet-5', etichetta: 'Sonnet 5' },
  { valore: 'claude-opus-4-8', etichetta: 'Opus 4.8' },
  { valore: 'claude-sonnet-4-5', etichetta: 'Sonnet 4.5' },
  { valore: 'claude-haiku-4-5-20251001', etichetta: 'Haiku 4.5' }
]

/** Quelli che si possono passare a `/model` in una chat già aperta. */
export const MODELLI_IN_CHAT: Modello[] = MODELLI.filter((m) => m.valore !== 'default')
