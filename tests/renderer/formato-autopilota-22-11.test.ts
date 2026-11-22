import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// k-174b: ogni chat di workspace con un autopilota si vede nel formato
// autopilota + agenti a destra, non nel mosaico nudo.
const app = readFileSync(join(__dirname, '../../src/renderer/App.tsx'), 'utf8')

describe('formato autopilota + agenti a destra (k-174b)', () => {
  it('la colonna dell’autopilota è aperta di suo anche nei workspace di qui', () => {
    expect(app).toMatch(/\[colonnaAutopilota, setColonnaAutopilota\] = useState\(true\)/)
  })

  it('un workspace con autopilota entra da solo nella vista Panoramica/linguette', () => {
    expect(app).toContain('elencoForzato')
    expect(app).toMatch(/autopilotaDelWorkspace\(autopiloti, ws\) === undefined\) return[\s\S]{0,200}impostaElenco\(ws, true\)/)
  })

  it('l’effetto sta prima del return di «pronto» (hook, niente React #310)', () => {
    expect(app.indexOf('elencoForzato = useRef')).toBeGreaterThan(0)
    expect(app.indexOf('elencoForzato = useRef')).toBeLessThan(app.indexOf('if (!pronto) {'))
  })
})
