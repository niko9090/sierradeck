import { describe, it, expect } from 'vitest'
import { creaPostino, type ChatDiPc, type Scatola } from '../../src/main/progetti/posta'
import { creaMandaAChat } from '../../src/main/progetti/manda-a-chat'
import { ErroreRemoto } from '../../src/main/pc-remoto'

/**
 * Scrivere a una chat di un progetto che vive su un altro PC (0.88.0): acceso
 * → subito; spento → nella sua posta, consegnato quando torna, e chi ha
 * scritto vede l'esito. Id e cartelle finti.
 */
function scatolaInMemoria(): Scatola {
  const dati = new Map<string, unknown>()
  return {
    leggi: async <T,>(nome: string) => { const v = dati.get(nome); return (v === undefined ? undefined : JSON.parse(JSON.stringify(v))) as T | undefined },
    scrivi: async (nome, oggetto) => { dati.set(nome, JSON.parse(JSON.stringify(oggetto))) },
    cancella: async (nome) => { dati.delete(nome) },
    elenca: async (prefisso) => [...dati.keys()].filter((k) => k.startsWith(prefisso))
  }
}

const CARTELLA = 'E:\\Progetti\\Prova'

function pc(id: string, scatola: Scatola, cartelle: string[] = []) {
  let chat: ChatDiPc[] = []
  const scritti: { chat: string; testo: string }[] = []
  const aperte: string[] = []
  let ora = Date.parse('2026-10-30T09:00:00.000Z')
  const postino = creaPostino({
    scatola: () => scatola,
    pcId: () => id,
    pcNome: () => id.toUpperCase(),
    versione: () => '0.88.0',
    chat: () => chat,
    cartelle: () => cartelle,
    cartellaEsiste: (c) => cartelle.includes(c),
    apriChat: (c) => { aperte.push(c) },
    riprendiChat: (_c, s) => { aperte.push(s) },
    scrivi: (chatId, testo) => { scritti.push({ chat: chatId, testo }) },
    adesso: () => ora
  })
  return { postino, scritti, aperte, chat: (c: ChatDiPc[]) => { chat = c }, avanti: (ms: number) => { ora += ms } }
}

