# server - 共享后端 API

NestJS + TypeORM + MySQL + JWT,同时服务 admin 后台与 mini 小程序。

```bash
cp ../.env.example .env   # 修改数据库连接
npm install
npm run seed              # 建表 + 演示数据(幂等;SEED_FORCE=true npm run seed 可重灌)
npm run start:dev         # 开发模式(3000 端口)
npm run build && npm start
npm test                  # 预约核心规则单元测试
```

接口前缀 `/api`:
- `POST /api/auth/login` 后台登录;`POST /api/auth/mini-login` 小程序登录(WX_MOCK=true 时 code 即 openid)
- `/api/students|parents|teachers|courses|classes|lessons|packages|payments|bookings|dashboard/*` 后台接口(AdminGuard)
- `/api/mini/parent/*`、`/api/mini/teacher/*` 小程序接口(MiniGuard + 角色限制)

详细说明见仓库根目录 README。
