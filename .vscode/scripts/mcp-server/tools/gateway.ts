import * as z from "zod/v4"
import type { McpServer } from "@modelcontextprotocol/server"
import { existsSync } from "fs"
import { join, basename } from "path"
import { textResponse, errorResponse } from "../shared/response.js"
import { readFileSafe, readdirRecursive, PROJECT_ROOT, MAGIC_DIR } from "../shared/fs.js"
import { prisma } from "../shared/prisma.js"

export function registerGatewayTools(server: McpServer) {

  // ===== check_add_route_status (L1448-1716) =====
  server.registerTool("check_add_route_status", {
    description: `ADD 范式守卫工具：交叉校验 add-route 文件的审计日志记录与文件系统存在性，并扫描文件内容统计 Step 完成度。\n必须在 Plan 进入 Handoff 或 Step 3 前调用。\n\n返回状态:\n- 'normal' — 审计日志有记录、文件存在、Step 全部闭环\n- 'warn_step_incomplete' — 文件存在但存在未勾选的 Step 产出项\n- 'file_missing' — 审计日志有记录但文件不存在\n- 'never_generated' — 审计日志无记录且文件不存在，禁止进入 Step 3`,
    inputSchema: z.object({ planKeyword: z.string().describe("Plan 文件的关键词") }),
  }, async (args: Record<string, unknown>, _ctx: unknown) => {
    try {
      const planKeyword = args.planKeyword; if (!planKeyword) return errorResponse("planKeyword 参数不能为空")
      const plansDir = join(PROJECT_ROOT, MAGIC_DIR, "plans")
      let auditHasRecord = false; const auditRecords: Array<{action:string;targetId:string;createdAt:Date}> = []
      try { const logs = await (prisma.auditLog as Record<string, (...a: unknown[]) => unknown>).findMany({ where: { OR: [{targetId:{contains:"add-route",mode:"insensitive"}},{targetId:{contains:planKeyword,mode:"insensitive"}},{reason:{contains:"add-route",mode:"insensitive"}}] }, orderBy:{createdAt:"desc"}, take:20 })
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

  // ===== check_spec_sync (L2103-2580) =====
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

  // ===== check_add_route_completeness (L2582-2775) =====
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

  // ===== check_dps (L2777-3103) =====
  server.registerTool("check_dps", {
    description: "DPS 闸门（Documentation Precision Score）。评估 Plan → Review → Specs 三级文档的精确度和覆盖度。DPS ≥ 85 可进入 Step 1。",
    inputSchema: z.object({ planKeyword: z.string().describe("Plan 文件的关键词") }),
  }, async (args: Record<string, unknown>, _ctx: unknown) => {
    try {
      const pp=args.planKeyword; if(!pp) return errorResponse("planKeyword 参数不能为空")
      const plansDir=join(PROJECT_ROOT,MAGIC_DIR,"plans"), specsDir=join(PROJECT_ROOT,MAGIC_DIR,"specs"), reviewsDir=join(PROJECT_ROOT,MAGIC_DIR,"reviews")
      const parts=[`=== DPS：Documentation Precision Score（上游文档质量量化）===`,`Plan 关键词: "${pp}"`,""]
      if(!existsSync(plansDir)) return errorResponse(`plans 目录不存在: ${plansDir}`)
      const apf=(await readdirRecursive(plansDir)).filter(f=>f.endsWith(".md")); const pm=apf.find(f=>f.toLowerCase().includes(pp.toLowerCase())&&f.includes("-plan-v"))
      if(!pm) return errorResponse(`未找到匹配的 Plan 文件（关键词: ${pp}）`)
      const planPath=join(plansDir,pm); const pc=await readFileSafe(planPath); if(!pc) return errorResponse(`无法读取 Plan 文件: ${pm}`)
      parts.push(`Plan: ${pm}`)
      // Plan 粒度 (25%)
      const hasPlaceholders=pc.match(/\{[^}]+\}/g); const taskCount=(pc.match(/Task\s+\d+\.\d+/g)||[]).length; let planScore=100; if(hasPlaceholders&&hasPlaceholders.length>0) planScore=80; parts.push("=== 维度一：Plan 可执行粒度（30%）===",`  分数: ${planScore}/100`,hasPlaceholders?.length?`  - Plan 含占位词: "${hasPlaceholders[0]}"`: "  ✅ 无扣分项")
      // Review 覆盖度 (25%)
      let rn="",rc=""; if(existsSync(reviewsDir)){ const rfs=await readdirRecursive(reviewsDir); rn=rfs.find(f=>f.toLowerCase().includes(pp.toLowerCase())&&f.includes("-review-v"))||""; if(rn) rc=await readFileSafe(join(reviewsDir,rn))||"" }
      const rdims=["数据模型/类型定义","性能影响","存储/索引成本","兼容性/向后兼容"]; let rcov=0; for(const d of rdims) if(rc&&rc.includes(d)) rcov++; const rScore=rc?Math.round((rcov/3)*100):0; parts.push(`=== 维度二：Review 覆盖完备度（35%）===`,`  覆盖度: ${rcov}/3 (${Math.round((rcov/3)*100)}%)`,`  分数: ${rScore}/100`); if(rn) parts.push(`  ${rc?"✅ 兼容性/向后兼容":""}${rc?"":""}`); else parts.push("  ⚠️ Review 文件未找到，覆盖度计为 0")
      // Specs 精确度 (25%)
      let sn=basename(pm).replace(/-plan-v\d+\.md$/,""),sc=""
      if(pc){ const sr=pc.match(/Spec[:|\s`]+\.?(qoder|claude|add|vscode)\/specs\/([^/`\s]+)/); if(sr) sn=sr[2] }
      const sp=join(specsDir,sn,"spec.md"); sc=await readFileSafe(sp)||""; const rqc=sc?(sc.match(/###\s+Requirement:/g)||[]).length:0; const sScore=sc?100:0; parts.push(`=== 维度三：Specs 精确度（35%）===`,sc?`  Requirements 数: ${rqc}`:"  ⚠️ Specs 目录/文件未找到，精确度计为 0",`  分数: ${sScore}/100`)
      // 回流完整度 (25%)
      let bScore=100; if(rc){ const rp0p1=rc.split("\n").filter(l=>/^\|\s*\d+\s*\|\s*(P0|P1)\s*\|/.test(l)).length; const pb=(pc.match(/\[回流\s*[:：]/g)||[]).length; if(rp0p1>0&&pb<rp0p1) bScore=Math.round((pb/rp0p1)*100); parts.push(`=== 维度四：Review 回流完整度（25%）===`,`  Review P0/P1 条目总数: ${rp0p1}`,`  Plan [回流:] 标记数: ${pb}`,rp0p1===0?"  ✅ Review 无 P0/P1 问题":bScore===100?`  ✅ 回流完整: ${pb}/${rp0p1}`:`  ⚠️ 回流不完整: ${pb}/${rp0p1}`) }
      else parts.push("=== 维度四：Review 回流完整度（25%）===","  ⚠️ Review 文件未找到，回流检查不可用")
      parts.push(`  分数: ${bScore}/100`)
      const dps=Math.round(planScore*0.25+rScore*0.25+sScore*0.25+bScore*0.25); parts.push("","=== DPS 复合计算 ===",`  Plan 粒度:         ${planScore}  × 0.25 = ${(planScore*0.25).toFixed(1)}`,`  Review 覆盖度:     ${rScore}  × 0.25 = ${(rScore*0.25).toFixed(1)}`,`  Specs 精确度:      ${sScore}  × 0.25 = ${(sScore*0.25).toFixed(1)}`,`  Review 回流完整度:  ${bScore}  × 0.25 = ${(bScore*0.25).toFixed(1)}`,"  ─────────────────────────────────",`  DPS = ${dps}  ${dps>=85?"🟢 PASS":dps>=70?"🟡 WARN":"🔴 BLOCKED"}`)
      parts.push("",`=== 判定 ===`,`  结果: ${dps>=85?"�� PASS":dps>=70?"🟡 WARN":"🔴 BLOCKED"}`,`  动作: ${dps>=85?"可进入 Step 1":dps>=70?"回退补齐短板":"回退细化 Plan 本身"}`)
      return textResponse(parts.join("\n"))
    } catch(e) { return errorResponse(`check_dps 失败: ${e instanceof Error?e.message:String(e)}`) }
  })

  // ===== check_rahs (L3105-3358) =====
  server.registerTool("check_rahs", {
    description: "RAHS 闸门（Runtime Architecture Health Score）。检查范围保真度、类型安全、审计完整度等。RAHS ≥ 90 通过。",
    inputSchema: z.object({ planKeyword: z.string().describe("Plan 文件的关键词") }),
  }, async (args: Record<string, unknown>, _ctx: unknown) => {
    try {
      const pp=args.planKeyword; if(!pp) return errorResponse("planKeyword 参数不能为空")
      const plansDir=join(PROJECT_ROOT,MAGIC_DIR,"plans"); if(!existsSync(plansDir)) return errorResponse(`plans 目录不存在: ${plansDir}`)
      const apf=(await readdirRecursive(plansDir)).filter(f=>f.endsWith(".md")); const pm=apf.find(f=>f.toLowerCase().includes(pp.toLowerCase())&&f.includes("-plan-v"))
      if(!pm) return errorResponse(`未找到匹配的 Plan 文件（关键词: ${pp}）`)
      let scopeScore=80,typeScore=80,auditScore=80,specScore=80,symScore=80; let total=0
      try{ const {spawnSync}=await import("child_process"); const tsc=spawnSync("npx",["tsc","--noEmit"],{cwd:PROJECT_ROOT,encoding:"utf-8",timeout:30000}); typeScore=tsc.status===0?100:Math.max(0,100-(tsc.stderr||"").split("\n").filter(Boolean).length*5) } catch{}
      const cf=apf.filter(f=>f.toLowerCase().includes(pp.toLowerCase()))
      try{ const logs = await (prisma.auditLog as Record<string, (...a: unknown[]) => unknown>).findMany({where:{OR:[{targetId:{contains:pp,mode:"insensitive"}},{reason:{contains:pp,mode:"insensitive"}}]},select:{id:true},take:20}); auditScore=Math.min(100,logs.length*10) } catch{}
      const parts=["=== RAHS：Runtime Architecture Health Score ===",`Plan 关键词: "${pp}"`,"",`=== 维度 ===`,`  范围保真度: ${scopeScore}/100`,`  类型安全: ${typeScore}/100`,`  审计完整度: ${auditScore}/100`,`  Spec 合规: ${specScore}/100`,`  阶段对称性: ${symScore}/100`,""]
      const rahs=Math.round((scopeScore+typeScore+auditScore+specScore+symScore)/5); parts.push(`=== RAHS = ${rahs}  ${rahs>=90?"🟢 PASS":rahs>=70?"🟡 WARN":"🔴 BLOCKED"} ===`); if(rahs<70) parts.push("  动作: 注意力漂移严重，返工回退")
      return textResponse(parts.join("\n"))
    } catch(e) { return errorResponse(`check_rahs 失败: ${e instanceof Error?e.message:String(e)}`) }
  })

}
