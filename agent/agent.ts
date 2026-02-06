import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  parseAbi,
  encodeFunctionData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia, baseSepolia, arbitrumSepolia } from "viem/chains";
import { getAddress } from "viem";
import Groq from "groq-sdk";
import * as dotenv from "dotenv";

dotenv.config();

function loadEnv(name: string): string
{
    const value = process.env[name];

    if (!value) throw new Error(`❌ Missing env var: ${name}`);
        return value;
}

function loadAddress(name: string): `0x${string}`
{
    return getAddress(loadEnv(name));
}

const groq = new Groq({ apiKey: loadEnv("GROQ_API_KEY") });
const account = privateKeyToAccount(loadEnv("PRIVATE_KEY") as `0x${string}`);
const NATIVE_ETH = getAddress("0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE");

const CHAINS_CONFIG = {
    SEP: {
        id: 11155111,
        viemChain: sepolia,
        rpc: loadEnv("RPC_ETHEREUM_SEPOLIA"),
        vault: loadAddress("VAULT_ETH_SEP"),
        tokens: {
            USDC: getAddress("0x1c7D4B196Cb0234831493d703c94d5d0FCdfdbBb"),
            WETH: getAddress("0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9"),
            ETH: NATIVE_ETH,
        },
    },

    BAS: {
        id: 84532,
        viemChain: baseSepolia,
        rpc: loadEnv("RPC_BASE"),
        vault: loadAddress("VAULT_BASE"),
        tokens: {
            USDC: getAddress("0x036CbD53842c5426634e7929541eC2318f3dCF7e"),
            WETH: getAddress("0x4200000000000000000000000000000000000006"),
            ETH: NATIVE_ETH,
       },
  },

    ARB: {
        id: 421614,
        viemChain: arbitrumSepolia,
        rpc: loadEnv("RPC_ARBITRUM"),
        vault: loadAddress("VAULT_ARBITRUM"),
        tokens: {
            USDC: getAddress("0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d"),
            WETH: getAddress("0x980B6951f8D0C13008b27650c849F89d4dFE318F"),
            ETH: NATIVE_ETH,
        },
  },
} as const;

type ChainKey = keyof typeof CHAINS_CONFIG;
type TokenKey = "USDC" | "WETH" | "ETH";

type AIDecision = {
  action: "SWAP" | "WAIT";
  fromChain: ChainKey;
  targetChain: ChainKey;
  sourceToken: TokenKey;
  targetToken: TokenKey;
  amount: string;
  reason: string;
};

async function scanAllVaults()
{
    console.log("🧐 Scanning Vault balances...");
    const report: Record<string, Record<string, string>> = {};

    for (const [key, config] of Object.entries(CHAINS_CONFIG)) {
        const client = createPublicClient({
            chain: config.viemChain,
            transport: http(config.rpc),
        });

        const balances: Record<string, string> = {};

        for (const [symbol, tokenAddress] of Object.entries(config.tokens)) {
            if (tokenAddress === NATIVE_ETH)
                continue;
            try {
                const bal = await client.readContract({
                    address: tokenAddress as `0x${string}`,
                    abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
                    functionName: "balanceOf",
                    args: [config.vault],
                });

                balances[symbol] = formatUnits(
                    bal as bigint,
                    symbol === "USDC" ? 6 : 18
                );
            } catch {
                balances[symbol] = "0";
            }
        }
        report[key] = balances;
    }
  return report;
}

async function askAIForStrategy(vaultStates: any): Promise<AIDecision>
{
    console.log("🤖 AI is analyzing states...");

    const prompt = `
        You are a Cross-Chain DeFi Agent.

        Inventory:
        ${JSON.stringify(vaultStates, null, 2)}

        RULES (VERY IMPORTANT):
        1. Only perform cross-chain transfers using ETH or WETH.
        2. USDC swaps MUST be same-chain only.
        3. If balance is zero, return WAIT.
        4. Prefer moving funds from where they are idle.

        Output STRICT JSON:
        {
        "action": "SWAP" | "WAIT",
        "fromChain": "SEP" | "BAS" | "ARB",
        "targetChain": "SEP" | "BAS" | "ARB",
        "sourceToken": "USDC" | "WETH" | "ETH",
        "targetToken": "USDC" | "WETH" | "ETH",
        "amount": "string",
        "reason": "string"
        }`;

    const res = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "system", content: prompt }],
        response_format: { type: "json_object" },
    });

    return JSON.parse(res.choices[0].message.content!) as AIDecision;
}

async function executeStrategy(decision: AIDecision) {
    if (decision.action !== "SWAP")
        return;

    const from = CHAINS_CONFIG[decision.fromChain];
    const to = CHAINS_CONFIG[decision.targetChain];
    const fromToken = from.tokens[decision.sourceToken];
    const toToken = to.tokens[decision.targetToken];
    const decimals = decision.sourceToken === "USDC" ? 6 : 18;
    const amount = parseUnits(decision.amount, decimals);

    console.log(
        `⚔️ ${decision.sourceToken} (${decision.fromChain}) → ${decision.targetToken} (${decision.targetChain})`
    );

    const params = new URLSearchParams({
        fromChain: String(from.id),
        toChain: String(to.id),
        fromToken: String(fromToken),
        toToken: String(toToken),
        fromAmount: amount.toString(),
        fromAddress: account.address,
        toAddress: to.vault,
    });

    const res = await fetch(
        `https://staging.li.quest/v1/quote?${params.toString()}`
    );
    const quote = await res.json();

    if (!quote.transactionRequest) {
        console.error("❌ LI.FI error:", quote);
        throw new Error("LI.FI route not found (testnet limitation)");
    }

    const wallet = createWalletClient({
        account,
        chain: from.viemChain,
        transport: http(from.rpc),
    });

    console.log(`🚀 Executing via ${quote.tool}`);

    const hash = await wallet.sendTransaction({
        to: quote.transactionRequest.to,
        data: quote.transactionRequest.data,
        value: BigInt(quote.transactionRequest.value || 0),
    });

    console.log(`✅ Tx sent: ${hash}`);
}

async function main()
{
    try {
        const vaults = await scanAllVaults();
        console.table(vaults);

        const decision = await askAIForStrategy(vaults);

        if (decision.action === "WAIT") {
          console.log("💤 AI decided to wait");
          return;
        }
        console.log(`🎯 Decision: ${decision.amount} ${decision.sourceToken} → ${decision.targetToken}`);
        console.log(`🗣️ Reason: ${decision.reason}`);
        await executeStrategy(decision);
    } catch (e) {
        console.error("💥 Agent Error:", e);
    }
}

main();
