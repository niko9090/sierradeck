import { describe, it, expect } from 'vitest'
import { paginaClient } from '../../src/main/client-pagina'
import { totaleSelezione, vistaSpazio, scadenzaRecupero, TESTI_AZIONI_CHAT, type VoceSpazio, type ChatInRecupero } from '../../src/shared/gestione-chat'
import {
  confermaArchiviaChat, confermaChiudiChat, confermaEliminaChat, nomeScelte, ordinaVoci, quandoUsata, riepilogoSelezione, riepilogoSpazio, rigaRecupero, rigaVoce
} from '../../src/shared/gestione-chat-vista'
import { byteLeggibili } from '../../src/shared/spazio-drive'

/**
 * La gestione delle chat sulla pagina del telefono (0.79.0): le stesse righe
 * e conferme del PC (le funzioni della pagina contro quelle condivise), i
 * tre tasti con il «?», e «Svuota» in due passi.
 */
const html = paginaClient()
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
function funzione(nome: string): string {
  const inizio = script.indexOf(`function ${nome}(`)
  if (inizio < 0) throw new Error(`${nome} non trovata`)
  let profondita = 0
  for (let i = script.indexOf('{', inizio); i < script.length; i += 1) {
    if (script[i] === '{') profondita += 1
    else if (script[i] === '}' && --profondita === 0) return script.slice(inizio, i + 1)
  }
  throw new Error(`${nome} non chiusa`)
}
const gc = script.slice(script.indexOf('var GC ='), script.indexOf('\n', script.indexOf('var GC =')))
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const f = new Function(`${gc}; ${['gcByte', 'gcQuando', 'gcData', 'gcRigaVoce', 'gcQuante', 'gcRiepilogo', 'gcTotale', 'gcRiepilogoSel', 'gcRigaRecupero', 'gcOrdina', 'gcNome', 'gcConferma'].map(funzione).join('\n')}
  return { gcByte, gcQuando, gcRigaVoce, gcRiepilogo, gcTotale, gcRiepilogoSel, gcRigaRecupero, gcOrdina, gcNome, gcConferma, GC }`)() as Record<string, (...a: unknown[]) => unknown> & { GC: { testi: unknown; frase: string } }

const ORA = Date.parse('2026-10-17T12:00:00Z')
const GIORNO = 86_400_000
const voci: VoceSpazio[] = [
  { sessione: '11111111-1111-4111-8111-111111111111', titolo: 'a', slug: 's', byte: 2048, parti: {}, ultimaAttivita: new Date(ORA - 3600_000).toISOString(), archiviata: false, aperta: false },
  { sessione: '22222222-2222-4222-8222-222222222222', titolo: 'b', slug: 's', byte: 12 * 1024 * 1024, parti: {}, ultimaAttivita: new Date(ORA - 90 * GIORNO).toISOString(), archiviata: true, aperta: false },
  { sessione: '33333333-3333-4333-8333-333333333333', titolo: 'c', slug: 's', byte: 340 * 1024, parti: {}, archiviata: false, aperta: true, nonEliminabile: '«c» sta lavorando: aspetta che finisca, poi chiudila.' }
]
const quando = new Date(ORA - 3 * GIORNO).toISOString()
const rec: ChatInRecupero = { id: 'r', sessione: voci[1]!.sessione, titolo: 'b', slug: 's', quando, scadeIl: scadenzaRecupero(quando), byte: 5 * 1024 * 1024, file: [] }

