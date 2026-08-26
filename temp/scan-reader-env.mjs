import fs from 'node:fs'
import path from 'node:path'

const acc = []
function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f)
    const st = fs.statSync(p)
    if (st.isDirectory()) {
      if (!/node_modules|\.git|dist/.test(f)) walk(p)
    } else if (/\.(ts|tsx|mjs|js)$/.test(f)) acc.push(p)
  }
}
walk('src')
walk('scripts')
const re = /MOLIU_READER[A-Z_]*|readerJudge|reader-eval|readerEval/i
for (const f of acc) {
  const t = fs.readFileSync(f, 'utf8')
  const lines = t.split(/\r?\n/)
  lines.forEach((l, i) => {
    if (re.test(l) && !/^import |from '/.test(l.trim())) {
      console.log(`${f}:${i + 1}: ${l.trim().slice(0, 160)}`)
    }
  })
}
