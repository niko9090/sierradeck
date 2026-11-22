import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cambiaVistaElenco, inElenco, rinominaInElenco } from '../../src/shared/vista-elenco'
import { normalizzaPreferenze } from '../../src/shared/preferenze'

// k-174f: «serverDSM» (autopilota) e «ServerDSM» (preferenza) sono lo stesso workspace;
// la colonna dell'autopilota è aperta di default e la scelta si ricorda.
const app = readFileSync(join(__dirname, '../../src/renderer/App.tsx'), 'utf8')

describe('nomi dei workspace senza maiuscole (k-174f)', () => {
  it('«serverDSM» vs «ServerDSM» entra nel formato', () => {
    expect(inElenco(['ServerDSM'], 'serverDSM')).toBe(true)
    expect(inElenco(['ServerDSM'], '  serverdsm ')).toBe(true)
    expect(inElenco(['Altro'], 'serverDSM')).toBe(false)
    expect(cambiaVistaElenco(['ServerDSM'], 'serverDSM', true)).toEqual(['serverDSM'])
    expect(cambiaVistaElenco(['ServerDSM'], 'serverDSM', false)).toEqual([])
    expect(rinominaInElenco(['ServerDSM'], 'serverDSM', 'Nuovo')).toEqual(['Nuovo'])
  })

  it('App.tsx confronta con inElenco, non con includes esatto', () => {
    expect(app).not.toMatch(/workspaceElenco\.includes\(/)
    expect(app).toContain('inElenco(workspaceElenco, ws)')
    expect(app).toContain('inElenco(workspaceElenco, workspace.attivo)')
  })
})

describe('colonna dell’autopilota (k-174f)', () => {
  it('aperta di default', () => {
    expect(app).toMatch(/\[colonnaAutopilota, setColonnaAutopilota\] = useState\(true\)/)
    expect(normalizzaPreferenze({}).colonnaAutopilotaAperta).toBeUndefined()
  })

  it('la scelta di chiuderla si ricorda nelle preferenze', () => {
    expect(normalizzaPreferenze({ colonnaAutopilotaAperta: false }).colonnaAutopilotaAperta).toBe(false)
    expect(normalizzaPreferenze({ colonnaAutopilotaAperta: true }).colonnaAutopilotaAperta).toBeUndefined()
    expect(app).toContain('colonnaAutopilotaAperta: v ? undefined : false')
    expect(app).toContain('setColonnaAutopilota(p.colonnaAutopilotaAperta !== false)')
  })
})
