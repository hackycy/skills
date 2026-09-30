# mobile-interface-design

一个用于在**没有 UI 设计师或设计稿**时，从产品需求直接设计并实现移动端 H5 / Mobile Web / App WebView 的 Agent Skill。

它默认以页面为工作单元，但**有产品上下文时必须保持产品连续性**：新页面可以有适合自己任务的构图，但不能在已有 App 内悄悄创造第二套视觉系统。

## 它做什么

这套 skill 不会从需求直接跳到 CSS，而是走一套经过约束的设计搜索流程：

1. 保留产品事实和现有行为；
2. 判断主要移动端结果 / 使用模式；
3. 提取产品原生材料，但不强迫视觉主题化；
4. 只有结构真正开放时才探索多个结构方案；
5. 用语义表达档位代替 1–10 taste 分数；
6. 运行 **设计表达准入（Authored-Idea Gate）**——页面级 signature 是可选项；
7. 在继承已有产品规范的前提下提交页面 Visual Contract；
8. 使用项目技术栈或 HTML/CSS/JS 实现真实 UI；
9. 有浏览器能力时渲染并视觉评审；
10. 做替换、连续性、authorship 和 squint 测试；
11. 用轻量静态 validator 检查移动端技术问题和高置信生成式 UI 痕迹。

## 为什么要改设计搜索规则

**设计方法本身也会变成模板。**

如果要求每一页都必须有一个主 CTA、一个至少出现三次的 signature、一套数字 taste profile、一个命名 composition pattern，就会制造另一种 AI 同质化。

这个版本保留“先探索再收敛”的好处，但让表达服从真实任务：

- 监控页可以靠 scanning anchors，而不是强行一个 focal object；
- 设置、验证、账单详情可以完全没有页面级 signature；
- 领域知识可以只改变信息结构，而不变成可见主题；
- 已有产品通常应继承字体、控件、颜色语义、导航和动效风格。

## 核心流程

```text
需求
→ 产品事实
→ 使用模式
→ 领域材料
→ 必要时探索构图
→ 语义表达档位
→ 设计表达准入
→ Visual Contract
→ 实现
→ 渲染评审
→ 去模板化 + 连续性审计
→ 迭代
```

## 安装

把整个 `mobile-interface-design` 目录复制到 coding agent 使用的 skills 目录。

保持以下目录和 `SKILL.md` 同级：

- `resources/`
- `examples/`
- `scripts/`
- `assets/`
- `agents/`

## 可选依赖

如果安装了 Anthropic 公共 `frontend-design` skill，可以把它作为视觉 craft 依赖。本 skill 仍负责移动端层级、使用模式、人体工学、导航、WebView 约束和产品连续性。

## 浏览器评审

完整流程最好提供 Playwright、browser MCP 或等价渲染工具。

390px 可以作为首轮观察宽度，然后再检查更窄 / 更宽手机和真实目标设备。

没有渲染能力时仍可做静态推理和校验，但不能声称已经完成真实视觉验证。

## 静态验证

```bash
node /path/to/mobile-interface-design/scripts/validate-mobile-h5.mjs ./index.html
```

validator 是启发式工具。产品推理和真实渲染评审优先级更高。

## 设计哲学

这套 skill 组合了：产品事实驱动的结构、必要时的发散/收敛、语义表达档位、可选 authored idea、具体实现 token、移动端技术约束、产品连续性、渲染评审和轻量静态检查。
