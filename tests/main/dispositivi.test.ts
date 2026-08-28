import { describe, it, expect, beforeEach } from 'vitest'
import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriDispositivi, DURATA_CODICE_MS, MAX_TENTATIVI, PASSO_ACCESSO_MS, nuovoCodice } from '../../src/main/dispositivi'

let cartella: string
let ora = 1_000_000
const adesso = (): number => ora

beforeEach(() => {
  cartella = mkdtempSync(join(tmpdir(), 'sd-disp-'))
  ora = 1_000_000
})

const apri = (): ReturnType<typeof apriDispositivi> => apriDispositivi(cartella, adesso)

describe('il codice di accoppiamento', () => {
  it('e di sei cifre, leggibile ad alta voce', () => {
    expect(nuovoCodice()).toMatch(/^\d{6}$/)
  })

  it('senza accoppiamento aperto non entra nessuno', () => {
    // La porta e' chiusa finche' non la apri tu: e' l'unico momento in cui un
    // dispositivo nuovo puo' presentarsi.
    expect(apri().accoppia('123456', 'telefono')).toBeUndefined()
  })

  it('un codice sbagliato non apre', () => {
    const d = apri()
    const { codice } = d.apriAccoppiamento()
    const sbagliato = codice === '000000' ? '111111' : '000000'
    expect(d.accoppia(sbagliato, 'telefono')).toBeUndefined()
  })

  it('scaduto vale come chiuso', () => {
    const d = apri()
    const { codice } = d.apriAccoppiamento()
    ora += DURATA_CODICE_MS + 1
    expect(d.accoppia(codice, 'telefono')).toBeUndefined()
    expect(d.accoppiamentoAperto()).toBeUndefined()
  })

  it('vale per un dispositivo solo', () => {
    // Se restasse valido, chi ha visto il codice sullo schermo potrebbe
    // collegare altri dispositivi quando gli pare.
    const d = apri()
    const { codice } = d.apriAccoppiamento()
    expect(d.accoppia(codice, 'primo')).toBeDefined()
    expect(d.accoppia(codice, 'secondo')).toBeUndefined()
  })

  it('dopo troppi codici sbagliati la finestra si chiude', () => {
    // Sei cifre si indovinano a forza bruta in tre minuti se nessuno conta i
    // tentativi: raggiunta la soglia la porta si chiude e il codice giusto non
    // vale piu' finche' non la riapri.
    const d = apri()
    const { codice } = d.apriAccoppiamento()
    const sbagliato = codice === '000000' ? '111111' : '000000'
    for (let i = 0; i < MAX_TENTATIVI; i++) expect(d.accoppia(sbagliato, 'ladro')).toBeUndefined()
    expect(d.accoppiamentoAperto()).toBeUndefined()
    expect(d.accoppia(codice, 'telefono')).toBeUndefined()
  })

  it('riaprire azzera il conto dei tentativi', () => {
    // Chi sbaglia a digitare non deve restare chiuso fuori: una nuova finestra
    // riparte da zero.
    const d = apri()
    const primo = d.apriAccoppiamento()
    const sbagliato = primo.codice === '000000' ? '111111' : '000000'
    for (let i = 0; i < MAX_TENTATIVI - 1; i++) d.accoppia(sbagliato, 'x')
    const secondo = d.apriAccoppiamento()
    expect(d.accoppia(secondo.codice, 'telefono')).toBeDefined()
  })
})

describe('la chiave di un dispositivo', () => {
  it('si vede una volta sola: sul disco resta il segno', () => {
    const d = apri()
    const { codice } = d.apriAccoppiamento()
    const esito = d.accoppia(codice, 'telefono')
    const scritto = readFileSync(join(cartella, 'dispositivi.json'), 'utf8')
    expect(esito?.chiave).toBeDefined()
    expect(scritto).not.toContain(esito?.chiave ?? 'x')
    expect(scritto).toContain('segno')
  })

  it('riconosce il dispositivo e rifiuta le chiavi inventate', () => {
    const d = apri()
    const { codice } = d.apriAccoppiamento()
    const esito = d.accoppia(codice, 'telefono')
    expect(d.riconosci(esito?.chiave ?? '')?.nome).toBe('telefono')
    expect(d.riconosci('chiave-inventata')).toBeUndefined()
    expect(d.riconosci('')).toBeUndefined()
  })

  it('segna quando un dispositivo si e fatto vivo', () => {
    const d = apri()
    const { codice } = d.apriAccoppiamento()
    const esito = d.accoppia(codice, 'tablet')
    ora += 60_000
    d.riconosci(esito?.chiave ?? '')
    expect(d.elenca()[0]?.ultimoAccesso).toBeDefined()
  })

  it('due dispositivi hanno chiavi diverse', () => {
    const d = apri()
    const uno = d.accoppia(d.apriAccoppiamento().codice, 'uno')
    const due = d.accoppia(d.apriAccoppiamento().codice, 'due')
    expect(uno?.chiave).not.toBe(due?.chiave)
  })
})

