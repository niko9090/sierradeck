import { messaggioChatAltrove } from '@shared/posta'

export type CasaAltroveDi = (sessionUuid: string, cwd: string) => { id: string; nome: string; motivo: string } | undefined

/**
 * Il proprietario del progetto, chiesto **prima** della convalida dello spawn.
 *
 * `validateSpawnRequest` rifiuta una cartella assente con «cwd non accessibile»;
 * ma un progetto che vive su un altro PC qui la cartella non ce l'ha, ed è il
 * caso normale: la risposta giusta è «vive su <PC>», non una riga rossa
 * (lotto errori 20261101084702). Ritorna il messaggio da lanciare, o `undefined`
 * se il progetto non è di un altro PC (o la richiesta è malformata: ci pensa la convalida).
 */
export function rifiutoCasaAltrove(raw: unknown, casaAltroveDi: CasaAltroveDi): string | undefined {
  const g = (typeof raw === 'object' && raw !== null ? raw : {}) as { sessionUuid?: unknown; cwd?: unknown }
  if (typeof g.sessionUuid !== 'string' || g.sessionUuid === '' || typeof g.cwd !== 'string' || g.cwd === '') return undefined
  const fuori = casaAltroveDi(g.sessionUuid, g.cwd)
  if (fuori === undefined) return undefined
  return messaggioChatAltrove({
    cwd: g.cwd, pc: { id: fuori.id, nome: fuori.nome }, sessionUuid: g.sessionUuid, casa: true,
    perche: `il progetto vive su ${fuori.nome}${fuori.motivo !== '' ? ` (${fuori.motivo})` : ''}`
  })
}
