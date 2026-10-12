import { chiusaDopo, giudicaRiquadroRemoto, rigaChiusaACasa, rigaNonApertaACasa, type ChiusaDaTe } from '@shared/chiuse'
import { rimuoviSessioni, type Archivio } from '@shared/workspace'

/**
 * Il workspace rispecchia il PC di casa (0.64.2) anche quando **nessuna
 * finestra lo mostra**.
 *
 * Il riquadro remoto si giudica da solo a ogni giro (`RiquadroRemoto.tsx`), ma
 * solo se è a schermo. Un workspace che Nicholas non sta guardando — MT5,
 * mentre lavora su un altro — teneva il riquadro di una chat chiusa sul
 * portatile fino alla volta dopo in cui lo apriva. Qui il Core fa lo stesso
 * giudizio sui riquadri remoti salvati nei workspace nascosti, con la stessa
 * funzione (`giudicaRiquadroRemoto`), e li toglie dall'archivio.
 *
 * Non tocca mai il PC di casa: gli chiede solo `/api/stato`. Se non risponde
 * non si toglie niente.
 */

export type StatoDiCasa = { chat: { sessione?: string }[]; chiuse?: ChiusaDaTe[]; salvate?: string[] }

export type DipendenzeRispecchia = {
  leggi: () => Archivio | undefined
  scrivi: (a: Archivio) => void
  /** I workspace a schermo adesso: quelli li giudica il riquadro stesso. */
  mostrati: () => Set<string>
  statoDi: (pcId: string) => Promise<StatoDiCasa>
  nomePc: (pcId: string, salvato: string) => string
  /** L'id di questo PC: un riquadro «remoto» che punta qui non ha una casa altrove da chiedere. */
  io?: () => string
  /** La casa memorizzata di una chat (id del PC): si toglie solo se è proprio il PC guardato (0.67.0). */
  casaDi?: (sessione: string) => string | undefined
  log: (riga: string) => void
  /** L'archivio è cambiato: le finestre aggiornano l'elenco dei workspace. */
  cambiato?: (a: Archivio) => void
  adesso?: () => number
}

export type Tolto = { workspace: string; sessione: string; titolo: string; pcId: string; perche: 'chiusa' | 'togli' }

export function creaRispecchia(d: DipendenzeRispecchia) {
  const adesso = d.adesso ?? Date.now
  /** I PC che non hanno risposto, già detti nel registro: una riga sola finché non tornano. */
  const muti = new Set<string>()

  return {
    async giro(): Promise<Tolto[]> {
      const prima = d.leggi()
      if (prima === undefined) return []
      const mostrati = d.mostrati()
      // I riquadri remoti dei workspace nascosti, per PC di casa.
      const perPc = new Map<string, { workspace: string; sessione: string; titolo: string; pcNome: string; dal?: string }[]>()
      for (const w of prima.workspace) {
        if (mostrati.has(w.nome)) continue
        for (const layout of Object.values(w.perSlot)) {
          for (const p of layout.panes) {
            const r = p.remoto
            if (r === undefined || r.sessione === undefined || r.sessione === '') continue
            if (d.io !== undefined && r.pcId === d.io()) continue
            const voci = perPc.get(r.pcId) ?? []
            voci.push({ workspace: w.nome, sessione: r.sessione, titolo: p.title, pcNome: r.pcNome, ...(r.dal !== undefined ? { dal: r.dal } : {}) })
            perPc.set(r.pcId, voci)
          }
        }
      }
      const tolti: Tolto[] = []
      for (const [pcId, voci] of perPc) {
        let st: StatoDiCasa
        try {
          st = await d.statoDi(pcId)
          muti.delete(pcId)
        } catch (e) {
          if (!muti.has(pcId)) {
            muti.add(pcId)
            d.log(`[apertura] ${d.nomePc(pcId, voci[0]?.pcNome ?? pcId)} non raggiungibile: i suoi riquadri nei workspace nascosti restano come sono (${e instanceof Error ? e.message : String(e)})`)
          }
          continue
        }
        for (const v of voci) {
          const chiusa = chiusaDopo(st.chiuse, v.sessione, v.dal)
          const g = giudicaRiquadroRemoto({
            trovata: st.chat.some((c) => c.sessione === v.sessione),
            sessione: v.sessione,
            chiusaRegistrata: chiusa !== undefined,
            salvateLa: st.salvate,
            apertoIl: v.dal !== undefined ? Date.parse(v.dal) : undefined,
            ultimaAzioneIl: undefined,
            inAttesa: false,
            adesso: adesso(),
            casaCerta: d.casaDi?.(v.sessione) === pcId
          })
          if (g !== 'togli' && g !== 'chiusa') continue
          const nome = d.nomePc(pcId, v.pcNome)
          d.log(`[apertura] «${v.titolo !== '' ? v.titolo : v.sessione.slice(0, 8)}» (${v.sessione.slice(0, 8)}) dal workspace «${v.workspace}», che nessuna finestra mostra: ${g === 'chiusa' && chiusa !== undefined ? rigaChiusaACasa(nome, chiusa.il) : rigaNonApertaACasa(nome)}`)
          tolti.push({ workspace: v.workspace, sessione: v.sessione, titolo: v.titolo, pcId, perche: g })
        }
      }
      if (tolti.length === 0) return []
      // Si rilegge: nel frattempo una finestra può aver salvato. Si tolgono solo
      // i riquadri remoti giudicati, e solo dai workspace ancora nascosti.
      const ora = d.leggi()
      if (ora === undefined) return []
      const ancoraNascosti = d.mostrati()
      const daTogliere = new Map<string, Set<string>>()
      for (const t of tolti) {
        if (ancoraNascosti.has(t.workspace)) continue
        const s = daTogliere.get(t.workspace) ?? new Set<string>()
        s.add(t.sessione)
        daTogliere.set(t.workspace, s)
      }
      if (daTogliere.size === 0) return []
      const dopo: Archivio = {
        ...ora,
        workspace: ora.workspace.map((w) => {
          const s = daTogliere.get(w.nome)
          if (s === undefined) return w
          const perSlot = Object.fromEntries(Object.entries(w.perSlot).map(([k, l]) => {
            const remote = new Set(l.panes.filter((p) => p.remoto !== undefined && s.has(p.sessionUuid)).map((p) => p.sessionUuid))
            return [k, remote.size > 0 ? rimuoviSessioni(l, remote) : l]
          }))
          return { ...w, perSlot }
        })
      }
      d.scrivi(dopo)
      d.cambiato?.(dopo)
      return tolti.filter((t) => daTogliere.get(t.workspace)?.has(t.sessione) === true)
    }
  }
}
