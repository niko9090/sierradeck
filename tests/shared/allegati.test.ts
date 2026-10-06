import { describe, it, expect } from 'vitest'
import {
  accettaPezzo, ALLEGATO_MAX_BYTE, controllaAllegato, creaLimitatore, decidiDestinazione, giornoCartella, idInvioValido,
  leggiDestinazione, notaPulita, percento, percorsoAllegato, pezzoBase64Valido, PEZZO_BYTE, prossimoPezzo, quantiPezzi,
  rigaPerAutopilota, rigaPerChat, ripulisciNome, tipoVietato
} from '@shared/allegati'

/** 0.50.0: le regole pure dei file dal telefono. */
describe('il nome ripulito', () => {
  it('un nome normale resta com’è', () => {
    expect(ripulisciNome('Fattura Rossi 2026.pdf')).toEqual({ ok: true, nome: 'Fattura Rossi 2026.pdf' })
    expect(ripulisciNome('  foto.jpg ')).toEqual({ ok: true, nome: 'foto.jpg' })
  })
  it('un nome con un percorso dentro si rifiuta (traversal)', () => {
    for (const n of ['../../Windows/system32/x.dll', '..\\..\\boot.ini', 'a/b.txt', 'C:\\x.txt', 'c:x.txt', '..', '.']) {
      expect(ripulisciNome(n).ok, n).toBe(false)
    }
  })
  it('i caratteri che Windows non vuole diventano _, i riservati prendono un _ davanti', () => {
    expect(ripulisciNome('a<b>c:d"e|f?g*h.txt')).toEqual({ ok: true, nome: 'a_b_c_d_e_f_g_h.txt' })
    expect(ripulisciNome('CON.txt')).toEqual({ ok: true, nome: '_CON.txt' })
    expect(ripulisciNome('nul')).toEqual({ ok: true, nome: '_nul' })
    expect(ripulisciNome('com1.tar.gz')).toEqual({ ok: true, nome: '_com1.tar.gz' })
  })
  it('caratteri di controllo, a capo, punti e spazi in fondo spariscono', () => {
    expect(ripulisciNome('rapporto\u0000\n.pdf. . ')).toEqual({ ok: true, nome: 'rapporto.pdf' })
    expect(ripulisciNome('...').ok).toBe(false)
    expect(ripulisciNome('').ok).toBe(false)
  })
  it('un nome lunghissimo si accorcia tenendo l’estensione', () => {
    const r = ripulisciNome('x'.repeat(300) + '.docx')
    expect(r.ok && r.nome.length).toBe(120)
    expect(r.ok && r.nome.endsWith('.docx')).toBe(true)
  })
})

describe('tipo e grandezza', () => {
  it('i programmi che Windows esegue con un doppio clic: 415', () => {
    expect(tipoVietato('setup.EXE')).toBe(true)
    expect(tipoVietato('script.bat')).toBe(true)
    expect(tipoVietato('foto.jpg')).toBe(false)
    const e = controllaAllegato({ nome: 'virus.exe', byte: 10 })
    expect(e).toMatchObject({ ok: false, stato: 415 })
  })
  it('oltre 100 MB: 413, con il limite scritto', () => {
    const e = controllaAllegato({ nome: 'video.mp4', byte: ALLEGATO_MAX_BYTE + 1 })
    expect(e).toMatchObject({ ok: false, stato: 413 })
    expect(!e.ok && e.errore).toContain('100 MB')
    expect(controllaAllegato({ nome: 'video.mp4', byte: ALLEGATO_MAX_BYTE })).toEqual({ ok: true, nome: 'video.mp4' })
  })
  it('traversal nel nome: 400', () => {
    expect(controllaAllegato({ nome: '../segreti.txt', byte: 1 })).toMatchObject({ ok: false, stato: 400 })
  })
  it('grandezza mancante o negativa: 400; un file vuoto va bene', () => {
    expect(controllaAllegato({ nome: 'a.txt', byte: undefined })).toMatchObject({ ok: false, stato: 400 })
    expect(controllaAllegato({ nome: 'a.txt', byte: -1 })).toMatchObject({ ok: false, stato: 400 })
    expect(controllaAllegato({ nome: 'a.txt', byte: 0 }).ok).toBe(true)
  })
})

