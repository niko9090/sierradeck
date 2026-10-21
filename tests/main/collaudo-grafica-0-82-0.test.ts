import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { paginaClient } from '../../src/main/client-pagina'
import { ultimaRigaDalloSchermo, ultimaRigaUtile } from '../../src/renderer/ultime-righe'
import { rigaDiStato } from '@shared/polso-chat'
import { testoMigrazione } from '@shared/migrazione-elenco'
import { componiNuovaChat } from '../../src/renderer/nuova-chat'
import { chatDietro } from '../../src/renderer/memoria-workspace'
import type { LayoutSalvato, PaneSalvato } from '@shared/workspace'

/**
 * Collaudo della grafica 0.82.0 (c-41): i cinque difetti trovati da c-32 nella
 * sezione «Grafica: prima e dopo (0.79.0 → 0.81.1)» dell'analisi 0.80.0.
 *
 * Il collaudo non corregge il prodotto. Un difetto ancora aperto è scritto come
 * `it.fails`: dice cosa deve succedere, e oggi fallisce. Chi corregge il
 * difetto vede questo test diventare rosso e toglie `.fails`.
 * c-43 (0.82.0) li ha corretti tutti e cinque: nessun `.fails` resta.
 * Dettagli, passi e righe in `.sierradeck/quaderno/collaudo-grafica-0-82-0.md`.
 */
const html = paginaClient()
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
const leggi = (f: string): string => readFileSync(f, 'utf8')

describe('difetto 1: le chat del workspace dietro non sono «chiusa»', () => {
  // Pagina e app leggono `deps.chat()` = `chatDiQui()` (index.ts), che ha solo
  // le chat che la finestra racconta (il workspace davanti) e il sottofondo.
  // Serve una prova con due workspace e i terminali vivi: va fatta nella copia.
  // c-43: la finestra annuncia anche le chat vive dei workspace tenuti in
  // memoria (`chatDietro`), con il loro workspace e `dietro`; la pagina le mette
  // nel loro gruppo, accese. Provato anche nella copia con due workspace.
  const funzione = (nome: string): string => {
    const inizio = script.indexOf(`function ${nome}(`)
    let profondita = 0
    for (let i = script.indexOf('{', inizio); i < script.length; i += 1) {
      if (script[i] === '{') profondita += 1
      else if (script[i] === '}' && --profondita === 0) return script.slice(inizio, i + 1)
    }
    throw new Error(`${nome} non trovata`)
  }
  const pane = (id: string, o: Record<string, unknown> = {}): PaneSalvato => ({ id, sessionUuid: `s-${id}`, cwd: 'C:/p', title: id, ...o }) as PaneSalvato

  it('chatDietro: i terminali accesi dei workspace dietro, non quello davanti né ibernate o remote', () => {
    const vivi = [
      { nome: 'Davanti', layout: { panes: [pane('a', { ptyId: 'pa' })] } as unknown as LayoutSalvato },
      { nome: 'Dietro', layout: { panes: [pane('b', { ptyId: 'pb' }), pane('c'), pane('d', { ptyId: 'pd', ibernata: true }), pane('e', { ptyId: 'pe', remoto: { pcId: 'x', pcNome: 'x', cwd: 'C:/p' } })] } as unknown as LayoutSalvato }
    ]
    expect(chatDietro(vivi, 'Davanti').map((d) => [d.workspace, d.pane.id, d.pane.ptyId])).toEqual([['Dietro', 'b', 'pb']])
  })

  it('una chat viva del workspace dietro non compare fra le salvate «chiusa · tocca per riaprirla»', () => {
    const gruppi = new Function(`${funzione('gruppiChat')}; return gruppiChat`)() as (s: unknown) => { workspace: string; voci: { viva?: { id: string }; salvata?: { sessione: string } }[] }[]
    const s = {
      chat: [
        { id: 'a', sessione: 'sa', workspace: 'Davanti', viva: true },
        // Viva dietro: salvata là, e una nuova non ancora nell'archivio.
        { id: 'b', sessione: 'sb', workspace: 'Dietro', viva: true, dietro: true },
        { id: 'n', sessione: 'sn', workspace: 'Dietro', viva: true, dietro: true }
      ],
      workspace: { nomi: ['Davanti', 'Dietro'], attivo: 'Davanti', chat: [{ sessione: 'sb', workspace: 'Dietro' }, { sessione: 'sz', workspace: 'Dietro' }] }
    }
    const dietro = gruppi(s).find((g) => g.workspace === 'Dietro')!
    expect(dietro.voci.filter((v) => v.viva).map((v) => v.viva!.id)).toEqual(['b', 'n'])
    expect(dietro.voci.filter((v) => v.salvata).map((v) => v.salvata!.sessione)).toEqual(['sz'])
    expect(gruppi(s).find((g) => g.workspace === 'Davanti')!.voci.map((v) => v.viva?.id)).toEqual(['a'])
  })
})

