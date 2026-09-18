// Costruisce l'installer Windows su un PC con **Smart App Control** acceso.
//
// `npm run pacchetto` (electron-builder) per ricavare il disinstallatore
// ESEGUE l'installer appena generato: non firmato, Smart App Control lo
// blocca e la build muore con «⨯ spawn UNKNOWN» in
// `NsisTarget.computeScriptAndSignUninstaller` (eventi 3077/3033 nel registro
// CodeIntegrity/Operational). Sul ramo «macOS Catalina» lo stesso codice legge
// invece il disinstallatore dal file con un lettore in puro JS
// (`UninstallerReader`), senza eseguire niente: qui si forza quel ramo.
//
//   npm run build && node -e "require('fs').rmSync('dist',{recursive:true,force:true})"
//   node scripts/pacchetto-senza-eseguire.cjs
//
// L'installer che esce e' identico a quello di `pacchetto` (a parte la firma,
// che dipende dal certificato presente sul PC). Usato la prima volta il
// 18/09/2026 sul portatile per la 0.29.0 (`.sierradeck/quaderno/build-sul-portatile.md`).
const path = require('node:path')
const macos = require(path.join(process.cwd(), 'node_modules/app-builder-lib/out/util/macosVersion.js'))
macos.isMacOsCatalina = () => true

const { build, Platform, Arch } = require(path.join(process.cwd(), 'node_modules/electron-builder'))
build({
  targets: Platform.WINDOWS.createTarget('nsis', Arch.x64),
  publish: 'never'
}).then((file) => {
  console.log('fatto:', file.join(', '))
}).catch((e) => {
  console.error('fallito:', e)
  process.exit(1)
})
