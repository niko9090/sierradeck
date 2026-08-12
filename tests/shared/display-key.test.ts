import { describe, it, expect } from 'vitest'
import { chiaveMonitor } from '@shared/display-key'

describe('chiaveMonitor', () => {
  const primario = { bounds: { x: 0, y: 0, width: 2560, height: 1440 }, scaleFactor: 1 }

  it('produce la stessa chiave per la stessa geometria', () => {
    expect(chiaveMonitor(primario)).toBe(chiaveMonitor({ ...primario }))
  })

  it('distingue due monitor affiancati di uguale risoluzione', () => {
    const secondario = { bounds: { x: 2560, y: 0, width: 2560, height: 1440 }, scaleFactor: 1 }
    expect(chiaveMonitor(primario)).not.toBe(chiaveMonitor(secondario))
  })

  it('distingue la stessa risoluzione con scalatura diversa', () => {
    expect(chiaveMonitor(primario)).not.toBe(chiaveMonitor({ ...primario, scaleFactor: 1.5 }))
  })

  it('non contiene caratteri che romperebbero una chiave JSON', () => {
    expect(chiaveMonitor(primario)).not.toMatch(/["\\\n]/)
  })
})
