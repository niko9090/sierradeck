/**
 * Le scorciatoie che valgono adesso, lette da chi non ha le preferenze sotto
 * mano.
 *
 * Il terminale sta in fondo all'albero (App → Console → Mosaic → Terminal) e
 * deve sapere, a ogni tasto, se quella pressione è una scorciatoia: in quel
 * caso la lascia passare invece di mandarla a Claude Code. Farglielo arrivare
 * di proprietà in proprietà è la strada che in `preferenze-vive.ts` ha già
 * fatto perdere un interruttore per strada; qui la tabella viva sta in un posto
 * solo, la console la aggiorna quando cambiano le preferenze, tutti la leggono.
 */
import {
  azionePer, combinazioneDi, SCORCIATOIE_PREDEFINITE,
  type Azione, type Scorciatoie, type TastoPremuto
} from '@shared/scorciatoie'

let vive: Scorciatoie = { ...SCORCIATOIE_PREDEFINITE }

/** Mentre il pannello «ascolta» un tasto nuovo, nessuna scorciatoia scatta. */
let sospese = false

export function impostaScorciatoie(s: Scorciatoie): void {
  vive = { ...s }
}

export function scorciatoieVive(): Scorciatoie {
  return vive
}

export function sospendiScorciatoie(valore: boolean): void {
  sospese = valore
}

/** L'azione di una pressione, o niente se non è una scorciatoia (o se sono sospese). */
export function azioneDelTasto(e: TastoPremuto): Azione | undefined {
  if (sospese) return undefined
  return azionePer(vive, combinazioneDi(e))
}
