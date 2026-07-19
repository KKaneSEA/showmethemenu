import { spawn } from 'node:child_process'

const api = spawn(process.execPath, ['server/index.js'], { stdio: 'inherit' })
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' })
let isStopping = false

function stop(code = 0) {
  if (isStopping) return
  isStopping = true
  api.kill('SIGTERM')
  vite.kill('SIGTERM')
  setTimeout(() => process.exit(code), 250).unref()
}

api.once('exit', (code) => stop(code || 0))
vite.once('exit', (code) => stop(code || 0))
process.once('SIGINT', () => stop(0))
process.once('SIGTERM', () => stop(0))
