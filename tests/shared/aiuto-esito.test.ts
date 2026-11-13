import { describe, it, expect } from 'vitest'
import {
  causaDalTesto, causaDelMotivo, chiaveCompito, colpaDelPc, estrattoSicuro, fraseCausa, motivoBreve, motivoDelRisultato,
  pauseAiuti, pcInPausa, serieGuasti, PAUSA_PC_MS, PAUSA_PROGETTO_MS, RIPROVA_STESSO_PC_MS
} from '../../src/shared/aiuto-esito'
import { lavoroAffidatoValido, type LavoroAffidato } from '../../src/shared/aiuto-rete'

/**
 * 13/11: «Aiuta la rete» mandava lo stesso compito allo stesso Aiutante ogni
 * mezzo minuto, e ogni volta «fallito (lo specialista ha chiuso con un
 * errore)» senza dire perché. Qui: il perché vero, e le pause che fermano il giro.
 */

describe('il perché di uno specialista che chiude con un errore', () => {
  it('riconosce le cause comuni, con una frase italiana', () => {
    expect(causaDalTesto('Invalid API key · Please run /login')).toBe('accesso')
    expect(causaDalTesto('Not logged in · Please run /login')).toBe('accesso')
    expect(causaDalTesto('OAuth token has expired. Please obtain a new token or refresh your existing token.')).toBe('accesso')
    expect(causaDalTesto('API Error: 401 {"type":"error","error":{"type":"authentication_error"}}')).toBe('accesso')
    expect(causaDalTesto('Claude AI usage limit reached|1731510000')).toBe('limite')
    expect(causaDalTesto('You\'ve hit your weekly limit · resets 1am (Europe/Rome)')).toBe('limite')
    expect(causaDalTesto('Credit balance is too low')).toBe('limite')
    expect(causaDalTesto('', 'error_max_turns')).toBe('turni')
    expect(causaDalTesto('Reached maximum turns')).toBe('turni')
    expect(causaDalTesto('Claude requested permissions to use Bash, but you haven\'t granted it yet. Permission denied')).toBe('permesso')
    expect(causaDalTesto('git clone: fatal: repository does not exist')).toBe('git')
    expect(causaDalTesto('npm ci uscito con 1: npm ERR! code EINTEGRITY')).toBe('npm')
    expect(causaDalTesto('\'git\' is not recognized as an internal or external command')).toBe('strumenti')
    expect(causaDalTesto('spawn claude.exe ENOENT')).toBe('strumenti')
    expect(causaDalTesto('API Error: 529 {"type":"overloaded_error"}')).toBe('api')
    expect(causaDalTesto('There\'s an issue with the selected model (opus). It may not exist or you may not have access to it. model: opus is not available')).toBe('modello')
    expect(causaDalTesto('3 tests failed in vitest')).toBe('compito')
    expect(causaDalTesto('boh')).toBe('sconosciuta')
    for (const c of ['accesso', 'limite', 'npm', 'git', 'strumenti'] as const) expect(fraseCausa(c)).toMatch(/^su quel PC/u)
  })

  it('il motivo ha la frase, il tipo del result, un pezzo del testo e la coda dello stderr', () => {
    const r = motivoDelRisultato({ tipo: 'success', testo: 'Invalid API key · Please run /login', stderr: 'qualcosa\nultima riga dello stderr', codice: 1 })
    expect(r.causa).toBe('accesso')
    expect(r.motivo.startsWith(fraseCausa('accesso'))).toBe(true)
    expect(r.motivo).toContain('tipo success')
    expect(r.motivo).toContain('«Invalid API key · Please run /login»')
    expect(r.motivo).toContain('stderr: qualcosa ultima riga dello stderr')
    // Senza niente da dire: almeno la frase e l'uscita.
    expect(motivoDelRisultato({ codice: 3 }).motivo).toBe(`${fraseCausa('sconosciuta')} (uscita 3)`)
    expect(motivoDelRisultato({ tipo: 'error_during_execution' }).motivo).toBe(`${fraseCausa('sconosciuta')} (tipo error_during_execution)`)
  })

  it('il pezzo di testo è corto e senza cose segrete o private', () => {
    const s = estrattoSicuro(`errore con sk-ant-oat01-abcdefghijklmnop in C:\\Users\\mario\\progetto e /home/mario/x token=${'a'.repeat(30)} ${'Z'.repeat(50)}`)
    expect(s).not.toContain('abcdefghijklmnop')
    expect(s).not.toContain('mario')
    expect(s).not.toContain('a'.repeat(30))
    expect(s).not.toContain('Z'.repeat(50))
    expect(estrattoSicuro('x'.repeat(10) + ' ' + 'y '.repeat(500), 50).length).toBeLessThanOrEqual(50)
    expect(estrattoSicuro('a\n\n  b')).toBe('a b')
  })

  it('la causa si rilegge dal motivo (anche di un PC di prima) e la frase corta va nella vista', () => {
    const { motivo } = motivoDelRisultato({ testo: 'npm ERR! boh' })
    expect(causaDelMotivo(motivo)).toBe('npm')
    expect(causaDelMotivo('lo specialista ha chiuso con un errore')).toBe('sconosciuta')
    expect(causaDelMotivo(undefined)).toBe('sconosciuta')
    expect(motivoBreve(motivo)).toBe(fraseCausa('npm'))
  })

  it('solo i guasti del PC che aiuta lo mettono in pausa', () => {
    expect(colpaDelPc('accesso')).toBe(true)
    expect(colpaDelPc('sconosciuta')).toBe(true)
    expect(colpaDelPc('compito')).toBe(false)
    expect(colpaDelPc('turni')).toBe(false)
    expect(colpaDelPc('fermato')).toBe(false)
    expect(colpaDelPc('progetto')).toBe(false)
  })
})

