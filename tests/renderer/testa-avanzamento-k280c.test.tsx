import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RigaAvanzamento, TestaOrchestratore } from '../../src/renderer/components/TestaOrchestratore'
import { ChatAutopilotaRemota } from '../../src/renderer/components/ChatAutopilotaRemota'
import type { Autopilota } from '../../src/shared/autopilota'

/** k-280c: la riga dell'avanzamento in testa alla chat si legge sempre. */
const testo = (h: string): string => h.replace(/<[^>]*>/g, '')

describe('la riga dell’avanzamento', () => {
  it('vista non ancora arrivata: «leggo…»', () => {
    const h = testo(renderToStaticMarkup(<TestaOrchestratore workspace="cartella:k280c-nessuna-vista" />))
    expect(h).toContain('Avanzamento')
    expect(h).toContain('leggo…')
  })
  it('percento assente: «Avanzamento —» con il perché dietro il «?»', () => {
    const m = renderToStaticMarkup(<RigaAvanzamento percento={undefined} />)
    expect(testo(m)).toContain('Avanzamento —')
    expect(m).toContain('aiuto__tasto')
    expect(m).not.toContain('progressbar')
  })
  it('80: «Avanzamento 80%» con la barra', () => {
    const m = renderToStaticMarkup(<RigaAvanzamento percento={80} />)
    expect(testo(m)).toContain('Avanzamento 80%')
    expect(m).toContain('role="progressbar"')
    expect(m).toContain('width:80%')
  })
})

describe('la chat di un autopilota su un altro PC', () => {
  it('monta la testa con l’avanzamento', () => {
    const a = { id: 'a1', nome: 'Autopilota', workspace: 'cartella:prova', cwd: 'C:/prova', stato: 'attivo', cicli: 0, iniziatoIl: '2026-11-24T10:00:00.000Z', ultimoEvento: '2026-11-24T10:00:00.000Z', decisioni: [] } as unknown as Autopilota
    const h = testo(renderToStaticMarkup(
      <ChatAutopilotaRemota pcId="pc-1" pcNome="PC-prova" stato={{ autopilota: a, giu: false } as never} rileggi={() => undefined} />
    ))
    expect(h).toContain('Avanzamento')
  })
})
