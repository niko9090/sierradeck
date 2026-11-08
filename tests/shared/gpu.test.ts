import { describe, expect, it } from 'vitest'
import { riassuntoGpu, risorseValide } from '../../src/shared/risorse'

const bene = { gpu_compositing: 'enabled', webgl: 'enabled_on', webgl2: 'enabled_on' }

describe('riassuntoGpu', () => {
  it('scheda attiva', () => {
    expect(riassuntoGpu(bene)).toEqual({ testo: 'Scheda video: attiva', spenta: false })
  })
  it('aggiunge il produttore della scheda attiva', () => {
    const info = { gpuDevice: [{ active: false, vendorId: 0x8086 }, { active: true, vendorId: 0x10de }] }
    expect(riassuntoGpu(bene, info)?.testo).toBe('Scheda video: attiva (NVIDIA)')
  })
  it('WebGL in software', () => {
    expect(riassuntoGpu({ ...bene, webgl: 'unavailable_software' })).toEqual({ testo: 'Scheda video: attiva, WebGL in software', spenta: false })
  })
  it('solo processore quando è spenta', () => {
    expect(riassuntoGpu({ gpu_compositing: 'disabled_off', webgl: 'disabled_off' })?.spenta).toBe(true)
    expect(riassuntoGpu({ gpu_compositing: 'disabled_software', webgl: 'disabled_off' })?.testo).toContain('solo processore')
  })
  it('senza dato niente riga', () => {
    expect(riassuntoGpu(undefined)).toBeUndefined()
    expect(riassuntoGpu({})).toBeUndefined()
  })
  it('i PC vecchi senza gpu restano validi', () => {
    expect(risorseValide({ cpu: 1, ramMb: 2, driveAlMinuto: 0, driveRifiutate: 0 })).toBe(true)
  })
})
