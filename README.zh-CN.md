<div align="center">

# dotpm

**Obsidian 里的项目管理。用表格、甘特图和看板管理纯 Markdown 笔记。**

[![Obsidian community plugin](https://img.shields.io/badge/Obsidian-community%20plugin-7c3aed?logo=obsidian&logoColor=white)](https://obsidian.md/plugins?id=project-manager)
[![Downloads](https://img.shields.io/github/downloads/dotpm/obsidian-pm/total?color=2ea44f)](https://github.com/dotpm/obsidian-pm/releases)
[![License](https://img.shields.io/github/license/dotpm/obsidian-pm)](LICENSE)
[![Donate](https://img.shields.io/badge/Donate-Buy%20me%20a%20coffee-ffdd00?logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/kropachev)

[安装](#安装) | [快速上手](#快速上手) | [文档](docs) | [官网](https://dotpm.pm) | [更新日志](CHANGELOG.md)

[English](README.md) | 简体中文

<img width="1422" alt="dotpm 仪表盘" src="https://github.com/user-attachments/assets/ca6bc67f-e656-45be-b93a-17410555ec1a" />

</div>

用项目管理工具时，计划在一个软件里，围绕计划的思考却在另一个软件里。dotpm 把这两样都放进你的仓库：一个项目就是一条笔记，一个任务也是一条笔记，而表格、时间线和看板，不过是看同一批文件的三个角度。

- 真正的排期，而不是打勾清单。任务有开始和截止日期，依赖关系画成箭头，前置任务一延期，甘特图会自动把后面的任务顺延。
- 任务本身就是一条完整的笔记，有正文、反向链接、标签和属性。搜索、关系图谱、模板、Dataview，全都照常可用。
- 智能体和脚本也能干活。本地 HTTP / MCP 服务和命令行客户端改的就是视图里那些笔记，编程智能体可以自己领任务、更新进度、把它关掉。
- 不用注册任何账号。仓库怎么同步，项目就怎么同步；项目文件夹也可以像代码一样放进 git 看 diff、做审阅。
- 桌面端和移动端都能用。任何视图都能导出成一个 HTML 文件，没装 Obsidian 也能打开。

## 安装

在 Obsidian 中打开 **设置 > 第三方插件 > 浏览**，搜索 **dotpm**，安装后启用即可。也可以直接打开[插件页面](https://obsidian.md/plugins?id=project-manager)。

需要 Obsidian 1.13 或更高版本，桌面端和移动端均可。

<details>
<summary>测试版与手动安装</summary>

**BRAT：**安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat)，选择 **Add beta plugin**，填入 `dotpm/obsidian-pm`。

**手动安装：**从[最新版本](https://github.com/dotpm/obsidian-pm/releases/latest)下载 `main.js`、`manifest.json` 和 `styles.css`，放到 `<vault>/.obsidian/plugins/project-manager/` 目录下，重新加载 Obsidian 后启用插件。

</details>

## 快速上手

1. 点击左侧栏的时间线图标，或者运行命令 **dotpm: 打开项目面板**。
2. 点击 **新建项目**，起个名字，打开它。
3. 点击 **添加任务**，按需填上状态、截止日期、负责人等信息。
4. 在视图顶部的 **表格**、**甘特图**、**看板** 之间随意切换。
5. 回到仓库看一眼：多了一条 `Projects/你的项目.md` 笔记，还有一个 `Projects/你的项目_tasks/` 文件夹，每个任务一条笔记。

已经有一堆笔记想直接当任务用？运行 **dotpm: 将笔记导入为任务**。想把现有笔记变成项目，只需在它的属性里加上 `pm-project: true`，再运行 **dotpm: 将当前文件作为项目打开**。

## 视图

### 表格

支持排序、筛选和就地编辑。选中多行后，可以一次性改掉它们的状态、优先级、负责人、标签、截止日期或父任务。常用的筛选和排序组合还能存成一个命名视图。

<video src="https://github.com/user-attachments/assets/104bd993-d4c1-42e7-9d6a-ae46fd7ce6a8" autoplay loop muted playsinline width="600"></video>

### 甘特图

拖动条形改日期，拖动条形两端改工期，从一个条形拖到另一个就建立依赖。时间刻度从天到年任意缩放。里程碑显示为菱形，一条竖线标出今天的位置。

<video src="https://github.com/user-attachments/assets/916f7100-44ef-401c-abb3-e003a0f7720a" autoplay loop muted playsinline width="600"></video>

### 看板

一种状态一列，把卡片拖到别的列就是改状态。卡片上直接显示优先级、负责人、标签和截止日期。

<video src="https://github.com/user-attachments/assets/316fc43b-6915-499a-a6ad-0680c462d014" autoplay loop muted playsinline width="600"></video>

## 功能一览

**任务**

- 子任务，层级不限
- 依赖关系（项目内、跨项目均可）和里程碑
- 开始日期、截止日期、进度、负责人、标签
- 重复任务
- 工时预估与工时记录
- 自定义字段：文本、数字、日期、单选、多选、人员、复选框、URL
- 每个任务都有自己的 Markdown 正文

**计划**

- 自动排期：前置任务一动，后续任务跟着动
- 到期提醒
- 归档：手动归档，或到期一定天数后自动归档
- 撤销与重做

**组织**

- 子项目；每个项目都有概览页，汇总进度、里程碑、子项目和属性
- 一个视图既可以只看一个项目，也可以看它的整棵子树、一个文件夹，乃至整个仓库
- 已完成或不再需要的项目可以归档，子项目随之归档
- 保存视图：把筛选加排序的组合存起来，起个名字
- 在表格里批量编辑
- 负责人对应人员笔记，每个人都有自己的任务列表，头像颜色可由笔记的 `color` 属性设置

**自定义**

- 状态和优先级的名称、颜色、图标都能改，全局或单个项目均可
- 单个项目可以覆盖默认视图、排期和归档设置
- 团队成员，全局或按项目设置

## 文件格式

一个任务大概长这样。在 Obsidian 里打开，用任何文本编辑器改，或者放进 git 看 diff，都没问题。

```yaml
---
pm-task: true
projectId: '[[Website redesign]]'
title: 'Write the launch post'
type: 'task'
status: 'in-progress'
priority: 'high'
start: '2026-09-01'
due: '2026-09-20'
progress: 40
assignees: ['[[Alice]]']
tags: ['marketing']
dependencies: ['[[Design the homepage]]']
---
Draft, review with the team, publish on launch day.
```

同步和普通笔记没有任何区别，Obsidian Sync、iCloud、Syncthing、git 都能把项目一起带上。两个人同时改同一个任务，会得到一个普通的同步冲突；除此之外没有实时协作功能。

## 走出 Obsidian

**分享视图。** 运行 **dotpm: 将当前视图导出为 HTML**，当前的表格、时间线或看板会被写成一个文件，任何浏览器都能打开，任务、筛选条件和图标全部内嵌。

**本地 API 与 MCP。** 打开 **设置 > 本地 API**，桌面端就会在 `127.0.0.1` 上提供仓库里的项目数据，用 bearer 令牌鉴权。脚本走普通 HTTP，编程智能体走 Model Context Protocol：

```sh
claude mcp add --transport http dotpm http://127.0.0.1:<port>/mcp --header "Authorization: Bearer <token>"
```

**命令行。** `npm install -g @dotpm/cli` 安装 `dotpm` 命令。在仓库目录下运行，它会自己找到服务。

```sh
dotpm projects
dotpm create <projectId> --title "Write the release notes" --due 2026-09-20
dotpm search release --status todo
```

客户端的每一次修改都走视图用的那套代码，Obsidian 里立刻就能看到。详见 [docs/api.md](docs/api.md) 和 [docs/cli.md](docs/cli.md)。

**TaskNotes。** dotpm 能导入 TaskNotes 的任务，日期、依赖和层级都保留，还可以和它共用一套状态和优先级。详见 [docs/tasknotes.md](docs/tasknotes.md)。

## 参与贡献

Bug 和功能建议请提 [issue](https://github.com/dotpm/obsidian-pm/issues)。欢迎 Pull Request；如果改动不止是一个小修复，请先开 issue 聊聊思路，免得做完了方向不对。

仓库是一个 pnpm workspace，基于 Node 24。`pnpm dev` 会把构建产物直接输出到 `VAULT_PATH` 指定的仓库；CI 跑的是 `pnpm check`、`pnpm check:submission` 和 `pnpm test`。

## 许可证

[MIT](LICENSE)
