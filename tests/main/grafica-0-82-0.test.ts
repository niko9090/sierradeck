import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { paginaClient } from '../../src/main/client-pagina'
import { ultimaRigaDalloSchermo } from '../../src/renderer/ultime-righe'
import { divisioneLinguette, LINGUETTE_RARE } from '../../src/renderer/linguette-diario'
import { SEZIONI, sezioneInVista } from '@shared/impostazioni-struttura'

/**
 * Grafica meno caotica (0.82.0, `rapporto-0-82-0.md`): meno cose in vista,
 * niente detto due volte, nessuna funzione tolta, uguale su PC, pagina e app.
 */
const html = paginaClient()
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
const estrai = (inizio: string): string => {
  const i = script.indexOf(inizio)
  if (i < 0) throw new Error(`manca ${inizio}`)
  let profondita = 0
  for (let j = script.indexOf('{', i); j < script.length; j++) {
    if (script[j] === '{') profondita++
    else if (script[j] === '}' && --profondita === 0) return script.slice(i, j + 1)
  }
  throw new Error('non si chiude')
}
const esc = 'function esc(s) { return String(s) }'
const leggi = (f: string): string => readFileSync(f, 'utf8')

describe('la riga sotto il nome di una chat ferma', () => {
  it('non è il solo «❯» del campo vuoto: si risale alla riga vera', () => {
    expect(ultimaRigaDalloSchermo(['Faro, Vetrina, Nodo', '', '─────────', '❯ ', '─────────', '  ⏵⏵ bypass permissions on (shift+tab to cycle)'])).toBe('Faro, Vetrina, Nodo')
    expect(ultimaRigaDalloSchermo(['❯'])).toBe('')
    // Neanche la cornice con il titolo della chat, che tagliata era una riga di trattini.
    expect(ultimaRigaDalloSchermo(['● Faro, Vetrina, Nodo', `${'─'.repeat(170)} Somma: cosa fa ─`, '❯ ', '─'.repeat(40)])).toBe('● Faro, Vetrina, Nodo')
    // Quello che hai scritto nel campo resta: non è il campo vuoto.
    expect(ultimaRigaDalloSchermo(['❯ ciao'])).toBe('❯ ciao')
  })
})

describe('le linguette della scheda dell autopilota', () => {
  const tutte = ['domande', 'lavoro', 'istruzioni', 'file', 'obiettivo', 'criteri', 'compiti', 'diario'].map((id) => ({ id }))
  it('in vista quelle di tutti i giorni, le rare dietro «⋯», nessuna persa', () => {
    const { inVista, altre } = divisioneLinguette(tutte, 'lavoro')
    expect(inVista.map((l) => l.id)).toEqual(['domande', 'lavoro', 'obiettivo', 'criteri', 'compiti'])
    expect(altre.map((l) => l.id)).toEqual(['istruzioni', 'file', 'diario'])
    expect(inVista.length + altre.length).toBe(tutte.length)
  })
  it('quella aperta resta in vista anche se è rara', () => {
    const { inVista, altre } = divisioneLinguette(tutte, 'file')
    expect(inVista.map((l) => l.id)).toContain('file')
    expect(altre.map((l) => l.id)).toEqual(['istruzioni', 'diario'])
  })
  it('la scheda usa la divisione e tiene «⧉» per staccare', () => {
    const s = leggi('src/renderer/components/DiarioAutopilota.tsx')
    expect(s).toContain('divisioneLinguette(')
    expect(s).toContain('aria-label="Altre linguette"')
    expect(s).toContain('aria-label="Stacca la linguetta in una finestra"')
    expect(LINGUETTE_RARE).toEqual(['istruzioni', 'file', 'diario'])
  })
})

