import { describe, it, expect } from 'vitest'
import { componiImpostazioni, TIMEOUT_HOOK_S } from '@shared/hook-autopilota'

/**
 * Gli hook con cui una chat governata dice «ho finito di rispondere».
 *
 * Non erano coperti da nessun test, ed è il punto in cui l'autopilota smette
 * di funzionare in silenzio: un URL sbagliato non solleva niente, non scrive
 * niente — la chat lavora, finisce, e nessuno se ne accorge mai. L'autopilota
 * resta ad aspettare per sempre un turno che è già passato.
 */
describe('le impostazioni di una chat governata', () => {
  const leggi = (s: string): Record<string, { hooks: { url: string; timeout: number }[] }[]> =>
    (JSON.parse(s) as { hooks: Record<string, { hooks: { url: string; timeout: number }[] }[]> }).hooks

  it('dice al servizio quando la chat si ferma e quando chiede', () => {
    const h = leggi(componiImpostazioni('ap-1', 47630))
    expect(Object.keys(h).sort()).toEqual(['Notification', 'Stop'])
  })

  it('porta l autopilota nell URL, non nel corpo', () => {
    // Al primo `Stop` il session_id non è ancora noto a nessuno: cercare per
    // sessione lascerebbe il primo evento senza padrone.
    const url = leggi(componiImpostazioni('ap-1', 47630)).Stop?.[0]?.hooks[0]?.url ?? ''
    expect(url).toContain('ap=ap-1')
    expect(url).toContain('127.0.0.1:47630')
    expect(url).toContain('/hook/stop')
  })

  it('e la chat, quando ce n e una', () => {
    // Con una flotta, sapere **quale** si è fermata è l'unico modo per dare a
    // ciascuna le proprie istruzioni invece che a caso.
    const url = leggi(componiImpostazioni('ap-1', 47630, 'ch-2')).Stop?.[0]?.hooks[0]?.url ?? ''
    expect(url).toContain('ap=ap-1&chat=ch-2')
  })

  it('senza chat non lascia un parametro vuoto nell indirizzo', () => {
    const url = leggi(componiImpostazioni('ap-1', 47630)).Stop?.[0]?.hooks[0]?.url ?? ''
    expect(url).not.toContain('chat=')
  })

  it('parla solo con questo computer', () => {
    // Un servizio che avvia processi non si espone alla rete, e l'indirizzo
    // dell'hook è l'unico posto da cui potrebbe sfuggire.
    const s = componiImpostazioni('ap-1', 47630, 'ch-1')
    expect(s).not.toMatch(/https?:\/\/(?!127\.0\.0\.1)/)
  })

  it('lascia all hook il tempo di una verifica lenta', () => {
    // Un hook scaduto lascia la chat ferma senza che nessuno lo sappia: è il
    // guasto peggiore per un sistema il cui scopo è non lasciarla ferma.
    const t = leggi(componiImpostazioni('ap-1', 47630)).Stop?.[0]?.hooks[0]?.timeout
    expect(t).toBe(TIMEOUT_HOOK_S)
    expect(TIMEOUT_HOOK_S).toBeGreaterThanOrEqual(600)
  })

  it('e JSON valido, perche finisce in una riga di comando', () => {
    expect(() => JSON.parse(componiImpostazioni('ap-1', 47630, 'ch-1'))).not.toThrow()
  })
})
