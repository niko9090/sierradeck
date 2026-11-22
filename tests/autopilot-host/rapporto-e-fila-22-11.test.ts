import { describe, it, expect } from 'vitest'
import { fermoAMeta, promessaSenzaFine } from '../../src/autopilot-host/finito-a-meta'
import { giudicaGuardiaOrchestratore } from '../../src/autopilot-host/guardia-orchestratore'
import { attesaVuota, passo } from '@shared/attesa-specialisti'

/**
 * 22/11 (k-178l). Due difetti di un'analisi:
 * 1. uno specialista che chiude con «Adesso lancio la suite completa.» e senza la riga RAPPORTO passava per finito;
 * 2. l'Agent che finiva in fila per un posto perdeva il suo prompt.
 */

describe('lavoro a metà: chi scrive codice chiude con un RAPPORTO detto apposta', () => {
  const SENZA = 'Ho scritto la correzione e i test.\nAdesso lancio la suite completa.'

  it('«Adesso lancio la suite completa.» in fondo è a metà, per ogni ruolo che scrive', () => {
    expect(promessaSenzaFine(SENZA)).toContain('Adesso lancio')
    for (const ruolo of ['sviluppatore', 'interfaccia', 'android', 'verificatore']) {
      expect(fermoAMeta(ruolo, SENZA)).toBeDefined()
    }
    expect(promessaSenzaFine('Test scritti.\nLancerò la suite appena posso.')).toBeDefined()
  })

  it('un riepilogo senza RAPPORTO finita/bloccata/serve è a metà, anche senza verbi', () => {
    const riepilogo = 'Fatto. Test verdi, commit a1b2c3.'
    expect(fermoAMeta('sviluppatore', riepilogo)).toContain('senza RAPPORTO')
    expect(fermoAMeta('interfaccia', `${riepilogo}\nRAPPORTO: provo — suite in corso`)).toBeDefined()
  })

  it('chiusure vere: finita, bloccata, mi serve, «bloccato:»', () => {
    expect(fermoAMeta('sviluppatore', 'Adesso lancio la suite.\nPassata.\nRAPPORTO: finita — commit a1b2c3, test verdi')).toBeUndefined()
    expect(fermoAMeta('android', 'RAPPORTO: bloccata perché — manca la chiave')).toBeUndefined()
    expect(fermoAMeta('verificatore', 'RAPPORTO: mi serve — la decisione sul nome')).toBeUndefined()
    expect(fermoAMeta('sviluppatore', 'bloccato: serve una decisione sul nome.')).toBeUndefined()
    expect(fermoAMeta('sviluppatore', undefined)).toBeUndefined()
    expect(fermoAMeta('sviluppatore', '  ')).toBeUndefined()
  })

  it('esploratore, revisore e rilascio non sono toccati se non scrivono RAPPORTO', () => {
    for (const ruolo of ['esploratore', 'revisore', 'rilascio']) {
      expect(fermoAMeta(ruolo, 'Ho letto il codice: il difetto è nel guardiano, riga 40.')).toBeUndefined()
    }
  })
})

describe('un Agent in fila non perde il suo prompt', () => {
  const PROMPT = 'Correggi il guardiano; criterio: `npx vitest run tests/guardia.test.ts`.'
  const adesso = Date.parse('2026-11-22T08:00:00.000Z')
  let n = 0
  const id = (): string => `v-${(n += 1)}`

  it('la guardia passa il prompt alla fila', () => {
    let visto: string | undefined
    const g = giudicaGuardiaOrchestratore(
      { tool_name: 'Agent', tool_input: { subagent_type: 'sviluppatore', description: 'k-9: il guardiano', prompt: PROMPT } },
      {
        radice: process.cwd(), specialistiSulPc: 0, tettoPc: 4,
        fila: (r) => { visto = r.prompt; return { passa: false, posizione: 1, davanti: 0 } }
      }
    )
    expect(g.ok).toBe(false)
    expect(visto).toBe(PROMPT)
  })

  it('la voce in fila lo conserva, e un secondo tentativo senza prompt non lo toglie', () => {
    const r = { workspace: 'Lavoro', descrizione: 'k-9: il guardiano', tipo: 'sviluppatore' }
    const p1 = passo(attesaVuota(), { ...r, prompt: PROMPT }, { liberi: 0, adesso, id })
    expect(p1.passa).toBe(false)
    expect(p1.passa ? undefined : p1.voce.prompt).toBe(PROMPT)
    expect(p1.mossa.stato.voci[0]?.prompt).toBe(PROMPT)
    const p2 = passo(p1.mossa.stato, r, { liberi: 0, adesso, id })
    expect(p2.mossa.stato.voci).toHaveLength(1)
    expect(p2.mossa.stato.voci[0]?.prompt).toBe(PROMPT)
  })

  it('un secondo tentativo col prompt aggiorna una voce che non l’aveva', () => {
    const r = { workspace: 'Lavoro', descrizione: 'k-10: altro', tipo: 'sviluppatore' }
    const p1 = passo(attesaVuota(), r, { liberi: 0, adesso, id })
    expect(p1.mossa.stato.voci[0]?.prompt).toBeUndefined()
    const p2 = passo(p1.mossa.stato, { ...r, prompt: PROMPT }, { liberi: 0, adesso, id })
    expect(p2.mossa.stato.voci).toHaveLength(1)
    expect(p2.mossa.stato.voci[0]?.prompt).toBe(PROMPT)
  })
})
