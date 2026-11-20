/**
 * I percorsi del menu unico, scritti una volta sola: i testi per l'utente
 * («apri Impostazioni → …») li prendono da qui, così se una voce cambia nome
 * si cambia qui e `tests/renderer/testi-menu-esistenti.test.ts` controlla che
 * ogni sezione citata esista ancora.
 */
import { SEZIONI } from './impostazioni-struttura'
import { MENU_PRINCIPALE } from './menu-principale'

const IMP = 'Impostazioni'
const FRECCIA = ' → '

/** Il titolo di una sezione delle Impostazioni, com'è sul PC (il Drive lì si chiama «Account e Drive»). */
export const TITOLO_SEZIONE_PC = {
  aggiornamenti: 'Aggiornamenti',
  computer: 'Computer',
  chat: 'Chat e autopiloti',
  limiti: 'Limiti',
  drive: 'Account e Drive',
  aspetto: 'Aspetto',
  notifiche: 'Notifiche',
  info: 'Info e aiuto'
} as const

export const PERCORSO = {
  aggiornamenti: `${IMP}${FRECCIA}${TITOLO_SEZIONE_PC.aggiornamenti}`,
  /** Nome del computer, porte, accoppiamento dei telefoni, accesso da fuori la rete. */
  computer: `${IMP}${FRECCIA}${TITOLO_SEZIONE_PC.computer}`,
  client: `${IMP}${FRECCIA}${TITOLO_SEZIONE_PC.computer}${FRECCIA}Client`,
  fuoriRete: `${IMP}${FRECCIA}${TITOLO_SEZIONE_PC.computer}${FRECCIA}«Accetta il Client anche da fuori la rete locale»`,
  chat: `${IMP}${FRECCIA}${TITOLO_SEZIONE_PC.chat}`,
  pin: `${IMP}${FRECCIA}${TITOLO_SEZIONE_PC.chat}${FRECCIA}«PIN delle chat»`,
  quadernoPersonale: `${IMP}${FRECCIA}${TITOLO_SEZIONE_PC.chat}${FRECCIA}«Quaderno personale»`,
  limiti: `${IMP}${FRECCIA}${TITOLO_SEZIONE_PC.limiti}`,
  account: `${IMP}${FRECCIA}${TITOLO_SEZIONE_PC.drive}`,
  tornaComeEra: `${IMP}${FRECCIA}${TITOLO_SEZIONE_PC.drive}${FRECCIA}«Torna a com’era»`,
  notifiche: `${IMP}${FRECCIA}${TITOLO_SEZIONE_PC.notifiche}`,
  registro: `${IMP}${FRECCIA}${TITOLO_SEZIONE_PC.info}${FRECCIA}Registro`,
  errori: `${IMP}${FRECCIA}${TITOLO_SEZIONE_PC.info}${FRECCIA}Errori`,
  /** Gli altri PC, acceso o spento, installa là: la voce Computer della barra. */
  computerBarra: 'Computer',
  spostaQui: 'Progetti → «Sposta su questo PC»',
  salvataggio: 'Progetti → «Salvataggio e arrivo»',
  contenutoDrive: 'Progetti → «Il contenuto del Drive»'
} as const

/** Le sezioni delle Impostazioni per titolo (di qualunque posto), per i controlli. */
export function titoliSezioniImpostazioni(): string[] {
  return [...SEZIONI.map((s) => s.titolo), ...Object.values(TITOLO_SEZIONE_PC)]
}

/** I nomi delle voci della barra del PC, per i controlli. */
export function nomiVociBarra(): string[] {
  return MENU_PRINCIPALE.filter((v) => v.soloTelefono !== true).map((v) => v.nome)
}
