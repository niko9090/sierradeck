import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { vociMenuApplicazione, vociMenuContestuale } from '../../src/main/menu-modifica'
import { paginaClient } from '../../src/main/client-pagina'

/**
 * Nicholas (30/09): «nella chat con l'autopilota non riesco né a copiare né a
 * incollare nella casella». Le prove, sui tre lati.
 */
describe('copia e incolla nella chat con l autopilota', () => {
  it('il menu dell applicazione ha i ruoli di Modifica: senza, Ctrl+C e Ctrl+V non hanno a chi arrivare', () => {
    const modifica = vociMenuApplicazione().find((v) => v.label === 'Modifica')
    const ruoli = (modifica?.submenu as { role?: string }[]).map((v) => v.role)
    for (const r of ['copy', 'paste', 'cut', 'selectAll', 'undo']) expect(ruoli).toContain(r)
    // E le voci che servono alle verifiche restano.
    const vista = vociMenuApplicazione().find((v) => v.label === 'Vista')
    expect((vista?.submenu as { role?: string }[]).map((v) => v.role)).toContain('toggleDevTools')
  })

  it('il tasto destro in un campo offre Incolla, su un testo selezionato Copia, altrove niente', () => {
    const tutti = { canCut: true, canCopy: true, canPaste: true, canSelectAll: true }
    const campo = vociMenuContestuale({ isEditable: true, selectionText: '', editFlags: { ...tutti, canCopy: false } })
    const incolla = campo.find((v) => v.role === 'paste')
    expect(incolla?.enabled).toBe(true)
    expect(campo.find((v) => v.role === 'copy')?.enabled).toBe(false)
    expect(vociMenuContestuale({ isEditable: false, selectionText: 'una riga', editFlags: tutti }).map((v) => v.role)).toEqual(['copy'])
    expect(vociMenuContestuale({ isEditable: false, selectionText: '  ', editFlags: tutti })).toEqual([])
  })

  it('il processo principale li monta davvero', () => {
    const indice = readFileSync('src/main/index.ts', 'utf8')
    expect(indice).toContain('Menu.setApplicationMenu(Menu.buildFromTemplate(vociMenuApplicazione()))')
    expect(indice).toContain("webContents.on('context-menu'")
  })

  it('la chat con l autopilota riapre la selezione che il body spegne', () => {
    const css = readFileSync('src/renderer/console.css', 'utf8')
    expect(css).toMatch(/body\s*\{[^}]*user-select:\s*none/)
    expect(css).toMatch(/\.chatap__flusso\s*\{[^}]*user-select:\s*text/)
    // La casella dove si incolla accetta la selezione.
    expect(css).toMatch(/textarea\.campo,\s*input\.campo\s*\{[^}]*user-select:\s*text/)
    expect(readFileSync('src/renderer/components/ChatAutopilota.tsx', 'utf8')).toContain('className="campo chatap__campo"')
  })

  it('la pagina del telefono non ridisegna mentre si seleziona', () => {
    const html = paginaClient()
    const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
    const inizio = script.indexOf('function selezioneAttiva(')
    const fine = script.indexOf('}', inizio)
    const selezioneAttiva = new Function(script.slice(inizio, fine + 1) + '\nreturn selezioneAttiva')() as (s: unknown) => boolean
    const finta = (testo: string, chiusa: boolean) => ({ isCollapsed: chiusa, toString: () => testo })
    expect(selezioneAttiva(finta('ciao', false))).toBe(true)
    expect(selezioneAttiva(finta('', true))).toBe(false)
    expect(selezioneAttiva(null)).toBe(false)
    const pannello = script.slice(script.indexOf('function pannello('), script.indexOf('function pannello(') + 900)
    expect(pannello).toContain('if (selezioneAttiva(window.getSelection())) return')
  })

  it('l app Android rende selezionabile la chat con lui', () => {
    const lavori = readFileSync('android/app/src/main/java/it/ferrariconsulenze/sierradeck/Lavori.kt', 'utf8')
    const pezzo = lavori.slice(lavori.indexOf('items(chat) { b ->'), lavori.indexOf('items(chat) { b ->') + 700)
    expect(pezzo).toContain('SelectionContainer')
  })
})
