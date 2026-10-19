import { transformSync } from 'esbuild'
import fs from 'node:fs'

const files = [
  'src/components/NotificationBell.jsx',
  'src/components/Header.jsx',
  'src/components/GuestUpgradeModal.jsx',
  'src/utils/guestAccount.js',
  'src/pages/root/redsea/wt/RootUtilityControl.jsx',
  'src/pages/UtilityPayment.jsx',
  'src/pages/ServiceRequests.jsx',
]

let bad = 0
for (const file of files) {
  try {
    transformSync(fs.readFileSync(file, 'utf8'), { loader: 'jsx' })
    console.log('OK   ' + file)
  } catch (error) {
    bad += 1
    console.log('FAIL ' + file + ' :: ' + error.message)
  }
}
process.exit(bad ? 1 : 0)
