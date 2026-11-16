import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { avviaProcessoReale, type AccessoProcesso } from '../../src/autopilot-host/processo-claude'

/**
 * Il gettone di un anno arriva davvero al processo, e un rifiuto di Claude lo
 * segna. Al posto di `claude` un `node -e` che si comporta come lui.
 */
function prova(script: string, conGettone: boolean): Promise<{ righe: string[]; rifiuti: string[] }> {
  const rifiuti: string[] = []
  const accesso: AccessoProcesso = {
    ambiente: (env) => conGettone ? { env: { ...env, CLAUDE_CODE_OAUTH_TOKEN: 'gettone-finto' }, conGettone: true } : { env, conGettone: false },
    rifiutato: (p) => { rifiuti.push(p) }
  }
  const avvia = avviaProcessoReale(process.execPath, async () => {}, accesso)
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (typeof v === 'string' && k !== 'CLAUDE_CODE_OAUTH_TOKEN') env[k] = v
  const p = avvia({ args: ['-e', script], cwd: tmpdir(), env })
  const righe: string[] = []
  p.suRiga((r) => righe.push(r))
  return new Promise((ok) => p.suUscita(() => ok({ righe, rifiuti })))
}

const ERRORE = "console.log(JSON.stringify({type:'result',is_error:true,result:'Failed to authenticate: this login reached its time limit'}))"

describe('processo claude con il gettone di un anno', () => {
  it('il gettone entra nell’ambiente del processo', async () => {
    const r = await prova("console.log(process.env.CLAUDE_CODE_OAUTH_TOKEN || 'nessuno')", true)
    expect(r.righe).toEqual(['gettone-finto'])
  })
  it('un rifiuto di Claude col gettone lo segna, una volta', async () => {
    const r = await prova(`${ERRORE};${ERRORE}`, true)
    expect(r.rifiuti).toHaveLength(1)
  })
  it('senza gettone un errore d’accesso non segna niente (è il login normale)', async () => {
    const r = await prova(ERRORE, false)
    expect(r.rifiuti).toHaveLength(0)
  })
})
