import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { ChatAutopilota } from '../../src/renderer/components/ChatAutopilota'
import * as Campo from '../../src/renderer/components/CampoChatAutopilota'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'

/**
 * 0.85.1 (Nicholas, 23/10): scrivendo nella scheda dell'autopilota il testo
 * andava a scatti. Il testo del campo stava nello stato di `ChatAutopilota`:
 * ogni lettera ricalcolava la conversazione intera (diario, Punto, righe dal
 * vivo, messaggi verso la chat). Adesso il campo è un pezzo suo, con lo stato
 * locale e `memo`: una lettera ridisegna solo il campo, e una rilettura dal
 * servizio non ridisegna il campo.
 *
 * Nei test non c'è un DOM (niente jsdom): il costo di una lettera si misura
 * come il tempo di disegno del componente che tiene il testo — prima la chat
 * intera, adesso il solo campo.
 */
const ORA = Date.parse('2026-10-23T18:00:00Z')
const iso = (ms: number): string => new Date(ms).toISOString()
const chat = (n: number): ChatGovernata =>
  ({ id: `c-${n}`, compito: `Il compito numero ${n}, con una descrizione lunga come quelle vere.`, stato: n % 3 === 0 ? 'finita' : 'lavoro', cicli: n, sessionId: `s-${n}`, dal: iso(ORA - n * 60_000) })

/** Un autopilota grande come quelli veri di una giornata di lavoro: centinaia di righe nel diario. */
const grande = (): Autopilota => ({
  ...nuovoAutopilota({ id: 'ap-1', nome: 'Prova', obiettivo: 'Un obiettivo lungo. '.repeat(20), cwd: 'C:\\p', criteri: Array.from({ length: 15 }, (_, i) => ({ descrizione: `criterio ${i}`, soddisfatto: i % 2 === 0 })), iniziatoIl: iso(ORA - 10 * 3600_000) }),
  stato: 'lavoro',
  chats: Array.from({ length: 12 }, (_, i) => chat(i + 1)),
  decisioni: Array.from({ length: 600 }, (_, i) => ({ quando: iso(ORA - (600 - i) * 30_000), cosa: `Ha deciso: continua — la chat c-${(i % 12) + 1} va avanti col passo ${i}, ${'dettaglio '.repeat(8)}` })),
  dialogo: Array.from({ length: 120 }, (_, i) => ({ quando: iso(ORA - (120 - i) * 120_000), da: i % 2 === 0 ? 'tu' as const : 'lui' as const, testo: `Battuta ${i}: ${'parole della conversazione '.repeat(6)}` }))
} as Autopilota)

/** Tempo medio di un disegno, in millisecondi, dopo un giro a vuoto per scaldare. */
function tempoMedio(disegna: () => string, volte = 40, scalda = 5): number {
  for (let i = 0; i < scalda; i += 1) disegna()
  const t0 = performance.now()
  for (let i = 0; i < volte; i += 1) disegna()
  return (performance.now() - t0) / volte
}

describe('il campo della scheda dell’autopilota scorre fluido', () => {
  it('il testo non sta più nello stato della chat intera', () => {
    const sorgente = readFileSync('src/renderer/components/ChatAutopilota.tsx', 'utf8')
    expect(sorgente).not.toMatch(/useState\(''\)/)
    expect(sorgente).toContain('<CampoChatAutopilota')
    const campo = readFileSync('src/renderer/components/CampoChatAutopilota.tsx', 'utf8')
    expect(campo).toMatch(/memo\(/)
    expect(campo).toMatch(/useState\(''\)/)
  })

  it('una rilettura dal servizio non ridisegna il campo', () => {
    const uguali = Campo.stessoCampo
    const base = { autopilotaId: 'ap-1', campoPronto: false, disfaTitolo: undefined, onCambiato: () => undefined }
    // Un autopilota riletto (oggetto nuovo, funzione nuova) ma con lo stesso id: il campo resta com'è.
    expect(uguali(base, { ...base, onCambiato: () => undefined })).toBe(true)
    expect(uguali(base, { ...base, disfaTitolo: 'ha cambiato i criteri' })).toBe(false)
    expect(uguali(base, { ...base, autopilotaId: 'ap-2' })).toBe(false)
  })

  it('una lettera costa molto meno della chat intera (numeri nel rapporto 0.85.1)', () => {
    const a = grande()
    // La chat intera costa centinaia di ms a disegno (500 col PC carico): poche misure bastano, 45 superavano i 20 s del test.
    const chatIntera = tempoMedio(() => renderToStaticMarkup(<ChatAutopilota autopilota={a} onCambiato={() => undefined} />), 5, 1)
    const dopo = tempoMedio(() => renderToStaticMarkup(<Campo.CampoChatAutopilota autopilotaId={a.id} onCambiato={() => undefined} campoPronto={false} disfaTitolo={undefined} />))
    console.log(`[misura] chat intera ${chatIntera.toFixed(3)} ms, una lettera adesso (solo il campo) ${dopo.toFixed(3)} ms`)
    expect(dopo * 5).toBeLessThan(chatIntera)
  }, 60_000)
})
