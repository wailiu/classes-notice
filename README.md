# 艺术培训学校管理系统

面向艺术类培训学校(素描、创意美术、书法、声乐、钢琴、古筝、架子鼓、拉丁舞)的一体化教务系统,单体仓库包含三端:

| 目录 | 说明 | 技术栈 |
| --- | --- | --- |
| `server/` | 共享后端 REST API | Node.js + NestJS + TypeORM + MySQL + JWT |
| `admin/` | 后台管理 Web(中文) | Vue 3 + Vite + Vue Router + Pinia + Element Plus |
| `mini/` | 微信小程序(家长 / 老师) | 原生小程序(WXML/WXSS/JS) |

## 功能总览

**后台 admin**
- 登录鉴权(超管 `super` / 前台教务 `staff` 两种角色)
- 工作台:在读学员数、今日课次、生效课时包、本月收入、今日待上课列表、剩余课时预警(≤3 课时)
- 学员档案:姓名/性别/生日/在读状态/备注,关联多位家长(含称谓)
- 家长管理:手机号、微信 openid 绑定;一个家长可关联多个孩子
- 老师管理:姓名/手机/微信绑定/擅长科目
- 课程科目:8 门艺术课(可增删改)
- 班级排课:教室、每周上课时间、容量、授课老师;按日期范围一键生成课次
- 课时包/报名:购买课时、剩余课时、有效期,报名时同步生成缴费流水;支持手动调整课时(赠课/纠错)。**新建课时包必须绑定课种**(不同课种费用不同,已取消"通用课时包")
- 缴费管理:金额/方式/状态/流水号,支持退费(联动作废课时包)、金额合计
- 课表与预约看板:按日期/班级筛选课次,查看预约名单,后台代预约、签到、缺勤、取消预约、取消课次(自动退课时)

**小程序 mini**
- 微信登录:开发环境 mock 免登(无需真实 AppId),生产可切换真实 `wx.login`
- 身份识别:家长 / 老师 / 未绑定(未绑定引导联系前台)
- 家长端:多孩子切换、剩余课时与课时包明细、未来两周课表(余位/已满/已约状态)、预约、取消预约、预约记录。课表展示学校全部课种,但**只能预约已购买课种**:未购买或该课种课时不足的课次按钮禁用,并展示"未购买该课种 / 该课种课时不足"等中文原因
- 老师端:未来两周所教课次(预约人数)、课次学员名单(含家长电话,可拨打)、帮学员签到

**核心业务规则(服务端强校验)**
- 预约:课次未开始、学员在读、不可重复预约、班级容量未满、同一时段无冲突,预约即扣 1 课时(事务 + 行锁防超扣)
- **课时严格按课种消耗**:不同课种费用不同,只能用与课次课种一致的课时包扣课(同课种多个包时先到期先用),买了素描不能约钢琴;学员未购买该课种、该课种课时不足或已过期时预约被拒绝并返回明确中文原因。小程序与后台代预约走同一套服务端校验,无法绕过
- **通用课时包已取消**:新建课时包必须绑定课种;历史 `courseId` 为空的"通用包"一律不可再用于预约(后台课时包列表会标红提示,可编辑处理)
- 取消:家长端开课前 2 小时内不可取消(可配置 `CANCEL_DEADLINE_HOURS`),取消退回课时;后台可强制取消
- 签到/缺勤:签到确认到课;缺勤不退课时
- 取消课次:该课次所有有效预约自动退回课时

## 本地启动

### 0. 前置要求

- Node.js ≥ 20
- Docker(用于一键启动 MySQL;或自备 MySQL 8)

### 1. 启动 MySQL

```bash
docker compose up -d
```

默认创建数据库 `art_school`,账号 `art / art123456`(见 `docker-compose.yml` 与 `.env.example`)。

