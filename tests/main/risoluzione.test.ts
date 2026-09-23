import { describe, it, expect } from 'vitest'
import { componiDossier, argomentiAgente, ultimeRighe, ISTRUZIONI_AGENTE } from '../../src/main/risoluzione'

describe('la risoluzione avanzata', () => {
  const richiesta = {
    cwd: 'E:\\Progetti\\x', sessionUuid: 'abc-123', titolo: 'gestionale', caso: 'morta',
    titoloDiagnosi: 'claude.exe si è chiuso subito (codice 1)', dettaglio: 'uscito con 1 dopo 3 s\nError: boom',
    ultimeRighe: ['riga 1', 'Error: boom']
  }
  const contesto = {
    versioneSierraDeck: '0.34.0', claude: 'C:\\Users\\n\\.local\\bin\\claude.exe',
    accesso: { autenticato: false, motivo: 'token scaduto' }, cartellaEsiste: false,
    trascrizione: { percorso: 'C:\\Users\\n\\.claude\\projects\\E--Progetti-x\\abc-123.jsonl', esiste: true, byte: 4096 },
    ultimeRigheRegistro: ['2026-09-23T00:00:00Z [ERRORE] [app] qualcosa'], sistema: 'Windows 11'
  }

  it('il dossier dice tutto quello che l’utente non vede, con i punti critici in evidenza', () => {
    const d = componiDossier(richiesta, contesto, '2026-09-23T00:10:00.000Z')
    expect(d).toContain('Caso: **morta**')
    expect(d).toContain('**NON esiste su questo PC**')
    expect(d).toContain('esiste, 4096 byte')
    expect(d).toContain('**non valido** — token scaduto')
    expect(d).toContain('Error: boom')
    expect(d).toContain('[ERRORE] [app] qualcosa')
    expect(d).toContain('--resume <sessione>')
  })

  it('un terminale prolisso non gonfia il dossier all’infinito', () => {
    const lungo = { ...richiesta, ultimeRighe: Array.from({ length: 2000 }, (_, i) => `riga ${i} ${'x'.repeat(40)}`) }
    const d = componiDossier(lungo, contesto)
    expect(d.length).toBeLessThan(40_000)
    expect(d).toContain('tagliato')
  })

  it('l’agente parte interattivo, con il dossier come primo messaggio e le istruzioni di sistema', () => {
    const a = argomentiAgente('C:\\Temp\\dossier.md')
    expect(a[0]).toContain('C:\\Temp\\dossier.md')
    expect(a).toContain('--dangerously-skip-permissions')
    expect(a[a.indexOf('--append-system-prompt') + 1]).toBe(ISTRUZIONI_AGENTE)
    expect(ISTRUZIONI_AGENTE).toContain('Non modificare')
  })

  it('le ultime righe del registro, senza righe vuote', () => {
    expect(ultimeRighe('a\r\nb\n\nc\n', 2)).toEqual(['b', 'c'])
    expect(ultimeRighe('', 5)).toEqual([])
  })
})
