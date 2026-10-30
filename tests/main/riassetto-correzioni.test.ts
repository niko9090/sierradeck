import { describe, it, expect } from 'vitest'
import { comandoSenzaShell } from '../../src/main/claude-versione'
import { consoleNelRegistro } from '../../src/main/console-nel-registro'
import { messaggioChatAltrove } from '../../src/shared/posta'
import { rispostaConPazienza } from '../../src/shared/riquadri-morti'

/** Le correzioni piccole che viaggiano con il riassetto (0.88). */
describe('npm.cmd senza shell: true (DEP0190)', () => {
  it('su Windows passa da cmd /d /c con gli argomenti suoi, altrove si lancia com’è', () => {
    const [c, args] = comandoSenzaShell('npm.cmd', ['view', '@anthropic-ai/claude-code', 'version'], true)
    expect(c.toLowerCase()).toMatch(/cmd(\.exe)?$/)
    expect(args).toEqual(['/d', '/c', 'npm.cmd', 'view', '@anthropic-ai/claude-code', 'version'])
    expect(comandoSenzaShell('npm', ['view'], false)).toEqual(['npm', ['view']])
  })
})

describe('il rifiuto atteso di una chat di un altro PC', () => {
  it('va nel registro come informazione, gli altri errori restano errori', () => {
    const righe: Array<[string, string]> = []
    const finta = { warn: () => undefined, error: () => undefined } as unknown as Pick<Console, 'warn' | 'error'>
    const torna = consoleNelRegistro({ info: (m) => righe.push(['info', m]), errore: (m) => righe.push(['errore', m]) }, finta)
    finta.error(`Error occurred in handler for 'pty:spawn': Error: ${messaggioChatAltrove({ cwd: 'C:\\x', pc: { id: 'p', nome: 'Casa' }, sessionUuid: 's' })}`)
    finta.error('Error occurred in handler for \'pty:spawn\': Error: CHAT_CHIUSA_SENZA_CARTELLA:{}')
    torna()
    expect(righe.map((r) => r[0])).toEqual(['info', 'errore'])
  })
})

describe('i riquadri morti con un servizio lento', () => {
  const dormi = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms / 100))

  it('una risposta entro il primo tetto basta', async () => {
    expect(await rispostaConPazienza(async () => 'ok', { primaMs: 2000, poiMs: 6000, serve: () => true, dormi })).toBe('ok')
  })

  it('in ritardo: si aspetta ancora solo se serve, la stessa richiesta', async () => {
    let chieste = 0
    const lenta = (): Promise<string> => { chieste += 1; return new Promise((r) => setTimeout(() => r('tardi'), 40)) }
    expect(await rispostaConPazienza(lenta, { primaMs: 2000, poiMs: 6000, serve: () => true, dormi })).toBe('tardi')
    expect(chieste).toBe(1)
    expect(await rispostaConPazienza(lenta, { primaMs: 2000, poiMs: 6000, serve: () => false, dormi })).toBeUndefined()
  })

  it('una richiesta fallita si rifà una volta; senza risposta torna undefined (non si toglie niente)', async () => {
    let chieste = 0
    const r = await rispostaConPazienza(async () => { chieste += 1; if (chieste === 1) throw new Error('giù'); return 'seconda' }, { primaMs: 2000, poiMs: 6000, serve: () => true, dormi })
    expect(r).toBe('seconda')
    const mai = await rispostaConPazienza(() => new Promise<string>(() => undefined), { primaMs: 2000, poiMs: 6000, serve: () => true, dormi })
    expect(mai).toBeUndefined()
  })
})
