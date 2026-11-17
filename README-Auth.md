dya studio 设备身份校验 —— 独立分发包（UID 白名单版）
本包为 dya-studio 上位机增加「设备身份校验」，使其只识别你登记过 MCU 唯一 ID 的键盘，其他基于 ZMK Studio 协议的键盘（包括他人用你开源代码自制的新键盘）一律拒绝。
与旧版不同，本包将固件侧抽成了独立 ZMK 模块（noirix-auth），任何 ZMK 配置仓库都能通过 west.yml 一行引入，无需改动对方配置仓库的内部结构。
包结构
dya-studio-auth-package/
├── README.md                        # 本文件
├── 部署操作手册.md                   # 中文部署手册（GitHub Desktop + VSCode 版）
├── dya-studio/                      # ① 宿主侧改动（合并到 dya-studio 的 main 分支）
│   ├── proto/zmk/auth/auth.proto
│   ├── src/proto/zmk/auth/auth.ts
│   ├── src/lib/deviceAuth.ts
│   ├── src/hooks/useDeviceAuth.ts
│   ├── src/components/DeviceAuthGate.tsx
│   └── src/App.tsx
├── noirix-auth/                     # ② 固件侧：独立 ZMK 模块（托管成独立仓库后 west.yml 引入）
│   ├── zephyr/module.yml
│   ├── Kconfig
│   ├── CMakeLists.txt
│   ├── proto/zmk/auth/auth.proto
│   ├── proto/zmk/auth/auth.options
│   └── src/studio/auth_handler.c
└── examples/
    └── west.yml.snippet             # 使用方 config/west.yml 接入片段
一、工作原理（一句话）
键盘固件注册一个 ZMK Studio RPC 子系统 noirix__auth，宿主连接后向它索取 MCU 唯一 ID（device_id）；宿主把该 ID 做 SHA-256 后与白名单比对，命中才放行，否则断开并提示「该设备未在授权名单中」。
- 认证方式：MCU 唯一 ID 白名单（SHA-256 哈希存储），无共享密钥、无 HMAC
- 白名单：dya studio 侧维护「授权 device_id 的 SHA-256 哈希列表」，构建期注入
- 强度定位：防网上的第三方用你的开源代码自制键盘，不追求对抗专业逆向
为什么用哈希存白名单：MCU 唯一 ID 是 128 位随机值，即使白名单哈希泄露也无法反推出明文 ID 去伪造；实现极简（一次 SHA-256）。
二、① 宿主侧（dya-studio）接入
2.0 获取 dya-studio 仓库（GitHub Desktop）
dya-studio 源码仓库地址：https://github.com/NoirGuo/dya-studio
1. 打开 GitHub 网页，进入 NoirGuo/dya-studio，点右上角 Fork 到你自己的账号（后续可直接提交、推送）。
2. 打开 GitHub Desktop，File → Clone repository：选你自己的 dya-studio fork，或输入 NoirGuo/dya-studio 直接克隆上游。
3. 确认当前分支为 main（分支下拉里切换）。
仓库已 clone 到本地时，改用 File → Add local repository 指向该文件夹。
2.1 合并改动文件
把 dya-studio/ 目录下的文件按路径对应合并到你 fork 的 main 分支：
文件
类型
改动要点
proto/zmk/auth/auth.proto
新增
device_id-only 协议定义
src/proto/zmk/auth/auth.ts
新增
ts-proto 生成物：Request/Response 编解码
src/lib/deviceAuth.ts
新增
isDeviceAuthorized(deviceId)：SHA-256 + 白名单比对
src/hooks/useDeviceAuth.ts
新增
连接后读 device_id 并查白名单的 hook
src/components/DeviceAuthGate.tsx
新增
全屏门禁：校验中 / 拒绝（含断开按钮）
src/App.tsx
覆盖
在 StudioUnlockProvider 内挂载 <DeviceAuthGate />
⚠️ App.tsx 是覆盖：若你的 fork 里改过 App.tsx，先在 diff 里比对，别冲掉自己的定制。
2.2 构建客户端
dya-studio 是 Electron + Vite + React 项目，合并改动后先 npm install（需 Node.js 22+），再构建。以下命令均在终端（macOS/Linux）或 PowerShell（Windows）里执行：
命令
作用
npm run build
Web 版生产构建（产出 dist/）
npm run dist:mac / dist:win / dist:linux
桌面版安装包（.dmg / .exe / .AppImage）
npm run dev
本地开发（http://localhost:5173）
构建链会自动把 proto/zmk/auth/auth.proto 编译成 src/proto/zmk/auth/auth.ts，并把 deviceAuth.ts 等打进产物，无需改构建配置。
2.3 构建时注入白名单
白名单通过环境变量 VITE_NOIRIX_AUTH_DEVICE_IDS 在构建时注入（多个设备哈希用英文逗号分隔）。在「终端」（macOS/Linux）或「PowerShell」（Windows）里执行：
# macOS / Linux 终端
VITE_NOIRIX_AUTH_DEVICE_IDS="<哈希1>,<哈希2>" npm run build

