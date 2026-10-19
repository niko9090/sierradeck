import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { leggiConfigurazione, componiAvviso, creaAvvisatore, AVVISI_VICINI_MS } from '../../src/autopilot-host/telegram'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

function conFile(contenuto: string): string {
  const d = mkdtempSync(join(tmpdir(), 'tg-'))
  const p = join(d, 'telegram_config.json')
  writeFileSync(p, contenuto, 'utf8')
  return p
}

function ap(over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-1', nome: 'Test verdi', obiettivo: 'Fai passare la suite', cwd: 'C:\\p',
      criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: true }],
      iniziatoIl: '2026-08-09T10:00:00.000Z'
    }),
    ...over
  }
}

describe('leggiConfigurazione', () => {
  it('legge token e chat dal file del bot esistente', () => {
    const p = conFile(JSON.stringify({ bot_token: '123:abc', chat_id: '999' }))
    expect(leggiConfigurazione([p])).toEqual({ token: '123:abc', chat: '999' })
  })

  it('accetta un chat_id numerico', () => {
    const p = conFile(JSON.stringify({ bot_token: '123:abc', chat_id: 999 }))
    expect(leggiConfigurazione([p])?.chat).toBe('999')
  })

  it('prova i percorsi in ordine e usa il primo leggibile', () => {
    const buono = conFile(JSON.stringify({ bot_token: 't', chat_id: '1' }))
    expect(leggiConfigurazione([join(tmpdir(), 'non-esiste-mai.json'), buono])?.token).toBe('t')
  })

  it('restituisce undefined quando non c e configurazione, invece di sollevare', () => {
    // Telegram e' un di piu': senza, l'autopilota lavora lo stesso e lo dice
    // soltanto nel log.
    expect(leggiConfigurazione([join(tmpdir(), 'niente.json')])).toBeUndefined()
  })

  it('rifiuta una configurazione senza token o senza chat', () => {
    expect(leggiConfigurazione([conFile(JSON.stringify({ chat_id: '1' }))])).toBeUndefined()
    expect(leggiConfigurazione([conFile(JSON.stringify({ bot_token: 't' }))])).toBeUndefined()
    expect(leggiConfigurazione([conFile('non sono JSON')])).toBeUndefined()
  })
})

describe('componiAvviso', () => {
  it('per un lavoro finito riporta obiettivo, cicli e decisioni prese', () => {
    const testo = componiAvviso('finito', ap({
      cicli: 4,
      decisioni: [{ quando: '2026-08-09T10:01:00.000Z', cosa: 'scelto il formato JSON' }]
    }))
    expect(testo).toContain('Test verdi')
    expect(testo).toContain('4')
    expect(testo).toContain('formato JSON')
  })

  it('per uno stallo dice che cambia strada, non che si e fermato', () => {
    // L'autopilota non si ferma piu' allo stallo: prova un altro approccio. Un
    // messaggio che annunciasse la fine del lavoro sarebbe falso.
    const testo = componiAvviso('stallo', ap({ stato: 'lavoro', strategia: 'dubitare della misura' }))
    expect(testo).toContain('dubitare della misura')
    expect(testo).not.toContain('fermato')
  })

  it('per una domanda mette in chiaro come si risponde', () => {
    const testo = componiAvviso('domanda', ap(), 'Quale chiave uso?')
    expect(testo).toContain('Quale chiave uso?')
    // Senza il comando, l'utente riceve una domanda e non sa come rispondere.
    expect(testo).toContain('/rispondi')
    expect(testo).toContain('ap-1')
  })

  it('sfugge il testo dell utente, cosi Telegram non rifiuta tutto il messaggio', () => {
    // Un < o una & nell'obiettivo facevano rispondere a Telegram «can't parse
    // entities»: l'avviso non arrivava, nemmeno la domanda. Il testo dinamico va
    // sfuggito; i tag che mettiamo noi (<b>, <code>) restano.
    const testo = componiAvviso('domanda', ap({ nome: 'A & B', obiettivo: 'usa Promise<void>' }), 'e <script>?')
    expect(testo).toContain('Promise&lt;void&gt;')
    expect(testo).toContain('A &amp; B')
    expect(testo).toContain('&lt;script&gt;')
    expect(testo).toContain('<b>')
    expect(testo).toContain('<code>')
    // Nessun < grezzo dal testo dell'utente deve sopravvivere.
    expect(testo).not.toContain('Promise<void>')
  })

  it('non manda un messaggio sterminato', () => {
    const lungo = ap({
      obiettivo: 'x'.repeat(6000),
      decisioni: Array.from({ length: 200 }, (_, i) => ({ quando: 'q', cosa: `decisione ${i}` }))
    })
    // Telegram taglia a 4096 caratteri: un messaggio piu' lungo arriva mutilato
    // proprio nella parte finale, dove c'e' cosa fare adesso.
    expect(componiAvviso('finito', lungo).length).toBeLessThanOrEqual(4000)
  })
})

