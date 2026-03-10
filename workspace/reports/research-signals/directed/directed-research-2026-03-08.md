# 定向学术研究日报 2026-03-08
_采集时间: 2026-03-08T23:30:01.220Z_
_课题数量: 3_

## 知道自己不知道 (Known Unknowns / Unknown Unknowns)

_AI系统如何识别自身认知盲区、能力边界、知识缺口_

### cuRoboV2: Dynamics-Aware Motion Generation with Depth-Fused Distance Fields for High-DoF Robots
🔗 http://arxiv.org/abs/2603.05493v1
📅 2026-03-05T18:58:04Z
> Effective robot autonomy requires motion generation that is safe, feasible, and reactive. Current methods are fragmented: fast planners output physically unexecutable trajectories, reactive controllers struggle with high-fidelity perception, and existing solvers fail on high-DoF systems. We present 

### Ansatz-Free Learning of Lindbladian Dynamics In Situ
🔗 http://arxiv.org/abs/2603.05492v1
📅 2026-03-05T18:57:25Z
> Characterizing the dynamics of open quantum systems at the level of microscopic interactions and error mechanisms is essential for calibrating quantum hardware, designing robust simulation protocols, and developing tailored error-correction methods. Under Markovian noise/dissipation, a natural chara

### Towards Provably Unbiased LLM Judges via Bias-Bounded Evaluation
🔗 http://arxiv.org/abs/2603.05485v1
📅 2026-03-05T18:52:28Z
> As AI models progress beyond simple chatbots into more complex workflows, we draw ever closer to the event horizon beyond which AI systems will be utilized in autonomous, self-maintaining feedback loops. Any autonomous AI system will depend on automated, verifiable rewards and feedback; in settings 

### Transformer-Based Inpainting for Real-Time 3D Streaming in Sparse Multi-Camera Setups
🔗 http://arxiv.org/abs/2603.05507v1
📅 2026-03-05T18:59:59Z
> High-quality 3D streaming from multiple cameras is crucial for immersive experiences in many AR/VR applications. The limited number of views - often due to real-time constraints - leads to missing information and incomplete surfaces in the rendered images. Existing approaches typically rely on simpl

### Accelerating Text-to-Video Generation with Calibrated Sparse Attention
🔗 http://arxiv.org/abs/2603.05503v1
📅 2026-03-05T18:59:32Z
> Recent diffusion models enable high-quality video generation, but suffer from slow runtimes. The large transformer-based backbones used in these models are bottlenecked by spatiotemporal attention. In this paper, we identify that a significant fraction of token-to-token connections consistently yiel

### POET-X: Memory-efficient LLM Training by Scaling Orthogonal Transformation
🔗 http://arxiv.org/abs/2603.05500v1
📅 2026-03-05T18:59:23Z
> Efficient and stable training of large language models (LLMs) remains a core challenge in modern machine learning systems. To address this challenge, Reparameterized Orthogonal Equivalence Training (POET), a spectrum-preserving framework that optimizes each weight matrix through orthogonal equivalen

### 📋 本地系统排查方向

- [ ] 检查意图识别的no-match率和未知意图候选
- [ ] 检查规则库中缺少感知/执行层的规则数量
- [ ] 检查handler_not_found的模式是否暗示能力缺失
- [ ] 检查告警响应率（被忽视的告警=不知道自己应该知道的）
- [ ] 检查评测集覆盖率vs实际场景覆盖率的差距

## Agent自主进化

_undefined_

### RoboPocket: Improve Robot Policies Instantly with Your Phone
🔗 http://arxiv.org/abs/2603.05504v1
📅 2026-03-05T18:59:38Z
> Scaling imitation learning is fundamentally constrained by the efficiency of data collection. While handheld interfaces have emerged as a scalable solution for in-the-wild data acquisition, they predominantly operate in an open-loop manner: operators blindly collect demonstrations without knowing th

### Safe-SAGE: Social-Semantic Adaptive Guidance for Safe Engagement through Laplace-Modulated Poisson Safety Functions
🔗 http://arxiv.org/abs/2603.05497v1
📅 2026-03-05T18:59:02Z
> Traditional safety-critical control methods, such as control barrier functions, suffer from semantic blindness, exhibiting the same behavior around obstacles regardless of contextual significance. This limitation leads to the uniform treatment of all obstacles, despite their differing semantic meani

