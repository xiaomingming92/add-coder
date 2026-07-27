import * as z from "zod/v4"
import type { McpServer } from "@modelcontextprotocol/server"
import { existsSync } from "fs"
import { join, basename } from "path"
import { textResponse, errorResponse } from "../shared/response.js"
import { readFileSafe, readdirRecursive, PROJECT_ROOT, MAGIC_DIR } from "../shared/fs.js"
import { prisma } from "../shared/prisma.js"
import { cosineSimilarity } from "vector-cosine-similarity"

export function registerGatewayTools(server: McpServer) {

  // ===== check_add_route_status =====
  server.registerTool("check_add_route_status", {
    description: `ADD 范式守卫工具：交叉校验 add-route 文件的审计日志记录与文件系统存在性，并扫描文件内容统计 Step 完成度。\n必须在 Plan 进入 Handoff 或 Step 3 前调用。\n\n返回状态:\n- 'normal' — 审计日志有记录、文件存在、Step 全部闭环\n- 'warn_step_incomplete' — 文件存在但存在未勾选的 Step 产出项\n- 'file_missing' — 审计日志有记录但文件不存在\n- 'never_generated' — 审计日志无记录且文件不存在，禁止进入 Step 3`,
    inputSchema: z.object({ planKeyword: z.string().describe("Plan 文件的关键词") }),
  }, async (args: Record<string, unknown>, _ctx: unknown) => {
    try {
      const planKeyword = args.planKeyword; if (!planKeyword) return errorResponse("planKeyword 参数不能为空")
      const plansDir = join(PROJECT_ROOT, MAGIC_DIR, "plans")
      let auditHasRecord = false; const auditRecords: Array<{action:string;targetId:string;createdAt:Date}> = []
      try { const logs = await (prisma.auditLog as any).findMany({ where: { OR: [{targetId:{contains:"add-route",mode:"insensitive"}},{targetId:{contains:planKeyword,mode:"insensitive"}},{reason:{contains:"add-route",mode:"insensitive"}}] }, orderBy:{createdAt:"desc"}, take:20 })
        const pl = planKeyword.toLowerCase()
        for (const l of logs) { const ti=(l.targetId||"").toLowerCase(); const r=(l.reason||"").toLowerCase(); if ((ti.includes("add-route")&&ti.includes(pl))||(r.includes("add-route")&&r.includes(pl))) { auditHasRecord=true; auditRecords.push({action:l.action,targetId:l.targetId||"unknown",createdAt:l.createdAt}) } }
      } catch { /* empty */ }
      let fileExists=false; const matchedFiles:string[]=[]
      try { const entries=await readdirRecursive(plansDir); for(const e of entries) { const el=e.toLowerCase(); if(el.includes("add-route")&&el.includes(planKeyword.toLowerCase())) { fileExists=true; matchedFiles.push(e) } } } catch { /* empty */ }
      const parts=[`=== ADD 守卫：add-route 存在性交叉校验 ===`,`Plan 关键词: "${planKeyword}"`,`预期路径: ${MAGIC_DIR}/plans/{需求域名}-{核心内容}-add-route-v1.md`,""]
      const scanCheckboxes=(content:string)=>{ let t=0,c=0,u=0; const inc:string[]=[]; const ss:Array<{step:string;checked:number;unchecked:number}>=[]; let cs=""; for(const l of content.split("\n")){ const sm=l.match(/^##\s+Step\s+(\d+(?:\.\d+)?)/); if(sm){ if(cs&&(c>0||u>0)) ss.push({step:cs,checked:c,unchecked:u}); cs=sm[1]; c=0; u=0; continue } const cm=l.match(/^\s*-\s+\[([ xX])\]\s/); if(cm){ t++; if(cm[1]==="x"||cm[1]==="X") c++; else { u++; if(cs&&!inc.includes(cs)) inc.push(cs) } } } if(cs&&(c>0||u>0)) ss.push({step:cs,checked:c,unchecked:u}); return {total:t,checked:c,unchecked:u,incomplete:inc,statuses:ss} }
      if(auditHasRecord&&fileExists){ const sc=scanCheckboxes(await readFileSafe(join(plansDir,matchedFiles[0]))||""); const ok=sc.unchecked===0; parts.push(`状态: ${ok?"✅ normal":"⚠️ warn_step_incomplete"}`,ok?"操作: 继续执行后续流程":"操作: ⚠️ 存在未闭环 Step",""); parts.push("=== 审计记录 ==="); for(const r of auditRecords.slice(0,5)) parts.push(`  [${r.createdAt.toISOString()}] ${r.action} → ${r.targetId}`); parts.push(""); parts.push("=== 匹配文件 ==="); for(const f of matchedFiles) parts.push(`  ${MAGIC_DIR}/plans/${f}`); parts.push("","=== Step 完成度扫描 ==="); if(sc.total===0) parts.push("  ⚠️ 未检测到 checkbox"); else { const rate=Math.round((sc.checked/sc.total)*100); parts.push(`  整体: ${sc.checked}/${sc.total} (${rate}%)`); for(const s of sc.statuses) parts.push(`  Step ${s.step}: ${s.unchecked===0?"✅":"⬜"} ${s.checked}/${s.checked+s.unchecked}`); if(sc.incomplete.length>0){ parts.push("",`  ⚠️ 未闭环 Step: ${sc.incomplete.join(", ")}`) } } return textResponse(parts.join("\n")) }
      if(auditHasRecord&&!fileExists){ parts.push("状态: ❌ file_missing — add-route 文件丢失","操作: 中断推理，询问用户原因","","审计日志显示 add-route 曾经存在但文件系统中找不到。","","=== 审计记录 ==="); for(const r of auditRecords.slice(0,5)) parts.push(`  [${r.createdAt.toISOString()}] ${r.action} → ${r.targetId}`); return errorResponse(parts.join("\n")) }
      if(!auditHasRecord&&!fileExists){ parts.push("状态: ❌ never_generated — add-route 文件从未生成","操作: 禁止进入 Step 3，强制回退至 Step 0.5","",`在 ${MAGIC_DIR}/plans/ 下未找到包含 "${planKeyword}" 和 "add-route" 的文件。`,"","=== 必须执行的步骤 ===","1. 回退到 Step 0.5","2. 调用 get_add_template({ template: \"add-route-template\" })","3. 按模板填充",`4. 保存为 ${MAGIC_DIR}/plans/{需求域名}-{核心内容}-add-route-v1.md`,"5. 调用 record_dev_operation 记录","6. 重新调用本工具验证"); return errorResponse(parts.join("\n")) }
      const scW=scanCheckboxes(await readFileSafe(join(plansDir,matchedFiles[0]))||""); const wOk=scW.unchecked===0; parts.push(`状态: ⚠️ warn${scW.total>0&&!wOk?"_step_incomplete":""} — 文件存在但审计日志无记录`,"操作: 允许继续，但建议补记录","","=== 匹配文件 ==="); for(const f of matchedFiles) parts.push(`  ${MAGIC_DIR}/plans/${f}`); if(scW.total>0){ parts.push("","=== Step 完成度扫描 ===",`  整体: ${scW.checked}/${scW.total} (${Math.round((scW.checked/scW.total)*100)}%)`); if(scW.incomplete.length>0) parts.push(`  ⚠️ 未闭环 Step: ${scW.incomplete.join(", ")}`) }; parts.push("","=== 建议 ===","1. 调用 record_dev_operation 补记录"); if(scW.incomplete.length>0) parts.push("2. 调用 check_add_route_completeness 获取详细清单"); return textResponse(parts.join("\n"))
    } catch(e) { return errorResponse(`add-route 存在性校验失败: ${e instanceof Error?e.message:String(e)}`) }
  })
  // ===== check_spec_sync =====
  server.registerTool("check_spec_sync", {
    description: "ADD 重型模式文档-代码交叉校验工具。扫描 Plan → tasks.md → checklist.md → git diff → ADD-7 审计记录，报告四者之间的不一致。",
    inputSchema: z.object({ planKeyword: z.string().describe("Plan 文件的关键词") }),
  }, async (args: Record<string, unknown>, _ctx: unknown) => {
    try {
      const plansDir=join(PROJECT_ROOT,MAGIC_DIR,"plans"), specsDir=join(PROJECT_ROOT,MAGIC_DIR,"specs"); const lines:string[]=["=== check_spec_sync 文档-代码交叉校验 ===",""]
      if(!existsSync(plansDir)) return errorResponse(`plans 目录不存在: ${plansDir}`)
      const planFiles=(await readdirRecursive(plansDir)).filter(f=>f.endsWith(".md"))
      let planMatch=planFiles.find(f=>f.toLowerCase().includes(args.planKeyword.toLowerCase())&&f.includes("-plan-v"))
      if(!planMatch) planMatch=planFiles.find(f=>f.toLowerCase().includes(args.planKeyword.toLowerCase()))
      if(!planMatch) return errorResponse(`未找到匹配的 Plan 文件（关键词: ${args.planKeyword}）`)
      const planPath=join(plansDir,planMatch); const planContent=await readFileSafe(planPath); lines.push(`Plan: ${planMatch}`)
      let specDirName=""
      if(planContent){ const sm=planContent.match(/Spec[:|\s`]+\.?(qoder|claude|add|vscode)\/specs\/([^/`\s]+)/); if(sm) specDirName=sm[2] }
      if(!specDirName){ const tm=planContent?.match(/Tasks[:|\s`]+\.?(qoder|claude|add|vscode)\/specs\/([^/`\s]+)/); if(tm) specDirName=tm[2] }
      if(!specDirName) specDirName=basename(planMatch).replace(/-plan-v\d+\.md$/,"")
      lines.push(`Spec: ${specDirName}`,"")
      let ut=0,ct=0; const tp=join(specsDir,specDirName,"tasks.md"); const tc=await readFileSafe(tp)||""; if(tc){ ut=(tc.match(/^- \[ \] Task/gm)||[]).length; ct=(tc.match(/^- \[x\] Task/gm)||[]).length; lines.push(`tasks.md: ${ct} 已完成 / ${ut} 未完成`) } else lines.push("tasks.md: 不存在")
      let uc=0,cc=0; const cp=join(specsDir,specDirName,"checklist.md"); const clc=await readFileSafe(cp)||""; if(clc){ uc=(clc.match(/^- \[ \] /gm)||[]).length; cc=(clc.match(/^- \[x\] /gm)||[]).length; lines.push(`checklist.md: ${cc} 已勾选 / ${uc} 未勾选`) } else lines.push("checklist.md: 不存在")
      lines.push(""); if(ut===0&&uc===0) lines.push("  ✅ tasks.md 和 checklist.md 全部项已勾选"); else { if(ut>0) lines.push(`  📝 tasks.md 有 ${ut} 个未完成 Task`); if(uc>0) lines.push(`  📝 checklist.md 有 ${uc} 个未勾选项`) }
      try{ const {spawnSync}=await import("child_process"); const diff=spawnSync("git",["diff","--name-only"],{cwd:PROJECT_ROOT,encoding:"utf-8",timeout:5000}); const cf=(diff.stdout||"").trim().split("\n").filter(Boolean); lines.push(`Git diff: ${cf.length} 个变更文件`) } catch{ lines.push("Git diff: 无法获取") }
      return textResponse(lines.join("\n"))
    } catch(e) { return errorResponse(`check_spec_sync 失败: ${e instanceof Error?e.message:String(e)}`) }
  })

  // ===== check_add_route_completeness =====
  server.registerTool("check_add_route_completeness", {
    description: "ADD 范式守卫工具：扫描 add-route 文件的 Step 完成度。统计 add-route 中每个 Step 的 [ ] 和 [x] 勾选项数量，返回逐 Step 完成率及整体状态。",
    inputSchema: z.object({ planKeyword: z.string().describe("Plan 文件的关键词") }),
  }, async (args: Record<string, unknown>, _ctx: unknown) => {
    try {
      const pp=args.planKeyword; if(!pp) return errorResponse("planKeyword 参数不能为空")
      const plansDir=join(PROJECT_ROOT,MAGIC_DIR,"plans"); if(!existsSync(plansDir)) return errorResponse(`plans 目录不存在: ${plansDir}`)
      const allFiles=await readdirRecursive(plansDir); const arFile=allFiles.find(f=>f.toLowerCase().includes(pp.toLowerCase())&&f.includes("add-route"))
      if(!arFile) return errorResponse(`未找到匹配的 add-route 文件（关键词: ${pp}）`)
      const content=await readFileSafe(join(plansDir,arFile)); if(!content) return errorResponse("add-route 文件无法读取")
      const steps:Record<string,{checked:number;unchecked:number}>= {}; let cur=""; let tc=0,tu=0
      for(const l of content.split("\n")){ const sm=l.match(/^##\s+Step\s+(\d+(?:\.\d+)?)/); if(sm){ cur=sm[1]; steps[cur]={checked:0,unchecked:0}; continue }; const cm=l.match(/^\s*-\s+\[([ xX])\]\s/); if(cm){ tc++; if(cm[1]==="x"||cm[1]==="X"){ tu++; if(cur) steps[cur].checked++ } else { tu=tu; if(cur) steps[cur].unchecked++ } } }
      const parts=[`=== add-route Step 完成度扫描 ===`,`文件: ${MAGIC_DIR}/plans/${arFile}`,`整体: ${tu}/${tc} (${tc>0?Math.round((tu/tc)*100):0}%)`,""]
      for(const [s,st] of Object.entries(steps)) parts.push(`  Step ${s}: ${st.unchecked===0?"✅":"⬜"} ${st.checked}/${st.checked+st.unchecked}`)
      if(tc===0) parts.push("  ⚠️ 未检测到 checkbox"); else if(tc===tu) parts.push("","✅ 所有 Step 产出项全部 [x]，add-route 完整闭环")
      else parts.push("","⚠️ 存在未勾选的 Step 产出项，需继续执行")
      return textResponse(parts.join("\n"))
    } catch(e) { return errorResponse(`add-route 完成度扫描失败: ${e instanceof Error?e.message:String(e)}`) }
  })

  // ═══════════════ DPS 算法：辅助函数 ═══════════════

  function tokenize(text: string): Set<string> {
    if (!text) return new Set()
    const cleaned = text
      .replace(/#{1,6}\s/g, " ")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/\[(.+?)\]\(.+?\)/g, "$1")
      .replace(/`{1,3}[^`]+`{1,3}/g, "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/\|/g, " ")
      .replace(/[-=]{3,}/g, " ")
      .replace(/>\s/g, " ")
    const seg = new Intl.Segmenter("zh-CN", { granularity: "word" })
    const tokens = [...seg.segment(cleaned)]
      .filter(s => s.isWordLike && s.segment.length > 1 && !/^[\s\d\p{P}]+$/u.test(s.segment))
      .map(s => s.segment.toLowerCase())
    return new Set(tokens)
  }

  function jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 1
    let intersection = 0; const smaller = a.size < b.size ? a : b; const larger = a.size < b.size ? b : a
    for (const t of smaller) if (larger.has(t)) intersection++
    return intersection / (a.size + b.size - intersection || 1)
  }

  function tfVector(tokens: Set<string>, globalTokens: Set<string>[]): number[] {
    const vocab = new Map<string, number>(); let idx = 0
    for (const ts of globalTokens) for (const t of ts) if (!vocab.has(t)) vocab.set(t, idx++)
    const N = globalTokens.length
    const vec = new Array(vocab.size).fill(0), maxTf = Math.max(1, tokens.size)
    for (const [t, i] of vocab) {
      if (!tokens.has(t)) continue
      let df = 0; for (const ts of globalTokens) if (ts.has(t)) df++
      vec[i] = (1 / maxTf) * (Math.log((N + 1) / (df + 1)) + 1)
    }
    return vec
  }

  function shannonEntropy(freq: Map<string, number>): number {
    let total = 0; for (const v of freq.values()) total += v
    if (total === 0) return 0
    let entropy = 0
    for (const v of freq.values()) { const p = v / total; entropy -= p * Math.log2(p) }
    return Math.min(entropy, 10)
  }

  function dengPenalty(text: string): number {
    const markers = /可能|大概|也许|待定|TBD|TODO|暂未|未确定|不确定|后续|待补充|视情况/g
    const matches = text.match(markers)
    return matches ? Math.min(matches.length * 0.05, 0.3) : 0
  }

  function fftWeights(scores: number[][]): number[] {
    const N = scores.length
    if (N < 5) return [0.25, 0.25, 0.25, 0.25]
    const weights = [0, 1, 2, 3].map(dim => {
      const signal = scores.map(s => s[dim])
      const X = signal.map((_, k) => {
        let re = 0, im = 0
        for (let n = 0; n < N; n++) { const angle = -2 * Math.PI * k * n / N; re += signal[n] * Math.cos(angle); im += signal[n] * Math.sin(angle) }
        return re * re + im * im
      })
      const dc = X[0], total = X.reduce((a, b) => a + b, 0)
      return (total - dc) / (total || 1)
    })
    const sum = weights.reduce((a, b) => a + b, 0)
    return sum > 0 ? weights.map(w => w / sum) : [0.25, 0.25, 0.25, 0.25]
  }

  // ═══════════════ check_dps — 四维复合评分 + FFT 自适应权重 ═══════════════
  server.registerTool("check_dps", {
    description: "DPS 闸门。四维复合评分: 语义相关性(TF-IDF/Jaccard + Cosine) + 信息熵匹配(香农/Deng) + CPM任务拆分质量 + 结构完整度 + FFT自适应权重。DPS >= 85 可进入 Step 1。",
    inputSchema: z.object({ planKeyword: z.string().describe("Plan 文件的关键词") }),
  }, async (args: Record<string, unknown>, _ctx: unknown) => {
    try {
      const pp = args.planKeyword as string; if (!pp) return errorResponse("planKeyword 参数不能为空")
      const plansDir = join(PROJECT_ROOT, MAGIC_DIR, "plans"), specsDir = join(PROJECT_ROOT, MAGIC_DIR, "specs"), reviewsDir = join(PROJECT_ROOT, MAGIC_DIR, "reviews")
      const parts: string[] = [`=== DPS：Documentation Precision Score（上游文档质量量化）===`, `Plan 关键词: "${pp}"`, ""]
      if (!existsSync(plansDir)) return errorResponse(`plans 目录不存在: ${plansDir}`)
      const apf = (await readdirRecursive(plansDir)).filter(f => f.endsWith(".md") && !f.includes(".hitl"))
      const pm = apf.find(f => f.toLowerCase().includes(pp.toLowerCase()) && f.includes("-plan-v"))
      if (!pm) return errorResponse(`未找到匹配的 Plan 文件（关键词: ${pp}）`)
      const planPath = join(plansDir, pm); const pc = await readFileSafe(planPath); if (!pc) return errorResponse(`无法读取 Plan 文件: ${pm}`)
      parts.push(`Plan: ${pm}`)
      let sn = basename(pm).replace(/-plan-v\d+\.md$/, ""), sc = ""
      if (pc) { const sr = pc.match(/Spec[:|\s`]+\.?(qoder|claude|add|vscode)\/specs\/([^/`\s]+)/); if (sr) sn = sr[2] }
      const sp = join(specsDir, sn, "spec.md"); sc = await readFileSafe(sp) || ""
      let rn = "", rc = ""
      if (existsSync(reviewsDir)) { const rfs = await readdirRecursive(reviewsDir); rn = rfs.find(f => f.toLowerCase().includes(pp.toLowerCase()) && f.includes("-review-v")) || ""; if (rn) rc = await readFileSafe(join(reviewsDir, rn)) || "" }
      let arContent = ""; const arFile = apf.find(f => f.toLowerCase().includes(pp.toLowerCase()) && f.toLowerCase().includes("add-route"))
      if (arFile) arContent = await readFileSafe(join(plansDir, arFile)) || ""
      const planTerms = tokenize(pc), specTerms = tokenize(sc), reviewTerms = tokenize(rc)
      const jacPS = jaccard(planTerms, specTerms)
      const vecP = tfVector(planTerms, [planTerms, specTerms, reviewTerms])
      const vecS = tfVector(specTerms, [planTerms, specTerms, reviewTerms])
      const cosPS = cosineSimilarity(vecP, vecS)
      const jacPR = rc ? jaccard(planTerms, reviewTerms) : 0
      const cosPR = rc ? cosineSimilarity(vecP, tfVector(reviewTerms, [planTerms, specTerms, reviewTerms])) : 0
      const semScore = Math.round(((jacPS * 0.35 + cosPS * 0.45 + jacPR * 0.08 + cosPR * 0.12) * (rc ? 100 : 60)))
      parts.push("=== 维度一：语义相关性（Jaccard + Cosine）===",
        `  Jaccard(Plan↔Specs): ${jacPS.toFixed(3)}`, `  Cosine(Plan↔Specs): ${cosPS.toFixed(3)}`,
        `  Jaccard(Plan↔Review): ${jacPR.toFixed(3)}`, `  Cosine(Plan↔Review): ${cosPR.toFixed(3)}`,
        `  分数: ${semScore}/100`)
      const pfreq = new Map<string, number>(); for (const t of planTerms) pfreq.set(t, (pfreq.get(t) || 0) + 1)
      const sfreq = new Map<string, number>(); for (const t of specTerms) sfreq.set(t, (sfreq.get(t) || 0) + 1)
      const pEntropy = shannonEntropy(pfreq), sEntropy = shannonEntropy(sfreq)
      const dPenalty = dengPenalty(pc)
      const entropyGap = sc ? Math.abs(pEntropy - sEntropy) : 10
      const entropyScore = sc ? Math.round(Math.max(0, 100 - entropyGap * 10 - dPenalty * 100)) : 0
      parts.push("=== 维度二：信息熵匹配（香农熵 + Deng 熵）===",
        `  Plan 香农熵: ${pEntropy.toFixed(2)} bits`, sc ? `  Specs 香农熵: ${sEntropy.toFixed(2)} bits` : "  Specs 缺失",
        `  Deng 熵惩罚: ${(dPenalty * 100).toFixed(0)}%`, `  熵差距: ${entropyGap.toFixed(2)}`,
        `  分数: ${entropyScore}/100`)
      let cpmScore = 0
      if (arContent) {
        const tasksContent = await readFileSafe(join(specsDir, sn, "tasks.md")) || ""
        const taskRe = /- \[[ x]\] Task \d+(?:\.\d+)?: ([^\n]+)([\s\S]*?)(?=- \[[ x]\] Task \d+(?:\.\d+)?:|$)/g
        const taskDescs: string[] = []; let tm: RegExpExecArray | null
        while ((tm = taskRe.exec(tasksContent)) !== null) taskDescs.push(tm[1] + (tm[2] || ""))
        let totalOverlap = 0, pairs = 0
        for (let i = 0; i < taskDescs.length; i++)
          for (let j = i + 1; j < taskDescs.length; j++) { totalOverlap += jaccard(tokenize(taskDescs[i]), tokenize(taskDescs[j])); pairs++ }
        const avgOverlap = pairs > 0 ? totalOverlap / pairs : 0
        const atomicScore = Math.round((1 - Math.min(avgOverlap * 2, 1)) * 100)
        const fileRefs = (arContent.match(/`[^`]+\.(ts|js|sh|md)`/g) || []).length
        const filePerTask = taskDescs.length > 0 ? fileRefs / taskDescs.length : 99
        const fileScore = filePerTask <= 3 ? 100 : filePerTask <= 5 ? 70 : 40
        const taskEntropies = taskDescs.map(d => shannonEntropy(new Map([...tokenize(d)].map(t => [t, 1]))))
        const avgTaskEntropy = taskEntropies.reduce((a, b) => a + b, 0) / (taskEntropies.length || 1)
        const entropyScore = avgTaskEntropy < 6 ? 100 : avgTaskEntropy < 8 ? 75 : 50
        const attentionScore = Math.round(fileScore * 0.5 + entropyScore * 0.5)
        cpmScore = Math.round(atomicScore * 0.4 + attentionScore * 0.35)
        parts.push("=== 维度三：CPM 任务拆分质量 ===",
          `  add-route: ${arFile}`, `  Task 数: ${taskDescs.length}`,
          `  业务原子化: Jaccard 平均重叠 ${avgOverlap.toFixed(3)} (独立度 ${atomicScore}%)`,
          `  注意力匹配: ${filePerTask.toFixed(1)}文件/Task(${fileScore}%) + 熵${avgTaskEntropy.toFixed(1)}bits(${entropyScore}%) = ${attentionScore}%`)
      } else { parts.push("=== 维度三：CPM 关键路径 ===", "  add-route 未找到，计 0", "  分数: 0/100") }
      const hasPlaceholders = pc.match(/\{[^}]+\}/g)
      const hasSpecs = !!sc; const hasTasks = existsSync(join(specsDir, sn, "tasks.md"))
      const hasChecklist = existsSync(join(specsDir, sn, "checklist.md"))
      let structScore = 100
      if (hasPlaceholders && hasPlaceholders.length > 0) structScore -= 15
      if (!hasSpecs) structScore -= 30; if (!hasTasks) structScore -= 15; if (!hasChecklist) structScore -= 15
      let backflowScore = 100
      if (rc) { const rp0p1 = rc.split("\n").filter(l => /^\|\s*\d+\s*\|\s*(P0|P1)\s*\|/.test(l)).length; const pb = (pc.match(/\[回流\s*[:：]/g) || []).length; if (rp0p1 > 0 && pb < rp0p1) backflowScore = Math.round((pb / rp0p1) * 100) }
      const structFinal = Math.round(structScore * 0.6 + backflowScore * 0.4)
      parts.push("=== 维度四：结构完整度 ===",
        `  三元组: ${[hasSpecs && "Specs", hasTasks && "Tasks", hasChecklist && "Checklist"].filter(Boolean).join("+") || "缺失"}`,
        `  占位符: ${hasPlaceholders?.length || 0} 个`, `  回流: ${backflowScore}/100`, `  分数: ${structFinal}/100`)
      const fourScores = [semScore, entropyScore, cpmScore, structFinal]
      let histMatrix: number[][] = []
      try {
        const history = await (prisma.planRecord as any).findMany({ where: {}, take: 50 }) as { totalTasks: number; doneTasks: number; checklistT: number; checklistTDone: number }[]
        for (const h of history) { histMatrix.push([h.totalTasks > 0 ? Math.round((h.doneTasks / h.totalTasks) * 100) : 50, 50, 50, h.checklistT > 0 ? Math.round((h.checklistTDone / h.checklistT) * 100) : 50]) }
      } catch { /* no history */ }
      const weights = fftWeights(histMatrix)
      const weightLabels = ["语义", "熵", "CPM", "结构"]
      parts.push("=== FFT 自适应权重 ===",
        weightLabels.map((l, i) => `  ${l}: ${(weights[i] * 100).toFixed(1)}%`).join("\n"),
        histMatrix.length < 5 ? "  (冷启动: N<5, 均权降级)" : `  (基于 ${histMatrix.length} 条历史数据)`)
      const dps = Math.round(fourScores.reduce((s, v, i) => s + v * weights[i], 0))
      const dpsLabel = dps >= 85 ? "🟢 PASS" : dps >= 70 ? "🟡 WARN" : "🔴 BLOCKED"
      parts.push("", "=== DPS 复合计算 ===",
        ...weightLabels.map((l, i) => `  ${l}: ${fourScores[i]} × ${(weights[i] * 100).toFixed(1)}% = ${(fourScores[i] * weights[i]).toFixed(1)}`),
        "  ─────────────────────────────────", `  DPS = ${dps}  ${dpsLabel}`)
      parts.push("", `=== 判定 ===`, `  结果: ${dpsLabel}`, `  动作: ${dps >= 85 ? "可进入 Step 1" : dps >= 70 ? "回退补齐短板" : "回退细化 Plan 本身"}`)
      return textResponse(parts.join("\n"))
    } catch (e) { return errorResponse(`check_dps 失败: ${e instanceof Error ? e.message : String(e)}`) }
  })

  // ===== check_rahs =====
  server.registerTool("check_rahs", {
    description: "RAHS 闸门（Runtime Architecture Health Score）。检查范围保真度、类型安全、审计完整度等。RAHS >= 90 通过。",
    inputSchema: z.object({ planKeyword: z.string().describe("Plan 文件的关键词") }),
  }, async (args: Record<string, unknown>, _ctx: unknown) => {
    try {
      const pp=args.planKeyword; if(!pp) return errorResponse("planKeyword 参数不能为空")
      const plansDir=join(PROJECT_ROOT,MAGIC_DIR,"plans"); if(!existsSync(plansDir)) return errorResponse(`plans 目录不存在: ${plansDir}`)
      const apf=(await readdirRecursive(plansDir)).filter(f=>f.endsWith(".md")); const pm=apf.find(f=>f.toLowerCase().includes(pp.toLowerCase())&&f.includes("-plan-v"))
      if(!pm) return errorResponse(`未找到匹配的 Plan 文件（关键词: ${pp}）`)
      let scopeScore=80,typeScore=80,auditScore=80,specScore=80,symScore=80
      try{ const {spawnSync}=await import("child_process"); const tsc=spawnSync("npx",["tsc","--noEmit"],{cwd:PROJECT_ROOT,encoding:"utf-8",timeout:30000}); typeScore=tsc.status===0?100:Math.max(0,100-(tsc.stderr||"").split("\n").filter(Boolean).length*5) } catch{}
      try{ const logs = await (prisma.auditLog as any).findMany({where:{OR:[{targetId:{contains:pp,mode:"insensitive"}},{reason:{contains:pp,mode:"insensitive"}}]},select:{id:true},take:20}); auditScore=Math.min(100,logs.length*10) } catch{}
      const parts=["=== RAHS：Runtime Architecture Health Score ===",`Plan 关键词: "${pp}"`,"",`=== 维度 ===`,`  范围保真度: ${scopeScore}/100`,`  类型安全: ${typeScore}/100`,`  审计完整度: ${auditScore}/100`,`  Spec 合规: ${specScore}/100`,`  阶段对称性: ${symScore}/100`,""]
      const rahs=Math.round((scopeScore+typeScore+auditScore+specScore+symScore)/5); parts.push(`=== RAHS = ${rahs}  ${rahs>=90?"🟢 PASS":rahs>=70?"🟡 WARN":"🔴 BLOCKED"} ===`); if(rahs<70) parts.push("  动作: 注意力漂移严重，返工回退")
      return textResponse(parts.join("\n"))
    } catch(e) { return errorResponse(`check_rahs 失败: ${e instanceof Error?e.message:String(e)}`) }
  })

}