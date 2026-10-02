import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  hookSegnali, leggiSegnale, partitaDaSegnali, prontaDaSegnali, statoChat, statoDaSegnali, unisciConHook, EVENTI_SEGNALI, type Segnale
} from '@shared/segnali-chat'

/**
 * 0.45.0: i segnali di Claude Code al posto della lettura dello schermo. I
 * JSON sono quelli veri di Claude Code 2.1.287, presi il 02/10 con due
 * `claude -p` e degli hook che li scrivevano su disco
 * (tests/fixtures/hook-claude-2.1.287/). Notification e StopFailure in
 * modalità -p non arrivano: quei due sono dalla documentazione degli hook
 * (nome del file «dalla-documentazione»).
 */
const vero = (nome: string): unknown => JSON.parse(readFileSync(`tests/fixtures/hook-claude-2.1.287/${nome}.json`, 'utf8'))
const T = (s: number): string => new Date(Date.parse('2026-10-02T12:00:00.000Z') + s * 1000).toISOString()
const leggi = (nome: string, s: number): Segnale => leggiSegnale(vero(nome), T(s)) as Segnale

describe('il JSON vero degli hook', () => {
  it('si legge: sessione, evento e quello che serve di ognuno', () => {
    expect(leggi('SessionStart', 0)).toMatchObject({ sessione: 'a9cb6868-8398-4831-95fc-83b9b40b0a51', evento: 'SessionStart', origine: 'startup', cwd: 'C:\\progetti\\prova' })
    expect(leggi('UserPromptSubmit', 1).evento).toBe('UserPromptSubmit')
    expect(leggi('PermissionRequest', 2)).toMatchObject({ evento: 'PermissionRequest', strumento: 'PowerShell', dettaglio: 'Write text to file-di-prova.txt' })
    expect(leggi('Stop', 3).ultimoMessaggio).toContain('Il comando non è stato eseguito')
    expect(leggi('SessionEnd', 4)).toMatchObject({ evento: 'SessionEnd', origine: 'other' })
    expect(leggi('Notification.permission_prompt.dalla-documentazione', 5)).toMatchObject({ tipoNotifica: 'permission_prompt', messaggio: 'Claude needs your permission to use PowerShell' })
    expect(leggi('StopFailure.dalla-documentazione', 6).errore).toBe('rate_limit: Claude usage limit reached. Your limit will reset at 5pm.')
  })
  it('gli eventi che non usiamo e il JSON storto non contano', () => {
    expect(leggiSegnale(vero('PreToolUse'), T(0))).toBeUndefined()
    expect(leggiSegnale({ hook_event_name: 'Stop' }, T(0))).toBeUndefined()
    expect(leggiSegnale('niente', T(0))).toBeUndefined()
  })
})

