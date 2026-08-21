/**
 * Le coordinate PUBBLICHE del progetto Supabase.
 *
 * Stanno nel codice apposta: URL e chiave `anon` sono **fatte per vivere dentro
 * l'app**. La chiave anon non apre niente da sola — è protetta dalle regole di
 * accesso (Row Level Security) sul server di Supabase, esattamente come la chiave
 * pubblica di un pagamento online. Il segreto vero è la `service_role`, che **non
 * è qui e non deve esserci mai**: quella vive solo su un server, non in un
 * programma che l'utente installa.
 */
export const SUPABASE_URL = 'https://hrypnshkdwnzxppgczyi.supabase.co'

/** La chiave `anon`/pubblica: identifica il progetto, non autorizza nulla da sola. */
export const SUPABASE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyeXBuc2hrZHduenhwcGdjenlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczMjk4NDgsImV4cCI6MjEwMjkwNTg0OH0.7r9k4u2FgSAsWEH4klivFrqCbgM4ldM8XcnOfJYC1BM'
