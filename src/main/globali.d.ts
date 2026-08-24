/**
 * Costanti iniettate al build da electron-vite (`define`), con le credenziali
 * OAuth di Google incastonate nel pacchetto. Nei test e in dev senza `define`
 * NON esistono: vanno lette solo dietro `typeof ... !== 'undefined'`.
 */
declare const __GOOGLE_CLIENT_ID__: string
declare const __GOOGLE_CLIENT_SECRET__: string