describe('revocare', () => {
  it('spegne un dispositivo senza toccare gli altri', () => {
    // Il telefono perso si spegne, il tablet in mensola continua a funzionare.
    const d = apri()
    const telefono = d.accoppia(d.apriAccoppiamento().codice, 'telefono')
    const tablet = d.accoppia(d.apriAccoppiamento().codice, 'tablet')
    d.revoca(telefono?.id ?? '')
    expect(d.riconosci(telefono?.chiave ?? '')).toBeUndefined()
    expect(d.riconosci(tablet?.chiave ?? '')?.nome).toBe('tablet')
  })

  it('un id inventato non fa danni', () => {
    const d = apri()
    d.accoppia(d.apriAccoppiamento().codice, 'telefono')
    d.revoca('../../qualcosa')
    expect(d.elenca()).toHaveLength(1)
  })
})

describe('l elenco', () => {
  it('non contiene mai i segni delle chiavi', () => {
    const d = apri()
    d.accoppia(d.apriAccoppiamento().codice, 'telefono')
    expect(JSON.stringify(d.elenca())).not.toContain('segno')
  })
})

/**
 * Il difetto che ha scollegato un telefono vero.
 *
 * `riconosci` riscriveva l'elenco a **ogni** richiesta, per aggiornare l'ora
 * dell'ultimo accesso. Con l'app aperta le richieste sono più di una al
 * secondo, quindi il file era in rinomina quasi di continuo — e una lettura
 * caduta dentro una di quelle rinomine tornava «nessun dispositivo», cioè 401,
 * cioè un telefono che butta via l'accoppiamento e torna al codice QR.
 */
describe('un file che per un istante non si legge non revoca nessuno', () => {
  it('non riscrive l elenco a ogni riconoscimento', () => {
    const d = apri()
    d.apriAccoppiamento()
    const codice = d.accoppiamentoAperto()?.codice ?? ''
    const chiave = d.accoppia(codice, 'telefono')?.chiave ?? ''

    const percorso = join(cartella, 'dispositivi.json')
    d.riconosci(chiave)
    const dopoIlPrimo = statSync(percorso).mtimeMs

    // Cento richieste nello stesso minuto: il file non si deve muovere.
    for (let i = 0; i < 100; i += 1) {
      ora += 100
      expect(d.riconosci(chiave)).toBeDefined()
    }
    expect(statSync(percorso).mtimeMs).toBe(dopoIlPrimo)
  })

  it('passato il minuto l ora dell ultimo accesso si aggiorna lo stesso', () => {
    const d = apri()
    d.apriAccoppiamento()
    const codice = d.accoppiamentoAperto()?.codice ?? ''
    const chiave = d.accoppia(codice, 'telefono')?.chiave ?? ''
    d.riconosci(chiave)
    const primo = d.elenca()[0]?.ultimoAccesso

    ora += PASSO_ACCESSO_MS + 1
    d.riconosci(chiave)
    expect(d.elenca()[0]?.ultimoAccesso).not.toBe(primo)
  })

  it('se il file diventa illeggibile il dispositivo resta riconosciuto', () => {
    const d = apri()
    d.apriAccoppiamento()
    const codice = d.accoppiamentoAperto()?.codice ?? ''
    const chiave = d.accoppia(codice, 'telefono')?.chiave ?? ''
    expect(d.riconosci(chiave)).toBeDefined()

    // Il caso vero è una rinomina in corso, che qui non si riproduce a comando:
    // un file senza permessi di lettura provoca la stessa cosa — l'errore di
    // I/O nel bel mezzo di una richiesta autentica.
    const percorso = join(cartella, 'dispositivi.json')
    chmodSync(percorso, 0o000)
    try {
      const letto = (() => {
        try {
          readFileSync(percorso, 'utf8')
          return true
        } catch {
          return false
        }
      })()
      // Su Windows i permessi POSIX non mordono: là il test non ha nulla da
      // dire, e saltarlo è meglio che affermare il falso.
      if (!letto) expect(d.riconosci(chiave)).toBeDefined()
    } finally {
      chmodSync(percorso, 0o600)
    }
  })

  it('un file rotto invece toglie l accesso a tutti', () => {
    // Occupato e rotto non sono la stessa cosa: se il contenuto c'è e non è
    // JSON non si sa più chi era autorizzato, e la risposta prudente è nessuno.
    const d = apri()
    d.apriAccoppiamento()
    const codice = d.accoppiamentoAperto()?.codice ?? ''
    const chiave = d.accoppia(codice, 'telefono')?.chiave ?? ''
    expect(d.riconosci(chiave)).toBeDefined()

    writeFileSync(join(cartella, 'dispositivi.json'), 'non sono json', 'utf8')
    ora += PASSO_ACCESSO_MS + 1
    expect(d.riconosci(chiave)).toBeUndefined()
  })

  it('un dispositivo revocato da un altra finestra smette di entrare', () => {
    // Il ricordo non deve diventare una memoria che non si aggiorna: la revoca
    // arriva scrivendo il file, e va vista al primo giro successivo.
    const d = apri()
    d.apriAccoppiamento()
    const codice = d.accoppiamentoAperto()?.codice ?? ''
    const chiave = d.accoppia(codice, 'telefono')?.chiave ?? ''
    expect(d.riconosci(chiave)).toBeDefined()

    writeFileSync(
      join(cartella, 'dispositivi.json'),
      JSON.stringify({ versione: 1, dispositivi: [] }),
      'utf8'
    )
    expect(d.riconosci(chiave)).toBeUndefined()
  })
})