describe('le Impostazioni', () => {
  it('si accende la sezione che si sta leggendo', () => {
    const t = [{ id: 'aggiornamenti', cima: -400 }, { id: 'computer', cima: -10 }, { id: 'chat', cima: 300 }, { id: 'drive', cima: undefined }]
    expect(sezioneInVista(t, 24)).toBe('computer')
    expect(sezioneInVista(t, -500)).toBe('aggiornamenti')
    expect(sezioneInVista([{ id: 'x', cima: undefined }], 0)).toBeUndefined()
  })
  it('il rimando a «Riparti al login» sta nel «?» della sezione, non in una riga fissa', () => {
    expect(SEZIONI.find((s) => s.id === 'chat')?.spiega).toContain('Riparti al login')
    expect(leggi('src/renderer/components/PannelloImpostazioni.tsx')).not.toContain('impostazioni__nota con-aiuto">«Riparti al login»')
  })
})

describe('la Panoramica: niente detto due volte', () => {
  it('PC: lo stato non si ripete sotto la situazione; «Adesso» vuoto non si mostra; un «?» per le due viste', () => {
    expect(leggi('src/renderer/components/ChatAutopilota.tsx')).toContain('<RigaDalVivo autopilota={autopilota} senzaStato={soloConversazione} />')
    const p = leggi('src/renderer/components/WorkspacePanoramica.tsx')
    expect(p).toContain('adesso.length === 0 && (autopilota === undefined || righeAp.length === 0) ? null')
    expect(p).toContain('<Aiuto di="le due viste del workspace">')
    expect(p).not.toContain('<Aiuto di="Tutte le chat affiancate">')
  })
  it('pagina: la riga dal vivo senza la parola dello stato quando c è la situazione', () => {
    const dalVivoHtml = new Function(`${esc}; ${estrai('function dalVivoHtml(')}; return dalVivoHtml`)() as (v: unknown, senza?: boolean) => string
    const v = { etichetta: 'fermo', da: '22 min', ultimaAzione: 'ha adottato una chat' }
    expect(dalVivoHtml(v)).toContain('>fermo</b>')
    const senza = dalVivoHtml(v, true)
    expect(senza).not.toContain('fermo')
    expect(senza).toContain('ha adottato una chat · da 22 min')
    expect(dalVivoHtml({ etichetta: 'fermo' }, true)).toBe('')
    expect(script).toContain('dalVivoHtml(apDettaglio.dalVivo, !!(panoramicaAp && panoramicaAp.situazione))')
  })
  it('pagina: «Adesso · 0» non sta sotto «Al lavoro · 0»; senza «Al lavoro» (PC vecchio) resta', () => {
    const resto = new Function(`${esc}; var panAperte = {}; var apPc = false; var RUOLO_NOME = {}; function aiuto() { return '' } function rigaApri(id, t) { return t } function schedaTelHtml(s) { return s.titolo };
      ${estrai('function panoramicaRestoHtml(')}; return panoramicaRestoHtml`)() as (p: unknown) => string
    expect(resto({ schede: [], piano: [], alLavoro: [] })).not.toContain('Adesso')
    expect(resto({ schede: [], piano: [] })).toContain('Adesso · 0')
    expect(resto({ schede: [{ id: 'a', titolo: 'Media', stato: 'lavora' }], piano: [], alLavoro: [] })).toContain('Adesso · 1')
  })
  it('pagina: il testo d esempio del campo è corto, come sul PC', () => {
    expect(script).not.toContain('(le sue domande sono nella linguetta Domande)')
  })
})

describe('gli avvisi sopra le chat', () => {
  it('righe basse e tasti piccoli, gli stessi tasti', () => {
    const css = leggi('src/renderer/console.css')
    expect(css).toContain('.banda .banda__voce { padding: var(--s1) var(--s3); }')
    expect(css).toContain('.banda .banda__voce .tasto { padding: 2px 10px; font-size: var(--t1); }')
  })
})

describe('app: le stesse regole', () => {
  it('Kotlin: «Adesso» vuoto e la riga dal vivo senza stato', () => {
    const k = leggi('android/app/src/main/java/it/ferrariconsulenze/sierradeck/Panoramica.kt')
    expect(k).toContain('RegolePanoramica.mostraAdesso(sz.adesso.size, p.alLavoro != null)')
    expect(leggi('android/app/src/main/java/it/ferrariconsulenze/sierradeck/Lavori.kt')).toContain('DalVivo(it, senzaStato = true)')
  })
})
