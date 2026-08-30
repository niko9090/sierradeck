/**
 * Sfogliare un elenco di file: ordinare, filtrare, scegliere, andare avanti e
 * indietro.
 *
 * Sta qui, senza niente di React dentro, per la stessa ragione per cui ci sta
 * il confronto fra i due lati: è la parte che si sbaglia in silenzio. Un
 * ordinamento che mette `file10` prima di `file2`, una selezione con Maiusc
 * che salta una riga quando l'elenco è ordinato al contrario, una cronologia
 * che dopo «indietro» e un salto nuovo tiene ancora il ramo vecchio — sono
 * tutti difetti che a occhio non si vedono, e che a mano non si provano.
 *
 * Le due colonne del pannello usano queste stesse funzioni. È deliberato: il
 * lato locale e il lato remoto devono comportarsi **identici**, perché per chi
 * li usa sono lo stesso gesto fatto da due parti, e una differenza fra i due si
 * paga in dubbi ogni volta.
 */

/** Quel poco che serve per ordinare e filtrare. Vale per un file di qua e di là. */
export type VoceSfogliabile = {
  nome: string
  percorso: string
  cartella: boolean
  dimensione: number
  /** Ultima modifica, in millisecondi epoch. */
  quando: number
}

export type PerCosa = 'nome' | 'dimensione' | 'quando'
export type Ordine = { per: PerCosa; verso: 'su' | 'giu' }

export const ORDINE_PREDEFINITO: Ordine = { per: 'nome', verso: 'su' }

/**
 * Il confronto fra due nomi di file, come lo farebbe una persona.
 *
 * `numeric` è la parte che conta: senza, `parte10.txt` viene prima di
 * `parte2.txt` perché «1» viene prima di «2», e un elenco di file numerati —
 * cioè quasi ogni cartella di backup, di log, di episodi — risulta mescolato
 * senza che sia colpa di nessuno. `sensitivity: 'base'` mette `Alfa` e `alfa`
 * vicini invece che in due blocchi lontani, che è come li cerca l'occhio.
 */
const CONFRONTA_NOMI = new Intl.Collator('it', { numeric: true, sensitivity: 'base' })

/**
 * Ordina, con le cartelle sempre prima.
 *
 * Le cartelle in testa **non seguono il verso**: sono la struttura, non il
 * contenuto, e chi rovescia l'ordine per data vuole i file recenti in cima, non
 * ritrovarsi le cartelle in fondo dove non le cerca nessuno. È quello che fa
 * ogni gestore di file, ed è il motivo per cui non ci si pensa mai.
 *
 * A parità — due file della stessa dimensione, o dello stesso secondo — decide
 * il nome: un ordine che cambia a ogni ricarico, a parità di tutto il resto,
 * fa ballare le righe sotto il puntatore.
 */
export function ordinaVoci<T extends VoceSfogliabile>(voci: T[], ordine: Ordine): T[] {
  const segno = ordine.verso === 'su' ? 1 : -1
  return [...voci].sort((a, b) => {
    if (a.cartella !== b.cartella) return a.cartella ? -1 : 1
    const primo = ordine.per === 'nome'
      ? CONFRONTA_NOMI.compare(a.nome, b.nome)
      : ordine.per === 'dimensione'
        ? a.dimensione - b.dimensione
        : a.quando - b.quando
    if (primo !== 0) return primo * segno
    return CONFRONTA_NOMI.compare(a.nome, b.nome)
  })
}

/**
 * Il prossimo ordine dopo un clic sull'intestazione.
 *
 * Stessa colonna: si rovescia. Colonna diversa: si parte dal verso che serve —
 * dalla A per i nomi, dal più grande e dal più recente per gli altri due,
 * perché è quello che si sta cercando quando si clicca «dimensione» o «data».
 * Partire sempre crescente costringe a due clic ogni volta.
 */
export function prossimoOrdine(attuale: Ordine, per: PerCosa): Ordine {
  if (attuale.per === per) return { per, verso: attuale.verso === 'su' ? 'giu' : 'su' }
  return { per, verso: per === 'nome' ? 'su' : 'giu' }
}

export type Filtro = {
  /** Mostra solo i nomi che contengono questo. Vuoto: tutto. */
  testo?: string
  /** Se mostrare anche i file che cominciano per punto. */
  nascosti?: boolean
}

/**
 * Toglie quello che non si sta cercando.
 *
 * **Le cartelle non le filtra il testo.** Sembra sbagliato e non lo è: il
 * filtro serve a trovare un file dentro una cartella affollata, e nascondere
 * le cartelle mentre lo si cerca toglie l'unica via per andare a cercarlo
 * altrove. FileZilla fa lo stesso, e nessuno se ne accorge — che è il segno
 * che è giusto.
 *
 * I nascosti invece spariscono davvero, cartelle comprese: `.git` e
 * `node_modules` non sono posti dove si va a mano, e vederli sempre in testa
 * all'elenco è rumore su ogni progetto.
 */
