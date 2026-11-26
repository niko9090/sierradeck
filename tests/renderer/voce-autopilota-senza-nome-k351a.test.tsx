import { describe, it, expect, beforeAll } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Autopilota } from '../../src/shared/autopilota'

/**
 * k-351a: VoceAutopilota con un autopilota arrivato da un altro PC senza
 * `nome` non si rompe (prima: «Cannot read properties of undefined (reading
 * 'trim')») e il Parlato lo chiama «Autopilota».
 */
type Modulo = typeof import('../../src/renderer/components/VoceAutopilota')
let V: Modulo

beforeAll(async () => {
  ;(globalThis as { window?: unknown }).window = {
    gestore: { voceLocale: { stato: async () => ({ fase: 'assente' }), suCambio: () => () => {}, suFinestraNascosta: () => () => {}, scarica: async () => ({ fase: 'assente' }), annulla: async () => {}, rimuovi: async () => ({ fase: 'assente' }), trascrivi: async () => ({ ok: false, messaggio: 'no' }) } }
  }
  V = await import('../../src/renderer/components/VoceAutopilota')
})

describe('VoceAutopilota senza nome', () => {
  it('si disegna senza eccezioni con un autopilota senza nome', () => {
    const a = { id: 'a1', obiettivo: 'Rifai la pagina', cwd: 'C:\\x', stato: 'lavoro' } as unknown as Autopilota
    const html = renderToStaticMarkup(
      <V.VoceAutopilota autopilota={a} workspace="SierraDeck" battute={[]} invia={async () => undefined} suComando={() => {}} />
    )
    expect(html.length).toBeGreaterThan(0)
  })
})
