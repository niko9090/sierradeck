import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FUNZIONI, MENU_PRINCIPALE, MENU_TELEFONO, voceMenu } from '../../src/shared/menu-principale'
import { paginaClient } from '../../src/main/client-pagina'

/**
 * Il menu principale (0.61.0), uguale su PC, pagina e app. Nicholas (11/10):
 * «pratico, intuitivo, tutte le funzioni in vista ordinate per importanza».
 * L'inventario per esteso: `.sierradeck/quaderno/menu-rifatti-0-61-0-inventario.md`.
 */
const leggi = (p: string): string => readFileSync(p, 'utf8')
const kt = (f: string): string => leggi(join('android', 'app', 'src', 'main', 'java', 'it', 'ferrariconsulenze', 'sierradeck', f))

describe('il menu principale', () => {
  it('sette voci, in ordine d’importanza', () => {
    expect(MENU_PRINCIPALE.map((v) => v.nome)).toEqual(['Progetti', 'Autopiloti', 'Domande', 'Chat e workspace', 'File', 'Salute', 'Impostazioni'])
    for (const v of MENU_PRINCIPALE) {
      expect(v.spiega.length, v.id).toBeGreaterThan(80)
      expect(v.icona, v.id).not.toBe('')
      // Il nome corto è il nome, al più senza «e workspace» e con i trattini morbidi.
      expect(v.nome.startsWith(v.breve.replace(/­/g, '')), v.id).toBe(true)
    }
    // Le icone non si ripetono (prima ▣ voleva dire due cose, ⧉ altre due).
    expect(new Set(MENU_PRINCIPALE.map((v) => v.icona)).size).toBe(7)
  })
  it('nessuna funzione di prima resta senza casa, e ogni voce ha qualcosa dentro', () => {
    const id = new Set(MENU_PRINCIPALE.map((v) => v.id))
    for (const f of FUNZIONI) expect(id.has(f.dove), f.funzione).toBe(true)
    for (const v of MENU_PRINCIPALE) expect(FUNZIONI.some((f) => f.dove === v.id), v.id).toBe(true)
    // Le funzioni del vecchio «☁ Drive» stanno tutte in Progetti.
    for (const f of FUNZIONI.filter((x) => x.prima.includes('☁ Drive'))) expect(f.dove, f.funzione).toBe('progetti')
    expect(voceMenu('salute').nome).toBe('Salute')
  })
})

describe('sul PC: ogni voce dell’inventario si raggiunge', () => {
  const console_ = leggi('src/renderer/components/Console.tsx')
  const app = leggi('src/renderer/App.tsx')
  it('la barra è il menu principale; il vecchio «☁ Drive» non c’è più', () => {
    expect(console_).toContain('MENU_PRINCIPALE.map((v) =>')
    expect(console_).toContain('className="console console--principale"')
    expect(console_).not.toContain('☁ Drive')
    expect(console_).not.toContain('▤ Quaderno')
    expect(existsSync('src/renderer/components/PannelloDrive.tsx')).toBe(false)
    expect(app).not.toContain("aperto === 'drive'")
    // Una richiesta del vecchio «drive» (un riquadro che aspetta un PC spento, la scorciatoia) apre Progetti.
    expect(console_).toContain("if (quale === 'drive' || quale === 'progetti')")
    expect(console_).toContain("case 'drive': onProgetti?.(); return")
  })
  it('Progetti (0.69.0, a piena pagina): gli strumenti rari in «Strumenti ▾», niente più finestra stretta', () => {
    const p = leggi('src/renderer/components/VistaProgetti.tsx')
    expect(existsSync('src/renderer/components/ModalePannelloDrive.tsx')).toBe(false)
    expect(p).toContain('Strumenti ▾')
    for (const t of ['Sposta progetto…', 'Riordina le chat…', 'Dove vive ogni chat…', 'Quaderno del progetto', 'Salvataggio e arrivo', 'Il contenuto del Drive', '<SalvataggioDrive />', '<ContenutoDrive']) expect(p, t).toContain(t)
    const a = leggi('src/renderer/components/PannelloAccount.tsx')
    for (const t of ['Salva ora', 'Ripristina', 'Salvataggio automatico', 'Fondi con il Drive…', '<SezioneProgetti', 'export function SalvataggioDrive']) expect(a, t).toContain(t)
    const d = leggi('src/renderer/components/ContenutoDrive.tsx')
    for (const t of ['Per progetto (cartella)', 'Togli la cartella dal Drive', 'Rimetti sul Drive', 'Togli dal Drive']) expect(d, t).toContain(t)
    // Il rimando a se stesso non c'è più.
    expect(d).not.toContain('Chat e progetti del Drive…')
  })
  it('Chat e workspace, Salute, Impostazioni', () => {
    const c = leggi('src/renderer/components/PannelloChat.tsx')
    for (const t of ['+ Nuova chat', 'Riprendi una conversazione', 'Crea, rinomina, elimina…', 'Nuova finestra', 'Negozio…', '<SottofondoQui vuoto=', 'Usate da altri PC (nessuna)']) expect(c, t).toContain(t)
    expect(app).toContain("aperto === 'chat' ? (")
    const s = leggi('src/renderer/components/PannelloSalute.tsx')
    for (const t of ['<AltriComputer />', 'onConsumi?.()', '<PannelloConsumi incorporato />']) expect(s, t).toContain(t)
    const imp = leggi('src/renderer/components/PannelloImpostazioni.tsx')
    expect(imp).not.toContain("bottone('consumi'")
    expect(imp).not.toContain("detail: 'salute'")
    expect(imp).not.toContain('sierradeck:dove-vive')
  })
})

