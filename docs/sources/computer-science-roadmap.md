# 计算机科学与技术完整学习路线：技术演化与知识地图

## 1. 总体学习思想

不要把计算机科学仅仅理解成一组彼此独立的课程，而应该建立一条技术演化链：

> **需求/目的 → 核心问题 → 解决方案 → 技术 → 新问题 → 下一代技术**

这样可以理解“为什么会出现某项技术”，而不仅仅是记住“它是什么”。

---

## 2. 计算机与互联网的发展阶段

| 阶段 | 核心问题 | 主要知识 |
|---|---|---|
| 1. 计算基础 | 人如何让机器进行计算？ | 数制、逻辑门、布尔代数、图灵机 |
| 2. 计算机组成 | 如何真正造出一台计算机？ | CPU、ALU、寄存器、Memory、Bus、I/O、ISA |
| 3. 程序与编程语言 | 如何告诉机器做什么？ | Machine Code、Assembly、C、Python、编程范式 |
| 4. 操作系统 | 如何管理越来越复杂的硬件？ | Process、Thread、Memory、File System、OS、Linux |
| 5. 数据结构与算法 | 如何高效处理数据？ | Array、List、Tree、Graph、Hash、Sorting、Searching、Complexity |
| 6. 计算机网络 | 如何让计算机互相通信？ | Packet、Ethernet、IP、TCP/UDP、DNS、HTTP、Router |
| 7. 数据库 | 如何可靠保存和查询大量数据？ | DBMS、Relational Model、SQL、Index、Transaction、ACID |
| 8. 软件工程与版本控制 | 如何多人长期开发大型软件？ | Git、GitHub、CI/CD、Testing、Design Pattern |
| 9. 编译原理 | 高级语言如何变成机器可以执行的东西？ | Lexer、Parser、AST、Compiler、IR、Optimization |
| 10. 分布式与云计算 | 一台机器不够怎么办？ | Distributed System、Cloud、VM、Container、Docker、K8s |
| 11. 大数据与 AI | 数据越来越多、规则越来越复杂怎么办？ | Hadoop、Spark、ML、DL、GPU、CNN、Transformer |
| 12. 现代 AI 系统 | 如何让机器理解、推理并执行复杂任务？ | LLM、RAG、Agent、Tool Calling、MCP、AI Infra |

---

## 3. 每个阶段固定学习六个问题

以“操作系统”为例，不应该只是背诵 Process、Thread、Virtual Memory 等名词，而应该固定回答以下问题。

### ① 为什么出现？

程序越来越多，直接让程序操作硬件会产生冲突。

### ② 要解决什么问题？

```text
多个程序
↓
CPU 如何分配？
内存如何分配？
文件如何管理？
设备如何访问？
程序之间如何隔离？
```

### ③ 当时的解决方案是什么？

```text
Operating System
├── Process
├── Memory Management
├── File System
├── Device Management
└── System Call
```

### ④ 产生了什么核心概念？

例如：

`Process → Thread → Scheduling → Virtual Memory → File System → System Call`

### ⑤ 谁提出 / 谁发明 / 从哪里发展？

例如：

- Unix → Bell Labs
- Linux → Linus Torvalds
- Virtual Memory → 在早期计算机系统研究中逐步发展
- Process / Time-sharing → 操作系统发展过程中的核心概念

> 注意：并非所有技术都有一个明确的“单一发明人”。很多技术是多个研究者、大学、实验室和企业长期演化形成的。

### ⑥ 今天在哪里使用？

```text
Process
    ↓
Linux
    ↓
Docker
    ↓
Kubernetes
    ↓
Cloud
```

这样学习的重点就从“记住一个知识点”变成了理解**技术之间的继承关系**。

---

## 4. 计算机知识总体结构

```text
                         Computer Science
                                │
        ┌───────────────────────┼───────────────────────┐
        ↓                       ↓                       ↓
   Computer                   Software                Theory
   Hardware                   Engineering
        │                       │                       │
        ↓                       ↓                       ↓
 Computer Organization      Programming             Algorithms
        │                   Languages                    │
        ↓                       │                        Data
 CPU / Memory / I/O            ↓                     Structures
 ISA / ALU / Cache         Compiler                    │
        │                       │                       ↓
        └───────────┐           │                 Complexity
                    ↓           ↓
                 Operating System
                    │
          ┌─────────┼─────────┐
          ↓         ↓         ↓
       Process    Memory    File System
          │
          └──────────────┐
                         ↓
                   Computer Network
                         │
             ┌───────────┼───────────┐
             ↓           ↓           ↓
            IP          TCP         DNS
             │
             ↓
            HTTP
             │
             ↓
            Web
             │
             ↓
          Database
             │
             ↓
       Distributed System
             │
       ┌─────┴─────┐
       ↓           ↓
    Docker       Cloud
       │           │
       └─────┬─────┘
             ↓
          Big Data
             │
             ↓
             AI
             │
      ┌──────┼────────┐
      ↓      ↓        ↓
     ML      DL      LLM
                     │
               ┌─────┼─────┐
               ↓     ↓     ↓
              RAG  Agent  Tool
```

