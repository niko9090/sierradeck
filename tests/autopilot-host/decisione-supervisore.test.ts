import { describe, it, expect } from 'vitest'
import {
  chiediDecisione, componiPromptDecisione, leggiDecisioneSupervisore, PROMPT_MAX
} from '../../src/autopilot-host/decisione-supervisore'
import type { EsitoVerifica } from '../../src/autopilot-host/decisione'
import type { Interrogazione } from '../../src/autopilot-host/supervisore'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

function ap(over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-1', nome: 'Test', obiettivo: 'Fai passare la suite', cwd: 'C:\\p',
      criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: false }],
      iniziatoIl: '2026-08-12T10:00:00.000Z'
    }),
    ...over
  }
}

const FALLITO: EsitoVerifica = {
  descrizione: 'i test passano', comando: 'npm test', passato: false, uscita: '2 test rossi'
}
const NON_MISURABILE: EsitoVerifica = {
  descrizione: 'i test passano', comando: 'npm test', passato: false, misurato: false,
  uscita: 'bash: unexpected EOF'
}

describe('leggiDecisioneSupervisore', () => {
  it('legge la decisione', () => {
    const d = leggiDecisioneSupervisore('{"azione": "prosegui", "istruzioni": "guarda il test X"}')
    expect(d?.azione).toBe('prosegui')
    expect(d?.istruzioni).toBe('guarda il test X')
  })

  it('prende l ultimo JSON, non il primo', () => {
    // Il supervisore ragiona prima di decidere, e un JSON citato a meta'
    // ragionamento non e' la sua conclusione.
    const testo = 'Prima pensavo {"azione": "finito"} ma poi:\n{"azione": "prosegui", "istruzioni": "no"}'
    expect(leggiDecisioneSupervisore(testo)?.azione).toBe('prosegui')
  })

  it('legge un JSON con oggetti annidati', () => {
    // Cercare l'apertura con un indexOf prenderebbe la graffa sbagliata.
    const d = leggiDecisioneSupervisore(
      '{"azione": "correggiCriterio", "criterio": {"descrizione": "i test", "comando": "npx vitest run"}}'
    )
    expect(d?.criterio?.comando).toBe('npx vitest run')
  })

  it('scarta un azione che non esiste', () => {
    expect(leggiDecisioneSupervisore('{"azione": "esplodi"}')).toBeUndefined()
  })

  it('scarta un comando su piu righe', () => {
    // Un ritorno a capo dentro un comando e' cio' che ha rotto le verifiche una
    // volta: non lo si fa entrare una seconda.
    const d = leggiDecisioneSupervisore(
      '{"azione": "correggiCriterio", "criterio": {"descrizione": "x", "comando": "a\\nb"}}'
    )
    expect(d?.criterio).toBeUndefined()
  })

  it('senza JSON non inventa una decisione', () => {
    expect(leggiDecisioneSupervisore('non ne ho idea')).toBeUndefined()
  })
})

describe('componiPromptDecisione', () => {
  it('distingue un criterio non misurabile da uno fallito', () => {
    // E' la distinzione che e' costata una notte di lavoro: se il quadro non la
    // fa, il supervisore decide sulle stesse informazioni sbagliate di prima.
    const p = componiPromptDecisione(ap(), [NON_MISURABILE], 'ho finito', 0)
    expect(p).toContain('NON MISURABILE')
    expect(componiPromptDecisione(ap(), [FALLITO], 'ho finito', 0)).toContain('non soddisfatto')
  })

  it('avverte quando si gira in cerchio', () => {
    expect(componiPromptDecisione(ap(), [FALLITO], 'x', 4)).toContain('4 giri')
    expect(componiPromptDecisione(ap(), [FALLITO], 'x', 0)).not.toContain('giri che l')
  })

  it('porta obiettivo, cartella e ultimo messaggio', () => {
    const p = componiPromptDecisione(ap(), [FALLITO], 'ho sistemato il parser', 0)
    expect(p).toContain('Fai passare la suite')
    expect(p).toContain('C:\\p')
    expect(p).toContain('ho sistemato il parser')
  })

  it('dice che i fatti battono l opinione', () => {
    expect(componiPromptDecisione(ap(), [FALLITO], 'x', 0)).toContain('vince sulla tua')
  })
})

describe('chiediDecisione', () => {
  it('30/10: anche con una sessione data non la riprende: sempre di routine, senza sessione', async () => {
    // Con --resume la conversazione del supervisore cresceva a ogni giro senza fine.
    let vista: string | undefined = 'non chiamato'
    let opzioni: Parameters<Interrogazione>[3]
    const interroga: Interrogazione = (_p, _cwd, sessionId, o) => {
      vista = sessionId
      opzioni = o
      return Promise.resolve({ testo: '{"azione": "prosegui", "istruzioni": "vai"}', sessionId: 's-1' })
    }
    const esito = await chiediDecisione(ap(), [FALLITO], 'x', 0, interroga, 's-precedente')
    expect(vista).toBeUndefined()
    expect(opzioni).toEqual({ routine: true })
    expect(esito.decisione?.azione).toBe('prosegui')
  })

  it('29/10: senza sessione è una decisione di routine', async () => {
    let opzioni: Parameters<Interrogazione>[3]
    const interroga: Interrogazione = (_p, _cwd, _s, o) => { opzioni = o; return Promise.resolve({ testo: '{"azione": "finito"}' }) }
    await chiediDecisione(ap(), [FALLITO], 'x', 0, interroga, undefined)
    expect(opzioni).toEqual({ routine: true })
  })

  it('29/10: il prompt sta sotto PROMPT_MAX anche con obiettivo, messaggio e stato del programma enormi; niente «leggi i file»', () => {
    const lungo = ap({ obiettivo: 'o'.repeat(5000) })
    const uscita = { ...FALLITO, uscita: 'e'.repeat(5000) }
    const p = componiPromptDecisione(lungo, [uscita], 'm'.repeat(20_000), 0, [], `## Stato del programma\n${'s'.repeat(20_000)}`)
    expect(p.length).toBeLessThanOrEqual(PROMPT_MAX + 100)
    expect(p).toContain('## Stato del programma')
    expect(p).toContain('"azione"')
    expect(p).not.toContain('leggi i file')
    expect(p).not.toContain('e'.repeat(400))
  })

  it('un supervisore che esplode non decide niente, e non solleva', async () => {
    const rotto: Interrogazione = () => Promise.reject(new Error('claude non risponde'))
    await expect(chiediDecisione(ap(), [FALLITO], 'x', 0, rotto, undefined))
      .resolves.toEqual({ decisione: undefined })
  })
})
