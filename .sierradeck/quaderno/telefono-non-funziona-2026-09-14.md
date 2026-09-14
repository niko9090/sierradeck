---
titolo: "«La app su cellulare non funziona» (14/09, notte): cosa si vede dal PC, e cosa manca per capirlo"
quando: 2026-09-14T03:50:00+02:00
tag: ["telefono", "client", "diagnosi", "registro", "android"]
---

# Cosa dice il PC (il fisso, alle 01:48)

- SierraDeck 0.25.1 in esecuzione (la 0.26.0 è pubblicata dalle 23:57 ma
  non ancora installata: si installa alla chiusura); il server del Client
  ascolta su `0.0.0.0:47640`, il servizio autopiloti su `127.0.0.1:47630`.
- Rete: Ethernet 2 `192.168.1.191` (profilo **Privato**, con gateway → è
  l'indirizzo del QR, `indirizzoPrincipale` con `Get-NetIPConfiguration`),
  Tailscale `100.100.60.114` (Privato), più due adattatori virtuali
  (192.168.56.1 VirtualBox, 172.17.80.1 Hyper-V) che il QR non usa.
- Firewall: regole «sierradeck.exe» TCP e UDP, in entrata, Consenti,
  Privato+Pubblico, sul percorso giusto
  (`AppData\Local\Programs\SierraDeck\SierraDeck.exe`).
- `dispositivi.json`: un solo telefono accoppiato (SM-S938B, dal 3/09),
  **ultimo accesso 10 settembre 14:44Z**. Da quattro giorni il telefono non
  si presenta a questo PC con una chiave valida.
- Nei registri **non c'è nessuna riga del Client**: fino alla 0.26.0 i
  rifiuti (403 «solo dalla rete locale», 401 «dispositivo non
  riconosciuto») andavano solo in console, invisibile in produzione. Quindi
  dal PC non si può dire se il telefono bussa e viene respinto o se non
  arriva affatto.

# Cosa è cambiato stanotte

`creaServerClient({ log })`: i rifiuti (rete, chiave) e il primo contatto di
ogni dispositivo finiscono nel registro, una riga per indirizzo ogni dieci
minuti (`[client] …`). Test in `client-server.test.ts`. Dalla 0.27.0 il
registro dirà una di queste tre cose:
- `richiesta da fuori la rete locale, rifiutata: <ip>` → il telefono arriva
  da un indirizzo non privato (VPN sbagliata, dati mobili): o si accende
  «accetta anche da fuori la rete locale» o si usa l'indirizzo Tailscale;
- `<ip> bussa con una chiave che non riconosco … accoppiato di nuovo` → il
  telefono ha una chiave vecchia (revoca, dati del PC ripristinati):
  rifare l'accoppiamento dal QR;
- niente → il telefono non arriva al PC: indirizzo del QR cambiato (DHCP),
  wifi diverso, VPN attiva sul telefono (`Rete.comeSiamoMessi` nell'app lo
  dice), o il PC spento.

# Cosa fare domani (Nicholas)

1. Aprire l'app e leggere il messaggio sotto «non risponde»: dice da quale
   rete sta provando. Se c'è una VPN, usare l'indirizzo Tailscale (100.…).
2. Nelle postazioni dell'app controllare che l'indirizzo sia
   `192.168.1.191:47640` (il QR di adesso), non un vecchio IP.
3. Dopo l'aggiornamento alla 0.27.0, riprovare e leggere il registro
   (Account → «Registro attività»): le righe `[client]` dicono il resto.
4. Se le righe non ci sono e l'indirizzo è giusto: `curl http://192.168.1.191:47640/api/ciao`
   da un altro PC sulla stessa rete; se non risponde è il firewall o la
   rete, non SierraDeck.
