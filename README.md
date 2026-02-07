# 🤖 Agentic Cross-Chain DeFi Manager

> **An autonomous AI-driven agent that manages cross-chain liquidity using LI.FI routing and Uniswap swaps**

Built for **HackMoney 2026** — Category: **DeFi / Agentic Finance / Cross-Chain**

---

## 🚀 Overview

This project is an **autonomous DeFi agent** that:

* Monitors vault balances across multiple chains
* Uses an AI model to **decide when and where to move capital**
* Routes liquidity cross-chain via **LI.FI**
* Executes swaps using **Uniswap** (v4-ready architecture)

The goal is to demonstrate how **agentic systems can actively manage capital across chains**, rather than relying on static strategies or manual intervention.

---

## 🧠 Core Concept

Traditional DeFi strategies are:

* Static
* Single-chain
* Manually operated

This agent introduces:

* 🔁 **Continuous monitoring**
* 🤖 **AI-driven decision making**
* 🌉 **Cross-chain execution**
* 🦄 **Composable DeFi primitives (Uniswap + LI.FI)**

The agent behaves like a **cross-chain hedge fund manager**.

---

## 🏗 Architecture

```
┌────────────────────┐
│   On-chain Vaults  │
│  (SEP / BAS / ARB) │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│  Balance Scanner   │  ← Reads ERC20 balances
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│   AI Decision Hub  │  ← LLM decides strategy
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│   LI.FI Router     │  ← Cross-chain routing
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Uniswap Swap Layer │  ← Capital deployment
└────────────────────┘
```

---

## 🔗 Supported Chains (Testnet)

| Chain            | ID       | Purpose            |
| ---------------- | -------- | ------------------ |
| Ethereum Sepolia | 11155111 | Base liquidity hub |
| Base Sepolia     | 84532    | Active USDC source |
| Arbitrum Sepolia | 421614   | Expansion chain    |

---

## 💱 Supported Tokens

* **USDC** (6 decimals)
* **WETH / ETH** (18 decimals)

Native ETH is handled separately from ERC20 logic.

---

## 🤖 AI Strategy Engine

The AI receives:

* Real on-chain balances
* Chain & token availability

It must output **strict JSON** decisions:

```json
{
  "action": "SWAP" | "WAIT",
  "fromChain": "SEP" | "BAS" | "ARB",
  "targetChain": "SEP" | "BAS" | "ARB",
  "sourceToken": "USDC" | "WETH",
  "targetToken": "USDC" | "WETH",
  "amount": "string",
  "reason": "explanation"
}
```

Safety rules are enforced:

* No swaps if balance is zero
* No invalid chain/token combinations

---

## 🌉 LI.FI Integration

LI.FI is used as the **cross-chain routing layer**:

* Best bridge + DEX path
* Chain-agnostic execution
* Future mainnet-ready

⚠️ **Note on Testnet**

LI.FI staging endpoints are permissioned.
Execution on testnet is **simulated**, but:

* The real LI.FI API is integrated
* Parameters are production-accurate

> The agent is **mainnet-ready by design**.

---

## 🦄 Uniswap Integration

Uniswap is the **liquidity execution layer**:

* Swaps are routed into Uniswap pools
* Architecture is compatible with **Uniswap v4 hooks**

Future extensions:

* Dynamic hook-based rebalancing
* Fee optimization
* MEV-aware routing

---

## 🛠 Tech Stack

* **TypeScript**
* **Viem** (Ethereum interactions)
* **Groq LLM API** (AI decision engine)
* **LI.FI API** (cross-chain routing)
* **Uniswap** (swap execution)
* **Foundry** (smart contracts, optional extension)

---

## ⚙️ Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Create a `.env` file:

```env
PRIVATE_KEY=0x...
GROQ_API_KEY=...

RPC_ETHEREUM_SEPOLIA=...
RPC_BASE=...
RPC_ARBITRUM=...

VAULT_ETH_SEP=0x...
VAULT_BASE=0x...
VAULT_ARBITRUM=0x...
```

### 3. Run the agent

```bash
npx ts-node agent.ts
```

---

## 🧪 Example Output

```
🧐 Scanning Vault balances...
SEP: USDC 0 | WETH 0
BAS: USDC 20 | WETH 0

🤖 AI Decision:
Move 20 USDC from BAS to SEP
Reason: Consolidate idle capital
```

---

## 🏆 Hackathon Alignment

### ✅ Uniswap Prize

* Intelligent swap routing
* Agent-controlled liquidity
* v4-ready architecture

### ✅ LI.FI Prize

* Native cross-chain design
* Real API integration
* Production-ready routing logic

---

## 🔮 Future Work

* Real mainnet execution
* On-chain agent logic
* Yield strategy modules
* Risk management layer
* DAO-controlled agents

---

## 👤 Author

Built by **Armand** for HackMoney 2026

---

## ⚠️ Disclaimer

This project is a **hackathon prototype**.
Not audited. Do not use in production without proper security review.
