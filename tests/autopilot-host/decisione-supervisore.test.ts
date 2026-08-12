import { describe, it, expect } from 'vitest'
import {
  chiediDecisione, componiPromptDecisione, leggiDecisioneSupervisore
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
  it('riusa la sessione del supervisore', async () => {
    // Senza, ricostruirebbe il compito da capo a ogni fermata: la differenza
    // fra chi segue il lavoro e chi lo vede per la prima volta.
    let vista: string | undefined = 'non chiamato'
    const interroga: Interrogazione = (_p, _cwd, sessionId) => {
      vista = sessionId
      return Promise.resolve({ testo: '{"azione": "prosegui", "istruzioni": "vai"}', sessionId: 's-1' })
    }
    const esito = await chiediDecisione(ap(), [FALLITO], 'x', 0, interroga, 's-precedente')
    expect(vista).toBe('s-precedente')
    expect(esito.sessionId).toBe('s-1')
    expect(esito.decisione?.azione).toBe('prosegui')
  })

  it('un supervisore che esplode non decide niente, e non solleva', async () => {
    const rotto: Interrogazione = () => Promise.reject(new Error('claude non risponde'))
    await expect(chiediDecisione(ap(), [FALLITO], 'x', 0, rotto, undefined))
      .resolves.toEqual({ decisione: undefined })
  })
})
