import * as z from "zod/v4"
import type { ToolRegistrar } from "./registrar.js"
import { textResponse, errorResponse } from "../shared/response.js"

export function registerQualityTools(server: ToolRegistrar) {

  // ===== check_phase_symmetry (L615-679) =====
  server.registerTool("check_phase_symmetry", {
    description: "检查代码中的阶段标记对称性（ADD-2 阶段标记对称）。统计 auditPhaseStart/End 配对情况。",
    inputSchema: z.object({ code: z.string().describe("要检查的 TypeScript 代码文本") }),
  }, (args, _ctx) => {
    try {
      const code = args.code; if(!code) return errorResponse("code 参数不能为空")
      const sr=/auditPhaseStart\(["']([^"']+)["']/g, er=/auditPhaseEnd\(["']([^"']+)["']/g
      const ss:string[]=[], es:string[]=[]; let m
      while((m=sr.exec(code))!==null) ss.push(m[1]); while((m=er.exec(code))!==null) es.push(m[1])
      const sc:Record<string,number>={}, ec:Record<string,number>={}
      for(const s of ss) sc[s]=(sc[s]||0)+1; for(const e of es) ec[e]=(ec[e]||0)+1
      const ap=new Set([...Object.keys(sc),...Object.keys(ec)]); const asym:string[]=[]
      ap.forEach(p=>{ const a=sc[p]||0,b=ec[p]||0; if(a!==b) asym.push(`  ⚠️ ${p}: Start=${a}, End=${b} (${a>b?"缺少 End":"缺少 Start"})`) })
      const l=[`=== ADD-2 阶段标记对称性检查 ===`,`Start 总数: ${ss.length}`,`End 总数: ${es.length}`,""]
      if(!asym.length) l.push("✅ 阶段标记完全对称"); else l.push(`❌ 发现 ${asym.length} 个不对称阶段:`,...asym)
      l.push("","=== 所有阶段明细 ==="); ap.forEach(p=>l.push(`  ${p}: Start=${sc[p]||0}, End=${ec[p]||0}`))
      return textResponse(l.join("\n"))
    } catch(e) { return errorResponse(`检查阶段对称性失败: ${e instanceof Error?e.message:String(e)}`) }
  })

  // ===== check_failure_path (L681-757) =====
  server.registerTool("check_failure_path", {
    description: "检查失败路径审计信息密度（ADD-6）。对比 try 块与 catch 块的 extra 字段数。",
    inputSchema: z.object({ code: z.string().describe("要检查的 TypeScript 代码文本") }),
  }, (args, _ctx) => {
    try {
      const code = args.code; if(!code) return errorResponse("code 参数不能为空")
      const sec = args.code.split(/catch\s*\(/); if(sec.length<=1) return textResponse("=== ADD-6 失败路径审计检查 ===\n\n未检测到 try/catch 块。")
      const l=[`=== ADD-6 失败路径审计信息密度检查 ===`,`检测到 ${sec.length-1} 个 catch 块`,""]; let ap=true
      for(let i=1;i<sec.length;i++){ const cb=sec[i],ce=cb.indexOf("{"); if(ce===-1) continue
        const tb=sec[i-1]; const tem=tb.match(/extra[:\s]*\{[^}]*\}/g); const tfc=tem?tem.reduce((s,m)=>s+(m.match(/\w+:/g)?.length||0),0):0
        const ci=cb.indexOf("}"),cbd=cb.slice(ce,ci+1); const cem=cbd.match(/extra[:\s]*\{[^}]*\}/g); const cfc=cem?cem.reduce((s,m)=>s+(m.match(/\w+:/g)?.length||0),0):0
        const ch=cbd.includes("throw"), ca=cbd.includes("audit")||cbd.includes("Audit"); const cid=cfc+(ch?2:0)+(ca?2:0)
        l.push(`--- Catch 块 #${i} ---`); if(cid>=tfc&&ca) l.push("  ✅ 失败路径审计信息密度充足"); else { ap=false; if(!ca) l.push("  ❌ catch 块缺少审计调用"); if(cid<tfc) l.push(`  ❌ 信息密度不足: catch=${cfc}, try=${tfc}`) }
        l.push(`  try extra 字段数: ${tfc}`,`  catch extra 字段数: ${cfc}`,`  有审计调用: ${ca?"是":"否"}`,`  有 throw: ${ch?"是":"否"}`,"")
      }
      l.push(ap?"✅ 所有 catch 块满足 ADD-6":"⚠️ 部分 catch 块需补充审计信息")
      return textResponse(l.join("\n"))
    } catch(e) { return errorResponse(`检查失败路径失败: ${e instanceof Error?e.message:String(e)}`) }
  })

  // ===== generate_audit_logger (L759-990) =====
  server.registerTool("generate_audit_logger", {
    description: "生成符合三层分离模式的新审计日志器完整代码。遵循 ADD-1~6 原则。",
    inputSchema: z.object({
      domain: z.string().describe("审计日志器域名（小写中划线）"),
      phases: z.string().describe("业务阶段枚举列表（逗号分隔，大写蛇形）"),
      prefix: z.string().describe("审计前缀标识"),
    }),
  }, (args, _ctx) => {
    try {
      const {domain,phases,prefix} = args; if(!domain||!phases||!prefix) return errorResponse("domain, phases, prefix 参数均不能为空")
      const pl=phases.split(",").map(p=>p.trim()).filter(Boolean); if(!pl.length) return errorResponse("phases 必须包含至少一个阶段")
      const fn=domain.split("-").map(s=>s.charAt(0).toUpperCase()+s.slice(1)).join(""), ld=`logs/${domain}/`, lf=`${domain}.log`
      const te=pl.map(p=>`  | "${p}"`).join("\n"), fp=fn.charAt(0).toLowerCase()+fn.slice(1)
      const dlg=`=== 三层分离式审计日志器: ${domain} ===\n域名: ${domain}\n前缀: [${prefix}]\n日志目录: ${ld}\n阶段数: ${pl.length}\n阶段列表: ${pl.join(", ")}\n\n=== 文件1: src/lib/${domain}-dev-logger.ts (Layer 1) ===\n--- 模板代码 ---\nimport * as fs from "fs/promises"\nimport * as path from "path"\nconst PREFIX = "[${prefix}]"\nconst LOG_DIR = path.join(process.cwd(), "${ld}")\nconst LOG_FILE = "${lf}"\nconst IS_DEV = process.env.NODE_ENV === "development"\ntype ${fn}AuditPhase =\n${te}\nexport function ${fp}Audit(phase: ${fn}AuditPhase, detail: string, extra?: Record<string, unknown>) { if (!IS_DEV) return; const msg = \`\${PREFIX} [\${new Date().toISOString()}] [\${phase}] \${detail}\${extra ? " | " + JSON.stringify(extra) : ""}\`; console.log(msg) }\nexport function ${fp}AuditPhaseStart(phase: ${fn}AuditPhase, description: string) { if (!IS_DEV) return; console.log(\`\${PREFIX} ═══ [\${phase}] 开始: \${description} ═══\`) }\nexport function ${fp}AuditPhaseEnd(phase: ${fn}AuditPhase, detail: string) { if (!IS_DEV) return; console.log(\`\${PREFIX} ═══ [\${phase}] 结束: \${detail} ═══\`) }\n\n=== 文件2: src/lib/${domain}-audit.ts (Layer 2) ===\nimport { prisma } from "@/lib/prisma"\nconst PREFIX2 = "[${prefix}:RUNTIME]"\ntype ${fn}AuditAction =\n${pl.map(p=>`  | "${p}"`).join("\n")}\nexport type ${fn}AuditRecord = { action: ${fn}AuditAction; entityId: string; detail: Record<string, unknown>; traceId?: string }\nexport async function record${fn}Audit(record: ${fn}AuditRecord): Promise<void> { console.log(\`\${PREFIX2} [\${new Date().toISOString()}] [\${record.action}] entity=\${record.entityId}\${record.traceId ? " trace="+record.traceId : ""}\${Object.keys(record.detail).length ? " | "+JSON.stringify(record.detail) : ""}\`); try { await prisma.auditLog.create({ data: { userId: "system", action: record.action, targetType: "${fn}", targetId: record.entityId, traceId: record.traceId||null, afterState: record.detail as Record<string,unknown>, reason: \`\${record.action} on \${record.entityId}\` } }) } catch(e) { console.error(\`\${PREFIX2} Failed to write AuditLog: \${e}\`) } }\n\n=== 使用方式 ===\n开发审计: import { ${fp}AuditPhaseStart, ${fp}AuditPhaseEnd, ${fp}Audit } from "@/lib/${domain}-dev-logger"\n运行时审计: import { record${fn}Audit } from "@/lib/${domain}-audit"`
      return textResponse(dlg)
    } catch(e) { return errorResponse(`生成审计日志器失败: ${e instanceof Error?e.message:String(e)}`) }
  })

  // ===== check_add_compliance (L1875-2101) =====
  server.registerTool("check_add_compliance", {
    description: "综合 ADD 合规检查（ADD-1~6 一键验证）。检查阶段标记对称性、失败路径审计密度、循环体审计、审计日志器导入完整性。",
    inputSchema: z.object({
      code: z.string().describe("要检查的 TypeScript 代码文本"),
      projectPattern: z.string().optional().default("event-based").describe("项目审计模式: 'event-based' 使用 auditPhaseStart/End, 'mixed' 同时检查 event 和 agentAudit"),
    }),
  }, (args, _ctx) => {
    try {
      const code=args.code; if(!code) return errorResponse("code 参数不能为空")
      const l=["=== ADD 合规检查（ADD-1~6）===",""]
      const sr=/auditPhaseStart\(["']([^"']+)["']/g, er=/auditPhaseEnd\(["']([^"']+)["']/g; const ss:string[]=[], es:string[]=[]; let m; while((m=sr.exec(code))!==null) ss.push(m[1]); while((m=er.exec(code))!==null) es.push(m[1])
      const sc:Record<string,number>={}, ec:Record<string,number>={}; for(const s of ss) sc[s]=(sc[s]||0)+1; for(const e of es) ec[e]=(ec[e]||0)+1
      const ap=new Set([...Object.keys(sc),...Object.keys(ec)]); let symOk=true; ap.forEach(p=>{if((sc[p]||0)!==(ec[p]||0)) symOk=false})
      l.push("[ADD-2] 阶段标记对称性:","  Start: "+ss.length+", End: "+es.length,symOk?"  ✅ 对称":"  ❌ 不对称: "+[...ap].filter(p=>(sc[p]||0)!==(ec[p]||0)).join(", "),"")
      const hasAgentAudit=code.includes("agentAudit(")
      l.push("[ADD-1] 审计导入: "+ (hasAgentAudit||ss.length>0?"✅ 已导入审计调用":"⚠️ 未检测到审计调用"),"")
      l.push("[ADD-3] 循环体审计: "+ (code.includes("for")||code.includes("while")||code.includes(".forEach")||code.includes(".map")? "⚠️ 循环体需逐项审计": "✅ 未检测到循环"),"")
      const hasConsole=code.includes("console.log"); const hasFile=code.includes("writeToFile")||code.includes("appendFile"); const hasPrisma=code.includes("prisma.")||code.includes("AuditLog")
      l.push("[ADD-4] 三通道输出: ",`  console: ${hasConsole?"✅":"⚠️"}`,`  file: ${hasFile?"✅":"⚠️"}`,`  DB: ${hasPrisma?"✅":"⚠️"}`,"")
      l.push("[ADD-5/6] 失败路径: "+(code.includes("catch")?"⚠️ catch 块需等价审计":"✅ 无异常处理"))
      return textResponse(l.join("\n"))
    } catch(e) { return errorResponse(`合规检查失败: ${e instanceof Error?e.message:String(e)}`) }
  })

}
