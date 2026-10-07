import { describe, it, expect } from 'vitest'
import {
  eventiDaLinea, LINEA_NUOVA, passiCollegamento, passo, rovescia, stradaDiIndirizzo,
  type EventoTentativo, type Linea, type VistaCollegamento
} from '@shared/collegamento'
import { paginaClient } from '../../src/main/client-pagina'

/**
 * «Mi collego a NOME-PC…» (0.52.1). Nicholas (07/10): «Ho cambiato pc e non
 * si vede nessuna animazione e lo stato della connessione». Gli stessi
 * scenari stanno in `TentativiTest.kt` (app). Solo nomi e indirizzi di esempio.
 */
const stati = (v: VistaCollegamento): string[] => v.passi.map((p) => `${p.strada}:${p.stato}`)

describe('i passi dell’animazione, dagli eventi', () => {
  it('i tentativi in ordine, poi la strada buona con il ritardo', () => {
    let e: EventoTentativo[] = [{ tipo: 'provo', strada: 'lan', il: 0 }]
    let v = passiCollegamento('PC-ESEMPIO', e)
    expect(v).toMatchObject({ fase: 'provo', titolo: 'Mi collego a PC-ESEMPIO…', sotto: 'provo rete di casa' })
    expect(stati(v)).toEqual(['lan:provo', 'tailscale:attesa', 'webrtc:attesa', 'drive:attesa'])
    e = [...e, { tipo: 'fallita', strada: 'lan', il: 5000, motivo: 'non ha risposto in 5 secondi' }, { tipo: 'provo', strada: 'tailscale', il: 5000 }]
    expect(passiCollegamento('PC-ESEMPIO', e).sotto).toBe('provo Tailscale')
    e = [...e, { tipo: 'riuscita', strada: 'tailscale', il: 5100, ritardoMs: 84 }]
    v = passiCollegamento('PC-ESEMPIO', e)
    expect(v).toMatchObject({ fase: 'collegato', titolo: 'Collegato a PC-ESEMPIO', sotto: 'Tailscale · 84 ms', strada: 'tailscale', ritardoMs: 84 })
    expect(stati(v)).toEqual(['lan:fallita', 'tailscale:ok', 'webrtc:inutile', 'drive:inutile'])
    expect(v.passi[0]?.motivo).toBe('non ha risposto in 5 secondi')
  })
  it('se fallisce: il motivo, mai una schermata vuota', () => {
    const v = passiCollegamento('PC-ESEMPIO', [
      { tipo: 'provo', strada: 'lan', il: 0 }, { tipo: 'fallita', strada: 'lan', il: 1, motivo: 'rifiutato' },
      { tipo: 'salta', strada: 'tailscale', motivo: 'nessun indirizzo Tailscale' }, { tipo: 'salta', strada: 'webrtc', motivo: 'dal telefono no' },
      { tipo: 'fallito', il: 2, motivo: 'nessuna strada ha risposto' }
    ])
    expect(v).toMatchObject({ fase: 'fallito', titolo: 'Non riesco a collegarmi a PC-ESEMPIO', sotto: 'nessuna strada ha risposto' })
    expect(stati(v)).toEqual(['lan:fallita', 'tailscale:salta', 'webrtc:salta', 'drive:salta'])
  })
})

describe('dalla macchina della linea (riquadro remoto, ponte, pagina)', () => {
  it('collegato al primo colpo, via WebRTC dopo «collegando», fallito', () => {
    const su = passo(LINEA_NUOVA, { tipo: 'ok', il: 1000, ritardoMs: 120, strada: 'webrtc' })
    const v = passiCollegamento('PC-ESEMPIO', eventiDaLinea(su, 0))
    expect(stati(v)).toEqual(['lan:fallita', 'tailscale:salta', 'webrtc:ok', 'drive:inutile'])
    expect(v.ritardoMs).toBe(120)
    const apre = passo(LINEA_NUOVA, { tipo: 'errore', il: 1000, motivo: 'collegando', messaggio: 'apro WebRTC' })
    expect(stati(passiCollegamento('PC-ESEMPIO', eventiDaLinea(apre, 0)))).toEqual(['lan:fallita', 'tailscale:fallita', 'webrtc:provo', 'drive:attesa'])
    const giu = passo(LINEA_NUOVA, { tipo: 'errore', il: 1000, motivo: 'irraggiungibile', messaggio: 'non risponde' })
    expect(passiCollegamento('PC-ESEMPIO', eventiDaLinea(giu, 0))).toMatchObject({ fase: 'fallito', sotto: 'non risponde' })
    expect(stati(passiCollegamento('PC-ESEMPIO', eventiDaLinea(LINEA_NUOVA, 0)))).toEqual(['lan:provo', 'tailscale:attesa', 'webrtc:attesa', 'drive:attesa'])
  })
  it('a linea caduta: conto alla rovescia, ambra i primi tentativi e poi rosso', () => {
    const su = passo(LINEA_NUOVA, { tipo: 'ok', il: 0, ritardoMs: 30, strada: 'lan' })
    expect(rovescia(su, 0)).toBeUndefined()
    const giu = passo(su, { tipo: 'errore', il: 10_000, motivo: 'irraggiungibile' })
    expect(rovescia(giu, 10_000)).toEqual({ testo: 'riprovo fra 1 s', colore: 'ambra' })
    let l: Linea = giu
    for (let i = 0; i < 3; i++) l = passo(l, { tipo: 'errore', il: l.prossimoIl as number, motivo: 'irraggiungibile' })
    expect(rovescia(l, (l.prossimoIl as number) - 4500)).toEqual({ testo: 'riprovo fra 5 s', colore: 'rosso' })
  })
  it('la strada dall’indirizzo: solo gli intervalli standard', () => {
    expect(stradaDiIndirizzo('http://100.101.102.103:7420')).toBe('tailscale')
    expect(stradaDiIndirizzo('192.168.1.20:7420')).toBe('lan')
    expect(stradaDiIndirizzo('10.0.0.5')).toBe('lan')
    expect(stradaDiIndirizzo('http://8.8.8.8:7420')).toBeUndefined()
    expect(stradaDiIndirizzo('pc-esempio.local')).toBeUndefined()
  })
})