describe('scrivere a una chat di un altro PC', () => {
  it('acceso: va diretto con /api/scrivi, niente posta', async () => {
    const chiamate: string[] = []
    const m = creaMandaAChat({
      chiama: async (_pc, percorso, corpo) => {
        chiamate.push(percorso)
        if (percorso === '/api/stato') return { chat: [{ id: '7', cwd: CARTELLA, titolo: 't', sessione: 'ses-1', viva: true, aspetta: true }] }
        expect(corpo).toMatchObject({ chat: '7', testo: 'ciao' })
        return { fatto: true }
      },
      accoda: async () => { throw new Error('non deve andare in posta') },
      posta: async () => ({ voci: [] }),
      io: () => 'a'
    })
    const e = await m.manda({ pcId: 'b', sessione: 'ses-1', testo: 'ciao' })
    expect(e).toEqual({ ok: true, via: 'diretta', dati: { fatto: true } })
    expect(chiamate).toEqual(['/api/stato', '/api/scrivi'])
  })

  it('spento: va nella sua posta, arriva quando torna, e chi ha scritto vede l esito', async () => {
    const s = scatolaInMemoria()
    const a = pc('a', s)
    const b = pc('b', s, [CARTELLA])
    // Tutti e due hanno battuto una volta: A sa che B legge le cassette d'uscita.
    await b.postino.giro()
    await a.postino.giro()
    await a.postino.pc()
    await b.postino.pc()
    const m = creaMandaAChat({
      chiama: async () => { throw new ErroreRemoto('irraggiungibile', 'B non risponde') },
      accoda: (pcId, v) => a.postino.aggiungi(pcId, v),
      posta: (pcId) => a.postino.posta(pcId),
      io: () => 'a',
      nomeDi: () => 'B',
      nuovoId: () => 'voce-1'
    })
    const e = await m.manda({ pcId: 'b', chat: '7', sessione: 'ses-1', cwd: CARTELLA, testo: 'fai il punto' })
    expect(e).toMatchObject({ ok: true, via: 'posta', voce: 'voce-1' })
    expect(await m.stati('b')).toMatchObject([{ id: 'voce-1', stato: 'attesa', testo: 'fai il punto' }])

    // B torna acceso con la chat aperta che aspetta: il suo postino consegna.
    b.chat([{ id: '7', sessione: 'ses-1', titolo: 'Prova', cwd: CARTELLA, viva: true, aspetta: true }])
    b.avanti(60_000)
    await b.postino.giro()
    expect(b.scritti).toEqual([{ chat: '7', testo: 'fai il punto' }])
    expect(await m.stati('b')).toMatchObject([{ id: 'voce-1', stato: 'consegnato' }])

    // Un giro in più non lo riscrive.
    await b.postino.giro()
    expect(b.scritti).toHaveLength(1)
  })

  it('spento e la chat là è chiusa: il postino la riprende, poi consegna', async () => {
    const s = scatolaInMemoria()
    const a = pc('a', s)
    const b = pc('b', s, [CARTELLA])
    await b.postino.giro(); await a.postino.giro(); await a.postino.pc(); await b.postino.pc()
    const m = creaMandaAChat({
      chiama: async () => { throw new ErroreRemoto('non-so', 'non so se è acceso') },
      accoda: (pcId, v) => a.postino.aggiungi(pcId, v),
      posta: (pcId) => a.postino.posta(pcId),
      io: () => 'a',
      cwdDi: (_pc, ses) => (ses === 'ses-9' ? CARTELLA : undefined)
    })
    expect(await m.manda({ pcId: 'b', sessione: 'ses-9', testo: 'riparti' })).toMatchObject({ ok: true, via: 'posta' })
    await b.postino.giro()
    expect(b.aperte).toEqual(['ses-9'])
    b.chat([{ id: '3', sessione: 'ses-9', titolo: 'x', cwd: CARTELLA, viva: true, aspetta: true }])
    await b.postino.giro()
    expect(b.scritti.map((x) => x.testo)).toEqual(['riparti'])
  })

  it('una cartella che su quel PC non c è: fallita, e lo si vede', async () => {
    const s = scatolaInMemoria()
    const a = pc('a', s)
    const b = pc('b', s, [])
    await b.postino.giro(); await a.postino.giro(); await a.postino.pc(); await b.postino.pc()
    const m = creaMandaAChat({
      chiama: async () => { throw new ErroreRemoto('irraggiungibile', 'giù') },
      accoda: (pcId, v) => a.postino.aggiungi(pcId, v),
      posta: (pcId) => a.postino.posta(pcId),
      io: () => 'a'
    })
    await m.manda({ pcId: 'b', cwd: 'E:\\NonCe', testo: 'x' })
    await b.postino.giro()
    const [st] = await m.stati('b')
    expect(st?.stato).toBe('fallito')
    expect(st?.esito).toContain('non esiste')
  })

  it('risponde con un errore vero, o non ha finito in tempo: niente posta, mai due volte', async () => {
    let accodate = 0
    const deps = (err: ErroreRemoto) => creaMandaAChat({
      chiama: async () => { throw err },
      accoda: async () => { accodate += 1; return { voci: [] } },
      posta: async () => undefined,
      io: () => 'a'
    })
    expect(await deps(new ErroreRemoto('http', 'non ha finito entro 20 secondi', 504)).manda({ pcId: 'b', chat: '1', cwd: CARTELLA, testo: 'x' })).toMatchObject({ ok: false, stato: 504 })
    expect(await deps(new ErroreRemoto('pin', 'protetta', 423)).manda({ pcId: 'b', chat: '1', cwd: CARTELLA, testo: 'x' })).toMatchObject({ ok: false, pin: true })
    expect(await deps(new ErroreRemoto('cassaforte', 'chiusa')).manda({ pcId: 'b', chat: '1', cwd: CARTELLA, testo: 'x' })).toMatchObject({ ok: false, motivo: 'cassaforte' })
    expect(accodate).toBe(0)
  })

  it('spento e senza cartella nota: lo dice invece di perdere il messaggio', async () => {
    const m = creaMandaAChat({
      chiama: async () => { throw new ErroreRemoto('irraggiungibile', 'giù') },
      accoda: async () => { throw new Error('no') },
      posta: async () => undefined,
      io: () => 'a'
    })
    expect(await m.manda({ pcId: 'b', sessione: 's', testo: 'x' })).toMatchObject({ ok: false, motivo: 'senza-cartella' })
  })

  it('posta non disponibile (Drive scollegato): non partito, e lo dice', async () => {
    const m = creaMandaAChat({
      chiama: async () => { throw new ErroreRemoto('irraggiungibile', 'giù') },
      accoda: async () => undefined,
      posta: async () => undefined,
      io: () => 'a'
    })
    const e = await m.manda({ pcId: 'b', cwd: CARTELLA, testo: 'x' })
    expect(e).toMatchObject({ ok: false, motivo: 'posta' })
  })
})
