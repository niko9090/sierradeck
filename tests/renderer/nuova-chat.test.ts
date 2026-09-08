import { describe, it, expect } from 'vitest'
import { nomeDaCartella, proponiNuovaChat, validaNuovaChat, nomeCartellaDaNome, componiNuovaChat, unisciPercorso } from '../../src/renderer/nuova-chat'
import type { PaneData } from '../../src/renderer/state/layout'

function riquadro(cwd: string): PaneData {
  return { id: 'p1', sessionUuid: 'u1', cwd, title: 't' }
}

describe('nomeDaCartella', () => {
  it('propone il nome della cartella', () => {
    // Con sei riquadri aperti, sei «Nuova chat» identiche non dicono niente, e
    // rinominarle una per una e' un lavoro che nessuno fa.
    expect(nomeDaCartella('C:\\Users\\tizio\\Progetti\\sierradeck')).toBe('sierradeck')
  })

  it('regge la barra finale e quella rovescia', () => {
    expect(nomeDaCartella('C:\\Progetti\\alfa\\')).toBe('alfa')
    expect(nomeDaCartella('/home/tizio/beta/')).toBe('beta')
  })

  it('sulla radice di un disco ripiega su un nome generico', () => {
    // `C:\` non ha un ultimo pezzo che sia un nome: chiamare una chat «C:»
    // sarebbe peggio di non darle nessun nome.
    expect(nomeDaCartella('C:\\')).toBe('Nuova chat')
    expect(nomeDaCartella('   ')).toBe('Nuova chat')
  })
})

describe('proponiNuovaChat', () => {
  it('propone la cartella del riquadro aperto e il suo nome', () => {
    // Chi lavora sempre nello stesso posto preme Invio e non si accorge della
    // finestra: proporre bene e' cio' che rende la domanda gratuita.
    expect(proponiNuovaChat([riquadro('C:\\Progetti\\alfa')], [], 'C:\\Users\\tizio'))
      .toEqual({ cartella: 'C:\\Progetti\\alfa', nome: 'alfa' })
  })

  it('senza niente di meglio propone la cartella dell utente', () => {
    expect(proponiNuovaChat([], [], 'C:\\Users\\tizio').cartella).toBe('C:\\Users\\tizio')
  })
})

describe('validaNuovaChat', () => {
  it('senza cartella non si apre niente, e si dice perche', () => {
    // La cartella e' dove il lavoro succede: aprire una chat senza sapere dove
    // significa aprirla nel posto sbagliato.
    const esito = validaNuovaChat({ cartella: '  ', nome: 'alfa' })
    expect(esito.ok).toBe(false)
    if (!esito.ok) expect(esito.motivo).toContain('cartella')
  })

  it('toglie le virgolette che mette «Copia come percorso»', () => {
    // E' il modo piu' probabile con cui una cartella arriva in questo campo:
    // senza toglierle, il Core rifiuterebbe un percorso che a chi l'ha
    // incollato sembra giusto — e avrebbe ragione lui.
    const esito = validaNuovaChat({ cartella: '"C:\\Progetti\\alfa"', nome: 'x' })
    expect(esito.ok && esito.cartella).toBe('C:\\Progetti\\alfa')
  })

  it('un nome vuoto ripiega sul nome della cartella invece di fermare', () => {
    // Il nome e' decorativo — l'identita' della chat e' il suo sessionUuid — e
    // fermare qualcuno per un'etichetta sarebbe un ostacolo messo davanti a
    // niente.
    const esito = validaNuovaChat({ cartella: 'C:\\Progetti\\alfa', nome: '   ' })
    expect(esito.ok && esito.nome).toBe('alfa')
  })

  it('ripulisce il titolo prima di lasciarlo passare', () => {
    // Il nome finisce su `-n` nella riga di comando di claude.exe: un doppio
    // apice al posto giusto si spezzerebbe in argomenti separati, e la chat non
    // si aprirebbe. La stessa regola che vale per i titoli letti da disco.
    const esito = validaNuovaChat({
      cartella: 'C:\\Progetti\\alfa',
      nome: '" --dangerously-skip-permissions "'
    })
    expect(esito.ok).toBe(true)
    if (esito.ok) expect(esito.nome).not.toContain('"')
  })
})

describe('il nome fa la cartella (0.19.0)', () => {
  // Nicholas: «le chat di default si aprono in Documenti con il nome della
  // chat; se la cartella non esiste verrà creata; "fra i progetti" va nella
  // cartella di SierraDeck per i progetti».
  const basi = { documenti: 'C:\\Users\\nik\\Documents', progetti: 'C:\\Users\\nik\\Documents\\Progetti SierraDeck' }

  it('toglie quello che Windows non accetta, e non lascia punti o spazi in coda', () => {
    expect(nomeCartellaDaNome('Sito: v2 / nuovo?')).toBe('Sito- v2 - nuovo-')
    expect(nomeCartellaDaNome('  fatture 2026.  ')).toBe('fatture 2026')
    expect(nomeCartellaDaNome('')).toBe('Nuova chat')
    expect(nomeCartellaDaNome('x'.repeat(200))).toHaveLength(80)
  })

  it('in Documenti: Documenti\\<nome>, da creare', () => {
    const e = componiNuovaChat({ nome: 'Sito web', posto: 'documenti', altrove: '', basi })
    expect(e).toEqual({ ok: true, cartella: 'C:\\Users\\nik\\Documents\\Sito web', nome: 'Sito web', daCreare: true })
  })

  it('fra i progetti: nella cartella dei progetti SierraDeck', () => {
    const e = componiNuovaChat({ nome: 'Sito web', posto: 'progetti', altrove: '', basi })
    expect(e.ok && e.cartella).toBe('C:\\Users\\nik\\Documents\\Progetti SierraDeck\\Sito web')
  })

  it('senza nome, in Documenti o fra i progetti, non si parte: e lui a fare la cartella', () => {
    const e = componiNuovaChat({ nome: '  ', posto: 'documenti', altrove: '', basi })
    expect(e.ok).toBe(false)
  })

  it('altrove vale la regola di prima: la cartella scelta, il nome se manca dalla cartella', () => {
    const e = componiNuovaChat({ nome: '', posto: 'altrove', altrove: '"C:\\Lavoro\\gestore"', basi })
    expect(e).toEqual({ ok: true, cartella: 'C:\\Lavoro\\gestore', nome: 'gestore', daCreare: false })
  })

  it('il separatore segue la base', () => {
    expect(unisciPercorso('C:\\Users\\nik\\Documents\\', 'x')).toBe('C:\\Users\\nik\\Documents\\x')
    expect(unisciPercorso('/home/nik/Documents', 'x')).toBe('/home/nik/Documents/x')
  })
})