# Windows PowerShell
$env:VITE_NOIRIX_AUTH_DEVICE_IDS="<哈希1>,<哈希2>"; npm run build
桌面版同理，换成 dist:mac / dist:win / dist:linux 即可。GitHub Actions 自动构建则在仓库 Secrets 里建 VITE_NOIRIX_AUTH_DEVICE_IDS 并在 env 中引用。
⚠️ 未设置该变量时 fail-closed：所有设备都会被拒绝。 完整分步说明见「部署操作手册.md · 五、构建客户端并注入白名单」。
三、② 固件侧（noirix-auth 独立模块）接入
3.1 把模块托管成独立 Git 仓库
把 noirix-auth/ 整个目录推送为一个独立仓库（如 https://github.com/<你>/noirix-auth）。目录内已含标准 zephyr/module.yml，是一个自包含 ZMK feature 模块（模块名 zmk-feature-noirix-auth）。
3.2 在使用方的 config/west.yml 引入
参考 examples/west.yml.snippet，在 remotes 和 projects 各加一条（在 VSCode 中编辑 config/west.yml）：
remotes:
  - name: noirix
    url-base: https://github.com/<你的账号或组织>

projects:
  - name: noirix-auth
    remote: noirix
    revision: main
3.3 在使用方的 .conf 开启
在 VSCode 中编辑对应的 .conf 文件（如 config/noirix44.conf）：
CONFIG_ZMK_STUDIO=y   # 需已开启（RPC 自定义子系统依赖）
CONFIG_NOIRIX_AUTH=y  # 本模块开关（Kconfig 已 select HWINFO，无需手动开 CONFIG_HWINFO）
固件侧无需注入任何密钥，任何人 fork 后构建出的固件烧到你的键盘都能正常上报 device_id。
四、白名单配置（务必先做）
4.1 采集键盘的 device_id
每把键盘的 MCU 唯一 ID 可通过以下任一方式获取：
- 键盘上电后串口日志（ZMK 会打印，或临时加日志）；
- 用 dya studio 连接该键盘，在调试信息里读 device_id（首次连接未授权会拒绝，但可先看到 ID）。
4.2 计算 SHA-256 哈希
在「终端」（macOS/Linux）或「Git Bash」（Windows）里执行：
printf '<device_id_hex>' | xxd -r -p | sha256sum
（或 `printf '<device_id_hex>'
openssl dgst -sha256`）
4.3 加入宿主白名单
把哈希加入 VITE_NOIRIX_AUTH_DEVICE_IDS（多个用英文逗号分隔），见「二、宿主侧接入」。
五、验证判定标准
#
测试
期望
V1
白名单内的键盘（device_id 哈希命中）连接
认证通过，全功能可用
V2
其他 ZMK Studio 键盘（无 noirix__auth 子系统）
提示「不支持身份校验」，拒绝
V3
有 noirix__auth 但 device_id 不在白名单
提示「未在授权名单中」，拒绝
V4
伪造 device_id（哈希无法命中）
拒绝
V5
Demo 模式 / BLE 通道
Demo 可用；BLE 同样过门禁
六、注意事项
- 旧版自有固件（未烧 auth 模块）升级后会被拒绝，需同步烧录新固件。
- 宿主使用 WebCrypto crypto.subtle（SHA-256），需运行在安全上下文（HTTPS / localhost）；Electron 若以 file:// 加载需确认其为安全上下文。
- 白名单哈希存储的是不可逆的 SHA-256，但前提是你不要公开 device_id 明文；若明文 device_id 泄露，他人可据此伪造（属"拿到实体/明文"级别的威胁，本方案不防）。