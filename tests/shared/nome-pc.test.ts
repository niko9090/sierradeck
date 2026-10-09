import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nomeDaMostrare, nomeSceltoValido, sottotitoloPc, NOME_PC_MAX, type PcConNome } from '@shared/nome-pc'
import { mappaPc } from '@shared/collegamento'
import { apriIdentitaPc } from '../../src/main/progetti/pc'
import { paginaClient } from '../../src/main/client-pagina'

/**
 * Il nome scelto di un PC al posto dell'hostname (0.52.4). Nicholas (07/10):
 * nell'app, in alto e nel cambio di computer, si vedeva il nome tecnico della
 * macchina invece di quello che le aveva dato lui. Gli stessi casi
 * (`tests/fixtures/nome-pc-casi.json`) li legge `NomePcTest.kt`. Solo nomi di
 * esempio.
 */
type Caso = { caso: string; pc: PcConNome; mostra: string; sotto: string | null }
const CASI = JSON.parse(readFileSync(join(__dirname, '../fixtures/nome-pc-casi.json'), 'utf8')) as Caso[]
const ROOT = join(__dirname, '../..')
const leggi = (f: string): string => readFileSync(join(ROOT, f), 'utf8')

describe('nomeDaMostrare e il sottotitolo', () => {
  for (const c of CASI) {
    it(c.caso, () => {
      expect(nomeDaMostrare(c.pc)).toBe(c.mostra)
      expect(sottotitoloPc(c.pc) ?? null).toBe(c.sotto)
    })
  }
  it('un nome da salvare: pulito e al massimo quaranta caratteri', () => {
    expect(nomeSceltoValido('  Studio\tdi casa  ')).toBe('Studio di casa')
    expect(nomeSceltoValido('x'.repeat(60))).toHaveLength(NOME_PC_MAX)
    expect(nomeSceltoValido('   ')).toBe('')
    expect(nomeDaMostrare(undefined)).toBe('')
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
    ${estrai('function pulitoPc(')}
    ${estrai('function nomeDaMostrare(')}
    ${estrai('function sottotitoloPc(')}
    return { nomeDaMostrare, sottotitoloPc }
  `)() as { nomeDaMostrare: typeof nomeDaMostrare; sottotitoloPc: typeof sottotitoloPc }
  it('stessi risultati su tutti i casi', () => {
    for (const c of CASI) {
      expect(pagina.nomeDaMostrare(c.pc), c.caso).toBe(nomeDaMostrare(c.pc))
      expect(pagina.sottotitoloPc(c.pc), c.caso).toBe(sottotitoloPc(c.pc))
    }
  })
  it('la usa per gli altri computer, il «Mi collego a…» e la mappa', () => {
    expect(script).toContain('esc(nomeDaMostrare(b)) + hostPiccolo(b)')
    expect(script).toContain('nomeDaMostrare(ultimoStato.computer)')
    expect(script).toContain('esc(n.host)')
  })
})

describe('questo PC: il nome scelto si salva, si cambia e si toglie', () => {
  const temp: string[] = []
  afterEach(() => { for (const t of temp.splice(0)) rmSync(t, { recursive: true, force: true }) })
  const cartella = (): string => { const c = mkdtempSync(join(tmpdir(), 'sd-nome-')); temp.push(c); return c }
  it('senza nome scelto si mostra l’hostname; con, il nome scelto e l’hostname a parte', () => {
    const dati = cartella()
    const pc = apriIdentitaPc(dati, { nome: () => 'PC-ESEMPIO', casa: cartella })
    expect(pc.leggi()).toMatchObject({ nome: 'PC-ESEMPIO', host: 'PC-ESEMPIO' })
    expect(pc.leggi().nomeScelto).toBeUndefined()
    const id = pc.leggi().id
    expect(pc.impostaNome('  Studio  ')).toMatchObject({ id, nome: 'Studio', host: 'PC-ESEMPIO', nomeScelto: 'Studio' })
    // Riaperto (un riavvio): resta, e su disco «nome» è ancora l'hostname per le versioni vecchie.
    const riaperto = apriIdentitaPc(dati, { nome: () => 'PC-ESEMPIO', casa: cartella })
    expect(riaperto.leggi()).toMatchObject({ id, nome: 'Studio', nomeScelto: 'Studio' })
    expect(JSON.parse(readFileSync(join(dati, 'pc.json'), 'utf8'))).toMatchObject({ id, nome: 'PC-ESEMPIO', nomeScelto: 'Studio' })
    // La cartella dei progetti non lo perde.
    riaperto.impostaCartellaProgetti(join(dati, 'progetti'))
    expect(riaperto.leggi().nomeScelto).toBe('Studio')
    expect(riaperto.impostaNome('')).toMatchObject({ nome: 'PC-ESEMPIO' })
    expect(riaperto.leggi().nomeScelto).toBeUndefined()
  })
})

describe('il nome scelto viaggia', () => {
  it('nel battito e nella mappa, con l’hostname a parte', () => {
    expect(leggi('src/main/progetti/posta.ts')).toContain('host: i.host')
    expect(leggi('src/main/index.ts')).toContain("identita: () => { const i = identitaPc.leggi(); return { host: i.host")
    const m = mappaPc({ id: 'pc-fisso-id', nome: 'Studio', host: 'PC-ESEMPIO' }, [{ pcId: 'pc-due', nome: 'Portatile', host: 'portatile', stato: 'acceso' }])
    expect(m.nodi[0]).toMatchObject({ nome: 'Studio', host: 'PC-ESEMPIO' })
    expect(m.nodi[1]?.host).toBeUndefined()
  })
})

describe('sul PC si mostra ovunque il nome di adesso', () => {
  it('riquadri «SU», Riprendi, case, attese, mappa e «Altri computer» passano da NomePc / useNomePc', () => {
    expect(leggi('src/renderer/components/Mosaic.tsx')).toContain('SU <NomePc id={data.remoto.pcId}')
    expect(leggi('src/renderer/components/ModaleSessioni.tsx')).toContain('SU <NomePc id={altrove.id}')
    expect(leggi('src/renderer/components/RiquadroRemoto.tsx')).not.toMatch(/\{remoto\.pcNome\}/)
    expect(leggi('src/renderer/components/Terminal.tsx')).not.toMatch(/\{(inAttesaDi|altrove)\.pc\.nome\}/)
    expect(leggi('src/renderer/components/OspiteChat.tsx')).toContain('useNomePc(casa?.pc')
    expect(leggi('src/renderer/components/MappaPc.tsx')).toContain('n.host')
    const account = leggi('src/renderer/components/PannelloAccount.tsx')
    // Il nome di questo PC sta in Impostazioni → Computer dalla 0.56.0; il componente resta in PannelloAccount.
    expect(leggi('src/renderer/components/PannelloImpostazioni.tsx')).toContain('<NomeQuestoPc />')
    expect(account).toContain('window.gestore.posta.impostaNome(')
  })
})