describe('il percorso nel progetto', () => {
  it('giorno della cartella e nome unico', () => {
    expect(giornoCartella(new Date(2026, 9, 6, 23, 59))).toBe('2026-10-06')
    const presi = new Set(['.sierradeck/allegati/2026-10-06/foto.jpg', '.sierradeck/allegati/2026-10-06/foto (2).jpg'])
    expect(percorsoAllegato('foto.jpg', '2026-10-06', (r) => presi.has(r))).toBe('.sierradeck/allegati/2026-10-06/foto (3).jpg')
    expect(percorsoAllegato('LEGGIMI', '2026-10-06', () => false)).toBe('.sierradeck/allegati/2026-10-06/LEGGIMI')
  })
})

describe('i pezzi e la ripresa', () => {
  it('quanti pezzi e il prossimo', () => {
    expect(quantiPezzi(0)).toBe(1)
    expect(quantiPezzi(PEZZO_BYTE * 2 + 1)).toBe(3)
    expect(prossimoPezzo(0, 10)).toEqual({ da: 0, lunghezza: 10 })
    expect(prossimoPezzo(PEZZO_BYTE, PEZZO_BYTE + 5)).toEqual({ da: PEZZO_BYTE, lunghezza: 5 })
    expect(prossimoPezzo(10, 10)).toBeUndefined()
    expect(percento(50, 200)).toBe(25)
    expect(percento(0, 0)).toBe(100)
  })
  it('si accetta solo il pezzo che attacca dove il file è arrivato', () => {
    expect(accettaPezzo({ ricevuti: 0, byte: 100 }, 0, 60)).toEqual({ ok: true, ricevuti: 60 })
    // Il telefono ha perso la risposta e lo rimanda: confermato senza riscriverlo.
    expect(accettaPezzo({ ricevuti: 60, byte: 100 }, 0, 60)).toEqual({ ok: true, ricevuti: 60, doppio: true })
    // Un buco: 409 con quanto c'è, e si riparte da lì.
    expect(accettaPezzo({ ricevuti: 60, byte: 100 }, 80, 20)).toMatchObject({ ok: false, stato: 409, ricevuti: 60 })
    // Oltre la grandezza dichiarata, o più lungo di un pezzo: 413.
    expect(accettaPezzo({ ricevuti: 60, byte: 100 }, 60, 41)).toMatchObject({ ok: false, stato: 413 })
    expect(accettaPezzo({ ricevuti: 0, byte: PEZZO_BYTE * 3 }, 0, PEZZO_BYTE + 1)).toMatchObject({ ok: false, stato: 413 })
    expect(accettaPezzo({ ricevuti: 0, byte: 10 }, -1, 5)).toMatchObject({ ok: false, stato: 400 })
  })
  it('il base64 di un pezzo e l’id dell’invio', () => {
    expect(pezzoBase64Valido(Buffer.from('ciao').toString('base64'))).toBe(true)
    expect(pezzoBase64Valido('non base64!')).toBe(false)
    expect(pezzoBase64Valido('A'.repeat(Math.ceil(PEZZO_BYTE / 3) * 4 + 4))).toBe(false)
    expect(idInvioValido('abcDEF12_-')).toBe(true)
    expect(idInvioValido('../x')).toBe(false)
    expect(idInvioValido('corto')).toBe(false)
  })
})

