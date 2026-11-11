import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { MOTIVO_ATTESA, MOTIVO_CHIEDI, MOTIVO_COMANDO, MOTIVO_POSTO_DELICATO, MOTIVO_SCONOSCIUTO, permessoDaSolo } from '../../src/autopilot-host/permessi-automatici'

/**
 * 0.89.5, BG4 del 02/11: k-4 fermo al 37% perché scrivere nella copia del
 * pannello (fuori dalla cartella del workspace) chiedeva un permesso a
 * Nicholas, che non era al PC.
 */
describe('i permessi che il programma concede da solo (0.89.5)', () => {
  const casa = process.platform === 'win32' ? 'C:\\Users\\prova' : '/home/prova'
  const temp = join(casa, 'AppData', 'Local', 'Temp')
  const progetto = join(casa, 'glos-machine')
  const o = { casa, temp }
  const motivo = (strumento: string, input: unknown): string | undefined => {
    const r = permessoDaSolo(strumento, input, progetto, o)
    return r.concesso ? undefined : r.motivo
  }

  it('scrivere nella copia accanto al progetto, o nel progetto, passa da solo', () => {
    expect(permessoDaSolo('Write', { file_path: join(casa, 'glos-machine-k3', 'src', 'vista.ts') }, progetto, o).concesso).toBe(true)
    expect(permessoDaSolo('Edit', { file_path: 'src/a.ts' }, progetto, o).concesso).toBe(true)
    expect(permessoDaSolo('NotebookEdit', { notebook_path: join(progetto, 'n.ipynb') }, progetto, o).concesso).toBe(true)
    expect(permessoDaSolo('Write', { file_path: join(temp, 'x.txt') }, progetto, o).concesso).toBe(true)
    expect(permessoDaSolo('WebFetch', { url: 'https://example.com' }, progetto, o).concesso).toBe(true)
  })

  // 11/11: prima «restavano una domanda» a Nicholas; adesso li nega il programma, con il motivo.
  it('i posti delicati, l’interno di .git e gli strumenti sconosciuti sono negati, con il motivo', () => {
    expect(permessoDaSolo('Write', { file_path: join(casa, '.ssh', 'authorized_keys') }, progetto, o).concesso).toBe(false)
    expect(permessoDaSolo('Edit', { file_path: join(casa, '.claude', 'settings.json') }, progetto, o).concesso).toBe(false)
    expect(permessoDaSolo('Write', { file_path: join(casa, 'AppData', 'Roaming', 'sierradeck', 'impostazioni.json') }, progetto, o).concesso).toBe(false)
    expect(permessoDaSolo('Write', { file_path: join(progetto, '.git', 'hooks', 'pre-commit') }, progetto, o).concesso).toBe(false)
    expect(permessoDaSolo('Write', { file_path: '' }, progetto, o).concesso).toBe(false)
    expect(permessoDaSolo('mcp__altro__fai', {}, progetto, o).concesso).toBe(false)
    if (process.platform === 'win32') expect(permessoDaSolo('Write', { file_path: 'C:\\Windows\\System32\\x.dll' }, progetto, o).concesso).toBe(false)
    expect(motivo('Write', { file_path: join(casa, '.ssh', 'authorized_keys') })).toBe(MOTIVO_POSTO_DELICATO)
    expect(motivo('Write', { file_path: join(progetto, '.git', 'hooks', 'pre-commit') })).toBe(MOTIVO_POSTO_DELICATO)
    expect(motivo('Write', { file_path: '' })).toMatch(/manca il percorso/)
    expect(motivo('mcp__altro__fai', {})).toBe(MOTIVO_SCONOSCIUTO)
    // Un comando di shell per cui la CLI chiede lo stesso un permesso: non si fa, e non si chiede.
    expect(motivo('Bash', { command: 'rm -rf cartella-importante' })).toBe(MOTIVO_COMANDO)
  })

  it('11/11: Monitor e le attese sono negati, «l’esito ti arriva come evento, chiudi il turno»', () => {
    // Il caso vero del 06/11: «fine attesa 90 s», un comando di shell che aspetta un file.
    const monitor = { description: 'fine attesa 90 s', timeout_ms: 120000, command: 'until grep -q . "esito.txt" 2>/dev/null; do sleep 2; done' }
    expect(motivo('Monitor', monitor)).toBe(MOTIVO_ATTESA)
    expect(MOTIVO_ATTESA).toMatch(/l’esito di specialisti e unioni ti arriva come evento, chiudi il turno/)
    for (const s of ['ScheduleWakeup', 'CronCreate', 'Sleep']) expect(motivo(s, {})).toBe(MOTIVO_ATTESA)
  })

  it('11/11: AskUserQuestion rimanda a chiedi_utente; chi legge e basta passa', () => {
    expect(motivo('AskUserQuestion', { questions: [] })).toBe(MOTIVO_CHIEDI)
    expect(MOTIVO_CHIEDI).toMatch(/chiedi_utente/)
    for (const s of ['Read', 'Grep', 'Glob', 'TodoWrite', 'TaskOutput']) expect(permessoDaSolo(s, {}, progetto, o).concesso).toBe(true)
  })

  it('11/11: nessun esito è «chiedi a Nicholas»: sempre concesso con il perché o negato con il motivo', () => {
    for (const s of ['Write', 'Monitor', 'mcp__altro__fai', 'WebSearch', 'AskUserQuestion', 'UnoNuovo']) {
      const r = permessoDaSolo(s, { file_path: join(progetto, 'a.ts') }, progetto, o)
      if (r.concesso) expect(r.perche.length).toBeGreaterThan(3)
      else expect(r.motivo.length).toBeGreaterThan(10)
    }
  })
})