describe('difetto 2: «IN MOTO» conta solo quello che lavora', () => {
  const polso = script.slice(script.indexOf('const polso ='), script.indexOf('const calma ='))
  it('il titolo c è ancora', () => {
    expect(polso).toContain('IN MOTO')
  })
  it('il numero non somma tutte le chat, ferme comprese', () => {
    expect(polso).not.toContain("(inMoto.length + (s.chat || []).length) + '</span></div>'")
  })
})

describe('difetto 3: sotto il nome di una chat, niente righe vuote di interfaccia', () => {
  it('dallo schermo: il solo «›» o «❯» del campo vuoto non è la riga', () => {
    expect(ultimaRigaDalloSchermo(['Faro, Vetrina, Nodo', '›'])).toBe('Faro, Vetrina, Nodo')
    expect(ultimaRigaDalloSchermo(['Faro, Vetrina, Nodo', '❯ '])).toBe('Faro, Vetrina, Nodo')
  })
  it('dallo schermo: la riga di stato con contesto e limiti non è la riga', () => {
    const stato = rigaDiStato({ sessione: 's', quando: 0, modello: 'Opus 5.5', contesto: { percento: 3, usati: 1, dimensione: 2 }, costoUsd: 0 }, 0)
    expect(ultimaRigaDalloSchermo(['Faro', stato])).toBe('Faro')
  })
  it('dallo schermo: la riga di stato con solo modello e costo («Opus 5.5 · 0.00 $») non è la riga', () => {
    const stato = rigaDiStato({ sessione: 's', quando: 0, modello: 'Opus 5.5', costoUsd: 0 }, 0)
    expect(stato).toBe('Opus 5.5 · 0.00 $')
    expect(ultimaRigaDalloSchermo(['Faro', stato])).toBe('Faro')
  })
  it('dal flusso (quando lo schermo non c è): il solo «›» non è la riga', () => {
    expect(ultimaRigaUtile('Faro, Vetrina, Nodo\n›\n')).toBe('Faro, Vetrina, Nodo')
  })
})

describe('difetto 4: la trasformazione non promette autopiloti che Autopiloti non mostra', () => {
  // I dormienti della Panoramica non stanno in Autopiloti (migrazione-elenco.ts),
  // che dice «Nessun autopilota»: la riga non li deve chiamare «autopiloti nuovi».
  const fatta = (n: number): string => testoMigrazione({ stato: 'fatta', dormienti: Array.from({ length: n }, (_, i) => ({ workspace: `ws-${i}` })) } as unknown as Parameters<typeof testoMigrazione>[0])
  it('con zero nuovi la frase non si contraddice', () => {
    expect(fatta(0)).toBe('Fatta: ogni workspace aveva già il suo autopilota.')
  })
  it('PC: con due dormienti non dice «2 autopiloti nuovi»', () => {
    expect(fatta(2)).not.toMatch(/autopilot[ai] nuov/)
    expect(fatta(1)).not.toMatch(/autopilot[ai] nuov/)
  })
  it('pagina e app dicono la stessa cosa del PC', () => {
    expect(script).not.toMatch(/autopiloti nuovi, fermi/)
    expect(leggi('android/app/src/main/java/it/ferrariconsulenze/sierradeck/Migrazione.kt')).not.toMatch(/autopiloti nuovi, fermi/)
  })
})

describe('difetto 5: Nuova chat non si contraddice', () => {
  const basi = { documenti: 'D:\\Documenti', progetti: 'D:\\Progetti' }
  const modale = leggi('src/renderer/components/ModaleNuovaChat.tsx')
  it('fra i progetti un nome vuoto vale «Nuova chat», come promette la riga (0.82.0, c-43)', () => {
    const e = componiNuovaChat({ nome: '', posto: 'progetti', altrove: '', basi })
    expect(e).toMatchObject({ ok: true, nome: 'Nuova chat', cartella: 'D:\\Progetti\\Nuova chat', daCreare: true })
  })
  it('se il nome vuoto è rifiutato, sotto il campo non si promette «La cartella si chiamerà «Nuova chat»»', () => {
    const e = componiNuovaChat({ nome: '', posto: 'progetti', altrove: '', basi })
    // O il nome vuoto vale «Nuova chat» (come promette la riga), o la riga
    // sotto il campo guarda se il nome è vuoto prima di promettere.
    const riga = modale.slice(modale.indexOf('<div className="misura"'), modale.indexOf('</div>', modale.indexOf('<div className="misura"')))
    expect(e.ok || /nome(\.trim\(\))? === ''/.test(riga)).toBe(true)
  })
})
