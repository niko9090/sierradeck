import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AvanzamentoSposta } from '../../src/renderer/components/VistaProgetti'
import { INIZI_PASSI_SPOSTA, MOTIVO_DRIVE_PIENO_SPOSTA, PASSI_SPOSTA, avanzamentoSposta, percentualeSposta, type VistaSposta } from '@shared/sposta'
import { byteLeggibili } from '@shared/spazio-drive'
import { paginaClient } from '../../src/main/client-pagina'

const ORA = Date.parse('2026-01-01T10:00:00Z')
const opz = { passi: PASSI_SPOSTA, inizi: INIZI_PASSI_SPOSTA, fmtByte: byteLeggibili, motivoDrivePieno: MOTIVO_DRIVE_PIENO_SPOSTA }
const base: VistaSposta = { progetto: 'p1', nome: 'Demo', daNome: 'PC-A', fase: 'scarico', messaggio: 'Scarico…', percorso: 'X:\\demo' }
const v = (x: Partial<VistaSposta>): ReturnType<typeof avanzamentoSposta> => avanzamentoSposta({ ...base, ...x }, ORA, opz)

describe('avanzamento dello spostamento: logica', () => {
  it('le soglie dei passi coincidono con le fasce della percentuale', () => {
    PASSI_SPOSTA.forEach((p, i) => expect(percentualeSposta(p.fase, 0)).toBe(INIZI_PASSI_SPOSTA[i]))
  })
  it('percentuale totale e stato di ogni passo', () => {
    const r = v({ percentuale: 60, percentualePasso: 50 })
    expect(r.percentuale).toBe(60)
    expect(r.passi.map((p) => p.stato)).toEqual(['fatto', 'fatto', 'in-corso', 'da-fare', 'da-fare', 'da-fare'])
    expect(v({ fase: 'fatta' }).passi.every((p) => p.stato === 'fatto')).toBe(true)
    expect(v({ fase: 'fatta' }).percentuale).toBe(100)
  })
  it('il passo in corso ha i numeri: file oppure byte leggibili', () => {
    expect(v({ percentuale: 60, percentualePasso: 30, fileFatti: 3, fileTotali: 10 }).passo).toEqual({ titolo: PASSI_SPOSTA[2]!.titolo, percentuale: 30, numeri: '3 di 10 file' })
    const r = v({ byteFatti: 1048576, byteTotali: 8 * 1048576, fileFatti: 1, fileTotali: 2 })
    expect(r.passo?.numeri).toBe(`${byteLeggibili(1048576)} di ${byteLeggibili(8 * 1048576)}`)
    expect(v({ fase: 'cambio', percentuale: 96 }).passo?.percentuale).toBeUndefined()
  })
  it('ultimo contatto: secondi, minuti', () => {
    expect(v({ ultimoContatto: new Date(ORA - 12_000).toISOString() }).contatto).toBe('ultimo contatto con PC-A: 12 s fa')
    expect(v({ ultimoContatto: new Date(ORA - 180_000).toISOString() }).contatto).toBe('ultimo contatto con PC-A: 3 min fa')
    expect(v({}).contatto).toBeUndefined()
  })
  it('attesa: sta nella riga e nel passo', () => {
    const r = v({ fase: 'attesa-proprietario', percentuale: 2, attesa: 'PC-A è spento' })
    expect(r.attesa).toBe('PC-A è spento')
    expect(r.passi[1]).toEqual({ titolo: PASSI_SPOSTA[1]!.titolo, stato: 'in-corso', nota: 'PC-A è spento' })
  })
  it('fallita: il passo fermo ha il motivo e si può riprovare', () => {
    const r = v({ fase: 'fallita', percentuale: 50, errore: 'Impronta diversa', puoRiprovare: true })
    expect(r.passi.map((p) => p.stato)).toEqual(['fatto', 'fatto', 'fermo', 'da-fare', 'da-fare', 'da-fare'])
    expect(r.passi[2]!.nota).toBe('Impronta diversa')
    expect(r.puoRiprovare).toBe(true)
    expect(v({ percentuale: 50 }).puoRiprovare).toBe(false)
  })
  it('Drive pieno si riconosce', () => {
    expect(v({ fase: 'fallita', percentuale: 2, errore: MOTIVO_DRIVE_PIENO_SPOSTA, puoRiprovare: true }).drivePieno).toBe(true)
    expect(v({ fase: 'fallita', errore: 'altro' }).drivePieno).toBe(false)
  })
})

describe('avanzamento dello spostamento: finestra', () => {
  const html = (x: Partial<VistaSposta>, spazio = true): string =>
    renderToStaticMarkup(createElement(AvanzamentoSposta, { s: { ...base, ...x }, occupato: false, onRiprova: () => {}, onChiudi: () => {}, ...(spazio ? { onSpazio: () => {} } : {}), adesso: ORA }))
  it('mostra barre, numeri, contatto e attesa', () => {
    const h = html({ percentuale: 60, percentualePasso: 30, fileFatti: 3, fileTotali: 10, ultimoContatto: new Date(ORA - 5000).toISOString(), attesa: 'una chat sta lavorando' })
    expect(h).toContain('60% in tutto')
    expect(h).toContain('3 di 10 file')
    expect(h).toContain('ultimo contatto con PC-A: 5 s fa')
    expect(h).toContain('sto aspettando: una chat sta lavorando')
    expect(h).toContain('role="progressbar"')
    expect(h).not.toContain('Riprova')
  })
  it('fallita: Riprova; Drive pieno: collegamento a Libera spazio', () => {
    const h = html({ fase: 'fallita', percentuale: 2, errore: MOTIVO_DRIVE_PIENO_SPOSTA, puoRiprovare: true })
    expect(h).toContain('Riprova')
    expect(h).toContain('Libera spazio sul Drive')
    expect(html({ fase: 'fallita', percentuale: 50, errore: 'altro', puoRiprovare: true })).not.toContain('Libera spazio')
    expect(html({ fase: 'fallita', percentuale: 50, errore: 'altro', puoRiprovare: false })).not.toContain('Riprova')
  })
})

describe('avanzamento dello spostamento: pagina del telefono', () => {
  const pagina = paginaClient()
  it('ha il blocco, con Riprova, aggiornamento da solo e la stessa funzione del PC', () => {
    expect(pagina).toContain('function pdSpostaHtml()')
    expect(pagina).toContain('function avanzamentoSposta(')
    expect(pagina).toContain('sto aspettando: ')
    expect(pagina).toContain('Riprova')
    expect(pagina).toContain('Libera spazio sul Drive')
  })
  it('lo script si compila e la funzione condivisa gira nella pagina', () => {
    const script = pagina.slice(pagina.indexOf('<script>') + 8, pagina.lastIndexOf('</script>'))
    expect(() => new Function(script)).not.toThrow()
    const i = script.indexOf('function avanzamentoSposta(')
    let prof = 0
    let fine = -1
    for (let k = script.indexOf('{', i); k < script.length; k++) {
      if (script[k] === '{') prof++
      else if (script[k] === '}' && --prof === 0) { fine = k; break }
    }
    const f = new Function(`${script.slice(i, fine + 1)}\nreturn avanzamentoSposta`)() as typeof avanzamentoSposta
    const r = f({ ...base, percentuale: 60, percentualeSposta: 1, fileFatti: 3, fileTotali: 10 } as VistaSposta, ORA, opz)
    expect(r.passo?.numeri).toBe('3 di 10 file')
    expect(r.percentuale).toBe(60)
  })
})
