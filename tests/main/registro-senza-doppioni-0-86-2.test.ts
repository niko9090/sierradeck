import { describe, it, expect } from 'vitest'
import { consoleNelRegistro } from '../../src/main/console-nel-registro'

/**
 * 0.86.2: le righe del registro comparivano due o tre volte. `registro.ts`
 * ripete in console ogni riga («[registro] …») e `console-nel-registro.ts` la
 * riscriveva nel file.
 */

describe('il registro non si riscrive da solo', () => {
  /** Un registro come quello vero: scrive e ripete in console con «[registro] ». */
  function ambiente(): { righe: string[]; c: Pick<Console, 'warn' | 'error'>; registro: { info: (m: string) => void; errore: (m: string) => void } } {
    const righe: string[] = []
    const c: Pick<Console, 'warn' | 'error'> = { warn: () => undefined, error: () => undefined }
    const registro = {
      info: (m: string) => { righe.push(`info ${m}`); c.warn(`[registro] ${m}`) },
      errore: (m: string) => { righe.push(`ERRORE ${m}`); c.error(`[registro] ${m}`) }
    }
    consoleNelRegistro(registro, c)
    return { righe, c, registro }
  }

  it('una riga scritta direttamente nel registro ci finisce una volta sola', () => {
    const { righe, registro } = ambiente()
    registro.errore('[pty-host] non uscito entro 800 ms')
    registro.info('[avvio] prima finestra a schermo dopo 2.1 s')
    expect(righe).toEqual(['ERRORE [pty-host] non uscito entro 800 ms', 'info [avvio] prima finestra a schermo dopo 2.1 s'])
  })

  it('una riga dalla console ci finisce una volta sola', () => {
    const { righe, c } = ambiente()
    c.error('[workspace] salvataggio fallito')
    expect(righe).toEqual(['ERRORE [workspace] salvataggio fallito'])
  })

  it('le righe che contengono «[registro]» altrove si scrivono ancora', () => {
    const { righe, c } = ambiente()
    c.warn('[layout] visto [registro] nel mezzo')
    expect(righe).toEqual(['info [layout] visto [registro] nel mezzo'])
  })
})
