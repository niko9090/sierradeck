import { nomeNormalizzato, type GruppoProgetti } from './progetti-unificati'
import type { CasaChat } from './una-casa'

/**
 * Dove sta il progetto di un workspace, e se si può creare qui (0.80.0).
 *
 * Il caso del 19/10: aprire su questo PC un workspace il cui progetto vive su
 * un altro PC creava qui una cartella vuota e registrava questo PC come
 * residente, «deciso da Nicholas». Il controllo guardava solo il registro dei
 * progetti per nome. Adesso un progetto è «altrove» anche quando lo dice la
 * residenza, quando i riquadri del workspace guardano un altro PC o quando un
 * altro PC ha un workspace con lo stesso nome: in tutti questi casi qui non
 * nasce niente.
 */
export type SceltaCartellaWorkspace =
  | { tipo: 'qui'; cartella: string }
  | { tipo: 'altrove'; pcNome: string; perche: string }
  | { tipo: 'crea'; cartella: string }
  | { tipo: 'niente'; perche: string }

export function sceltaCartellaWorkspace(p: {
  nome: string
  io: { id: string }
  gruppi: GruppoProgetti[]
  /** La residenza registrata di una chiave (`progetto:<id>`). */
  casaDi: (chiave: string) => Pick<CasaChat, 'pc' | 'pcNome'> | undefined
  /** I riquadri del workspace che guardano un PC (vuoto se il workspace non c'è). */
  remoti: { pcId: string; pcNome: string }[]
  /** I battiti degli altri PC, con i loro workspace. */
  battiti: { pcId: string; nome: string; workspace?: string[] }[]
  esiste: (percorso: string) => boolean
  /** La cartella che nascerebbe qui, e se va bene per un progetto. */
  cartellaNuova: string
  valida: boolean
}): SceltaCartellaWorkspace {
  const n = nomeNormalizzato(p.nome)
  if (p.nome.trim() === '' || n === nomeNormalizzato('Predefinito')) return { tipo: 'niente', perche: 'il workspace predefinito non ha un progetto' }
  const nomeDi = (pc: string): string => p.battiti.find((b) => b.pcId === pc)?.nome ?? pc.slice(0, 8)
  const g = p.gruppi.find((x) => nomeNormalizzato(x.nome) === n)
  const qui = g?.percorsi.find((x) => x.pc === p.io.id && p.esiste(x.percorso))?.percorso
  if (qui !== undefined) return { tipo: 'qui', cartella: qui }
  if (g !== undefined) {
    for (const id of g.ids) {
      const casa = p.casaDi(`progetto:${id}`)
      if (casa !== undefined && casa.pc !== p.io.id) return { tipo: 'altrove', pcNome: casa.pcNome || nomeDi(casa.pc), perche: 'il progetto risiede là' }
    }
    const fuori = g.percorsi.find((x) => x.pc !== p.io.id)
    if (fuori !== undefined) return { tipo: 'altrove', pcNome: nomeDi(fuori.pc), perche: 'il progetto ha la sua cartella là' }
  }
  const remoto = p.remoti.find((r) => r.pcId !== p.io.id)
  if (remoto !== undefined) return { tipo: 'altrove', pcNome: remoto.pcNome, perche: 'le chat del workspace lavorano là' }
  const altroPc = p.battiti.find((b) => b.pcId !== p.io.id && (b.workspace ?? []).some((w) => nomeNormalizzato(w) === n))
  if (altroPc !== undefined) return { tipo: 'altrove', pcNome: altroPc.nome, perche: 'quel PC ha un workspace con lo stesso nome' }
  if (!p.valida) return { tipo: 'niente', perche: `la cartella ${p.cartellaNuova} non va bene per un progetto` }
  return { tipo: 'crea', cartella: p.cartellaNuova }
}
