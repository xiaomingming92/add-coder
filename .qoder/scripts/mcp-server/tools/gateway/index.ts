// gateway/ 子模块拆分入口
// 各工具文件独立注册，由 registerGatewayTools 统一聚合并导出
import type { ToolRegistrar } from "../registrar.js";
import { registerCheckAddRouteStatus } from "./check_add_route_status.js";
import { registerCheckSpecSync } from "./check_spec_sync.js";
import { registerCheckAddRouteCompleteness } from "./check_add_route_completeness.js";
import { registerCheckDps } from "./check_dps.js";
import { registerCheckRahs } from "./check_rahs.js";
import { registerCheckDocSimilarity } from "./check_doc_similarity.js";

export function registerGatewayTools(server: ToolRegistrar) {
  registerCheckAddRouteStatus(server);
  registerCheckSpecSync(server);
  registerCheckAddRouteCompleteness(server);
  registerCheckDps(server);
  registerCheckRahs(server);
  registerCheckDocSimilarity(server);
}
