import { parentPort } from 'node:worker_threads'
import { preparaBlocco, applicaBlocco } from './lavoro'
import type { Progresso } from './motore'

/**
 * Il thread separato della sincronizzazione.
 *
 * Riceve una richiesta (preparare il blocco da caricare, o applicare quello
 * scaricato), fa il lavoro pesante — compressione, cifratura, disco — e rimanda
 * il risultato, spargendo intanto il progresso. Gira qui, non nel processo
 * principale, così l'interfaccia non si blocca mai, per quanti dati ci siano.
 */

const porta = parentPort
if (porta === null) throw new Error('sync-worker avviato senza parentPort')

type MsgPrepara = { tipo: 'prepara'; dati: string; radiceClaude: string; maestra: ArrayBuffer; adesso: string }
type MsgApplica = { tipo: 'applica'; dati: string; radiceClaude: string; maestra: ArrayBuffer; blocco: ArrayBuffer }
type Messaggio = MsgPrepara | MsgApplica

porta.on('message', (msg: Messaggio) => {
  const onProgresso = (p: Progresso): void => { porta.postMessage({ tipo: 'progresso', p }) }
  void (async () => {
    try {
      if (msg.tipo === 'prepara') {
        const { cifrato, voci } = await preparaBlocco(
          { dati: msg.dati, radiceClaude: msg.radiceClaude, maestra: Buffer.from(msg.maestra), adesso: msg.adesso },
          onProgresso
        )
        const ab = cifrato.buffer.slice(cifrato.byteOffset, cifrato.byteOffset + cifrato.byteLength) as ArrayBuffer
        porta.postMessage({ tipo: 'fatto', cifrato: ab, voci }, [ab])
      } else {
        const esito = await applicaBlocco(
          { dati: msg.dati, radiceClaude: msg.radiceClaude, maestra: Buffer.from(msg.maestra), blocco: Buffer.from(msg.blocco) },
          onProgresso
        )
        porta.postMessage({ tipo: 'fatto', esito })
      }
    } catch (e) {
      porta.postMessage({ tipo: 'errore', errore: e instanceof Error ? e.message : String(e) })
    }
  })()
})