### Cheap Thrills: Effective Amortized Optimization Using Inexpensive Labels
🔗 http://arxiv.org/abs/2603.05495v1
📅 2026-03-05T18:58:39Z
> To scale the solution of optimization and simulation problems, prior work has explored machine-learning surrogates that inexpensively map problem parameters to corresponding solutions. Commonly used approaches, including supervised and self-supervised learning with either soft or hard feasibility en

### FaceCam: Portrait Video Camera Control via Scale-Aware Conditioning
🔗 http://arxiv.org/abs/2603.05506v1
📅 2026-03-05T18:59:58Z
> We introduce FaceCam, a system that generates video under customizable camera trajectories for monocular human portrait video input. Recent camera control approaches based on large video-generation models have shown promising progress but often exhibit geometric distortions and visual artifacts on p

### Accelerating Text-to-Video Generation with Calibrated Sparse Attention
🔗 http://arxiv.org/abs/2603.05503v1
📅 2026-03-05T18:59:32Z
> Recent diffusion models enable high-quality video generation, but suffer from slow runtimes. The large transformer-based backbones used in these models are bottlenecked by spatiotemporal attention. In this paper, we identify that a significant fraction of token-to-token connections consistently yiel

### 📋 本地系统排查方向

- [ ] 检查evolver技能的运行频率和产出
- [ ] 检查CRAS的学习闭环是否真正闭合
- [ ] 检查ISC规则的全链路展开率

## 多Agent协同

_undefined_

### Safe-SAGE: Social-Semantic Adaptive Guidance for Safe Engagement through Laplace-Modulated Poisson Safety Functions
🔗 http://arxiv.org/abs/2603.05497v1
📅 2026-03-05T18:59:02Z
> Traditional safety-critical control methods, such as control barrier functions, suffer from semantic blindness, exhibiting the same behavior around obstacles regardless of contextual significance. This limitation leads to the uniform treatment of all obstacles, despite their differing semantic meani

### Reasoning Theater: Disentangling Model Beliefs from Chain-of-Thought
🔗 http://arxiv.org/abs/2603.05488v1
📅 2026-03-05T18:55:16Z
> We provide evidence of performative chain-of-thought (CoT) in reasoning models, where a model becomes strongly confident in its final answer, but continues generating tokens without revealing its internal belief. Our analysis compares activation probing, early forced answering, and a CoT monitor acr

### Observing and Controlling Features in Vision-Language-Action Models
🔗 http://arxiv.org/abs/2603.05487v1
📅 2026-03-05T18:53:50Z
> Vision-Language-Action Models (VLAs) have shown remarkable progress towards embodied intelligence. While their architecture partially resembles that of Large Language Models (LLMs), VLAs exhibit higher complexity due to their multi-modal inputs/outputs and often hybrid nature of transformer and diff

### Accelerating Text-to-Video Generation with Calibrated Sparse Attention
🔗 http://arxiv.org/abs/2603.05503v1
📅 2026-03-05T18:59:32Z
> Recent diffusion models enable high-quality video generation, but suffer from slow runtimes. The large transformer-based backbones used in these models are bottlenecked by spatiotemporal attention. In this paper, we identify that a significant fraction of token-to-token connections consistently yiel

### POET-X: Memory-efficient LLM Training by Scaling Orthogonal Transformation
🔗 http://arxiv.org/abs/2603.05500v1
📅 2026-03-05T18:59:23Z
> Efficient and stable training of large language models (LLMs) remains a core challenge in modern machine learning systems. To address this challenge, Reparameterized Orthogonal Equivalence Training (POET), a spectrum-preserving framework that optimizes each weight matrix through orthogonal equivalen

### 📋 本地系统排查方向

- [ ] 检查子Agent空跑率（empty runs）
- [ ] 检查任务分配vs完成率
- [ ] 检查Agent间通信瓶颈

---
_共采集 16 篇论文，3 个课题有可操作洞察_