> 不用 Docker 时:自行安装 MySQL 8,执行
> `CREATE DATABASE art_school DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
> 并创建相同账号,或修改 `server/.env` 指向你的实例。

### 2. 启动后端(端口 3000)

```bash
cd server
cp ../.env.example .env   # 按需修改数据库连接
npm install
npm run seed              # 建表 + 灌入演示数据(幂等,重复执行自动跳过)
npm run start:dev         # 开发模式;或 npm run build && npm start
```

### 3. 启动后台 admin(端口 5173)

```bash
cd admin
npm install
npm run dev
```

浏览器访问 http://localhost:5173 (开发服务器已将 `/api` 代理到 3000 端口)。

### 4. 打开小程序 mini

用【微信开发者工具】导入 `mini/` 目录(测试号即可):
1. 「详情 → 本地设置」勾选 **不校验合法域名、TLS 版本及 HTTPS 证书**(因为后端是 http://localhost:3000)
2. 编译后进入登录页,使用「开发模式 · 模拟身份登录」按钮即可体验家长/老师/未绑定三种身份

### 演示账号

| 端 | 账号 | 说明 |
| --- | --- | --- |
| admin | `admin / admin123` | 超级管理员 |
| admin | `reception / reception123` | 前台教务 |
| mini | mock 码 `mock-parent-1` | 家长「张爸爸」,名下两个孩子(张小明只买了素描、张小圆只买了创意美术,可用于验证"已购课种可约、未购课种不可约") |
| mini | mock 码 `mock-parent-2` | 家长「刘妈妈」(孩子刘一诺买了钢琴) |
| mini | mock 码 `mock-teacher-1` | 老师「王雪」(素描/创意美术) |
| mini | mock 码 `mock-teacher-2` | 老师「李墨」(书法) |
| mini | 其他任意 mock 码 | 未绑定身份,演示绑定引导 |

### 运行测试

```bash
cd server
npm test    # 预约/课时扣减/容量/冲突/取消 + 课种匹配(跨课种拒绝、通用包禁用、课表 canBook 标记)共 22 个用例
```

## 切换真实微信登录

开发环境默认 `WX_MOCK=true`:后端将登录 `code` 直接当作 openid,配合小程序登录页的「模拟身份」按钮使用,**无需真实 AppId**。

接入真实微信:
1. `server/.env` 设置 `WX_MOCK=false`,并填入 `WX_APPID`、`WX_SECRET`
2. `mini/project.config.json` 的 `appid` 改为你的小程序 AppId
3. `mini/utils/config.js` 设置 `devMock: false`,`baseUrl` 改为已备案的 https 域名(需在微信公众平台配置 request 合法域名)
4. 小程序端会走 `wx.login()` 获取真实 code,后端调用 `jscode2session` 换取 openid
5. 在后台「家长/老师管理」中把真实 openid 录入对应人员即可完成绑定(生产环境建议增加"手机号验证自助绑定"流程)

## 环境变量

见 `.env.example`,关键项:

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `DB_HOST/PORT/USER/PASSWORD/NAME` | 见文件 | MySQL 连接 |
| `DB_SYNC` | `true` | 自动同步表结构(生产请关闭并用迁移) |
| `JWT_SECRET` | dev 值 | 生产必须更换 |
| `CANCEL_DEADLINE_HOURS` | `2` | 开课前 N 小时禁止家长取消 |
| `LOW_HOURS_THRESHOLD` | `3` | 剩余课时预警阈值 |
| `WX_MOCK / WX_APPID / WX_SECRET` | mock 开 | 微信登录配置 |

## 目录结构

```
├── docker-compose.yml        # 一键启动 MySQL 8
├── .env.example              # 环境变量样例
├── server/                   # NestJS 后端
│   └── src/
│       ├── entities/         # 11 张表:管理员/学员/家长/关系/老师/科目/班级/课次/课时包/缴费/预约
│       ├── auth/             # 管理端登录 + 小程序登录(mock/真实微信) + JWT 守卫
│       ├── students|parents|teachers|courses/   # 基础档案 CRUD
│       ├── classes/          # 班级排课 + 课次生成/取消
│       ├── packages/         # 课时包(报名/调整/联动缴费)
│       ├── payments/         # 缴费流水/退费
│       ├── bookings/         # 预约/取消/签到/缺勤(核心规则 + 单测)
│       ├── dashboard/        # 工作台统计
│       ├── mini/             # 小程序家长端/老师端接口
│       └── seed/             # 种子数据脚本
├── admin/                    # Vue3 + Element Plus 后台
│   └── src/views/            # 登录/工作台/学员/家长/老师/课程/排课/课表预约/课时包/缴费
└── mini/                     # 原生微信小程序
    └── pages/                # 登录/家长(首页/预约/记录)/老师(首页/名单)/未绑定
```
