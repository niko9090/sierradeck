import type { Autopilota } from '@shared/autopilota'

/**
 * Se sta aspettando una risposta *adesso*, mentre si prepara.
 *
 * Durante l'intervista la domanda aperta è scritta nel motivo: finché non c'è,
 * l'autopilota sta guardando il progetto per conto suo e non aspetta nessuno.
 */
function stachiedendo(a: Autopilota): boolean {
  return a.motivoSospensione !== undefined && a.motivoSospensione.trim() !== ''
}

/**
 * Il LED di un autopilota: la sua classe e cosa dice a chi ci passa sopra.
 *
 * Quattro colori e nient'altro, perché a due metri si distinguono quattro
 * colori e non otto sfumature. «Finito» si **spegne** invece di diventare
 * verde: un lavoro concluso non deve chiamare l'attenzione come uno in corso,
 * e verde ovunque significherebbe verde da nessuna parte.
 *
 * Verde vuol dire **una macchina in moto**, ambra **tocca a te**: per questo
 * chi si prepara è verde finché non ha davvero fatto una domanda. Prima era
 * ambra sempre — lampeggiava anche mentre leggeva i file per conto suo — ed è
 * il modo più rapido per insegnare a non guardare più i LED.
 */
export function ledDi(a: Autopilota): { classe: string; titolo: string } {
  const classe =
    a.stato === 'lavoro' || (a.stato === 'intervista' && !stachiedendo(a))
      ? 'led--lavoro'
      // «pronto» è ambra come l'attesa, ed è la stessa cosa: la macchina è
      // ferma e aspetta te. Verde direbbe che sta lavorando, e non ha ancora
      // scritto una riga.
      : a.stato === 'attesa' || a.stato === 'intervista' || a.stato === 'pronto'
        ? 'led--attesa'
        : a.stato === 'finito'
          ? 'led--finito'
          : 'led--fermo'

  const nome = a.nome.trim() !== '' ? a.nome : a.obiettivo
  const coda = a.motivoSospensione !== undefined && a.stato !== 'finito'
    ? ` — ${a.motivoSospensione}`
    : ''
  return { classe, titolo: `${nome}: ${a.stato}${coda}` }
}
