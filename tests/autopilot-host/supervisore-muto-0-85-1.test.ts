import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { argomentiSupervisore, interrogazioneReale, type Interrogazione } from '../../src/autopilot-host/supervisore'
import { ALLARME_DOPO, conAllarme, motivoBreve } from '../../src/autopilot-host/supervisore-muto'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { indicatoreDi, rigaAllarme } from '@shared/indicatore-autopilota'

/**
 * 0.85.1 (Nicholas, 23/10 sera): il supervisore falliva da stamattina con
 * «spawn ENAMETOOLONG», 239 volte, 124 di fila. Il prompt passava come
 * argomento di `-p` e superava il tetto della riga di comando di Windows
 * (32.767 caratteri). Adesso va sull'ingresso; e se il supervisore fallisce di
 * fila, dal terzo fallimento c'è un allarme nell'indicatore e nel registro.
 */

/** Un `claude` finto: legge il prompt dall'ingresso e risponde come `--output-format json`. */
function claudeFinto(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sd-claude-finto-'))
  const script = join(dir, 'claude-finto.cjs')
  writeFileSync(script, [
    "let dati = ''",
    "process.stdin.setEncoding('utf8')",
    "process.stdin.on('data', (d) => { dati += d })",
    "process.stdin.on('end', () => {",
    "  const args = process.argv.slice(2)",
    "  process.stdout.write(JSON.stringify({ result: 'letti ' + dati.length + ' caratteri, ultimo ' + dati.slice(-5) + ', argomenti ' + args.join(' ').length, session_id: 's-finta' }))",
    '})'
  ].join('\n'))
  return script
}

describe('il prompt del supervisore non passa sulla riga di comando', () => {
  it('fra gli argomenti non c\'è il prompt', () => {
    const lungo = 'x'.repeat(50_000)
    let visti: string[] = []
    argomentiSupervisore('claude.exe', lungo, 'C:\\p', undefined, (_c, a) => { visti = a })
    expect(visti).toContain('-p')
    expect(visti.some((a) => a.includes('xxxx'))).toBe(false)
    expect(visti.join(' ').length).toBeLessThan(200)
  })

  it('un prompt di oltre 40.000 caratteri ottiene la risposta', async () => {
    // Con il prompt negli argomenti questa chiamata falliva con spawn ENAMETOOLONG.
    const prompt = `${'giudica il lavoro. '.repeat(2500)}FINE!`
    expect(prompt.length).toBeGreaterThan(40_000)
    const interroga = interrogazioneReale(process.execPath, [claudeFinto()])
    const r = await interroga(prompt, process.cwd(), undefined)
    expect(r.sessionId).toBe('s-finta')
    expect(r.testo).toContain(`letti ${prompt.length} caratteri`)
    expect(r.testo).toContain('ultimo FINE!')
  }, 30_000)

  it('anche le lettere accentate arrivano intere', async () => {
    const prompt = 'perché è già lì — «così» '.repeat(2000)
    const r = await interrogazioneReale(process.execPath, [claudeFinto()])(prompt, process.cwd(), undefined)
    expect(r.testo).toContain(`letti ${prompt.length} caratteri`)
  }, 30_000)
})

describe('allarme dopo 3 fallimenti di fila', () => {
  const ADESSO = '2026-10-23T20:00:00.000Z'
  const cheFallisce = (quante: number): { interroga: Interrogazione; chiamate: () => number } => {
    let n = 0
    return {
      interroga: async () => {
        n += 1
        if (n <= quante) throw new Error('interrogazione del supervisore fallita: spawn ENAMETOOLONG')
        return { testo: '{"finito": false}' }
      },
      chiamate: () => n
    }
  }

  it('al terzo fallimento di fila l\'allarme parte una volta sola, con il motivo', async () => {
    const f = cheFallisce(5)
    const allarmi: string[] = []
    const s = conAllarme(f.interroga, () => ADESSO, (m) => { allarmi.push(rigaAllarme(m)) })
    for (let i = 0; i < 2; i++) await expect(s.interroga('p', 'C:/p', undefined)).rejects.toThrow()
    expect(s.stato()).toBeUndefined()
    expect(allarmi).toEqual([])
    await expect(s.interroga('p', 'C:/p', undefined)).rejects.toThrow()
    expect(allarmi).toEqual(['Allarme: il supervisore non risponde (3 volte di fila): spawn ENAMETOOLONG'])
    await expect(s.interroga('p', 'C:/p', undefined)).rejects.toThrow()
    expect(allarmi).toHaveLength(1)
    expect(s.stato()).toEqual({ volte: 4, motivo: 'spawn ENAMETOOLONG', dal: ADESSO })
  })

  it('una risposta buona spegne l\'allarme e azzera il conto', async () => {
    const f = cheFallisce(ALLARME_DOPO)
    const s = conAllarme(f.interroga, () => ADESSO, () => {})
    for (let i = 0; i < ALLARME_DOPO; i++) await expect(s.interroga('p', 'C:/p', undefined)).rejects.toThrow()
    expect(s.stato()?.volte).toBe(3)
    await s.interroga('p', 'C:/p', undefined)
    expect(s.stato()).toBeUndefined()
  })

  it('fallimenti non di fila non fanno allarme', async () => {
    let n = 0
    const alterna: Interrogazione = async () => {
      n += 1
      if (n % 2 === 1) throw new Error('scaduto')
      return { testo: 'ok' }
    }
    const allarmi: unknown[] = []
    const s = conAllarme(alterna, () => ADESSO, (m) => { allarmi.push(m) })
    for (let i = 0; i < 6; i++) await s.interroga('p', 'C:/p', undefined).catch(() => undefined)
    expect(allarmi).toEqual([])
  })

  it('il motivo è corto e senza il prefisso tecnico', () => {
    expect(motivoBreve(new Error('interrogazione del supervisore fallita: spawn ENAMETOOLONG\nriga 2'))).toBe('spawn ENAMETOOLONG')
    expect(motivoBreve(new Error('x'.repeat(500))).length).toBeLessThanOrEqual(160)
  })

  it('l\'indicatore lo mostra in rosso, prima di ogni altra cosa', () => {
    const ora = Date.parse(ADESSO)
    const a: Autopilota = {
      ...nuovoAutopilota({ id: 'ap-1', nome: 'Gestionale', obiettivo: 'Il gestionale', cwd: 'C:/progetto', criteri: [{ descrizione: 'compila', soddisfatto: false }], iniziatoIl: ADESSO }),
      stato: 'lavoro'
    }
    const muto = { volte: 124, motivo: 'spawn ENAMETOOLONG', dal: ADESSO }
    const i = indicatoreDi({ ...a, supervisoreMuto: muto }, ora)
    expect(i.andamento.colore).toBe('rosso')
    expect(i.andamento.testo).toContain('Allarme: il supervisore non risponde (124 volte di fila): spawn ENAMETOOLONG')
    // Senza allarme l'indicatore resta com'era.
    expect(indicatoreDi(a, ora).andamento.testo).not.toContain('Allarme')
  })
})