describe('la pagina del telefono usa la stessa funzione', () => {
  const html = paginaClient()
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
  const estrai = (inizio: string): string => {
    const i = script.indexOf(inizio)
    if (i < 0) throw new Error(`manca ${inizio}`)
    let p = 0
    for (let j = script.indexOf('{', i); j < script.length; j++) {
      if (script[j] === '{') p++
      else if (script[j] === '}' && --p === 0) return script.slice(i, j + 1)
    }
    throw new Error('non si chiude')
  }
  const pagina = new Function(`
    const STRADE_TENTATIVI = ['lan', 'tailscale', 'webrtc', 'drive']
    function fraSecondiLinea(l, adesso) { return l.prossimoIl === undefined ? 0 : Math.max(0, Math.ceil((l.prossimoIl - adesso) / 1000)) }
    ${estrai('function nomeTentativo(')}
    ${estrai('function iconaTentativo(')}
    ${estrai('function passiCollegamento(')}
    ${estrai('function eventiDaLinea(')}
    ${estrai('function stradaPagina(')}
    ${estrai('function rovesciaLinea(')}
    return { passiCollegamento, eventiDaLinea, stradaPagina, rovesciaLinea }
  `)() as { passiCollegamento: typeof passiCollegamento; eventiDaLinea: typeof eventiDaLinea; stradaPagina: (h: string) => string | undefined; rovesciaLinea: typeof rovescia }

  it('stessi passi della funzione condivisa su tutti gli scenari', () => {
    const scenari: EventoTentativo[][] = [
      [{ tipo: 'provo', strada: 'lan', il: 0 }],
      [{ tipo: 'provo', strada: 'lan', il: 0 }, { tipo: 'riuscita', strada: 'lan', il: 40, ritardoMs: 40 }],
      [{ tipo: 'provo', strada: 'lan', il: 0 }, { tipo: 'provo', strada: 'tailscale', il: 5 }, { tipo: 'riuscita', strada: 'tailscale', il: 9, ritardoMs: 90 }],
      [{ tipo: 'provo', strada: 'lan', il: 0 }, { tipo: 'salta', strada: 'tailscale', motivo: 'x' }, { tipo: 'fallito', il: 9, motivo: 'giù' }],
      [{ tipo: 'provo', strada: 'lan', il: 0 }, { tipo: 'fallita', strada: 'lan', il: 1, motivo: 'a' }, { tipo: 'fallita', strada: 'tailscale', il: 1, motivo: 'b' }, { tipo: 'provo', strada: 'webrtc', il: 2 }, { tipo: 'riuscita', strada: 'drive', il: 3, ritardoMs: 9000 }]
    ]
    for (const e of scenari) expect(pagina.passiCollegamento('PC-ESEMPIO', e)).toEqual(passiCollegamento('PC-ESEMPIO', e))
    const linee: Linea[] = [
      LINEA_NUOVA,
      passo(LINEA_NUOVA, { tipo: 'ok', il: 1, ritardoMs: 20, strada: 'lan' }),
      passo(LINEA_NUOVA, { tipo: 'errore', il: 1, motivo: 'collegando' }),
      passo(passo(LINEA_NUOVA, { tipo: 'errore', il: 1, motivo: 'irraggiungibile', messaggio: 'm' }), { tipo: 'errore', il: 2000, motivo: 'irraggiungibile' })
    ]
    for (const l of linee) {
      expect(pagina.eventiDaLinea(l, 0)).toEqual(eventiDaLinea(l, 0))
      expect(pagina.rovesciaLinea(l, 1500)).toEqual(rovescia(l, 1500))
    }
    for (const h of ['100.101.102.103', '192.168.1.20', '172.20.1.1', '8.8.8.8', 'pc-esempio.local']) expect(pagina.stradaPagina(h)).toBe(stradaDiIndirizzo(h))
  })
  it('la pagina mostra «Mi collego a…» e la Riprova', () => {
    expect(script).toContain('tentativiHtml() +')
    expect(script).toContain("'Mi collego a ' + nomePc")
    expect(script).toContain('onclick="riprovaLinea()">Riprova</button>')
  })
})

describe('il cambio di PC non si porta dietro il PC di prima (0.52.2)', () => {
  it('il riquadro remoto riparte da zero quando cambia il PC che guarda', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const mosaic = readFileSync(join(__dirname, '../../src/renderer/components/Mosaic.tsx'), 'utf8')
    expect(mosaic).toContain('<RiquadroRemoto key={`${data.remoto.pcId}|')
  })
})