describe('la destinazione', () => {
  const chat = [{ id: 'p-1', titolo: 'Clienti', cwd: 'C:\\clienti' }, { id: 'p-2', titolo: 'Nuova', cwd: '' }]
  const autopiloti = [{ id: 'a-1', nome: 'Rilascio', cwd: 'C:\\app' }]
  it('una chat o un autopilota di questo PC', () => {
    expect(decidiDestinazione(leggiDestinazione({ chat: 'p-1' }), { chat, autopiloti })).toEqual({ ok: true, tipo: 'chat', id: 'p-1', titolo: 'Clienti', cwd: 'C:\\clienti' })
    expect(decidiDestinazione(leggiDestinazione({ autopilota: 'a-1' }), { chat, autopiloti })).toEqual({ ok: true, tipo: 'autopilota', id: 'a-1', titolo: 'Rilascio', cwd: 'C:\\app' })
  })
  it('niente, tutte e due, una chat che non c’è o senza cartella, una chat di un altro PC: rifiuti col motivo', () => {
    expect(leggiDestinazione({})).toBeUndefined()
    expect(leggiDestinazione({ chat: 'p-1', autopilota: 'a-1' })).toBeUndefined()
    expect(decidiDestinazione(undefined, { chat, autopiloti })).toMatchObject({ ok: false, stato: 400 })
    expect(decidiDestinazione({ tipo: 'chat', chat: 'p-9' }, { chat, autopiloti })).toMatchObject({ ok: false, stato: 404 })
    expect(decidiDestinazione({ tipo: 'chat', chat: 'p-2' }, { chat, autopiloti })).toMatchObject({ ok: false, stato: 409 })
    expect(decidiDestinazione({ tipo: 'autopilota', autopilota: 'a-9' }, { chat, autopiloti })).toMatchObject({ ok: false, stato: 404 })
    const altro = decidiDestinazione({ tipo: 'chat', chat: 'pc:lap:s-1' }, { chat, autopiloti, altroPc: (id) => id.startsWith('pc:') })
    expect(altro).toMatchObject({ ok: false, stato: 400 })
    expect(!altro.ok && altro.errore).toContain('ponte')
  })
})

describe('quanti per minuto', () => {
  it('il ventunesimo nello stesso minuto aspetta; un altro mittente no; dopo un minuto si riparte', () => {
    const limita = creaLimitatore(20)
    for (let i = 0; i < 20; i++) expect(limita('tel:t1', 1000 + i)).toBe(true)
    expect(limita('tel:t1', 2000)).toBe(false)
    expect(limita('tel:t2', 2000)).toBe(true)
    expect(limita('tel:t1', 62_000)).toBe(true)
  })
})

describe('le righe di avviso', () => {
  it('alla chat: corta, con nome, percorso e nota', () => {
    expect(rigaPerChat({ nome: 'fattura.pdf', percorso: '.sierradeck/allegati/2026-10-06/fattura.pdf', nota: 'quella di Rossi' }))
      .toBe('Nicholas ti ha mandato il file fattura.pdf (.sierradeck/allegati/2026-10-06/fattura.pdf). Nota: quella di Rossi. Guardalo.')
    expect(rigaPerChat({ nome: 'a.png', percorso: 'p/a.png' })).toBe('Nicholas ti ha mandato il file a.png (p/a.png). Guardalo.')
    expect(rigaPerChat({ nome: 'a.png', percorso: 'p/a.png', nota: 'guarda!' })).toContain('Nota: guarda! Guardalo.')
  })
  it('la nota in una riga sola: un a capo nel terminale manderebbe il messaggio a metà', () => {
    expect(notaPulita('prima\nseconda\r\n\tterza')).toBe('prima seconda terza')
    expect(notaPulita('x'.repeat(900)).length).toBe(500)
    expect(rigaPerChat({ nome: 'a', percorso: 'b', nota: 'uno\ndue' })).not.toContain('\n')
  })
  it('all’autopilota: il percorso intero, e cosa farne', () => {
    const r = rigaPerAutopilota({ nome: 'schema.png', percorso: 'C:\\app\\.sierradeck\\allegati\\2026-10-06\\schema.png', nota: 'il nuovo flusso' })
    expect(r).toContain('C:\\app\\.sierradeck\\allegati\\2026-10-06\\schema.png')
    expect(r).toContain('Nota: il nuovo flusso.')
  })
})