export function filtraVoci<T extends VoceSfogliabile>(voci: T[], filtro: Filtro = {}): T[] {
  const cerca = (filtro.testo ?? '').trim().toLowerCase()
  return voci.filter((v) => {
    if (filtro.nascosti !== true && v.nome.startsWith('.')) return false
    if (cerca === '' || v.cartella) return true
    return v.nome.toLowerCase().includes(cerca)
  })
}

/** Quello che si vede davvero: filtrato e poi ordinato. */
export function vociVisibili<T extends VoceSfogliabile>(
  voci: T[],
  ordine: Ordine,
  filtro: Filtro = {}
): T[] {
  return ordinaVoci(filtraVoci(voci, filtro), ordine)
}

export type Selezione = {
  /** I percorsi scelti. */
  presi: string[]
  /**
   * L'ultima riga toccata senza Maiusc: è da lì che parte un intervallo.
   *
   * Va ricordata, e non basta «l'ultimo preso»: dopo un Maiusc l'ultimo preso è
   * la fine dell'intervallo, e un secondo Maiusc dovrebbe ripartire dallo
   * stesso punto d'appoggio — non dalla fine di prima. Senza, tenendo premuto
   * Maiusc e cliccando su e giù, la selezione cresce e non si restringe mai.
   */
  ancora?: string
}

/**
 * La scelta con Ctrl e Maiusc, come in qualunque elenco di file.
 *
 * Non è un vezzo: chi apre un pannello di file ha già le dita abituate, e un
 * elenco che si comporta diversamente costringe a scoprire da capo una cosa
 * che sapeva già fare.
 *
 * L'intervallo si conta sull'elenco **come si vede adesso** — filtrato e
 * ordinato — non su quello che è arrivato dal disco: chi tiene premuto Maiusc
 * sta indicando due righe sullo schermo, e prendere quello che sta in mezzo in
 * un altro ordine sceglierebbe file che non ha mai visto.
 */
export function nuovaSelezione(
  visibili: VoceSfogliabile[],
  attuale: Selezione,
  cliccato: string,
  tasti: { ctrl?: boolean; shift?: boolean } = {}
): Selezione {
  if (tasti.shift === true && attuale.ancora !== undefined) {
    const da = visibili.findIndex((v) => v.percorso === attuale.ancora)
    const a = visibili.findIndex((v) => v.percorso === cliccato)
    if (da !== -1 && a !== -1) {
      const [primo, ultimo] = da <= a ? [da, a] : [a, da]
      const dentro = visibili.slice(primo, ultimo + 1).map((v) => v.percorso)
      // L'ancora **non si sposta**: è il punto fisso da cui l'intervallo si
      // allarga e si stringe finché Maiusc resta premuto.
      return { presi: dentro, ancora: attuale.ancora }
    }
  }
  if (tasti.ctrl === true) {
    const gia = attuale.presi.includes(cliccato)
    return {
      presi: gia ? attuale.presi.filter((p) => p !== cliccato) : [...attuale.presi, cliccato],
      ancora: cliccato
    }
  }
  return { presi: [cliccato], ancora: cliccato }
}

/** Prende tutto quello che si vede. Non quello che c'è: quello che si vede. */
export function prendiTutto(visibili: VoceSfogliabile[]): Selezione {
  return {
    presi: visibili.map((v) => v.percorso),
    ...(visibili.at(-1) !== undefined ? { ancora: visibili[visibili.length - 1]!.percorso } : {})
  }
}

/**
 * Dove sei stato, per poterci tornare.
 *
 * Un client di file senza «indietro» costringe a risalire cartella per
 * cartella ogni volta che si sbaglia strada, e su un server con percorsi
 * lunghi è la cosa che stanca prima.
 */
export type Cronologia = {
  /** I percorsi visitati, dal più vecchio al più recente. */
  voci: string[]
  /** Dove siamo dentro `voci`. */
  indice: number
}

export function cronologiaVuota(percorso?: string): Cronologia {
  return percorso === undefined ? { voci: [], indice: -1 } : { voci: [percorso], indice: 0 }
}

/**
 * Un posto nuovo.
 *
 * **Quello che stava davanti si butta.** È la regola di ogni cronologia: se
 * sei tornato indietro di tre passi e poi prendi un'altra strada, i tre passi
 * di prima non sono più un futuro — tenerli darebbe un «avanti» che porta in
 * un ramo che non hai scelto.
 *
 * Tornare dove si è già non conta come passo: ricaricare la stessa cartella
 * riempirebbe la cronologia di copie della stessa riga.
 */
export function vaiA(c: Cronologia, percorso: string): Cronologia {
  if (c.voci[c.indice] === percorso) return c
  const prima = c.voci.slice(0, c.indice + 1)
  return { voci: [...prima, percorso], indice: prima.length }
}

export function puoIndietro(c: Cronologia): boolean { return c.indice > 0 }
export function puoAvanti(c: Cronologia): boolean { return c.indice < c.voci.length - 1 }

export function indietro(c: Cronologia): { storia: Cronologia; percorso?: string } {
  if (!puoIndietro(c)) return { storia: c }
  const indice = c.indice - 1
  return { storia: { ...c, indice }, percorso: c.voci[indice] as string }
}

