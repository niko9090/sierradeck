import { describe, it, expect } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BOZZA_AUTOPILOTA_VUOTA, PARTENZE, ULTIMO_WORKSPACE, bozzaDaCorpo, confermaChiudi, confermaDormi, confermaEliminaAutopilota,
  confermaEliminaWorkspace, confermaRinominaWorkspace, confermaSposta, controllaBozzaAutopilota, controllaNomeWorkspace,
  leggiAzioneFinestra, nomeDaObiettivo, percorsoAssoluto, type BozzaAutopilota
} from '../../src/shared/azioni-telefono'
import { REGOLE_PUBBLICAZIONE } from '../../src/shared/harness'

/**
 * Le regole e i testi per gestire chat, workspace e autopiloti dal telefono
 * (0.55.0). L'app li ricopia in Kotlin (`AzioniTelefono.kt`) e li confronta
 * con `android/app/src/test/resources/azioni/azioni-0.55.json`, scritto da
 * qui con `AGGIORNA=1`: la validazione dell'autopilota è la stessa del PC.
 */
const b = (p: Partial<BozzaAutopilota>): BozzaAutopilota => ({ ...BOZZA_AUTOPILOTA_VUOTA, ...p })
const CASI: { nome: string; bozza: BozzaAutopilota }[] = [
  { nome: 'vuota', bozza: b({}) },
  { nome: 'solo spazi', bozza: b({ obiettivo: '   ', cwd: 'C:\\Progetti\\Esempio' }) },
  { nome: 'senza cartella', bozza: b({ obiettivo: 'Sistema il lettore di CSV' }) },
  { nome: 'cartella relativa', bozza: b({ obiettivo: 'x', cwd: 'Esempio' }) },
  { nome: 'minima', bozza: b({ obiettivo: 'Sistema il lettore di CSV', cwd: 'C:\\Progetti\\Esempio' }) },
  { nome: 'obiettivo lungo senza nome', bozza: b({ obiettivo: 'Porta i test a verde e poi scrivi la scheda del quaderno con le cause trovate', cwd: 'D:\\Lavoro\\Esempio' }) },
  { nome: 'piena', bozza: b({ obiettivo: '  Porta i test a verde  ', cwd: ' C:\\Progetti\\Esempio ', nome: ' Test verdi ', criteri: 'npm test passa\r\n\r\n  il quaderno ha la scheda  \n', pubblicazione: 'beta', cloud: true, partenza: 'subito', workspace: ' Lavoro ' }) },
  { nome: 'rete', bozza: b({ obiettivo: 'x', cwd: '\\\\server\\condivisa\\Esempio' }) },
  { nome: 'regola sconosciuta', bozza: b({ obiettivo: 'x', cwd: 'C:\\Progetti\\Esempio', pubblicazione: 'sempre' as never }) },
  { nome: 'partenza sconosciuta', bozza: b({ obiettivo: 'x', cwd: 'C:\\Progetti\\Esempio', partenza: 'domani' as never }) },
  { nome: 'workspace troppo lungo', bozza: b({ obiettivo: 'x', cwd: 'C:\\Progetti\\Esempio', workspace: 'w'.repeat(61) }) },
  { nome: 'nome lungo', bozza: b({ obiettivo: 'x', cwd: 'C:\\Progetti\\Esempio', nome: 'n'.repeat(100) }) }
]
const NOMI_WS: { nome: string; esistenti: string[] }[] = [
  { nome: '', esistenti: [] }, { nome: '  Sera  ', esistenti: [] }, { nome: 'Lavoro', esistenti: ['Lavoro'] },
  { nome: 'x'.repeat(61), esistenti: [] }, { nome: 'a\tb', esistenti: [] }, { nome: 'Città', esistenti: ['Lavoro'] }
]

