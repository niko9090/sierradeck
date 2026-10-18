import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { RiassuntoAlLavoro, type SchedaVista } from '../../src/renderer/components/WorkspacePanoramica'

/**
 * 0.79.0, Nicholas: nella Panoramica la conversazione con l'autopilota grande
 * e sempre in vista, con il campo pronto; accanto il riassunto di chi lavora.
 */
describe('la Panoramica del PC: conversazione grande e riassunto accanto', () => {
  const schede: SchedaVista[] = [
    { id: 'p-1', paneId: 'p-1', titolo: 'x', stato: 'chiede', nataIl: 0, ultimaAzione: '', righe: [] },
    { id: 'p-2', titolo: 'y', stato: 'lavora', nataIl: 0, ultimaAzione: '', righe: [] }
  ]
  it('una riga per chat al lavoro: chi, cosa, da quanto, se aspetta te; senza riquadro non si apre', () => {
    const html = renderToStaticMarkup(
      <RiassuntoAlLavoro
        righe={[
          { id: 'p-1', chi: 'Collaudo', ruolo: 'collaudo', cosa: 'prova: «la copia»', quanto: 'adesso', aspettaTe: true },
          { id: 'p-2', chi: 'Sviluppo', ruolo: 'sviluppo', cosa: 'lavora a: «Somma»', quanto: 'da 12 min', aspettaTe: false }
        ]}
        schede={schede}
        onApri={() => undefined}
      />
    )
    expect(html).toContain('Al lavoro · 2 · ◆ 1 aspetta te')
    expect(html).toContain('prova: «la copia»')
    expect(html).toContain('aspetta te · adesso')
    expect(html).toContain('da 12 min')
    expect(html).toContain('pan2-riassunto__riga--chiede')
    // p-2 non ha riquadro: la riga è spenta.
    expect(html.match(/disabled=""/g)).toHaveLength(1)
  })
  it('nessuno al lavoro: una riga', () => {
    expect(renderToStaticMarkup(<RiassuntoAlLavoro righe={[]} schede={[]} onApri={() => undefined} />)).toContain('Nessuna chat al lavoro.')
  })
  it('la conversazione ha il campo sempre pronto e scorre da sola; il riassunto sta in cima al centro', () => {
    const corpo = readFileSync('src/renderer/components/WorkspacePanoramica.tsx', 'utf8')
    expect(corpo).toContain('<ChatAutopilota autopilota={autopilota} onCambiato={onRicarica} soloConversazione campoPronto />')
    expect(corpo).toContain('<RiassuntoAlLavoro righe={riassuntoAlLavoro(autopilota, schede, ora)}')
    const css = readFileSync('src/renderer/console.css', 'utf8')
    expect(css).toContain('.pan2 { display: grid; grid-template-columns: minmax(380px, 44%) minmax(0, 1fr);')
    // Scorre solo il flusso con la conversazione; senza autopilota (il primo messaggio) scorre la colonna.
    expect(css).toMatch(/\.pan2-dialogo \{[^}]*overflow: auto;/)
    expect(css).toContain('.pan2-dialogo:has(.chatap--pronta) { overflow: hidden; }')
    expect(css).toMatch(/\.pan2-riassunto \{ position: sticky;/)
    // Con molte chat al lavoro il riassunto non si prende tutto il centro.
    expect(css).toMatch(/\.pan2-riassunto__elenco \{[^}]*max-height: 30vh; overflow-y: auto;/)
  })
  it('senza la Panoramica il diario è intero: niente doppioni con le righe corte; Elimina toccato presto non apre la conferma', () => {
    const chat = readFileSync('src/renderer/components/ChatAutopilota.tsx', 'utf8')
    expect(chat).toContain("const battute = soloConversazione ? messaggi : tutte.filter((b) => b.tono !== 'traguardo')")
    const azioni = readFileSync('src/renderer/components/AzioniChat.tsx', 'utf8')
    expect(azioni).toContain('if (motivo !== undefined) { setMisura({ byte: s.byte, motivo, chiusa: ')
  })
})