export function avanti(c: Cronologia): { storia: Cronologia; percorso?: string } {
  if (!puoAvanti(c)) return { storia: c }
  const indice = c.indice + 1
  return { storia: { ...c, indice }, percorso: c.voci[indice] as string }
}

/**
 * I permessi scritti come li scrive `ls`: `rwxr-xr-x`.
 *
 * Serve accanto al numero, non al posto suo. Il numero è quello che si digita
 * e quello che si trova scritto nelle istruzioni («mettilo a 755»); le lettere
 * sono quelle che si leggono senza contare a mente, ed è come ci si accorge di
 * aver scritto 655 invece di 755 — un numero plausibile che toglie l'esecuzione
 * al proprietario.
 */
export function permessiInLettere(modo: number): string {
  const terzina = (bit: number): string =>
    `${(bit & 4) !== 0 ? 'r' : '-'}${(bit & 2) !== 0 ? 'w' : '-'}${(bit & 1) !== 0 ? 'x' : '-'}`
  return `${terzina((modo >> 6) & 7)}${terzina((modo >> 3) & 7)}${terzina(modo & 7)}`
}

/**
 * Legge un numero di permessi scritto a mano, o `undefined` se non lo è.
 *
 * Solo tre o quattro cifre da 0 a 7. **`parseInt` non basta**: accetta `9`
 * ignorando quello che non capisce, e `759` diventerebbe `75` — cioè `----wxr-x`,
 * un file senza permessi per il proprietario, ottenuto da una battitura
 * sbagliata che nessuno ha segnalato.
 */
export function leggiPermessi(testo: string): number | undefined {
  const pulito = testo.trim()
  if (!/^[0-7]{3,4}$/.test(pulito)) return undefined
  return Number.parseInt(pulito, 8)
}

/**
 * Il separatore che quel percorso sta già usando.
 *
 * Non si deduce dal sistema su cui gira il programma, si guarda il percorso: le
 * due colonne del pannello sono un disco Windows e un server Unix, e quello che
 * vale per una è sbagliato per l'altra. Dedurlo da `process.platform`
 * costruirebbe `\home\utente\file` sul server, che non esiste.
 *
 * Senza nessuna delle due barre — un percorso nudo — si sceglie la barra in
 * avanti: è quella dei server, ed è anche quella che Windows accetta comunque.
 */
export function separatoreDi(percorso: string): string {
  if (percorso.includes('/')) return '/'
  return percorso.includes('\\') ? '\\' : '/'
}

/** Unisce cartella e nome con la barra che quella cartella usa già. */
export function unisciPercorso(cartella: string, nome: string): string {
  const sep = separatoreDi(cartella)
  const pulita = cartella.endsWith(sep) ? cartella.slice(0, -1) : cartella
  return `${pulita}${sep}${nome}`
}

/** La cartella che contiene quel percorso. Vuota se non c'è un livello sopra. */
export function cartellaDi(percorso: string): string {
  const taglio = Math.max(percorso.lastIndexOf('/'), percorso.lastIndexOf('\\'))
  if (taglio < 0) return ''
  // La radice tiene la sua barra: il padre di `/casa` è `/`, non la stringa
  // vuota — e una stringa vuota qui vorrebbe dire «rinomina in un posto senza
  // nome», cioè cancellare il percorso.
  return taglio === 0 ? percorso.slice(0, 1) : percorso.slice(0, taglio)
}

/**
 * Lo stesso posto, con un altro nome: è quello che serve per rinominare.
 *
 * SFTP e il filesystem non hanno «rinomina»: hanno «sposta». Chi chiede di
 * chiamarlo diversamente sta chiedendo di spostarlo accanto a sé stesso, e
 * sbagliare questo calcolo vuol dire spostare un file in un posto che non
 * esiste — cioè, sui filesystem che lo permettono, perderlo.
 */
export function accantoA(percorso: string, nome: string): string {
  const cartella = cartellaDi(percorso)
  return cartella === '' ? nome : unisciPercorso(cartella, nome)
}

/**
 * Il nome che si propone quando un file esiste già dall'altra parte.
 *
 * `relazione.pdf` → `relazione (2).pdf`, e poi `(3)`, non `relazione.pdf (2)`:
 * un nome che perde l'estensione smette di aprirsi con un doppio clic, ed è il
 * modo più veloce per rendere inutile una copia appena salvata.
 */
export function nomeLibero(nome: string, presi: string[]): string {
  if (!presi.includes(nome)) return nome
  const punto = nome.lastIndexOf('.')
  // Un punto in testa è un file nascosto, non un'estensione: `.gitignore` non
  // ha un nome vuoto con estensione `gitignore`.
  const base = punto > 0 ? nome.slice(0, punto) : nome
  const coda = punto > 0 ? nome.slice(punto) : ''
  for (let n = 2; n < 1000; n += 1) {
    const proposta = `${base} (${n})${coda}`
    if (!presi.includes(proposta)) return proposta
  }
  return `${base} (${Date.now()})${coda}`
}