describe('creaAvvisatore', () => {
  it('manda il messaggio con token e chat della configurazione', async () => {
    const inviati: { url: string; corpo: unknown }[] = []
    const avvisa = creaAvvisatore({
      configurazione: { token: 't-1', chat: 'c-1' },
      manda: (url, corpo) => { inviati.push({ url, corpo }); return Promise.resolve(true) }
    })
    await avvisa('finito', ap())
    expect(inviati[0]?.url).toContain('t-1')
    expect((inviati[0]?.corpo as { chat_id: string }).chat_id).toBe('c-1')
  })

  it('senza configurazione non manda niente e non solleva', async () => {
    const avvisa = creaAvvisatore({ configurazione: undefined, manda: () => Promise.reject(new Error('mai')) })
    await expect(avvisa('finito', ap())).resolves.toBeUndefined()
  })

  it('0.81.0: gli avvisi vicini partono insieme, il primo subito; ognuno nel registro', async () => {
    const inviati: string[] = []
    let ora = 1_000_000
    let inSospeso: (() => void) | undefined
    let attesaMs = -1
    const avvisa = creaAvvisatore({
      configurazione: { token: 't', chat: 'c' },
      manda: (_url, corpo) => { inviati.push((corpo as { text: string }).text); return Promise.resolve(true) },
      adesso: () => ora,
      dopo: (ms, f) => { attesaMs = ms; inSospeso = f }
    })
    await avvisa('finito', ap({ nome: 'Uno' }))
    expect(inviati).toHaveLength(1)
    ora += 5_000
    await avvisa('sospeso', ap({ nome: 'Due', motivoSospensione: 'la verifica non parte' }))
    ora += 1_000
    await avvisa('domanda', ap({ nome: 'Tre' }), 'Quale chiave?')
    // Dentro i 20 s: aspettano, insieme.
    expect(inviati).toHaveLength(1)
    expect(attesaMs).toBe(AVVISI_VICINI_MS - 5_000)
    ora += 14_000
    inSospeso?.()
    await new Promise((r) => setTimeout(r, 0))
    expect(inviati).toHaveLength(2)
    expect(inviati[1]).toContain('2 avvisi da SierraDeck')
    expect(inviati[1]).toContain('Due')
    expect(inviati[1]).toContain('Quale chiave?')
    // Passata la finestra, il prossimo parte subito.
    ora += AVVISI_VICINI_MS
    await avvisa('finito', ap({ nome: 'Quattro' }))
    expect(inviati).toHaveLength(3)
  })

  it('0.81.0: «ripreso dopo un riavvio» non è più un avviso', () => {
    expect(() => componiAvviso('ripreso' as never, ap())).not.toThrow()
    expect(componiAvviso('ripreso' as never, ap())).not.toContain('ripreso dopo un riavvio')
  })

  it('un invio fallito non interrompe il lavoro', async () => {
    // Il lavoro dell'autopilota non dipende da Telegram: se la rete non c'e',
    // il messaggio si perde e resta nel log, ma la chat continua.
    const avvisa = creaAvvisatore({
      configurazione: { token: 't', chat: 'c' },
      manda: () => Promise.reject(new Error('rete assente'))
    })
    await expect(avvisa('stallo', ap())).resolves.toBeUndefined()
  })
})
