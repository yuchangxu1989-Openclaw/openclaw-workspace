# 定向学术研究日报 2026-03-09
_采集时间: 2026-03-09T23:30:01.156Z_
_课题数量: 3_

## 知道自己不知道 (Known Unknowns / Unknown Unknowns)

_AI系统如何识别自身认知盲区、能力边界、知识缺口_

### SUREON: A Benchmark and Vision-Language-Model for Surgical Reasoning
🔗 http://arxiv.org/abs/2603.06570v1
📅 2026-03-06T18:58:36Z
> Surgeons don't just see -- they interpret. When an expert observes a surgical scene, they understand not only what instrument is being used, but why it was chosen, what risk it poses, and what comes next. Current surgical AI cannot answer such questions, largely because training data that explicitly

### The Pen: Episodic Cognitive Assistance via an Ear-Worn Interface
🔗 http://arxiv.org/abs/2603.06564v1
📅 2026-03-06T18:53:04Z
> Wearable AI is often designed as always-available, yet continuous availability can conflict with how people work and socialize, creating discomfort around privacy, disruption, and unclear system boundaries. This paper explores episodic use of wearable AI, where assistance is intentionally invoked fo

### Understanding and Finding JIT Compiler Performance Bugs
🔗 http://arxiv.org/abs/2603.06551v1
📅 2026-03-06T18:39:33Z
> Just-in-time (JIT) compilers are key components for many popular programming languages with managed runtimes (e.g., Java and JavaScript). JIT compilers perform optimizations and generate native code at runtime based on dynamic profiling data, to improve the execution performance of the running appli

### BEVLM: Distilling Semantic Knowledge from LLMs into Bird's-Eye View Representations
🔗 http://arxiv.org/abs/2603.06576v1
📅 2026-03-06T18:59:55Z
> The integration of Large Language Models (LLMs) into autonomous driving has attracted growing interest for their strong reasoning and semantic understanding abilities, which are essential for handling complex decision-making and long-tail scenarios. However, existing methods typically feed LLMs with

### Penguin-VL: Exploring the Efficiency Limits of VLM with LLM-based Vision Encoders
🔗 http://arxiv.org/abs/2603.06569v1
📅 2026-03-06T18:58:04Z
> Vision Language Model (VLM) development has largely relied on scaling model size, which hinders deployment on compute-constrained mobile and edge devices such as smartphones and robots. In this work, we explore the performance limits of compact (e.g., 2B and 8B) VLMs. We challenge the prevailing pra

### Hierarchical Industrial Demand Forecasting with Temporal and Uncertainty Explanations
🔗 http://arxiv.org/abs/2603.06555v1
📅 2026-03-06T18:44:37Z
> Hierarchical time-series forecasting is essential for demand prediction across various industries. While machine learning models have obtained significant accuracy and scalability on such forecasting tasks, the interpretability of their predictions, informed by application, is still largely unexplor

### 📋 本地系统排查方向

- [ ] 检查意图识别的no-match率和未知意图候选
- [ ] 检查规则库中缺少感知/执行层的规则数量
- [ ] 检查handler_not_found的模式是否暗示能力缺失
- [ ] 检查告警响应率（被忽视的告警=不知道自己应该知道的）
- [ ] 检查评测集覆盖率vs实际场景覆盖率的差距

## Agent自主进化

_undefined_

### BEVLM: Distilling Semantic Knowledge from LLMs into Bird's-Eye View Representations
🔗 http://arxiv.org/abs/2603.06576v1
📅 2026-03-06T18:59:55Z
> The integration of Large Language Models (LLMs) into autonomous driving has attracted growing interest for their strong reasoning and semantic understanding abilities, which are essential for handling complex decision-making and long-tail scenarios. However, existing methods typically feed LLMs with