describe('pagina: la gestione delle chat', () => {
  it('le righe sono quelle del PC', () => {
    for (const n of [0, 512, 1536, 9_300_000, 3.2 * 1024 ** 3]) expect(f.gcByte!(n)).toBe(byteLeggibili(n))
    for (const t of [undefined, ORA - 10, ORA - GIORNO, ORA - 7 * GIORNO, ORA - 200 * GIORNO, ORA - 900 * GIORNO]) {
      const iso = t === undefined ? undefined : new Date(t).toISOString()
      expect(f.gcQuando!(iso, ORA)).toBe(quandoUsata(iso, ORA))
    }
    for (const v of voci) expect(f.gcRigaVoce!(v, ORA)).toBe(rigaVoce(v, ORA))
    const vista = vistaSpazio(voci, { versione: 1, chat: [rec] })
    expect(f.gcRiepilogo!(vista)).toBe(riepilogoSpazio(vista))
    const scelte = [voci[0]!.sessione, voci[2]!.sessione]
    expect(f.gcTotale!(voci, scelte)).toEqual(totaleSelezione(voci, scelte))
    expect(f.gcRiepilogoSel!(totaleSelezione(voci, scelte))).toBe(riepilogoSelezione(totaleSelezione(voci, scelte)))
    expect(f.gcRigaRecupero!(rec, ORA)).toBe(rigaRecupero(rec, ORA))
    expect(f.gcRigaRecupero!({ ...rec, drive: { pulizia: 'p', file: 1, byte: 1 } }, ORA)).toBe(rigaRecupero({ ...rec, drive: { pulizia: 'p', file: 1, byte: 1 } }, ORA))
    for (const o of ['spazio', 'uso'] as const) expect((f.gcOrdina!(voci, o) as VoceSpazio[]).map((v) => v.sessione)).toEqual(ordinaVoci(voci, o).map((v) => v.sessione))
  })

  it('le conferme sono quelle del PC, con il nome e lo spazio al loro posto', () => {
    expect(f.gcNome!(['x'])).toBe(nomeScelte(['x']))
    expect(f.gcNome!(['x', 'y', 'z'])).toBe(nomeScelte(['x', 'y', 'z']))
    expect(f.gcConferma!('chiudi', '«x»', '')).toEqual(confermaChiudiChat('«x»'))
    expect(f.gcConferma!('archivia', '3 chat', '')).toEqual(confermaArchiviaChat('3 chat'))
    expect(f.gcConferma!('elimina', '«x»', '12 MB')).toEqual(confermaEliminaChat('«x»', '12 MB', false))
    expect(f.gcConferma!('eliminaDrive', '«x»', '12 MB')).toEqual(confermaEliminaChat('«x»', '12 MB', true))
    expect(f.gcConferma!('elimina', '2 chat', '12 MB', 2)).toEqual(confermaEliminaChat('2 chat', '12 MB', false, 2))
    expect(f.gcConferma!('eliminaDrive', '2 chat', '12 MB', 2)).toEqual(confermaEliminaChat('2 chat', '12 MB', true, 2))
    expect(f.gcConferma!('archivia', '3 chat', '', 3)).toEqual(confermaArchiviaChat('3 chat', 3))
    expect(f.GC.testi).toEqual(TESTI_AZIONI_CHAT)
    expect(f.GC.frase).toBe('SVUOTA')
  })

  it('tre tasti per ogni chat, ognuno con il suo «?», nell’elenco e nella chat aperta', () => {
    const tasti = funzione('gcTastiHtml')
    expect(tasti).toContain("['chiudi', 'archivia', 'elimina']")
    expect(tasti).toContain("aiuto('gc-' + a + '-' + chiave")
    expect(script).toContain("gcTastiHtml(x.id, x.titolo, 's' + i)")
    expect(script).toContain("gcTastiHtml(aperta.sessione, aperta.titolo || aperta.cwd, 'c-' + aperta.id)")
    expect(script).toContain("apriPannello(\\'chatgestione\\')")
  })

  it('le rotte del PC, e lo svuota in due passi: prima il gettone, poi la parola', () => {
    for (const r of ['/api/chat/gestione/spazio', '/api/chat/gestione/azione', '/api/chat/gestione/archiviate', '/api/chat/gestione/recupero', '/api/chat/gestione/ripristina', '/api/chat/gestione/svuota']) expect(script, r).toContain(r)
    const continua = script.slice(script.indexOf('window.gcSvuotaContinua'), script.indexOf('window.gcFraseCambia'))
    expect(continua).toContain("chiedi('/api/chat/gestione/svuota', { ancheDalDrive: gcSvuotaDrive })")
    const davvero = script.slice(script.indexOf('window.gcSvuotaDavvero'), script.indexOf('function gcSvuotaHtml'))
    expect(davvero).toContain('gettone: s.gettone, frase: gcFrase')
    // Il tasto nasce spento e si accende solo con la parola giusta; la parola resta scritta anche se la pagina si ridisegna (revisione ECC).
    expect(funzione('gcSvuotaHtml')).toContain("id=\"gc-svuota-si\"' + (gcInCorso || gcFrase.trim().toUpperCase() !== GC.frase ? ' disabled' : '')")
    expect(funzione('gcSvuotaHtml')).toContain("value=\"' + esc(gcFrase) + '\"")
    // Un secondo tocco su «Svuota per sempre» non manda una seconda richiesta.
    expect(davvero).toContain("if (!s || s.passo !== 'scrivi' || gcInCorso) return")
    const b = { disabled: true }
    const cambia = new Function('document', 'window', `var GC = { frase: 'SVUOTA' }; var gcFrase = ''; var gcInCorso = false; ${script.slice(script.indexOf('window.gcFraseCambia'), script.indexOf('\n', script.indexOf('window.gcFraseCambia')))}; return window.gcFraseCambia`)({ getElementById: () => b }, {}) as (v: string) => void
    cambia('sì'); expect(b.disabled).toBe(true)
    cambia('svuota'); expect(b.disabled).toBe(false)
  })

  it('i rifiuti si mostrano con il motivo del PC, che nomina la chat', () => {
    const fai = script.slice(script.indexOf('window.gcFai'), script.indexOf('window.gcLinguetta'))
    expect(fai).toContain('filter(function (x) { return !x.ok }).map(function (x) { return x.motivo')
    expect(funzione('gcNotaHtml')).toContain('gc-rifiuti')
  })

  // La revisione con gli agenti di ECC (17/10).
  it('una casella spuntata non ferma il ridisegno: il totale e i tasti si aggiornano', () => {
    const p = funzione('pannello')
    expect(p).toContain("attivo.tagName === 'INPUT' && attivo.type !== 'checkbox' && attivo.type !== 'radio'")
  })

  it('Ripristina e «Continua» non partono due volte con un doppio tocco; una conferma arrivata tardi non compare', () => {
    for (const f of ['window.gcRipristinaArch', 'window.gcRipristinaRec', 'window.gcSvuotaContinua']) {
      expect(script.slice(script.indexOf(f), script.indexOf(f) + 120), f).toContain('if (gcInCorso) return')
    }
    const chiedi = script.slice(script.indexOf('window.gcChiedi ='), script.indexOf('window.gcChiediScelte'))
    expect(chiedi).toContain('if (n !== gcChiesta || dove !== pannelloAperto) return')
  })

  it('una chat che non si può eliminare ha «Elimina dal PC» spento con il motivo del PC, prima di toccarlo', async () => {
    const chieste: unknown[] = []
    const motivo = '«c» sta lavorando: aspetta che finisca, poi chiudila.'
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const g = new Function('chiedi', 'pannello', `${gc}
      var gcTitoli = {}, gcMisure = {}, ultimoStato = null
      function esc(s) { return String(s) }
      function aiuto(id, t) { return '<i>?</i>' }
      async ${funzione('gcMisura')}
      ${funzione('gcTastiHtml')}
      return { gcTastiHtml, gcMisure }`)(
      async (rotta: string, corpo: unknown) => { chieste.push([rotta, corpo]); return { selezione: { byte: 10, escluse: [{ sessione: 's', motivo }] } } },
      () => undefined
    ) as { gcTastiHtml: (s: string, t: string, k: string) => string; gcMisure: Record<string, { motivo?: string }> }
    const prima = g.gcTastiHtml('s', 'c', 'k')
    expect(prima).not.toContain('disabled')
    await new Promise((r) => setTimeout(r, 0))
    expect(chieste).toEqual([['/api/chat/gestione/spazio', { sessioni: ['s'] }]])
    const dopo = g.gcTastiHtml('s', 'c', 'k')
    expect(dopo).toMatch(/class="pericolo" disabled data-a="elimina"/)
    expect(dopo).toContain(`<span class="gc-no">${motivo}</span>`)
    // Chiudi e Archivia restano accesi: il PC risponde col motivo se non si può.
    expect(dopo.match(/disabled/g)).toHaveLength(1)
    expect(chieste).toHaveLength(1)
  })

  it('rileggendo dopo 10 s il motivo resta (niente «Elimina» acceso per un attimo); si ridisegna solo se cambia', async () => {
    let ridisegni = 0
    let rispondi: (v: unknown) => void = () => undefined
    const motivo = '«c» aspetta una tua risposta: rispondi o chiudila prima.'
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const g = new Function('chiedi', 'pannello', `${gc}
      var gcTitoli = {}, gcMisure = {}, ultimoStato = null
      function esc(s) { return String(s) }
      function aiuto(id, t) { return '<i>?</i>' }
      async ${funzione('gcMisura')}
      ${funzione('gcTastiHtml')}
      return { gcTastiHtml, gcMisure }`)(
      () => new Promise((r) => { rispondi = r }),
      () => { ridisegni += 1 }
    ) as { gcTastiHtml: (s: string, t: string, k: string) => string; gcMisure: Record<string, { motivo?: string; il: number }> }
    g.gcTastiHtml('s', 'c', 'k')
    rispondi({ selezione: { byte: 10, escluse: [{ sessione: 's', motivo }] } })
    await new Promise((r) => setTimeout(r, 0))
    expect(ridisegni).toBe(1)
    g.gcMisure.s!.il = Date.now() - 11_000
    // Si rilegge: mentre il PC risponde il tasto resta spento con il motivo.
    expect(g.gcTastiHtml('s', 'c', 'k')).toContain(`<span class="gc-no">${motivo}</span>`)
    expect(g.gcTastiHtml('s', 'c', 'k')).toMatch(/class="pericolo" disabled/)
    rispondi({ selezione: { byte: 12, escluse: [{ sessione: 's', motivo }] } })
    await new Promise((r) => setTimeout(r, 0))
    expect(ridisegni).toBe(1)
  })

  it('«Elimina» toccato prima che arrivi il motivo: niente conferma, il tasto si spegne con il motivo', () => {
    const chiedi = script.slice(script.indexOf('window.gcChiedi ='), script.indexOf('window.gcChiediScelte'))
    expect(chiedi).toContain('if (no) { pannello(ultimoStato); return }')
    expect(chiedi.indexOf('if (no) {')).toBeLessThan(chiedi.indexOf("gcConfermaAp = { azione: 'elimina'"))
  })
})
