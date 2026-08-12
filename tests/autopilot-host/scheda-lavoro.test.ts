import { describe, it, expect } from 'vitest'
import { corpoScheda, tagScheda, titoloScheda } from '../../src/autopilot-host/scheda-lavoro'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

function ap(over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-1', nome: 'Notte di test', obiettivo: 'Fai passare la suite', cwd: 'C:\p',
      criteri: [
        { descrizione: 'i test passano', comando: 'npm test', soddisfatto: true },
        { descrizione: 'il build regge', comando: 'npm run build', soddisfatto: false }
      ],
      iniziatoIl: '2026-08-12T10:00:00.000Z'
    }),
    ...over
  }
}

describe('la scheda che resta', () => {
  it('dice cosa e stato raggiunto e cosa no', () => {
    const corpo = corpoScheda(ap())
    expect(corpo).toContain('i test passano')
    expect(corpo).toContain('il build regge')
    expect(corpo).toContain('Fai passare la suite')
  })

  it('non ricopia le tracce dei comandi', () => {
    // Le tracce sono lo stesso errore ripetuto a ogni giro: qui conta cosa e'
    // stato deciso, non quante volte si e' visto lo stesso esito.
    const conStoria = ap({
      decisioni: [
        { quando: '2026-08-12T10:05:00.000Z', cosa: 'proseguito: i test passano - 2 rossi' },
        { quando: '2026-08-12T10:09:00.000Z', cosa: 'criterio corretto - «i test passano»: npx vitest run' }
      ]
    })
    const corpo = corpoScheda(conStoria)
    expect(corpo).not.toContain('proseguito:')
    expect(corpo).toContain('criterio corretto')
  })

  it('un lavoro andato liscio non lascia una sezione vuota', () => {
    expect(corpoScheda(ap())).toContain('andato dritto')
  })

  it('il titolo e il nome, o l obiettivo se il nome non c e', () => {
    expect(titoloScheda(ap())).toBe('Notte di test')
    expect(titoloScheda(ap({ nome: '   ' }))).toContain('Fai passare')
  })

  it('i tag dicono a colpo d occhio se era tutto a posto', () => {
    expect(tagScheda(ap({ stato: 'finito' }))).toContain('incompleto')
    const tutto = ap({ stato: 'finito', criteri: [{ descrizione: 'x', soddisfatto: true }] })
    expect(tagScheda(tutto)).not.toContain('incompleto')
    expect(tagScheda(tutto)).toContain('finito')
  })
})