### An ode to instantons
🔗 http://arxiv.org/abs/2603.06575v1
📅 2026-03-06T18:59:54Z
> We present a formalism for semiclassical time evolution in quantum mechanics, building on a century of work. We identify complex saddle points in real time, real saddle points in complex time, and complex saddle points in complex time that reproduce the known answers in classic problems. For the dec

### Third-order mixed electroweak-QCD corrections to the W-boson mass prediction from the muon lifetime
🔗 http://arxiv.org/abs/2603.06571v1
📅 2026-03-06T18:59:33Z
> We present the calculation of the so far missing ${\cal O}(α^2α_\mathrm{s})$ corrections to the quantity $Δr$, which relates the Fermi constant to the W-boson mass, and enables precision predictions of the latter. While the ${\cal O}(α^2α_\mathrm{s})$ corrections from diagrams with two closed fermio

### A class of d-dimensional directed polymers in a Gaussian environment
🔗 http://arxiv.org/abs/2603.06574v1
📅 2026-03-06T18:59:52Z
> We introduce and analyze a broad class of continuous directed polymers in $\mathbb{R}^d$ driven by Gaussian environments that are white in time and spatially correlated, under Dalang's condition. Using an Itô-renormalized stochastic-heat-equation representation, we establish structural properties of

### 📋 本地系统排查方向

- [ ] 检查evolver技能的运行频率和产出
- [ ] 检查CRAS的学习闭环是否真正闭合
- [ ] 检查ISC规则的全链路展开率

## 多Agent协同

_undefined_

### Omni-Diffusion: Unified Multimodal Understanding and Generation with Masked Discrete Diffusion
🔗 http://arxiv.org/abs/2603.06577v1
📅 2026-03-06T18:59:57Z
> While recent multimodal large language models (MLLMs) have made impressive strides, they predominantly employ a conventional autoregressive architecture as their backbone, leaving significant room to explore effective and efficient alternatives in architectural design. Concurrently, recent studies h

### BEVLM: Distilling Semantic Knowledge from LLMs into Bird's-Eye View Representations
🔗 http://arxiv.org/abs/2603.06576v1
📅 2026-03-06T18:59:55Z
> The integration of Large Language Models (LLMs) into autonomous driving has attracted growing interest for their strong reasoning and semantic understanding abilities, which are essential for handling complex decision-making and long-tail scenarios. However, existing methods typically feed LLMs with

### Fly360: Omnidirectional Obstacle Avoidance within Drone View
🔗 http://arxiv.org/abs/2603.06573v1
📅 2026-03-06T18:59:43Z
> Obstacle avoidance in unmanned aerial vehicles (UAVs), as a fundamental capability, has gained increasing attention with the growing focus on spatial intelligence. However, current obstacle-avoidance methods mainly depend on limited field-of-view sensors and are ill-suited for UAV scenarios which re

### SUREON: A Benchmark and Vision-Language-Model for Surgical Reasoning
🔗 http://arxiv.org/abs/2603.06570v1
📅 2026-03-06T18:58:36Z
> Surgeons don't just see -- they interpret. When an expert observes a surgical scene, they understand not only what instrument is being used, but why it was chosen, what risk it poses, and what comes next. Current surgical AI cannot answer such questions, largely because training data that explicitly

### Penguin-VL: Exploring the Efficiency Limits of VLM with LLM-based Vision Encoders
🔗 http://arxiv.org/abs/2603.06569v1
📅 2026-03-06T18:58:04Z
> Vision Language Model (VLM) development has largely relied on scaling model size, which hinders deployment on compute-constrained mobile and edge devices such as smartphones and robots. In this work, we explore the performance limits of compact (e.g., 2B and 8B) VLMs. We challenge the prevailing pra

### 📋 本地系统排查方向

- [ ] 检查子Agent空跑率（empty runs）
- [ ] 检查任务分配vs完成率
- [ ] 检查Agent间通信瓶颈

---
_共采集 15 篇论文，3 个课题有可操作洞察_