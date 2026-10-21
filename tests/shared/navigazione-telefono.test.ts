import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  apriSezioneAltro, indietroTelefono, linguettaDi, pannelliDelPosto, postoIniziale, scegliLinguetta,
  SEZIONI_ALTRO, toccaVoce, versoDestinazione, type PostoTelefono
} from '../../src/shared/navigazione-telefono'
import { MENU_TELEFONO } from '../../src/shared/menu-principale'
import { paginaClient } from '../../src/main/client-pagina'

/**
 * La navigazione a quattro voci della pagina del telefono (0.83.0), con le
 * stesse regole dell'app (`Navigazione.kt`, `NavigazioneTest.kt`).
 */
describe('le regole della navigazione', () => {
  it('si apre su Adesso, con niente aperto', () => {
    expect(postoIniziale()).toEqual({ voce: 'adesso', linguette: {}, sezione: null })
  })

  it('una voce si tocca e ci si va; ritoccarla torna al suo inizio', () => {
    let p = toccaVoce(postoIniziale(), 'chat')
    p = scegliLinguetta(p, 2)
    expect(linguettaDi(p)).toBe(2)
    // Andando altrove e tornando la linguetta si ricorda, come nell'app.
    p = toccaVoce(toccaVoce(p, 'progetti'), 'chat')
    expect(linguettaDi(p)).toBe(2)
    // Sulla voce in cui sei già: torna alla prima linguetta.
    expect(linguettaDi(toccaVoce(p, 'chat'))).toBe(0)
    // Altro: ritoccarla chiude la sezione.
    expect(toccaVoce(apriSezioneAltro(p, 'salute'), 'altro').sezione).toBeNull()
  })

  it('indietro è uguale ovunque: sezione, prima linguetta, Adesso, poi esce', () => {
    const passi = (p: PostoTelefono | null): PostoTelefono[] => {
      const visti: PostoTelefono[] = []
      while (p) { visti.push(p); p = indietroTelefono(p) }
      return visti
    }
    // Progetti › Drive → Progetti › Progetti → Adesso → esce.
    const drive = scegliLinguetta(toccaVoce(postoIniziale(), 'progetti'), 2)
    expect(passi(drive).map((p) => `${p.voce}/${linguettaDi(p)}`)).toEqual(['progetti/2', 'progetti/0', 'adesso/0'])
    // Altro › Consumi → Altro → Adesso → esce.
    const consumi = apriSezioneAltro(postoIniziale(), 'consumi')
    expect(passi(consumi).map((p) => `${p.voce}/${p.sezione ?? ''}`)).toEqual(['altro/consumi', 'altro/', 'adesso/'])
    // Da Adesso si esce.
    expect(indietroTelefono(postoIniziale())).toBeNull()
  })

  it('le destinazioni di prima finiscono nella loro voce, come Navigazione.verso dell’app', () => {
    const da = scegliLinguetta(toccaVoce(postoIniziale(), 'chat'), 1)
    const dove = (nome: string): string => {
      const p = versoDestinazione(da, nome)
      return `${p.voce}/${linguettaDi(p)}/${p.sezione ?? ''}`
    }
    expect(dove('domande')).toBe('adesso/0/')
    expect(dove('autopiloti')).toBe('adesso/0/')
    expect(dove('chat')).toBe('chat/0/')
    expect(dove('progetti')).toBe('progetti/0/')
    expect(dove('file')).toBe('progetti/1/')
    expect(dove('salute')).toBe('altro/0/salute')
    expect(dove('impostazioni')).toBe('altro/0/')
    // Ognuna delle sette voci del PC va nella voce del telefono che la contiene (MENU_TELEFONO).
    for (const v of MENU_TELEFONO) for (const id of v.contiene) expect(versoDestinazione(postoIniziale(), id).voce, id).toBe(v.id)
  })

  it('i pannelli che una linguetta o una sezione mostra già aperti', () => {
    const chat = toccaVoce(postoIniziale(), 'chat')
    const progetti = toccaVoce(postoIniziale(), 'progetti')
    expect(pannelliDelPosto(scegliLinguetta(chat, 2))).toEqual(['negozio'])
    expect(pannelliDelPosto(scegliLinguetta(progetti, 2))).toEqual(['drive', 'code'])
    expect(pannelliDelPosto(apriSezioneAltro(postoIniziale(), 'pc'))).toEqual(['pc'])
    expect(pannelliDelPosto(apriSezioneAltro(postoIniziale(), 'consumi'))).toEqual(['consumi'])
    expect(pannelliDelPosto(chat)).toEqual([])
  })

  it('le sezioni di Altro sono quelle dell’app, nello stesso ordine', () => {
    const kt = readFileSync(join('android', 'app', 'src', 'main', 'java', 'it', 'ferrariconsulenze', 'sierradeck', 'Navigazione.kt'), 'utf8')
    const titoliApp = [...kt.slice(kt.indexOf('enum class SezioneAltro')).matchAll(/^\s+[A-Z_]+\("([^"]+)", "/gm)].map((m) => m[1])
    // L'app ha Chat e Quaderno personale separati; la pagina li ha insieme, come le Impostazioni del PC.
    const pagina = SEZIONI_ALTRO.map((s) => s.titolo)
    expect(pagina.slice(0, 4)).toEqual(titoliApp.slice(0, 4))
    for (const t of ['Account', 'Aspetto', 'Avvisi', 'Info ed errori']) {
      expect(titoliApp).toContain(t)
      expect(pagina).toContain(t)
    }
  })
})

