/**
 * Il workspace che **questa finestra** ha davanti, in un posto solo e leggibile
 * in modo sincrono.
 *
 * Sembra un doppione dello stato di React, e invece è ciò che impedisce al
 * cambio di workspace di cancellare le chat.
 *
 * Il salvataggio del layout è **sincrono**: `cambiaVista` fa un `set` sullo
 * store, zustand notifica i sottoscritti nello stesso istante, e la persistenza
 * manda subito `layout:salva(layout, nomeDelWorkspace)`. Quel nome, finché
 * viveva nello stato di React, arrivava **vecchio**: il componente aggiorna
 * `attivo` solo *dopo* che la promessa del cambio è tornata, cioè dopo
 * `cambiaVista`. Il Core riceveva quindi «il layout del workspace B, salvalo
 * sotto A» e obbediva:
 *
 * - creando un workspace, A veniva svuotato (il layout nuovo è vuoto);
 * - cambiando workspace, A si ritrovava le chat di B e l'invariante «una chat,
 *   un workspace» le toglieva da B.
 *
 * In entrambi i casi, dopo un riavvio, le chat non c'erano più — mentre nella
 * sessione in corso la memoria dei workspace le ricopriva, e il guasto sembrava
 * casuale.
 *
 * Sta fuori da React perché deve poter cambiare **prima** di `cambiaVista`, nello
 * stesso giro sincrono: uno `useState` non può, per costruzione. Lo stato di
 * React resta per il disegno; qui vive la verità che serve al salvataggio.
 */
let corrente = ''

/** Il nome del workspace mostrato adesso. Vuoto = non ancora saputo. */
export function workspaceCorrente(): string {
  return corrente
}

/**
 * Dichiara quale workspace la finestra sta mostrando.
 *
 * Va chiamata **prima** di mettere a schermo il layout nuovo, non dopo: fra le
 * due c'è il salvataggio sincrono, ed è esattamente lì che il nome sbagliato fa
 * danno.
 */
export function impostaWorkspaceCorrente(nome: string): void {
  corrente = nome
}
