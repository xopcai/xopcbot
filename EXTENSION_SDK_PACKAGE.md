# Extension SDK 独立包方案

## 目标
将 `src/extension-sdk/` 提取为独立的 npm 包 `@xopcai/xopcbot-sdk`，供扩展开发者使用。

## 优势

1. **轻量级依赖** - 扩展开发者只需安装 SDK，无需安装整个 xopcbot
2. **版本独立** - SDK 可以独立版本发布，与 xopcbot 核心解耦
3. **类型安全** - 扩展开发时获得完整的 TypeScript 类型支持
4. **简化依赖** - xopcbot 核心不再需要在 `package.json` 中导出 `extension-sdk` 路径

## 目录结构

```
xopcbot-sdk/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # 主入口（当前 extension-sdk/index.ts 的内容）
│   ├── types.ts          # 从 extensions/types/ 提取的核心类型
│   ├── events.ts         # TypedEventBus 相关
│   ├── hooks.ts          # Hook 系统
│   └── utils.ts          # 工具函数
├── dist/                 # 编译输出
└── README.md
```

## package.json 示例

```json
{
  "name": "@xopcai/xopcbot-sdk",
  "version": "0.2.2",
  "description": "xopcbot Extension SDK - Build extensions for xopcbot",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "typescript": "^5.9.3"
  }
}
```

## 类型提取策略

当前 `extension-sdk` 是重新导出 `extensions/types/` 中的类型。独立包需要：

1. **复制核心类型** - 将 `ExtensionDefinition`, `ExtensionApi` 等核心类型复制到 SDK
2. **保持兼容** - 确保 xopcbot 核心中的类型与 SDK 类型兼容
3. **类型测试** - 添加类型测试确保两端类型一致

## xopcbot 核心适配

在 xopcbot 中安装 SDK 作为依赖：

```json
{
  "dependencies": {
    "@xopcai/xopcbot-sdk": "^0.2.2"
  }
}
```

然后修改 `src/extension-sdk/index.ts`：

```typescript
// 直接重新导出 SDK
export * from '@xopcai/xopcbot-sdk';
```

或者完全移除 `src/extension-sdk/`，在 package.json 中配置：

```json
{
  "exports": {
    "./extension-sdk": {
      "import": "@xopcai/xopcbot-sdk"
    }
  }
}
```

## 迁移步骤

### Phase 1: 创建 SDK 包

1. 创建 `packages/sdk/` 目录
2. 复制 `src/extension-sdk/index.ts` 到 `packages/sdk/src/index.ts`
3. 从 `src/extensions/types/` 提取核心类型到 SDK
4. 配置 SDK 的 package.json 和 tsconfig.json
5. 本地测试 SDK 编译

### Phase 2: 发布 SDK

1. 在 npm 注册 `@xopcai` scope
2. 发布 `@xopcai/xopcbot-sdk@0.2.2`
3. 创建 GitHub Actions 工作流自动发布

### Phase 3: xopcbot 适配

1. 安装 `@xopcai/xopcbot-sdk` 到 xopcbot
2. 修改 `src/extension-sdk/index.ts` 为重新导出
3. 删除 `src/extensions/types/`（如果类型已完全迁移到 SDK）
4. 测试所有扩展功能正常

### Phase 4: 清理

1. 删除 `src/extension-sdk/` 目录
2. 更新文档，指向新的 SDK 包
3. 发布 xopcbot 新版本

## 工作量估计

| 阶段 | 工作量 |
|------|--------|
| 创建 SDK 包 | 4-6 小时 |
| 发布 SDK | 1-2 小时 |
| xopcbot 适配 | 2-3 小时 |
| 测试验证 | 2-3 小时 |
| **总计** | **1-2 天** |

## 风险

1. **类型不同步** - SDK 和 xopcbot 核心类型可能不同步
   - 缓解: 添加类型兼容性测试

2. **循环依赖** - 如果 SDK 需要引用 xopcbot 核心类型
   - 缓解: 确保 SDK 只包含纯类型定义，不依赖运行时

3. **破坏性变更** - 扩展开发者需要更新导入路径
   - 缓解: 保持 `xopcbot/extension-sdk` 导出作为兼容性层

## 建议

考虑到当前 `extension-sdk` 只是一个类型重新导出文件，且没有复杂逻辑：

**短期**: 保持现状，它是一个轻量级的兼容层

**长期**: 当扩展生态发展壮大时，再考虑拆分为独立包

当前没有必要急于拆分，因为：
1. 它只是类型导出，没有增加包体积
2. 拆分需要维护两个包的版本同步
3. 当前扩展开发者数量有限
