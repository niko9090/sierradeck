import { avviaServizio } from './index'

/**
 * Il punto d'ingresso del processo del servizio.
 *
 * Esiste come file separato per una ragione precisa: `index.ts` deve poter
 * essere importato — dai test, da un altro modulo — **senza aprire una porta**.
 * Una guardia dentro `index.ts` non basterebbe: gli `import` di un modulo
 * vengono valutati prima di qualunque riga che li preceda nel file che li usa,
 * quindi una variabile impostata dal test arriverebbe sempre troppo tardi.
 */
avviaServizio()