function esempio(): Record<string, unknown> {
  return {
    autopilota: CASI.map((c) => ({ nome: c.nome, bozza: c.bozza, esito: controllaBozzaAutopilota(c.bozza) })),
    nomiWorkspace: NOMI_WS.map((c) => ({ ...c, esito: controllaNomeWorkspace(c.nome, c.esistenti) })),
    nomeDaObiettivo: ['Una frase di nove parole che si ferma alla ottava sola', 'breve'].map((o) => ({ obiettivo: o, nome: nomeDaObiettivo(o) })),
    partenze: PARTENZE,
    regole: REGOLE_PUBBLICAZIONE,
    ultimoWorkspace: ULTIMO_WORKSPACE,
    conferme: {
      dormi: confermaDormi('Esempio'),
      chiudi: confermaChiudi('Esempio'),
      sposta: confermaSposta('Esempio', 'Lavoro'),
      eliminaWorkspace: confermaEliminaWorkspace('Lavoro'),
      rinominaWorkspace: confermaRinominaWorkspace('Lavoro'),
      eliminaAutopilota: confermaEliminaAutopilota('Test verdi')
    }
  }
}

describe('le regole per gestire dal telefono', () => {
  it('l’autopilota: la stessa validazione del PC, con il perché per esteso', () => {
    expect(controllaBozzaAutopilota(b({}))).toEqual({ ok: false, campo: 'obiettivo', errore: 'Scrivi prima cosa vuoi ottenere.' })
    expect(controllaBozzaAutopilota(b({ obiettivo: 'x' }))).toMatchObject({ ok: false, campo: 'cwd' })
    const piena = controllaBozzaAutopilota(CASI.find((c) => c.nome === 'piena')!.bozza)
    expect(piena).toEqual({ ok: true, richiesta: { nome: 'Test verdi', obiettivo: 'Porta i test a verde', cwd: 'C:\\Progetti\\Esempio', criteri: [{ descrizione: 'npm test passa' }, { descrizione: 'il quaderno ha la scheda' }], pubblicazione: 'beta', vaSulCloud: true, workspace: 'Lavoro', partenza: 'subito' } })
    // Il nome come il PC: le prime otto parole, al massimo 60 caratteri.
    expect(nomeDaObiettivo('uno due tre quattro cinque sei sette otto nove')).toBe('uno due tre quattro cinque sei sette otto')
    expect(percorsoAssoluto('C:\\Progetti')).toBe(true)
    expect(percorsoAssoluto('\\\\server\\cartella')).toBe(true)
    expect(percorsoAssoluto('Progetti')).toBe(false)
  })
  it('il corpo dei telefoni di prima vale ancora: obiettivo, cartella, regola, cloud', () => {
    expect(bozzaDaCorpo({ obiettivo: 'o', cartella: 'C:\\c' })).toEqual({ ...BOZZA_AUTOPILOTA_VUOTA, obiettivo: 'o', cwd: 'C:\\c' })
    expect(bozzaDaCorpo({ obiettivo: 'o', cartella: 'C:\\c', criteri: [{ descrizione: 'a' }, 'b'] }).criteri).toBe('a\nb')
  })
  it('le azioni alla finestra si leggono senza fidarsi', () => {
    expect(leggiAzioneFinestra({ tipo: 'chat', azione: 'dormi', chat: 'p-1' })).toEqual({ tipo: 'chat', azione: 'dormi', chat: 'p-1' })
    expect(leggiAzioneFinestra({ tipo: 'chat', azione: 'cancella', chat: 'p-1' })).toBeUndefined()
    expect(leggiAzioneFinestra({ tipo: 'workspace', azione: 'rinomina', nome: 'a' })).toBeUndefined()
    expect(leggiAzioneFinestra({ tipo: 'chat', azione: 'sposta', chat: 'p-1' })).toBeUndefined()
  })
  it('le conferme dicono cosa succede e cosa no', () => {
    expect(confermaDormi('X').testo).toContain('con «Svegliala» riparte da dove era')
    expect(confermaChiudi('X').testo).toContain('La conversazione non si cancella')
    expect(confermaEliminaWorkspace('X').testo).toContain('workspaces.prima-dell-eliminazione.json')
  })
  it('l’app ha gli stessi casi e gli stessi testi (resources/azioni/azioni-0.55.json)', () => {
    const fatto = esempio()
    const file = join('android', 'app', 'src', 'test', 'resources', 'azioni', 'azioni-0.55.json')
    if (process.env.AGGIORNA === '1') {
      mkdirSync(join(file, '..'), { recursive: true })
      writeFileSync(file, `${JSON.stringify(fatto, null, 2)}\n`)
    }
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(fatto)
  })
})
