# PoseSketcher

[![Online Demo](https://img.shields.io/badge/Demo-gladpax.github.io-success?style=flat-square&logo=github)](https://gladpax.github.io/PoseSketcher/)
[![YouTube Demo](https://img.shields.io/badge/YouTube-Video-red?style=flat-square&logo=youtube)](https://youtu.be/97MVFyPoLcg)

> A lightweight, stroke-based 2D pose reference and sketch tool built with React and SVG.  
> 极简笔触驱动的 2D 人体姿态起稿与参考工具。

---

## 📖 Introduction / 项目简介

**PoseSketcher** 是一款专为画师、原画设计师与速写爱好者设计的极简人体姿态起稿工具。遵循“一笔定躯干主轴，四笔引出四肢”的直觉手感，快速在画布上生成具各有关节结构和透视的人体 2D 骨骼与体块模型。

生成后，用户可通过拖曳关节点对人体姿态进行灵活微调，或通过侧边栏自定义角色身体比例蓝图，极大提高绘画前期草图打型、动态捕捉与动作设计的效率。

---

## ✨ Features / 核心特性

- **笔触快速起稿 (Stroke-based Skeleton Generation)**
  - 划出第一笔（≥ 20px）即按比例分配头、颈、胸腰、骨盆主轴。
  - 悬停于肩/髋关节点起笔划线，自动识别吸附并推算手臂与腿部关节。
- **空间视角切换 (Front & Side Views)**
  - **正面模式**（鼠标左键绘制主轴）：生成具备标准肩宽与骨盆宽度的人体结构。
  - **侧面透视模式**（鼠标右键绘制主轴）：自动压缩两肩及骨盆横向投影间距，呈现侧身动态与同侧朝向。
- **层级联动编辑 (Hierarchical Joint Dragging)**
  - 具备自然的父子节点带动机制（如移动颈部带动头部、移动腰部带动双腿），姿态调整不脱节。
- **角色形态蓝图自定义 (Blueprint & Proportions Editor)**
  - 支持调整各关节点相对缩放、躯干粗细、头身比及体块透明度。
  - 支持导入/导出 JSON 角色比例预设。
- **纯矢量高性能渲染 (Pure SVG Architecture)**
  - 全流程采用纯 SVG 矢量节点与胶囊体渲染，无外部重型 3D 依赖，缩放无损、响应迅捷。
- **一键导出与复制 (Export & Clipboard)**
  - 支持一键导出透明通道 PNG，或直接复制高分辨率图层至剪贴板，无缝粘贴至 Photoshop/Sai/Procreate。

---

## ⌨️ Shortcuts / 快捷键参考

| 按键 | 功能说明 |
| :--- | :--- |
| `Ctrl + Z` | 撤销上一步操作 |
| `Delete` | 清空当前画布 |
| `1` | 切换骨骼辅助线条显隐 |
| `2` | 切换关节点显隐 |
| `3` | 切换外轮廓/体块胶囊体显隐 |
| `B` | 切换拇指/次要关节显隐 |
| `Space + 拖动` | 画布平移浏览 |

---

## 🚀 Quick Start / 快速上手

### 环境要求
- Node.js ≥ 18.0.0
- npm ≥ 9.0.0

### 安装与启动

1. **克隆仓库**
   ```bash
   git clone https://github.com/<your-username>/PoseSketcher.git
   cd PoseSketcher
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **启动本地开发服务器**
   ```bash
   npm run dev
   ```
   启动后访问 `http://localhost:3000` 即可开始使用。

4. **构建生产版本**
   ```bash
   npm run build
   npm run preview
   ```

---

## 🛠 Tech Stack / 技术栈

- **Core**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite 6](https://vitejs.dev/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Graphics**: Scalable Vector Graphics (SVG)

---

## 📄 License / 开源许可

本项目遵循 [Apache-2.0 License](LICENSE) 开源协议。
