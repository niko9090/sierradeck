import { describe, it, expect } from 'vitest'
import {
  componiPromptRisposta, domandaChiara, leggiEsitoRisposta
} from '../../src/autopilot-host/risposta-autonoma'
import {
  componiDomanda, ultimoMessaggioAssistente, DOMANDA_MAX
} from '../../src/autopilot-host/trascrizione'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

function ap(over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-1',
      nome: 'Caccia bug',
      obiettivo: 'Fai passare i test',
      cwd: 'E:/progetto',
      criteri: [{ descrizione: 'test verdi', comando: 'npm test', soddisfatto: false }],
      iniziatoIl: '2026-08-30T01:00:00.000Z'
    }),
    ...over
  }
}

describe('la domanda vera sta nella conversazione', () => {
  const riga = (ruolo: string, testo: unknown): string =>
    JSON.stringify({ type: ruolo, message: { role: ruolo, content: testo } })

  it('prende l ultimo messaggio dell assistente, non quello dell utente', () => {
    const righe = [
      riga('assistant', 'ho cominciato'),
      riga('user', 'vai avanti'),
      riga('assistant', 'Uso npm o pnpm?')
    ]
    expect(ultimoMessaggioAssistente(righe)).toBe('Uso npm o pnpm?')
  })

  it('legge il contenuto a blocchi, tenendo solo il testo', () => {
    // Gli altri blocchi sono chiamate a strumenti e risultati: non sono cose
    // dette a qualcuno, e infilarle nella domanda la rende illeggibile.
    const righe = [riga('assistant', [
      { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
      { type: 'text', text: 'Procedo con la seconda strada?' }
    ])]
    expect(ultimoMessaggioAssistente(righe)).toBe('Procedo con la seconda strada?')
  })

  it('una riga a meta non fa cadere niente', () => {
    // Succede leggendo mentre Claude Code sta ancora scrivendo il file.
    const righe = [riga('assistant', 'buona'), '{"type":"assist']
    expect(ultimoMessaggioAssistente(righe)).toBe('buona')
  })

  it('senza niente da dire torna undefined, invece di stringhe vuote', () => {
    expect(ultimoMessaggioAssistente([])).toBeUndefined()
    expect(ultimoMessaggioAssistente([riga('assistant', '   ')])).toBeUndefined()
    expect(ultimoMessaggioAssistente(['non sono json'])).toBeUndefined()
  })

  it('non si porta dietro mezz ora di conversazione', () => {
    const lungo = 'x'.repeat(DOMANDA_MAX * 2)
    expect(ultimoMessaggioAssistente([riga('assistant', lungo)])?.length).toBe(DOMANDA_MAX)
  })
})

describe('mettere insieme notifica e conversazione', () => {
  it('nessuna delle due basta da sola', () => {
    // La notifica dice che la chat è ferma ma non cosa vuole; il messaggio dice
    // cosa vuole ma non che sia ferma ad aspettarlo.
    const insieme = componiDomanda('attesa: Claude is waiting for your input', 'Uso npm o pnpm?')
    expect(insieme).toContain('waiting for your input')
    expect(insieme).toContain('Uso npm o pnpm?')
  })

  it('con una sola delle due non aggiunge intestazioni a vuoto', () => {
    expect(componiDomanda('solo notifica')).toBe('solo notifica')
    expect(componiDomanda('', 'solo messaggio')).toBe('solo messaggio')
  })
})

describe('il giudizio del supervisore', () => {
  it('rispondere e il caso normale, e il prompt lo dice', () => {
    // Senza quella riga un modello prudente gira all'utente qualunque cosa, che
    // è esattamente il comportamento da togliere.
    const p = componiPromptRisposta(ap(), 'Uso npm o pnpm?')
    expect(p).toContain('Rispondere è il caso normale')
    expect(p).toContain('Fai passare i test')
    expect(p).toContain('Uso npm o pnpm?')
  })

  it('legge una risposta da dare alla chat', () => {
    const e = leggiEsitoRisposta('{"azione":"rispondo","risposta":"usa npm","perche":"il progetto ha package-lock"}')
    expect(e).toEqual({ tipo: 'rispondo', risposta: 'usa npm', perche: 'il progetto ha package-lock' })
  })

  it('legge una domanda da girare alla persona', () => {
    const e = leggiEsitoRisposta('{"azione":"chiedi","domanda":"Quale chiave uso per il server?"}')
    expect(e?.tipo).toBe('chiedi')
  })

  it('trova il JSON anche dentro altro testo', () => {
    const e = leggiEsitoRisposta('Ecco:\n{"azione":"rispondo","risposta":"vai"}\nfine')
    expect(e?.tipo).toBe('rispondo')
  })

  it('illeggibile non vale come risposta', () => {
    // Una risposta inventata entra nella chat come una decisione presa, e da lì
    // in poi il lavoro va avanti su una premessa che nessuno ha stabilito.
    expect(leggiEsitoRisposta('non ho capito')).toBeUndefined()
    expect(leggiEsitoRisposta('{"azione":"rispondo"}')).toBeUndefined()
    expect(leggiEsitoRisposta('{"azione":"rispondo","risposta":"   "}')).toBeUndefined()
  })
})

describe('una domanda che si capisce da sola', () => {
  it('dice chi chiede, a che lavoro, e cosa succede se non rispondi', () => {
    // Chi risponde può avere un telefono in mano e non aver seguito niente
    // delle ultime due ore: «uso la porta 8080?» non è una domanda, è un
    // indovinello.
    const testo = domandaChiara(ap(), 'Quale chiave SSH uso?', 'il server ne accetta due')
    expect(testo).toContain('Caccia bug')
    expect(testo).toContain('Fai passare i test')
    expect(testo).toContain('il server ne accetta due')
    expect(testo).toContain('Quale chiave SSH uso?')
    // La riga più importante: senza, una domanda scaduta sembra lavoro perso e
    // chi la vede tardi lascia perdere invece di rispondere.
    expect(testo).toContain('Se rispondi tardi riparte lo stesso')
  })

  it('senza nome usa l obiettivo, invece di lasciare le virgolette vuote', () => {
    expect(domandaChiara(ap({ nome: '' }), 'e allora?')).toContain('Fai passare i test')
  })
})
