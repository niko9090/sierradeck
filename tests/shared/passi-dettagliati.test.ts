import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LINEA_NUOVA, passo, passiDettagliati, testoDettagli, type PassoDettagliato } from '@shared/collegamento'

/**
 * Il collegamento a un altro PC a schermo pieno nel riquadro (0.52.3):
 * passi in ordine, dettagli e motivi per ogni errore, il testo di «Copia i
 * dettagli». Solo nomi e indirizzi di esempio.
 */
const ids = (p: PassoDettagliato[]): string[] => p.map((x) => `${x.id}:${x.stato}`)
const INDIRIZZI = ['192.168.1.20', '100.101.102.103']

describe('i passi dettagliati del riquadro remoto', () => {
  it('in ordine: indirizzi, le quattro strade, la chiave, collegato', () => {
    const p = passiDettagliati({ nomePc: 'PC-ESEMPIO', linea: LINEA_NUOVA, inizio: 1000, adesso: 1400, indirizzi: INDIRIZZI })
    expect(ids(p)).toEqual(['indirizzi:ok', 'lan:provo', 'tailscale:attesa', 'webrtc:attesa', 'drive:attesa', 'chiave:attesa', 'collegato:attesa'])
    expect(p[0]?.indirizzo).toBe('192.168.1.20, 100.101.102.103')
    expect(p[1]).toMatchObject({ indirizzo: '192.168.1.20', durataMs: 400 })
    expect(p[2]?.indirizzo).toBe('100.101.102.103')
  })
  it('collegato via Tailscale: la strada buona con indirizzo e ritardo, la chiave verificata', () => {
    const l = passo(LINEA_NUOVA, { tipo: 'ok', il: 1200, ritardoMs: 84, strada: 'tailscale' })
    const p = passiDettagliati({ nomePc: 'PC-ESEMPIO', linea: l, inizio: 1000, adesso: 1300, indirizzi: INDIRIZZI, indirizzoBuono: '100.101.102.103' })
    expect(ids(p)).toEqual(['indirizzi:ok', 'lan:fallita', 'tailscale:ok', 'webrtc:salta', 'drive:salta', 'chiave:ok', 'collegato:ok'])
    expect(p[2]).toMatchObject({ indirizzo: '100.101.102.103', durataMs: 84 })
    expect(p[5]?.motivo).toContain('stessa cassaforte')
  })
  it('ogni errore ha il motivo per esteso e cosa fare', () => {
    const giu = passo(LINEA_NUOVA, { tipo: 'errore', il: 7000, motivo: 'irraggiungibile', messaggio: 'PC-ESEMPIO non risponde a nessun indirizzo' })
    const p = passiDettagliati({ nomePc: 'PC-ESEMPIO', linea: giu, inizio: 1000, adesso: 8000, indirizzi: INDIRIZZI })
    expect(ids(p)).toEqual(['indirizzi:ok', 'lan:fallita', 'tailscale:salta', 'webrtc:salta', 'drive:salta', 'chiave:salta', 'collegato:fallita'])
    expect(p[1]).toMatchObject({ motivo: 'PC-ESEMPIO non risponde a nessun indirizzo', durataMs: 6000 })
    expect(p[1]?.cosaFare).toContain('firewall')
    expect(p[6]?.cosaFare).toContain('Riprova')
    // La chiave di casa che non torna: il suo passo fallisce, con cosa fare.
    const chiave = passo(LINEA_NUOVA, { tipo: 'errore', il: 2000, motivo: 'cassaforte', messaggio: 'la chiave di casa non torna' })
    const k = passiDettagliati({ nomePc: 'PC-ESEMPIO', linea: chiave, inizio: 1000, adesso: 2500 })
    expect(k[0]?.stato).toBe('salta')
    expect(k.find((x) => x.id === 'chiave')).toMatchObject({ stato: 'fallita', motivo: 'la chiave di casa non torna' })
    expect(k.find((x) => x.id === 'chiave')?.cosaFare).toContain('cassaforte')
    // Via WebRTC dopo «collegando»: casa e Tailscale fallite, ognuna con cosa fare.
    const apre = passo(LINEA_NUOVA, { tipo: 'errore', il: 3000, motivo: 'collegando', messaggio: 'apro WebRTC' })
    const w = passiDettagliati({ nomePc: 'PC-ESEMPIO', linea: apre, inizio: 1000, adesso: 4000, indirizzi: INDIRIZZI })
    expect(ids(w).slice(1, 4)).toEqual(['lan:fallita', 'tailscale:fallita', 'webrtc:provo'])
    expect(w[2]?.cosaFare).toContain('Tailscale')
  })
  it('«Copia i dettagli»: tutti i passi con orari, indirizzi, tempi, motivi e cosa fare', () => {
    const giu = passo(LINEA_NUOVA, { tipo: 'errore', il: 7000, motivo: 'irraggiungibile', messaggio: 'non risponde' })
    const passi = passiDettagliati({ nomePc: 'PC-ESEMPIO', linea: giu, inizio: 1000, adesso: 8000, indirizzi: INDIRIZZI })
    const t = testoDettagli({ nomePc: 'PC-ESEMPIO', passi, inizio: 1000, adesso: 8000, versione: '0.52.3', ultimoSegno: '7/10 10:00' })
    const righe = t.split('\n')
    expect(righe[0]).toBe('SierraDeck · collegamento a PC-ESEMPIO (SierraDeck 0.52.3)')
    expect(righe[1]).toMatch(/^Iniziato alle \d{2}:\d{2}:\d{2} · 7 s · esito: non collegato$/)
    expect(t).toContain('Ultimo segno di PC-ESEMPIO: 7/10 10:00')
    expect(t).toContain('✗ Rete di casa: non riuscito · indirizzo 192.168.1.20 · 6000 ms · non risponde')
    expect(t).toContain('    Cosa fare: ')
    expect(righe.filter((r) => /: (fatto|non riuscito|in corso|saltato|in attesa)/.test(r))).toHaveLength(7)
  })
  it('il riquadro remoto li mostra a schermo pieno con «Copia i dettagli»', () => {
    const r = readFileSync(join(__dirname, '../../src/renderer/components/RiquadroRemoto.tsx'), 'utf8')
    const l = readFileSync(join(__dirname, '../../src/renderer/components/LineaRemota.tsx'), 'utf8')
    expect(r).toContain('<SchermoCollegamento')
    expect(r).toContain('passi={passiDettagliati(')
    expect(l).toContain("'Copia i dettagli'")
  })
})
