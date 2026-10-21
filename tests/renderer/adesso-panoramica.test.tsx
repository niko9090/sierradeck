import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { AdessoAutopilota } from '../../src/renderer/components/DalVivoAutopilota'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'

/**
 * 0.81.0, prova nella copia: la Panoramica aveva due «Adesso». A sinistra
 * «c-14 non è ancora partita», al centro «Nessuna chat al lavoro», perché
 * quello del centro guarda solo le finestre. Ora le righe dell'autopilota
 * stanno nella sezione del centro, una volta sola.
 */
const ORA = Date.now()
const iso = (ms: number): string => new Date(ms).toISOString()
const chat = (id: string, x: Partial<ChatGovernata> = {}): ChatGovernata =>
  ({ id, compito: `Il compito di ${id}.`, stato: 'lavoro', cicli: 2, sessionId: `s-${id}`, ...x })
const ap: Autopilota = {
  ...nuovoAutopilota({ id: 'ap-1', nome: 'Prova', obiettivo: 'x', cwd: 'C:\\p', criteri: [], iniziatoIl: iso(ORA - 900 * 60_000) }),
  stato: 'lavoro',
  chats: [chat('c-14', { cicli: 0, dal: iso(ORA - 844 * 60_000) }), chat('c-3', { ruolo: 'sviluppo', dal: iso(ORA - 5 * 60_000) }), chat('c-5', { stato: 'finita' })]
}

describe('«Adesso» nella Panoramica, una volta sola', () => {
  it('dentro la sezione: niente secondo titolo, tutte le righe e le finite', () => {
    const html = renderToStaticMarkup(<AdessoAutopilota autopilota={ap} dentro />)
    expect(html).not.toContain('serigrafia')
    expect(html).toContain('non è ancora partita')
    expect(html).toContain('al lavoro da 5 min')
    expect(html).toContain('1 chat finita')
  })

  it('sotto le schede delle finestre: solo le ferme', () => {
    const html = renderToStaticMarkup(<AdessoAutopilota autopilota={ap} dentro soloFerme />)
    expect(html).toContain('non è ancora partita')
    expect(html).not.toContain('al lavoro da 5 min')
    expect(html).not.toContain('chat finita')
  })

  it('la Panoramica le usa al posto di «Nessuna chat al lavoro», e la conversazione non le ripete', () => {
    const pan = readFileSync('src/renderer/components/WorkspacePanoramica.tsx', 'utf8')
    expect(pan).toContain('<AdessoAutopilota autopilota={autopilota!} dentro />')
    expect(pan).toContain('<AdessoAutopilota autopilota={autopilota} dentro soloFerme />')
    const chatAp = readFileSync('src/renderer/components/ChatAutopilota.tsx', 'utf8')
    expect(chatAp).toContain('{soloConversazione ? null : <AdessoAutopilota autopilota={autopilota} />}')
  })
})
