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

/**
 * Scans all registered Vaults across all configured chains.
 * @param userVaultAddresses - Optional array of additional vault addresses from the web dashboard.
 * @returns A nested object containing balances for every vault on every chain.
 */
export const scanAllVaults = async (userVaultAddresses: string[] = []) => {
    console.log("🧐 Scanning all registered Vault balances...");
    
    const firstChainKey = Object.keys(CHAINS_CONFIG)[0];
    const mainVault = (CHAINS_CONFIG as any)[firstChainKey]?.vault;
    const allVaultsToScan = Array.from(new Set([mainVault, ...userVaultAddresses])).filter(Boolean);
    const fullReport: Record<string, any> = {};

    for (const vaultAddress of allVaultsToScan) {
        const vaultReport: Record<string, Record<string, string>> = {};

        for (const [chainKey, config] of Object.entries(CHAINS_CONFIG)) {
            const typedConfig = config as any;
            const client = createPublicClient({
                chain: typedConfig.viemChain,
                transport: http(typedConfig.rpc),
            });

            const balances: Record<string, string> = {};

            for (const [symbol, tokenAddress] of Object.entries(typedConfig.tokens)) {
                if (tokenAddress === NATIVE_ETH) continue;
                
                try {
                    const bal = await client.readContract({
                        address: tokenAddress as `0x${string}`,
                        abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
                        functionName: "balanceOf",
                        args: [vaultAddress as `0x${string}`],
                    });

                    balances[symbol] = formatUnits(
                        bal as bigint,
                        symbol === "USDC" ? 6 : 18
                    );
                } catch (err) {
                    balances[symbol] = "0";
                }
            }
            vaultReport[chainKey] = balances;
        }
        fullReport[vaultAddress as string] = vaultReport;
    }

    return fullReport;
};

export const askAIForStrategy = async (fullReport: any) => {
    const prompt = `
    You are an AI Cross-Chain Liquidity Manager. 
    Here is the current state of multiple user vaults:
    ${JSON.stringify(fullReport, null, 2)}

    Your goal:
    1. Look at each vault address.
    2. If a vault has USDC on one chain but 0 on others, propose a MOVE.
    3. If the total balance is too low (e.g., less than 5 USDC), return WAIT to save gas.
    4. You MUST specify which vaultAddress you are acting upon.

    Return ONLY a JSON object:
    {
        "vaultAddress": "0x...", 
        "action": "SWAP" | "WAIT",
        "fromChain": "base" | "ethereum" | "arbitrum",
        "toChain": "base" | "ethereum" | "arbitrum",
        "amount": "number_as_string",
        "reason": "short explanation"
    }
    `;

    const response = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.1-70b-versatile",
        response_format: { type: "json_object" },
    });

    const decision = JSON.parse(response.choices[0].message.content || "{}");
    console.log("🤖 AI Decision:", decision.reason);
    return decision;
};

export const executeStrategy = async(decision: AIDecision) => {
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
