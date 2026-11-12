import { describe, it, expect } from 'vitest'
import { fraseStatoOrchestratore, quandoSveglia } from '@shared/piano-orchestratore'
import { fraseAdesso } from '@shared/stato-telefono'
import { vistaAutopilota } from '@shared/autopiloti-vista'
import type { Autopilota } from '@shared/autopilota'

/**
 * 0.102.1 (Nicholas, 12/11: «ci sono ancora progetti fermi nonostante se chiedo mi
 * dicono che sono al lavoro»). L'autopilota unico è sempre nello stato «lavoro»:
 * ogni vista diceva «al lavoro» anche con nessuno al lavoro. E una pausa chiesta da
 * lui (la sveglia delle 19:02) sembrava un fermo.
 */
const ORA = Date.parse('2026-11-12T14:00:00')
const base = { pensa: false, vivo: true, specialisti: [], piano: { totale: 13, uniti: 9 }, richieste: { aperte: 5, daPianificare: 0 }, domandeAperte: 0 }

describe('la frase di adesso dice la verità', () => {
  it('nessuno al lavoro e compiti aperti: «Fermo», non «al lavoro»', () => {
    expect(fraseStatoOrchestratore(base, ORA)).toEqual(expect.objectContaining({ tono: 'fermo' }))
  })
  it('con una sveglia futura è una pausa voluta, con l’ora', () => {
    const f = fraseStatoOrchestratore({ ...base, sveglia: { il: '2026-11-12T19:02:00', perche: 'di sera' } }, ORA)
    expect(f.tono).toBe('riposo')
    expect(f.testo).toBe('In pausa: riprende alle 19:02, come gli hai chiesto')
  })
  it('una sveglia passata non conta più', () => {
    expect(fraseStatoOrchestratore({ ...base, sveglia: { il: '2026-11-12T09:00:00', perche: 'x' } }, ORA).tono).toBe('fermo')
  })
  it('una domanda aperta vince sulla pausa', () => {
    expect(fraseStatoOrchestratore({ ...base, domandeAperte: 1, sveglia: { il: '2026-11-12T19:02:00', perche: 'x' } }, ORA).tono).toBe('aspetta')
  })
  it('l’ora della sveglia in parole', () => {
    expect(quandoSveglia('2026-11-12T19:02:00', ORA)).toBe('alle 19:02')
    expect(quandoSveglia('2026-11-13T09:00:00', ORA)).toBe('domani alle 9:00')
    expect(quandoSveglia('2026-11-20T08:30:00', ORA)).toBe('il 20/11 alle 8:30')
  })
  it('sul telefono la stessa pausa', () => {
    const fra = new Date(Date.now() + 3 * 3_600_000).toISOString()
    expect(fraseAdesso({ ...base, sveglia: { il: fra, perche: 'x' } }).testo).toMatch(/^In pausa: riprende /)
  })
})

describe('l’elenco degli autopiloti non dice «al lavoro» a vuoto', () => {
  const ap = (adesso?: { testo: string; tono: string }): Autopilota & { adesso?: { testo: string; tono: string } } => ({
    id: 'ap-1', nome: 'NexoraOS', obiettivo: '', cwd: 'E:\NexoraOS', stato: 'lavoro', chats: [], decisioni: [], creato: '2026-11-01T00:00:00Z',
    ...(adesso !== undefined ? { adesso } : {})
  }) as unknown as Autopilota & { adesso?: { testo: string; tono: string } }
  const ora = ORA
  it('fermo davvero: rosso, con il perché', () => {
    const v = vistaAutopilota(ap({ testo: 'Fermo: 4 compiti nel piano e nessuno specialista al lavoro', tono: 'fermo' }), ora)
    expect(v.stato.id).toBe('fermo')
    expect(v.gruppi).toContain('fermi')
  })
  it('in pausa: «in pausa», non al lavoro', () => {
    const v = vistaAutopilota(ap({ testo: 'In pausa: riprende alle 19:02, come gli hai chiesto', tono: 'riposo' }), ora)
    expect(v.stato.parola).toBe('in pausa')
  })
  it('aspetta una risposta: «aspetta te»', () => {
    expect(vistaAutopilota(ap({ testo: 'Fermo: aspetta una tua risposta', tono: 'aspetta' }), ora).stato.id).toBe('aspetta')
  })
  it('qualcuno lavora davvero: al lavoro', () => {
    expect(vistaAutopilota(ap({ testo: 'Al lavoro: sviluppatore', tono: 'lavora' }), ora).stato.id).toBe('al-lavoro')
  })
  it('senza il segno (servizio di prima): come prima', () => {
    expect(vistaAutopilota(ap(), ora).stato.id).toBe('al-lavoro')
  })
})
