import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { ChatAutopilota, CampoAutopilota } from '../../src/renderer/components/ChatAutopilota'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'

/**
 * 0.85.1 (Nicholas, 23/10 sera): il testo scritto nella linguetta
 * dell'autopilota sul PC non scorreva fluido. Il testo del campo stava nello
 * stato di tutta la chat con l'autopilota: ogni lettera ridisegnava la
 * conversazione intera, il Punto e le righe dal vivo. Ora sta nel suo campo,
 * e una lettera ridisegna solo quello.
 *
 * Il tempo per lettera si misura come il lavoro di un disegno: prima era il
 * disegno di tutta la chat, ora quello del solo campo.
 */
const ORA = Date.now()
const iso = (ms: number): string => new Date(ms).toISOString()
const chat = (id: string, x: Partial<ChatGovernata> = {}): ChatGovernata =>
  ({ id, compito: `Il compito di ${id}, scritto per intero come nei lavori veri.`, stato: 'lavoro', cicli: 4, sessionId: `s-${id}`, dal: iso(ORA - 30 * 60_000), ...x })
// Una giornata come il 23/10: centinaia di righe nel diario, qualche chat al lavoro.
const ap: Autopilota = {
  ...nuovoAutopilota({ id: 'ap-1', nome: 'Gestionale', obiettivo: 'Il gestionale delle consegne', cwd: 'C:\progetto', criteri: Array.from({ length: 12 }, (_, i) => ({ descrizione: `criterio ${i + 1}`, comando: `npm test -- parte${i}`, soddisfatto: i % 2 === 0 })), iniziatoIl: iso(ORA - 12 * 3_600_000) }),
  stato: 'lavoro',
  chats: Array.from({ length: 6 }, (_, i) => chat(`c-${i + 1}`)),
  decisioni: Array.from({ length: 800 }, (_, i) => ({ quando: iso(ORA - (800 - i) * 50_000), cosa: i % 5 === 0 ? `Ha deciso: continua — la chat c-${(i % 6) + 1} prosegue con il pezzo ${i}` : `unito il ramo ap/ap-1/c-${(i % 6) + 1} in main (giro ${i})` }))
}

const ms = (fai: () => void, volte: number): number => {
  for (let i = 0; i < 5; i++) fai() // a caldo
  const t0 = performance.now()
  for (let i = 0; i < volte; i++) fai()
  return (performance.now() - t0) / volte
}

describe('scrivere all\'autopilota è fluido (0.85.1)', () => {
  it('il testo del campo non sta più nello stato di tutta la chat', () => {
    const src = readFileSync('src/renderer/components/ChatAutopilota.tsx', 'utf8')
    const chatAp = src.slice(src.indexOf('export function ChatAutopilota'), src.indexOf('export function CampoAutopilota'))
    expect(chatAp).not.toContain("useState('')")
    expect(chatAp).not.toContain('<textarea')
    expect(chatAp).toContain('<CampoAutopilota')
    const campo = src.slice(src.indexOf('export function CampoAutopilota'))
    expect(campo).toContain("const [messaggio, setMessaggio] = useState('')")
    expect(campo).toContain('<textarea')
  })

  it('una lettera ridisegna solo il campo: il tempo per lettera scende di molto', () => {
    const prima = ms(() => { renderToStaticMarkup(<ChatAutopilota autopilota={ap} onCambiato={() => {}} />) }, 5)
    const dopo = ms(() => { renderToStaticMarkup(<CampoAutopilota inCorso={false} onManda={() => Promise.resolve(true)} />) }, 200)
    console.info(`[0.85.1] tempo per lettera: prima ${prima.toFixed(2)} ms (tutta la chat), dopo ${dopo.toFixed(3)} ms (solo il campo), ${Math.round(prima / dopo)} volte meno`)
    expect(dopo * 10).toBeLessThan(prima)
  })

  it('il campo c è ancora tutto: Manda, microfono, Disfa, errore', () => {
    const html = renderToStaticMarkup(<CampoAutopilota inCorso={false} onManda={() => Promise.resolve(true)} disfa={{ capito: 'il criterio nuovo', fai: () => {} }} errore="non raggiungibile" />)
    expect(html).toContain('Manda')
    expect(html).toContain('Disfa')
    expect(html).toContain('non raggiungibile')
    expect(html).toContain('scrivi all autopilota')
    const tutta = renderToStaticMarkup(<ChatAutopilota autopilota={ap} onCambiato={() => {}} />)
    expect(tutta).toContain('chatap__scrivi')
  })
})