describe('lo stato dai segnali: aspetta, chiede, lavora, errore', () => {
  it('il giro vero della seconda prova: avvio, turno, permesso, fine, chiusura', () => {
    const seq = [leggi('SessionStart', 0), leggi('UserPromptSubmit', 1)]
    expect(statoDaSegnali(seq)?.fase).toBe('lavora')
    seq.push(leggi('PermissionRequest', 2))
    expect(statoDaSegnali(seq)).toMatchObject({ fase: 'chiede', chiede: { tipo: 'permesso', strumento: 'PowerShell' } })
    // La notifica del permesso tiene lo strumento e aggiunge il messaggio.
    seq.push(leggi('Notification.permission_prompt.dalla-documentazione', 3))
    expect(statoDaSegnali(seq)).toMatchObject({ fase: 'chiede', dal: T(2), chiede: { strumento: 'PowerShell', messaggio: 'Claude needs your permission to use PowerShell' } })
    seq.push(leggi('Stop', 4))
    expect(statoDaSegnali(seq)).toMatchObject({ fase: 'aspetta', dal: T(4) })
    expect(statoDaSegnali(seq)?.ultimoMessaggio).toContain('Il comando non è stato eseguito')
    // Una notifica «ti aspetto» dopo lo Stop non sposta il «da quando».
    seq.push(leggi('Notification.idle_prompt.dalla-documentazione', 60))
    expect(statoDaSegnali(seq)).toMatchObject({ fase: 'aspetta', dal: T(4) })
    seq.push(leggi('SessionEnd', 70))
    expect(statoDaSegnali(seq)?.fase).toBe('chiusa')
  })
  it('un turno morto per un errore dell’API: errore con il motivo, e aspetta te', () => {
    const s = statoDaSegnali([leggi('UserPromptSubmit', 0), leggi('StopFailure.dalla-documentazione', 5)])
    expect(s).toMatchObject({ fase: 'errore', errore: expect.stringContaining('rate_limit') })
    expect(statoChat({ segnali: s, schermo: { aspetta: false, chiede: false } })).toMatchObject({ aspetta: true, chiede: false, errore: expect.stringContaining('rate_limit'), fonte: 'segnali' })
  })
  it('i segnali vincono sullo schermo; senza segnali vale lo schermo (riserva)', () => {
    const lavora = statoDaSegnali([leggi('UserPromptSubmit', 0)])
    expect(statoChat({ segnali: lavora, schermo: { aspetta: true, chiede: true } })).toMatchObject({ aspetta: false, chiede: false, lavora: true, fonte: 'segnali' })
    expect(statoChat({ schermo: { aspetta: true, chiede: false } })).toEqual({ aspetta: true, chiede: false, lavora: false, fonte: 'schermo' })
  })
})

describe('le consegne degli autopiloti con i segnali', () => {
  const adesso = Date.parse(T(10))
  it('pronta: «aspetta» da almeno un attimo; al lavoro no; senza segnali non si sa', () => {
    expect(prontaDaSegnali({ sessione: 's', fase: 'aspetta', dal: T(5) }, adesso)).toBe(true)
    expect(prontaDaSegnali({ sessione: 's', fase: 'aspetta', dal: T(10) }, adesso)).toBe(false)
    expect(prontaDaSegnali({ sessione: 's', fase: 'lavora', dal: T(1) }, adesso)).toBe(false)
    expect(prontaDaSegnali(undefined, adesso)).toBeUndefined()
  })
  it('partita: un turno cominciato da poco; altrimenti lo dice lo schermo', () => {
    expect(partitaDaSegnali({ sessione: 's', fase: 'lavora', dal: T(9) }, adesso)).toBe(true)
    expect(partitaDaSegnali({ sessione: 's', fase: 'lavora', dal: T(-120) }, adesso)).toBeUndefined()
    expect(partitaDaSegnali({ sessione: 's', fase: 'aspetta', dal: T(9) }, adesso)).toBeUndefined()
  })
})

describe('gli hook in --settings', () => {
  it('un hook http verso la rotta locale per ogni evento, senza shell (con PowerShell curl non va)', () => {
    const h = hookSegnali(47640).hooks as Record<string, { hooks: { type: string; url: string }[] }[]>
    expect(Object.keys(h)).toEqual([...EVENTI_SEGNALI])
    expect(h.Stop?.[0]?.hooks[0]).toEqual({ type: 'http', url: 'http://127.0.0.1:47640/api/segnale', timeout: 5 })
  })
  it('si sommano a quelli dell’autopilota, non li sostituiscono; il resto resta', () => {
    const autopilota = JSON.stringify({ hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'curl autopilota/stop' }] }] }, statusLine: { type: 'command', command: 'x' } })
    const u = JSON.parse(unisciConHook(autopilota, hookSegnali(47640))) as { hooks: Record<string, unknown[]>; statusLine: unknown }
    expect(u.hooks.Stop).toHaveLength(2)
    expect(JSON.stringify(u.hooks.Stop?.[0])).toContain('autopilota/stop')
    expect(u.hooks.SessionStart).toHaveLength(1)
    expect(u.statusLine).toEqual({ type: 'command', command: 'x' })
    expect(JSON.parse(unisciConHook(undefined, hookSegnali(1))).hooks.Stop).toHaveLength(1)
  })
})
