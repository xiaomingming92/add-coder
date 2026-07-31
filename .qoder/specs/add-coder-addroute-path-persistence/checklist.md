# Checklist: add-coder-addroute-path-persistence

- [x] [T] Schema 字段新增不破坏现有 Migration
- [x] [T] plan_track 扫描 add-route 逻辑不阻断 plan 落库
- [x] [T] plan_status 返回 addRoutePath
- [x] [T] plan_track 现有行为不受影响（plan/specs/tasks/checklist 路径仍正常写入）
- [x] [T] farm-agent sync 后 prisma generate 无报错
- [x] [R] farm-agent 端 plan_track 验证 addRoutePath 非空
- [x] [R] farm-agent 端 plan_status 验证返回 addRoutePath