---

## 5. 技术演化链

计算机技术可以进一步理解为连续解决问题的过程：

```text
CPU
↓
Assembly
↓
C
↓
Operating System
↓
Process / File / Memory
↓
Network
↓
Server
↓
Database
↓
Distributed System
↓
Virtual Machine
↓
Container
↓
Docker
↓
Kubernetes
↓
Cloud
↓
AI Infrastructure
↓
LLM
↓
Agent
```

### Docker 的例子

```text
物理服务器
↓
资源利用率低
↓
Virtual Machine
↓
VM 太重、启动慢
↓
Container
↓
Docker
↓
大量 Container 难以管理
↓
Kubernetes
↓
大量机器 / 数据中心难以管理
↓
Cloud
```

因此学习 Docker 时，不应该只学习：

> Docker 是什么？`docker run` 怎么用？

而应该理解：

> **Docker 为什么存在，以及它解决了哪一个层次的问题。**

---

## 6. 每个技术建立统一的“技术卡片”

以后学习任何技术，都可以使用下面的模板。

```text
技术名称：Docker
英文：Docker
类别：Containerization

① 出现背景
解决软件运行环境不一致的问题。

② 核心问题
“在我的电脑上能运行” ≠ “在服务器上能运行”。

③ 核心思想
将程序 + 依赖 + 运行环境打包成 Container。

④ 前置技术
OS
Process
Namespace
cgroups
Filesystem
Virtualization

⑤ 核心技术
Container
Image
Dockerfile
Docker Engine
Registry

⑥ 与其他技术关系
VM → Container → Docker → Kubernetes → Cloud

⑦ 解决的问题
环境隔离、部署一致性、快速启动。

⑧ 新产生的问题
单机 Docker 无法方便管理大量 Container。

⑨ 下一代技术
Kubernetes。

⑩ 代表人物 / 组织
Docker 最初由 Solomon Hykes 等人推动。

⑪ 今天的应用
Web 服务、微服务、AI 服务、CI/CD。
```

---

## 7. 最终知识范围

整个计算机科学与技术体系可以进一步拆成约 15 个核心模块：

1. **计算理论**
   - Turing Machine
   - Automata
   - Logic

2. **数字逻辑**
   - Boolean
   - Logic Gate
   - Binary
   - ALU

3. **计算机组成**
   - CPU
   - Memory
   - Cache
   - I/O
   - ISA

4. **编程语言**
   - Machine Code
   - Assembly
   - C
   - Java
   - Python
   - Rust
   - Programming Paradigms

5. **数据结构**
   - Array
   - Linked List
   - Stack
   - Queue
   - Tree
   - Graph
   - Hash Table

6. **算法与复杂度**
   - Sorting
   - Searching
   - Graph Algorithms
   - Dynamic Programming
   - Greedy
   - Divide and Conquer
   - Big-O

7. **操作系统**
   - Process
   - Thread
   - Scheduling
   - Memory Management
   - Virtual Memory
   - File System
   - System Call
   - Linux

8. **计算机网络**
   - Ethernet
   - IP
   - TCP
   - UDP
   - ARP
   - DNS
   - HTTP/HTTPS
   - Router
   - Switch

9. **数据库**
   - DBMS
   - Relational Model
   - SQL
   - Index
   - Transaction
   - ACID
   - PostgreSQL / MySQL / Redis

10. **编译原理**
    - Lexer
    - Parser
    - AST
    - Compiler
    - IR
    - Optimization
    - LLVM

11. **软件工程与版本控制**
    - Git
    - GitHub
    - Branch
    - Merge
    - CI/CD
    - Testing
    - Design Pattern

12. **分布式系统**
    - Distributed System
    - RPC
    - Consensus
    - CAP
    - Load Balancing
    - Fault Tolerance

13. **容器与云计算**
    - Virtual Machine
    - Container
    - Docker
    - Kubernetes
    - IaaS
    - PaaS
    - SaaS

14. **大数据**
    - Hadoop
    - HDFS
    - MapReduce
    - Spark
    - Kafka
    - Data Pipeline

15. **AI**
    - Machine Learning
    - Deep Learning
    - GPU
    - CNN
    - RNN
    - Transformer
    - LLM
    - RAG
    - Agent
    - Tool Calling
    - MCP
    - AI Infrastructure

---

## 8. 最终学习目标

最终不是“把这些课程全部学一遍”，而是建立下面这一套关系：

```text
名词
↓
定义
↓
作用
↓
出现背景
↓
要解决的问题
↓
解决方案
↓
核心技术
↓
前置技术
↓
后继技术
↓
技术栈位置
↓
历史来源
↓
现实应用
```

这样以后看到一个陌生技术，例如：

```text
Redis
Kafka
Kubernetes
PyTorch
CUDA
LLVM
PostgreSQL
Transformer
MCP
```

可以先判断：

> **它属于哪个层 → 为什么出现 → 解决哪个问题 → 依赖什么 → 又产生了什么后续技术。**

这会形成一张真正可以持续扩展的**计算机科学与技术知识地图**，而不是一堆互相孤立的课程笔记。
