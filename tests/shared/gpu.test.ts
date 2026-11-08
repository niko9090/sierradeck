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
  it('driver di base di Windows: motivo e cosa fare', () => {
    const r = riassuntoGpu({ gpu_compositing: 'disabled_software' }, { gpuDevice: [{ active: true, vendorId: 0x1414 }] })
    expect(r?.motivo).toBe('Windows usa il driver video di base')
    expect(r?.cosaFare).toContain('driver')
  })
  it('senza schede o con SwiftShader: driver di base', () => {
    expect(riassuntoGpu({ gpu_compositing: 'disabled_software' }, { gpuDevice: [] })?.motivo).toBe('Windows usa il driver video di base')
    expect(riassuntoGpu({ gpu_compositing: 'disabled_software' }, { auxAttributes: { glRenderer: 'Google SwiftShader' } })?.motivo).toBe('Windows usa il driver video di base')
  })
  it('scheda vera ma in software: esclusa da Chromium; spenta: accelerazione spenta', () => {
    const info = { gpuDevice: [{ active: true, vendorId: 0x8086 }] }
    expect(riassuntoGpu({ gpu_compositing: 'disabled_software' }, info)?.motivo).toBe('scheda esclusa da Chromium')
    expect(riassuntoGpu({ gpu_compositing: 'disabled_off' }, info)?.motivo).toBe('accelerazione spenta')
  })
  it('attiva: nessun motivo', () => {
    expect(riassuntoGpu(bene)?.motivo).toBeUndefined()
  })
  it('senza dato niente riga', () => {
    expect(riassuntoGpu(undefined)).toBeUndefined()
    expect(riassuntoGpu({})).toBeUndefined()
  })
  it('i PC vecchi senza gpu restano validi', () => {
    expect(risorseValide({ cpu: 1, ramMb: 2, driveAlMinuto: 0, driveRifiutate: 0 })).toBe(true)
  })
})
