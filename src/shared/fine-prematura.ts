/**
 * **Lo specialista che chiude a metà** (k-189, 08/11/2026): finiva mentre
 * aspettava un comando lasciato in sottofondo («attendo altri 200 secondi»,
 * «Sto aspettando la notifica», «RAPPORTO: provo …»). Il SubagentStop guarda
 * l'ultimo messaggio: se è un'attesa, lo rimanda al lavoro, al più
 * `MAX_RIMANDI` volte per specialista (mai all'infinito).
 */

export const MOTIVO_FINE_PREMATURA = 'aspetta la fine di quello che hai lanciato e poi chiudi'
export const MAX_RIMANDI = 2

/**
 * Pura: l'ultimo messaggio dello specialista è un'attesa, non un riepilogo finale?
 * Autosufficiente (niente costanti fuori): la sua fonte finisce nello script dell'hook.
 */
export function finePrematura(testo: string | undefined | null): boolean {
  const INIZIO = /^\s*(?:attendo|sto\s+aspettando|sto\s+attendendo|in\s+attesa|aspetto\s+(?:che|la|il|ancora)|rapporto:\s*(?:provo|piano|passo\s+fatto|mi\s+serve)|mi\s+serve)/iu
  const FINE = /(?:(?:attendo|aspetto)\s+(?:altri|ancora|la\s+fine|la\s+notifica|che)[^\n]*|in\s+corso(?:\s+in\s+(?:background|sottofondo))?|in\s+(?:background|sottofondo)|in\s+attesa(?:\s+d\w+[^\n]*)?|mi\s+serve[^\n]*)[\s.!…:]*$/iu
  const CHIUSA = /^rapporto:\s*(?:finita|bloccata)/iu
  const t = (testo ?? '').trim()
  if (t === '') return false
  const righe = t.split(/\r?\n/u).map((r) => r.trim()).filter((r) => r !== '')
  const ultima = righe[righe.length - 1] as string
  // Un riepilogo finale ha «RAPPORTO: finita» o «bloccato: …»: non si tocca.
  if (righe.some((r) => CHIUSA.test(r)) || /^bloccato\s*:/iu.test(righe[0] as string)) return false
  return INIZIO.test(righe[0] as string) || INIZIO.test(ultima) || FINE.test(ultima)
}

/**
 * Lo script dell'hook SubagentStop (comando `node -e`): legge il payload da
 * stdin, conta i rimandi per `agent_id` in un file temporaneo e, se la fine è
 * prematura e i rimandi sono sotto il tetto, risponde col blocco.
 */
export function scriptFinePrematura(): string {
  return `
const fs=require('fs'),os=require('os'),path=require('path');
const fine=${finePrematura.toString().replace(/^function finePrematura/u, 'function')};
const MOTIVO=${JSON.stringify(MOTIVO_FINE_PREMATURA)},MAX=${MAX_RIMANDI};
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
try{
const p=JSON.parse(d||'{}');
const testo=p.last_assistant_message||'';
if(!fine(testo))return;
const id=String(p.agent_id||p.session_id||'x').replace(/[^\\w-]/g,'_');
const f=path.join(os.tmpdir(),'sierradeck-rimandi-'+id+'.txt');
let n=0;try{n=parseInt(fs.readFileSync(f,'utf8'),10)||0}catch(e){}
if(n>=MAX)return;
fs.writeFileSync(f,String(n+1));
process.stdout.write(JSON.stringify({decision:'block',reason:MOTIVO}));
}catch(e){}
});`.trim()
}

/** Il comando dell'hook: lo script in base64, così non ci sono virgolette da proteggere. */
export function comandoFinePrematura(): string {
  const b64 = Buffer.from(scriptFinePrematura(), 'utf8').toString('base64')
  return `node -e "eval(Buffer.from('${b64}','base64').toString())"`
}