/**
 * La stessa navigazione **dentro la pagina**: le funzioni vere, estratte dallo
 * script come vanno al telefono, con un ambiente finto (nessun computer).
 */
describe('la pagina: tocchi, indietro e «al massimo 2 tocchi»', () => {
  const html = paginaClient()
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
  const estrai = (nome: string): string => {
    const inizio = script.indexOf(`function ${nome}(`)
    expect(inizio, `${nome} non e nella pagina`).toBeGreaterThan(-1)
    let profondita = 0
    for (let i = script.indexOf('{', inizio); i < script.length; i++) {
      if (script[i] === '{') profondita++
      else if (script[i] === '}' && --profondita === 0) return script.slice(inizio, i + 1)
    }
    throw new Error(`${nome} non si chiude`)
  }
  const riga = (inizio: string): string => script.split('\n').find((r) => r.startsWith(inizio)) ?? ''

  type Mondo = {
    posto: PostoTelefono
    stato: Record<string, unknown>
    inVista: (n: string) => boolean
    aperto: (n: string) => boolean
    daChiudere: () => (() => void) | null
    indietro: () => 'esce' | 'resta'
    vaiScheda: (n: string) => void
    sezioneImpostazioni: (t: string, id: string) => string
  }
  /** Un mondo nuovo: la pagina appena aperta, con le variabili che la navigazione guarda. */
  const mondo = (): Mondo => new Function(`
    var pannelloAperto = null, dentro = null, dentroAp = null, schedaAperta = null, altroAperto = null, wsAperto = '', confermando = null
    var fileVista = null, filePin = null, fileDove = null, pdScelto = '', pdStrumento = '', codaProgetto = null, pcAperto = null
    var window = {
      chiudiDentro: function () { dentro = null }, chiudiAp: function () { dentroAp = null },
      fileChiudiVista: function () { fileVista = null }, fileProgettiTutti: function () { fileDove = null; filePin = null },
      pdIndietro: function () { pdScelto = ''; pdStrumento = '' }, chiudiCoda: function () { codaProgetto = null }, chiudiPc: function () { pcAperto = null }
    }
    function fileVai(progetto, percorso) { fileDove = { progetto: progetto, percorso: percorso } }
    ${riga('var SEZIONI_ALTRO = ')}
    ${['postoIniziale', 'toccaVoce', 'scegliLinguetta', 'linguettaDi', 'apriSezioneAltro', 'indietroTelefono', 'versoDestinazione', 'pannelliDelPosto', 'inVista', 'aperto', 'daChiudere', 'sezioneImpostazioni'].map(estrai).join('\n')}
    var posto = postoIniziale()
    function indietro() {
      var chiudi = daChiudere()
      if (chiudi) { chiudi(); return 'resta' }
      var dove = indietroTelefono(posto)
      if (!dove) return 'esce'
      posto = dove
      return 'resta'
    }
    var stato = {}
    Object.defineProperty(stato, 'dentro', { get: function () { return dentro }, set: function (v) { dentro = v } })
    Object.defineProperty(stato, 'dentroAp', { get: function () { return dentroAp }, set: function (v) { dentroAp = v } })
    Object.defineProperty(stato, 'altroAperto', { get: function () { return altroAperto }, set: function (v) { altroAperto = v } })
    Object.defineProperty(stato, 'pannelloAperto', { get: function () { return pannelloAperto }, set: function (v) { pannelloAperto = v } })
    Object.defineProperty(stato, 'fileDove', { get: function () { return fileDove }, set: function (v) { fileDove = v } })
    Object.defineProperty(stato, 'fileVista', { get: function () { return fileVista }, set: function (v) { fileVista = v } })
    return {
      get posto() { return posto }, set posto(p) { posto = p }, stato: stato,
      inVista: inVista, aperto: aperto, daChiudere: daChiudere, indietro: indietro,
      vaiScheda: function (n) { posto = versoDestinazione(posto, n) }, sezioneImpostazioni: sezioneImpostazioni
    }
  `)() as Mondo

  it('indietro chiude prima il menu, poi il dettaglio, poi torna alla prima linguetta, ad Adesso, ed esce', () => {
    const m = mondo()
    m.posto = toccaVoce(m.posto, 'chat')
    m.stato.dentro = 'chat-1'
    m.stato.altroAperto = 'chat-1'
    expect(m.indietro()).toBe('resta')
    expect(m.stato.altroAperto).toBeNull()
    expect(m.stato.dentro).toBe('chat-1')
    expect(m.indietro()).toBe('resta')
    expect(m.stato.dentro).toBeNull()
    expect(m.posto.voce).toBe('chat')
    expect(m.indietro()).toBe('resta')
    expect(m.posto.voce).toBe('adesso')
    expect(m.indietro()).toBe('esce')
  })

  it('nei File indietro risale di una cartella alla volta, poi torna a Progetti', () => {
    const m = mondo()
    m.vaiScheda('file')
    m.stato.fileDove = { progetto: 'P', percorso: 'a/b' }
    m.stato.fileVista = { nome: 'x.txt' }
    m.indietro()
    expect(m.stato.fileVista).toBeNull()
    m.indietro()
    expect(m.stato.fileDove).toEqual({ progetto: 'P', percorso: 'a' })
    m.indietro()
    expect(m.stato.fileDove).toEqual({ progetto: 'P', percorso: '' })
    m.indietro()
    expect(m.stato.fileDove).toBeNull()
    m.indietro()
    expect(`${m.posto.voce}/${linguettaDi(m.posto)}`).toBe('progetti/0')
  })

  it('il pannello della linguetta non è «da chiudere»: indietro cambia linguetta', () => {
    const m = mondo()
    m.posto = scegliLinguetta(toccaVoce(m.posto, 'progetti'), 2)
    expect(m.aperto('drive')).toBe(true)
    expect(m.aperto('code')).toBe(true)
    expect(m.aperto('negozio')).toBe(false)
    expect(m.daChiudere()).toBeNull()
    m.indietro()
    expect(linguettaDi(m.posto)).toBe(0)
    expect(m.aperto('drive')).toBe(false)
  })

  it('ogni funzione di prima si raggiunge al massimo in 2 tocchi da qualunque voce', () => {
    // Un tocco = una voce della fascia, una linguetta o una voce dell'elenco di Altro.
    type Tocco = (p: PostoTelefono) => PostoTelefono
    const tocchi: Tocco[] = [
      ...MENU_TELEFONO.map((v) => (p: PostoTelefono) => toccaVoce(p, v.id)),
      ...[0, 1, 2].map((i) => (p: PostoTelefono) => scegliLinguetta(p, i)),
      ...SEZIONI_ALTRO.map((s) => (p: PostoTelefono) => p.voce === 'altro' ? apriSezioneAltro(p, s.id) : p)
    ]
    const raggiunti = (da: PostoTelefono): PostoTelefono[] => {
      const uno = tocchi.map((t) => t(da))
      return [da, ...uno, ...uno.flatMap((p) => tocchi.map((t) => t(p)))]
    }
    // Le schermate di prima (le sette voci del PC) e le sezioni di Altro, come la pagina le riconosce.
    const m = mondo()
    const vede = (p: PostoTelefono, cosa: string): boolean => { m.posto = p; return cosa.startsWith('sez:') ? p.voce === 'altro' && p.sezione === cosa.slice(4) : cosa.startsWith('pan:') ? m.aperto(cosa.slice(4)) : m.inVista(cosa) }
    const cose = ['domande', 'autopiloti', 'chat', 'progetti', 'file', 'pan:negozio', 'pan:drive', 'pan:code', 'pan:pc', 'pan:consumi', 'salute', 'impostazioni', ...SEZIONI_ALTRO.map((s) => 'sez:' + s.id)]
    const partenze = [postoIniziale(), scegliLinguetta(toccaVoce(postoIniziale(), 'chat'), 2), scegliLinguetta(toccaVoce(postoIniziale(), 'progetti'), 1), apriSezioneAltro(postoIniziale(), 'info')]
    for (const da of partenze) {
      const tutti = raggiunti(da)
      for (const cosa of cose) expect(tutti.some((p) => vede(p, cosa)), `${cosa} da ${JSON.stringify(da)}`).toBe(true)
    }
  })

  it('una sezione delle impostazioni mostra la sua sola piastrella', () => {
    const m = mondo()
    const tutte = '<div class="piastrella" data-sezione="aggiornamenti">A<div>x</div></div><div class="piastrella" data-sezione="drive">D</div><div class="piastrella" data-sezione="info">I</div>'
    expect(m.sezioneImpostazioni(tutte, 'drive')).toBe('<div class="piastrella" data-sezione="drive">D</div>')
    expect(m.sezioneImpostazioni(tutte, 'aggiornamenti')).toBe('<div class="piastrella" data-sezione="aggiornamenti">A<div>x</div></div>')
    expect(m.sezioneImpostazioni(tutte, 'nessuna')).toBe('')
  })

  it('ogni sezione di Altro che è delle impostazioni ha la sua piastrella nella pagina', () => {
    for (const s of SEZIONI_ALTRO.filter((x) => x.impostazioni)) expect(script, s.id).toContain(`<div class="piastrella" data-sezione="${s.id}">`)
  })
})