describe('nella pagina e nell’app: la stessa struttura', () => {
  it('la pagina ha le sette destinazioni con il loro contenuto', () => {
    const html = paginaClient()
    const sch = html.slice(html.indexOf('const schermate = {'))
    const corpo = sch.slice(0, sch.indexOf('app.innerHTML'))
    for (const v of MENU_PRINCIPALE) expect(corpo, v.id).toContain(`${v.id}:`)
    for (const t of ["apriPannello(\\'code\\')", "apriPannello(\\'drive\\')", "apriPannello(\\'quaderno\\')", "apriPannello(\\'pc\\')", "apriPannello(\\'consumi\\')", "apriPannello(\\'negozio\\')", "apriPannello(\\'sessioni\\')"]) expect(corpo, t).toContain(t)
  })
  it('l’app ha le stesse voci (assets/menu.json): le sette del PC raccolte in quattro (0.83.0)', () => {
    const fatto = {
      voci: MENU_PRINCIPALE.map((v) => ({ id: v.id, nome: v.nome, breve: v.breve, icona: v.icona, spiega: v.spiega })),
      telefono: MENU_TELEFONO.map((v) => ({ id: v.id, nome: v.nome, contiene: [...v.contiene], linguette: [...v.linguette] }))
    }
    const file = join('android', 'app', 'src', 'main', 'assets', 'menu.json')
    if (process.env.AGGIORNA === '1') {
      mkdirSync(join(file, '..'), { recursive: true })
      writeFileSync(file, `${JSON.stringify(fatto, null, 2)}\n`)
    }
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(fatto)
    const a = kt('App.kt')
    for (const t of ['VoceBarra.ADESSO -> Adesso(', 'VoceBarra.CHAT -> ConLinguette', 'VoceBarra.PROGETTI -> ConLinguette', 'VoceBarra.ALTRO -> Altro(', 'else -> Negozio(api)', 'BarraVoci(posto.voce']) expect(a, t).toContain(t)
    expect(a).not.toContain('Scheda.COMPUTER')
    expect(a).not.toContain('ParteComputer')
    // In Adesso: le domande in cima, poi gli autopiloti (Lavori).
    expect(kt('Adesso.kt')).toContain('domandeInCima(api, domande)')
  })
  it('il telefono: quattro voci che contengono ognuna delle sette, una volta sola', () => {
    expect(MENU_TELEFONO.map((v) => v.nome)).toEqual(['Adesso', 'Chat', 'Progetti', 'Altro'])
    const tutte = MENU_TELEFONO.flatMap((v) => v.contiene)
    expect([...tutte].sort()).toEqual(MENU_PRINCIPALE.map((v) => v.id).sort())
    // Le domande per Nicholas stanno nella prima voce, quella su cui si apre l'app.
    expect(MENU_TELEFONO[0].contiene[0]).toBe('domande')
  })
})
