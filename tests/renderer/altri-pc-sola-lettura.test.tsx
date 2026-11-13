import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AutopilotaDiLa, CorpoPanoramica } from '../../src/renderer/components/WorkspacePanoramica'
import { RiquadroRemoto } from '../../src/renderer/components/RiquadroRemoto'
import { FornisciRegolaChatRemote } from '../../src/renderer/workspace-remoti'

/**
 * Sezione «Altri PC» (13/11, Nicholas: «a volte non c'è l'autopilota e posso
 * scrivere direttamente nelle chat»): un workspace di un altro PC si vede con
 * l'autopilota di là, senza campi che scrivono nelle chat o creano un
 * autopilota qui.
 */
const remoto = (stato: { giu: boolean; nessuno?: boolean }, cwdLa?: string): Parameters<typeof AutopilotaDiLa>[0]['remoto'] =>
  ({ pcId: 'pc-b', pcNome: 'Portatile', stato, onRileggi: () => undefined, ...(cwdLa !== undefined ? { cwdLa } : {}) })

describe('la Panoramica di un workspace di un altro PC', () => {
  it('mentre l’autopilota di là si carica: «Mi collego…», nessun campo del primo messaggio', () => {
    const html = renderToStaticMarkup(
      <CorpoPanoramica workspace="Fionda" remoto={remoto({ giu: false })} cwd={'X:\\non-usare'} schede={[]} onApri={() => undefined} onRicarica={() => undefined} onSoloMia={() => undefined} />
    )
    expect(html).toContain('Mi collego a Portatile…')
    expect(html).toContain('su Portatile')
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('Aspetta il tuo primo messaggio.')
  })
  it('se quel PC non risponde lo dice, e non offre di crearne uno qui', () => {
    const html = renderToStaticMarkup(<AutopilotaDiLa workspace="Fionda" remoto={remoto({ giu: true }, 'X:\\di-la')} />)
    expect(html).toContain('Portatile non risponde')
    expect(html).not.toContain('<textarea')
  })
  it('là senza autopilota: il primo messaggio lo fa nascere su quel PC', () => {
    const html = renderToStaticMarkup(<AutopilotaDiLa workspace="Fionda" remoto={remoto({ giu: false, nessuno: true }, 'X:\\di-la')} />)
    expect(html).toContain('<textarea')
    expect(html).toContain('Avvia su Portatile')
  })
  it('là senza autopilota e senza una cartella di là: niente campo', () => {
    const html = renderToStaticMarkup(<AutopilotaDiLa workspace="Fionda" remoto={remoto({ giu: false, nessuno: true })} />)
    expect(html).not.toContain('<textarea')
    expect(html).toContain('avvialo da quel PC')
  })
})

describe('la chat di un altro PC in sola lettura', () => {
  const chat = { pcId: 'pc-b', pcNome: 'Portatile', cwd: 'X:\\di-la', sessione: 'sessione-di-prova' }
  it('con la regola «sola lettura» non c’è campo né Manda', () => {
    const html = renderToStaticMarkup(
      <FornisciRegolaChatRemote value={{ scrivibile: false, workspaceRemoto: true, pcNome: 'Portatile' }}>
        <RiquadroRemoto paneId="p-1" remoto={chat} title="Prova" />
      </FornisciRegolaChatRemote>
    )
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('>Manda<')
    expect(html).toContain('la comanda l’autopilota su Portatile')
  })
  it('senza regola (workspace di qui senza autopilota) il campo resta', () => {
    const html = renderToStaticMarkup(<RiquadroRemoto paneId="p-1" remoto={chat} title="Prova" />)
    expect(html).toContain('<textarea')
  })
})
