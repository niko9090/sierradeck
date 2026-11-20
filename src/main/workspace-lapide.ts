/**
 * La lapide sul Drive di un workspace eliminato (k-166w1).
 *
 * «Elimina workspace» tocca solo l'archivio di questo PC. Senza una lapide sul
 * Drive, il salvataggio successivo fondeva Drive e PC e `fondiArchivi` rimetteva
 * il nome che esisteva solo sul Drive: il workspace eliminato tornava, qui e
 * sugli altri PC. La lapide è la stessa di «Togli dal Drive»; il ripristino dal
 * recupero la toglie, così il workspace risale con il primo salvataggio.
 *
 * Non blocca mai l'eliminazione: senza Drive, passphrase o archivio sul Drive
 * la lapide non si scrive (e lo si dice nel registro), e il recupero locale
 * funziona comunque.
 */
export type SegnaSulDrive = (nome: string, verso: 'togli' | 'rimetti') => Promise<{ ok: boolean; messaggio?: string }>

export async function lapideDelWorkspace(
  segna: SegnaSulDrive | undefined,
  nome: string,
  verso: 'togli' | 'rimetti',
  registra: (m: string) => void = () => {}
): Promise<void> {
  if (segna === undefined) return
  try {
    const e = await segna(nome, verso)
    if (!e.ok) registra(`[workspace] lapide sul Drive di «${nome}» non ${verso === 'togli' ? 'scritta' : 'tolta'}: ${e.messaggio ?? 'motivo sconosciuto'}`)
  } catch (err) {
    registra(`[workspace] lapide sul Drive di «${nome}» non ${verso === 'togli' ? 'scritta' : 'tolta'}: ${err instanceof Error ? err.message : String(err)}`)
  }
}
