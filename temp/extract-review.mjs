import fs from 'node:fs'

const store = JSON.parse(
  fs.readFileSync(
    'temp/storyflow-matrix/provider-1787039781123/storyflow-provider-1787039781123-1787672617160.project-store.json',
    'utf8'
  )
)
const p = store.projects[0]
const outDir = 'temp/review-500ch'
fs.mkdirSync(outDir, { recursive: true })

// 1) 每章结尾 3 句 + 开头 2 句,用于跨章衔接与结尾复读检查
const boundary = []
for (const c of p.chapters) {
  const text = (c.content || '').replace(/\r/g, '')
  const paras = text.split('\n').filter(s => s.trim())
  const head = paras.slice(0, 2).join(' ').slice(0, 160)
  const tail = paras.slice(-3).join(' ')
  boundary.push({ n: c.orderIndex + 1, title: c.title, head, tail: tail.slice(-240) })
}
fs.writeFileSync(`${outDir}/boundaries.json`, JSON.stringify(boundary, null, 1), 'utf8')

// 结尾句重复检测:取每章最后一句,做完全重复聚类
const lastSent = boundary.map(b => {
  const s = b.tail.replace(/[。！？…]+$/u, '')
  return { n: b.n, s: s.slice(-60) }
})
const groups = new Map()
for (const it of lastSent) {
  const k = it.s
  if (!groups.has(k)) groups.set(k, [])
  groups.get(k).push(it.n)
}
const dups = [...groups.entries()].filter(([, ns]) => ns.length >= 2).sort((a, b) => b[1].length - a[1].length)
console.log('=== 结尾句完全重复组(>=2章) ===')
for (const [s, ns] of dups.slice(0, 20)) console.log(`x${ns.length} [${ns.join(',')}] ${s}`)

// 2) 抽样章节全文
const picks = [1, 2, 3, 48, 49, 50, 58, 100, 101, 150, 200, 249, 250, 300, 349, 350, 400, 450, 474, 475, 499, 500]
for (const n of picks) {
  const c = p.chapters[n - 1]
  fs.writeFileSync(`${outDir}/ch${String(n).padStart(3, '0')}.txt`, `【${c.title}】\n\n${c.content}`, 'utf8')
}

// 3) chapterMemories 状态摘要抽查
for (const n of [50, 100, 250, 474, 500]) {
  const m = p.chapterMemories[n - 1]
  fs.writeFileSync(`${outDir}/memory-ch${n}.json`, JSON.stringify(m, null, 1), 'utf8')
}

// 4) 关键实体跨章追踪:周茂(58章死)/冯保/沈宛君 出现章分布
const track = {}
for (const c of p.chapters) {
  for (const name of ['周茂', '冯保', '沈宛君', '陈廷敬', '赵元朗', '宋文渊', '秦王', '齐王', '三皇子', '崇仁帝']) {
    if ((c.content || '').includes(name)) {
      ;(track[name] ??= []).push(c.orderIndex + 1)
    }
  }
}
fs.writeFileSync(`${outDir}/entity-chapters.json`, JSON.stringify(track, null, 1), 'utf8')
console.log('=== 实体出场章数 ===')
for (const [k, v] of Object.entries(track)) console.log(k, v.length, '章')

// 5) 段落长度节奏(CV): AI 腔粗检
const cvs = []
for (const c of p.chapters) {
  const paras = (c.content || '').split(/\n+/).map(s => s.trim()).filter(s => s.length > 20)
  if (paras.length < 5) continue
  const lens = paras.map(s => s.length)
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length)
  cvs.push(sd / mean)
}
cvs.sort((a, b) => a - b)
console.log('=== 段落长度CV ===')
console.log('p10/p50/p90 =', cvs[Math.floor(cvs.length * 0.1)].toFixed(2), cvs[Math.floor(cvs.length * 0.5)].toFixed(2), cvs[Math.floor(cvs.length * 0.9)].toFixed(2))