describe('le pause: lo stesso compito non torna subito sullo stesso PC', () => {
  const T0 = Date.parse('2026-11-13T10:00:00.000Z')
  const iso = (ms: number): string => new Date(ms).toISOString()
  let n = 0
  const lavoro = (p: Partial<LavoroAffidato> & { fineMs?: number }): LavoroAffidato => {
    const { fineMs, ...resto } = p
    n++
    return {
      id: `r${n.toString(16).padStart(12, '0')}`, workspace: 'investimento', cwd: '/progetti/investimento', pcId: 'pc-aiutante', pcNome: 'Aiutante',
      ruolo: 'sviluppatore', descrizione: 'k-34: il grafico', compito: 'k-34', prompt: 'x', sistema: '', modello: 'sonnet', strumenti: [],
      stato: 'fallito', inizio: iso((fineMs ?? T0) - 15_000), fine: iso(fineMs ?? T0), motivo: 'lo specialista ha chiuso con un errore', ...resto
    }
  }

  it('dopo un fallimento quel compito non torna su quel PC per un po’, gli altri compiti sì', () => {
    const lavori = [lavoro({ fineMs: T0 })]
    const pause = pauseAiuti(lavori, T0 + 30_000)
    expect(pcInPausa(pause, 'pc-aiutante', 'investimento', 'k-34')?.tipo).toBe('compito')
    expect(pcInPausa(pause, 'pc-aiutante', 'investimento', 'k-35')).toBeUndefined()
    expect(pcInPausa(pause, 'pc-altro', 'investimento', 'k-34')).toBeUndefined()
    // Passato il tempo, può tornare.
    expect(pcInPausa(pauseAiuti(lavori, T0 + RIPROVA_STESSO_PC_MS + 1), 'pc-aiutante', 'investimento', 'k-34')).toBeUndefined()
  })

  it('due fallimenti dello stesso compito sullo stesso PC: quel PC in pausa per tutto il progetto per mezz’ora', () => {
    const lavori = [lavoro({ fineMs: T0 }), lavoro({ fineMs: T0 + 60_000 })]
    const adesso = T0 + RIPROVA_STESSO_PC_MS + 2 * 60_000
    const pause = pauseAiuti(lavori, adesso)
    expect(pcInPausa(pause, 'pc-aiutante', 'investimento', 'k-99')?.tipo).toBe('progetto')
    // Gli altri progetti no.
    expect(pcInPausa(pause, 'pc-aiutante', 'altro', 'k-1')).toBeUndefined()
    expect(pcInPausa(pauseAiuti(lavori, T0 + 60_000 + PAUSA_PROGETTO_MS + 1), 'pc-aiutante', 'investimento', 'k-99')).toBeUndefined()
  })

  it('tre compiti diversi falliti di fila per colpa del PC: il PC in pausa per tutti', () => {
    const lavori = [
      lavoro({ fineMs: T0, compito: 'k-34', descrizione: 'k-34: a' }),
      lavoro({ fineMs: T0 + 1000, compito: 'k-150', descrizione: 'k-150: b', workspace: 'altro' }),
      lavoro({ fineMs: T0 + 2000, compito: 'k-7', descrizione: 'k-7: c', workspace: 'terzo', motivo: 'su quel PC Claude Code non ha l’accesso fatto (o è scaduto): là va … (tipo success)' })
    ]
    expect(serieGuasti(lavori, 'pc-aiutante').compiti).toBe(3)
    const pause = pauseAiuti(lavori, T0 + RIPROVA_STESSO_PC_MS + 5000)
    const p = pcInPausa(pause, 'pc-aiutante', 'quarto', 'k-1')
    expect(p?.tipo).toBe('pc')
    expect(p?.perche).toContain('accesso')
    expect(pcInPausa(pauseAiuti(lavori, T0 + 2000 + PAUSA_PC_MS + 1), 'pc-aiutante', 'quarto', 'k-1')).toBeUndefined()
  })

  it('un lavoro riuscito azzera la serie; le prove rosse e i lavori fermati non contano', () => {
    const base = [
      lavoro({ fineMs: T0, compito: 'k-1', descrizione: 'k-1' }),
      lavoro({ fineMs: T0 + 1000, compito: 'k-2', descrizione: 'k-2' })
    ]
    expect(serieGuasti([...base, lavoro({ fineMs: T0 + 2000, compito: 'k-3', descrizione: 'k-3', stato: 'finito', motivo: undefined })], 'pc-aiutante').compiti).toBe(0)
    expect(serieGuasti([...base, lavoro({ fineMs: T0 + 2000, compito: 'k-3', descrizione: 'k-3', causa: 'compito' })], 'pc-aiutante').compiti).toBe(2)
    const fermati = [lavoro({ fineMs: T0, causa: 'fermato' }), lavoro({ fineMs: T0 + 1000, causa: 'fermato' })]
    expect(pauseAiuti(fermati, T0 + 2000)).toEqual([])
    // Lo stesso compito ripetuto è uno solo nella serie.
    expect(serieGuasti([lavoro({ fineMs: T0 }), lavoro({ fineMs: T0 + 1 }), lavoro({ fineMs: T0 + 2 })], 'pc-aiutante').compiti).toBe(1)
  })

  it('un progetto che qui non si impacchetta non va a nessun PC per un po’', () => {
    const lavori = [lavoro({ fineMs: T0, causa: 'progetto', motivo: `${fraseCausa('progetto')} — git rev-parse: fatal: needed a single revision` })]
    const pause = pauseAiuti(lavori, T0 + 1000)
    expect(pcInPausa(pause, 'pc-qualunque', 'investimento', 'k-1')?.tipo).toBe('spedizione')
    expect(pcInPausa(pause, 'pc-qualunque', 'altro', 'k-1')).toBeUndefined()
    // E non è colpa del PC che aiuta: nessuna serie.
    expect(serieGuasti(lavori, 'pc-aiutante').compiti).toBe(0)
  })

  it('le pause valgono anche dopo un riavvio: motivo e causa restano nel file dei lavori affidati', () => {
    const lavori = [lavoro({ fineMs: T0, causa: 'accesso' }), lavoro({ fineMs: T0 + 1000, causa: 'accesso' })]
    const riletti = (JSON.parse(JSON.stringify(lavori)) as unknown[]).map(lavoroAffidatoValido).filter((l): l is LavoroAffidato => l !== undefined)
    expect(riletti.map((l) => l.causa)).toEqual(['accesso', 'accesso'])
    expect(riletti[0]!.motivo).toBe('lo specialista ha chiuso con un errore')
    expect(pcInPausa(pauseAiuti(riletti, T0 + RIPROVA_STESSO_PC_MS + 5000), 'pc-aiutante', 'investimento', 'k-2')?.tipo).toBe('progetto')
    // Una causa sconosciuta nel file non passa.
    expect(lavoroAffidatoValido({ ...lavori[0], causa: 'inventata' })?.causa).toBeUndefined()
  })

  it('senza id del piano lo stesso compito è la stessa descrizione', () => {
    expect(chiaveCompito({ descrizione: '  Il  Grafico ' })).toBe('il grafico')
    expect(chiaveCompito({ compito: 'k-3', descrizione: 'x' })).toBe('k-3')
  })
})
