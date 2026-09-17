<div align="center">

# dotpm

**在 Obsidian 中做项目管理。基于纯 Markdown 笔记的表格、甘特图和看板。**

[![Obsidian community plugin](https://img.shields.io/badge/Obsidian-community%20plugin-7c3aed?logo=obsidian&logoColor=white)](https://obsidian.md/plugins?id=project-manager)
[![Downloads](https://img.shields.io/github/downloads/dotpm/obsidian-pm/total?color=2ea44f)](https://github.com/dotpm/obsidian-pm/releases)
[![License](https://img.shields.io/github/license/dotpm/obsidian-pm)](LICENSE)
[![Donate](https://img.shields.io/badge/Donate-Buy%20me%20a%20coffee-ffdd00?logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/kropachev)

[安装](#安装) | [快速上手](#快速上手) | [文档](docs) | [网站](https://dotpm.pm) | [更新日志](CHANGELOG.md)

[English](README.md) | 简体中文

<img width="1422" alt="dotpm 仪表盘" src="https://github.com/user-attachments/assets/ca6bc67f-e656-45be-b93a-17410555ec1a" />

</div>

项目管理工具把计划放在一个应用里，把对计划的思考放在另一个应用里。dotpm 把两者都留在仓库中。项目是一条笔记，任务也是一条笔记，表格、时间线和看板只是查看同一批文件的三种方式。

- 是排期，不是复选框。任务有开始日期和截止日期，依赖关系以箭头呈现，甘特图会在前置任务延期时自动推移后续任务。
- 任务就是完整的笔记。每个任务都有正文、反向链接、标签和属性，所以搜索、关系图谱、模板和 Dataview 都能直接使用。
- 智能体和脚本也能操作看板。本地 HTTP 与 MCP 服务器以及命令行客户端编辑的正是视图所用的同一批笔记，编程智能体可以领取任务、更新任务并关闭任务。
- 无需注册任何服务。项目随仓库现有的同步方式一起同步，项目文件夹也能像代码一样在 git 中查看差异和审阅。
- 支持桌面端和移动端，任何视图都能导出为单个 HTML 文件，无需 Obsidian 即可打开。

## 安装

在 Obsidian 中打开 **设置 > 第三方插件 > 浏览**，搜索 **dotpm**，安装并启用。也可以直接打开[插件页面](https://obsidian.md/plugins?id=project-manager)。

需要 Obsidian 1.13 或更高版本。支持桌面端和移动端。

<details>
<summary>测试版与手动安装</summary>

**BRAT：**安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat)，选择 **Add beta plugin**，输入 `dotpm/obsidian-pm`。

**手动：**从[最新发布版本](https://github.com/dotpm/obsidian-pm/releases/latest)下载 `main.js`、`manifest.json` 和 `styles.css`，放入 `<vault>/.obsidian/plugins/project-manager/`，然后重新加载 Obsidian 并启用插件。

</details>

## 快速上手

1. 点击侧边栏的时间线图标，或运行命令 **dotpm: 打开项目面板**。
2. 点击 **新建项目**，输入名称并打开它。
3. 点击 **添加任务**。设置状态、截止日期、负责人，按需填写。
4. 在视图顶部的 **表格**、**甘特图** 和 **看板** 之间切换。
5. 看看你的仓库。里面多了一条 `Projects/你的项目.md` 笔记和一个 `Projects/你的项目_tasks/` 文件夹，每个任务一条笔记。

已经有想作为任务的笔记？运行 **dotpm: 将笔记导入为任务**。要把现有笔记变成项目，在它的属性中加入 `pm-project: true`，然后运行 **dotpm: 将当前文件作为项目打开**。

## 视图

### 表格

行可以排序、筛选和就地编辑。多选几行后，可以一次为它们全部修改状态、优先级、负责人、标签、截止日期或父任务。筛选和排序的组合可以保存为命名视图。

<video src="https://github.com/user-attachments/assets/104bd993-d4c1-42e7-9d6a-ae46fd7ce6a8" autoplay loop muted playsinline width="600"></video>

### 甘特图

拖动条形可以重新排期，拖动条形边缘可以改变工期，从一个条形拖到另一个条形可以添加依赖。时间刻度可以从天缩放到年。里程碑显示为菱形，一条竖线标出今天。

<video src="https://github.com/user-attachments/assets/916f7100-44ef-401c-abb3-e003a0f7720a" autoplay loop muted playsinline width="600"></video>

### 看板

每个状态一列。把卡片拖到另一列即可修改状态。卡片显示优先级、负责人、标签和截止日期。

<video src="https://github.com/user-attachments/assets/316fc43b-6915-499a-a6ad-0680c462d014" autoplay loop muted playsinline width="600"></video>

## 功能

**任务**

- 任意层级的子任务
- 项目内或跨项目的依赖关系，以及里程碑
- 开始日期、截止日期、进度、负责人、标签
- 重复任务
- 时间预估和时间记录
- 自定义字段：文本、数字、日期、单选、多选、人员、复选框、URL
- 每个任务都有 Markdown 正文

**计划**

- 自动排期：前置任务移动时，后续任务跟着移动
- 截止日期提醒
- 归档，可手动，也可在设定天数后自动归档
- 撤销与重做

**组织**

- 子项目，每个项目都有概览页：进度、里程碑、子项目、属性
- 一个视图可以覆盖单个项目、其子树、一个文件夹或整个仓库
- 归档已完成或不再相关的项目，其子项目一并归档
- 保存视图：命名的筛选和排序组合
- 在表格中批量编辑
- 负责人对应的人员笔记，附带每个人的任务列表

**自定义**

- 状态和优先级可设置标签、颜色和图标，全局或按项目
- 按项目覆盖默认视图、排期和归档设置
- 团队成员，全局或按项目

## 文件格式

一个任务长这样。可以在 Obsidian 中打开，在任何文本编辑器中编辑，或在 git 中查看差异。

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

同步方式与其他笔记完全相同。Obsidian Sync、iCloud、Syncthing 和 git 都会一并同步项目。两个人同时编辑同一个任务会产生普通的同步冲突，除此之外没有实时协作。

## Obsidian 之外

**分享视图。** **dotpm: 将当前视图导出为 HTML** 会把当前打开的表格、时间线或看板写成一个文件，任何浏览器都能打开，任务、筛选条件和图标都包含在内。

**本地 API 与 MCP。** 打开 **设置 > 本地 API**，桌面端会在 `127.0.0.1` 上提供仓库中的项目数据，并通过 bearer 令牌鉴权。脚本使用普通 HTTP；编程智能体通过 Model Context Protocol 连接：

```sh
claude mcp add --transport http dotpm http://127.0.0.1:<port>/mcp --header "Authorization: Bearer <token>"
```

**命令行。** `npm install -g @dotpm/cli` 会安装 `dotpm` 命令。在仓库文件夹内运行时，它会自动找到服务器。

```sh
dotpm projects
dotpm create <projectId> --title "Write the release notes" --due 2026-09-20
dotpm search release --status todo
```

客户端做的每一处修改都经过视图所用的同一套代码，并立即显示在 Obsidian 中。详见 [docs/api.md](docs/api.md) 和 [docs/cli.md](docs/cli.md)。

**TaskNotes。** dotpm 可以导入 TaskNotes 任务，保留其日期、依赖关系和层级，还能与它共用状态和优先级。详见 [docs/tasknotes.md](docs/tasknotes.md)。

## 参与贡献

Bug 报告和功能需求请提交到 [issues](https://github.com/dotpm/obsidian-pm/issues)。欢迎提交 Pull Request。如果改动大于一个修复，请先开一个 issue，在动手之前就方案达成一致。

本仓库是运行在 Node 24 上的 pnpm workspace。`pnpm dev` 会构建到 `VAULT_PATH` 指定的仓库中，CI 运行的是 `pnpm check`、`pnpm check:submission` 和 `pnpm test`。

## 许可证

[MIT](LICENSE)
