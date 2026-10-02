import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  avvisoTentativoFallito, diagnosiDiario, esitoTentativo, leggiTentativo, motivoDaDiagnosi, paginaRelease
} from '@shared/tentativo-installazione'

/**
 * Il caso vero (portatile di Nicholas, 02/10). Alle 06:32 la 0.38.2 si è
 * installata. Alle 09:32 UTC «INSTALLA 0.39.0», la finestra di SierraDeck
 * Update si fa viva, il programma si chiude; alle 09:47 riparte ancora con la
 * 0.38.2. Nessuno se ne accorgeva.
 */
const tentativo = { versione: '0.39.0', da: '0.38.2', quando: '2026-10-02T09:32:21.225Z' }

describe('com e andato l ultimo tentativo', () => {
  it('nessun segno: nessuno', () => {
    expect(esitoTentativo(undefined, '0.38.2')).toEqual({ tipo: 'nessuno' })
  })
  it('ancora sulla versione di partenza: fallito', () => {
    expect(esitoTentativo(tentativo, '0.38.2')).toEqual({ tipo: 'fallito', tentativo })
  })
  it('sulla versione voluta: riuscito (il segno va tolto)', () => {
    expect(esitoTentativo(tentativo, '0.39.0')).toEqual({ tipo: 'riuscito', tentativo })
  })
  it('su un altra versione, installata a mano: riuscito anche questo', () => {
    expect(esitoTentativo(tentativo, '0.39.2').tipo).toBe('riuscito')
  })
  it('il segno si legge solo se e intero', () => {
    expect(leggiTentativo({ versione: '0.39.0', da: '0.38.2', quando: 'x' })).toEqual({ versione: '0.39.0', da: '0.38.2', quando: 'x' })
    expect(leggiTentativo({ versione: '0.39.0' })).toBeUndefined()
    expect(leggiTentativo(null)).toBeUndefined()
    expect(leggiTentativo('0.39.0')).toBeUndefined()
  })
})

describe('il diario di SierraDeck Update: solo quello che dice davvero', () => {
  const testa = '09:32:20 avviato con 0 argomenti\n09:32:20 parametri letti dal file: 7\n09:32:25 nessuna istanza rimasta: lancio l\'installer\n'
  it('codice di uscita diverso da zero', () => {
    expect(diagnosiDiario(testa + '09:32:40 installer fallito, codice 2\n')).toEqual({ tipo: 'codice', codice: 2 })
  })
  it('installer non partito: blocco di Windows solo se il messaggio lo dice', () => {
    expect(diagnosiDiario(testa + '09:32:25 installer non partito: Questo programma è bloccato dai criteri di gruppo\n'))
      .toMatchObject({ tipo: 'non-partito', bloccatoDaWindows: true })
    expect(diagnosiDiario(testa + '09:32:25 installer non partito: file non trovato\n'))
      .toMatchObject({ tipo: 'non-partito', bloccatoDaWindows: false })
  })
  it('lanciato e poi niente: interrotto; tempo scaduto; finito bene', () => {
    expect(diagnosiDiario(testa)).toEqual({ tipo: 'interrotto' })
    expect(diagnosiDiario(testa + '09:52:25 tempo scaduto\n')).toEqual({ tipo: 'tempo-scaduto' })
    expect(diagnosiDiario(testa + '09:33:10 installer terminato (codice 0)\n')).toEqual({ tipo: 'uscito-bene' })
    expect(diagnosiDiario('09:32:20 avviato con 0 argomenti\n')).toEqual({ tipo: 'prima-dell-installer' })
  })
  it('senza diario: nessuna diagnosi', () => {
    expect(diagnosiDiario(undefined)).toBeUndefined()
    expect(diagnosiDiario('  ')).toBeUndefined()
  })
  it('il motivo e certo solo quando lo e; altrimenti e detto probabile', () => {
    expect(motivoDaDiagnosi(undefined)).toContain('più probabile')
    expect(motivoDaDiagnosi(undefined)).toContain('Non lo so con certezza')
    expect(motivoDaDiagnosi({ tipo: 'codice', codice: 2 })).toContain('codice 2')
    expect(motivoDaDiagnosi({ tipo: 'non-partito', messaggio: 'bloccato dai criteri', bloccatoDaWindows: true })).not.toContain('probabile')
  })
})

describe('l avviso, uguale su PC, pagina e app', () => {
  it('dice cosa, il motivo probabile, le tre strade e il link alla versione', () => {
    const a = avvisoTentativoFallito(tentativo, undefined, paginaRelease('0.39.0'))
    expect(a.titolo).toMatch(/^Ho provato a installare la 0\.39\.0 alle \d\d:\d\d, ma sei ancora sulla 0\.38\.2\.$/)
    expect(a.motivo).toContain('Smart App Control')
    expect(a.motivo).toContain('non è firmato')
    expect(a.pagina).toBe('https://github.com/niko9090/sierradeck/releases/tag/v0.39.0')
    expect(a.strade).toHaveLength(3)
    expect(a.strade[0]).toContain(a.pagina)
    expect(a.strade[0]).toContain('SierraDeck-Setup-0.39.0.exe')
    expect(a.strade[1]).toContain('Riprova')
    expect(a.strade[2]).toContain('firma del codice')
    expect(a.strade[2]).toContain('Nicholas')
  })
})

describe('come e collegato', () => {
  const src = (p: string): string => readFileSync(join(__dirname, '../../src', p), 'utf8')
  it('il main segna il tentativo prima di lanciare l installer, lo toglie se l updater non parte, e lo legge all avvio', () => {
    const agg = src('main/aggiornamenti.ts')
    expect(agg.indexOf('segnaTentativo(stato.versione')).toBeLessThan(agg.indexOf('const partito = avviaUpdater('))
    expect(agg).toContain('togliSegno()')
    expect(agg).toContain("FILE_TENTATIVO = 'tentativo-installazione.json'")
    expect(agg).toContain('esitoTentativo(tentativo, app.getVersion())')
    expect(agg).toContain('INSTALLAZIONE NON RIUSCITA')
    // Lo stato lo porta sempre: la striscia del PC e il telefono lo leggono da li'.
    expect(agg).toContain('if (tentativoFallito !== undefined) nuovo = { ...nuovo, tentativoFallito }')
  })
  it('la striscia del PC e la pagina del telefono lo mostrano', () => {
    expect(src('renderer/App.tsx')).toContain('aggiornamento.tentativoFallito.titolo')
    const pagina = src('main/client-pagina.ts')
    expect(pagina).toContain('function fallitoHtml(a)')
    expect(pagina).toContain("f.pagina.indexOf('https://github.com/') === 0")
  })
})
