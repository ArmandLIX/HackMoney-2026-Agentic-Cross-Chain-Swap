import { createPublicClient, createWalletClient, http, parseUnits, formatUnits, parseAbi, parseEther, encodeFunctionData, encodeAbiParameters } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia, baseSepolia, arbitrumSepolia } from 'viem/chains';
import Groq from 'groq-sdk';
import * as dotenv from 'dotenv';

dotenv.config();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const NATIVE_ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

const CHAINS_CONFIG: any = {
    'SEP': { 
        id: 11155111, 
        viemChain: sepolia, 
        rpc: process.env.RPC_SEP, 
        vault: process.env.VAULT_SEP,
        tokens: { 'USDC': '0x1c7D4B196Cb0234831493d703c94d5d0FCdfdbBb', 'WETH': '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9' }
    },
    'BAS': { 
        id: 84532, 
        viemChain: baseSepolia, 
        rpc: process.env.RPC_BASE, 
        vault: process.env.VAULT_BASE,
        tokens: { 'USDC': '0x036CbD53842c5426634e7929541eC2318f3dCF7e', 'WETH': '0x4200000000000000000000000000000000000006' }
    },
    'ARB': { 
        id: 421614, 
        viemChain: arbitrumSepolia, 
        rpc: process.env.RPC_ARB, 
        vault: process.env.VAULT_ARB,
        tokens: { 'USDC': '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', 'WETH': '0x980B6951f8D0C13008b27650c849F89d4dFE318F' }
    }
};

async function scanAllVaults() {
    console.log("🧐 Scanning Vault balances based on CHAINS_CONFIG...");
    const report: any = {};

    for (const [key, config] of Object.entries(CHAINS_CONFIG)) {
        const client = createPublicClient({ chain: config.viemChain, transport: http(config.rpc) });
        const balances: any = {};

        for (const [symbol, address] of Object.entries(config.tokens)) {
            if (address === NATIVE_ETH) continue;
            try {
                const bal = await client.readContract({
                    address: address as `0x${string}`,
                    abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
                    functionName: 'balanceOf',
                    args: [config.vault]
                });
                // Dynamic decimals: USDC uses 6, others usually 18
                balances[symbol] = formatUnits(bal as bigint, symbol === 'USDC' ? 6 : 18);
            } catch (e) { balances[symbol] = "0"; }
        }
        report[key] = balances;
    }
    return report;
}

async function askAIForStrategy(vaultStates: any) {
    console.log("🤖 AI is analyzing current states...");
    
    const allZero = Object.values(vaultStates).every((chain: any) => 
        Object.values(chain).every(bal => bal === "0")
    );

    if (allZero) {
        return { action: "WAIT", reason: "All vault balances are currently zero. No action possible." };
    }

    const prompt = `You are a Cross-Chain Hedge Fund Manager.
    Current Inventory: ${JSON.stringify(vaultStates, null, 2)}
    
    CRITICAL RULES:
    1. If the 'sourceToken' balance is "0", you MUST return {"action": "WAIT"}.
    2. Only move funds if you have a balance > 0 on the 'fromChain'.
    3. Use targetChain/targetToken to maximize utility.

    Output strict JSON:
    {
        "action": "SWAP" | "WAIT",
        "fromChain": "SEP" | "BAS" | "ARB",
        "targetChain": "SEP" | "BAS" | "ARB",
        "sourceToken": "USDC" | "WETH",
        "targetToken": "USDC" | "WETH",
        "amount": "string number",
        "reason": "explanation"
    }`;

    const response = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "system", content: prompt }],
        response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message.content || '{}');
}

async function executeStrategy(decision: any) {
    const fromConfig = CHAINS_CONFIG[decision.fromChain];
    const toConfig = CHAINS_CONFIG[decision.targetChain];
    
    const fromTokenAddr = fromConfig.tokens[decision.sourceToken];
    const targetTokenAddr = toConfig.tokens[decision.targetToken];
    
    const decimals = decision.sourceToken === 'USDC' ? 6 : 18;
    const amountRaw = parseUnits(decision.amount, decimals);

    console.log(`⚔️ Action: ${decision.sourceToken} (${decision.fromChain}) -> ${decision.targetToken} (${decision.targetChain})`);

    const vaultPayload = encodeAbiParameters(
        [{ name: 'tokenOut', type: 'address' }, { name: 'fee', type: 'uint24' }],
        [targetTokenAddr as `0x${string}`, 3000]
    );

    const executionData = encodeFunctionData({
        abi: parseAbi(["function onFundsReceived(address token, uint256 amount, bytes calldata data)"]),
        functionName: 'onFundsReceived',
        args: [fromTokenAddr, 0n, vaultPayload]
    });

    const LIFI_API = "https://staging.li.quest/v1/quote";

    const params = new URLSearchParams({
        fromChain: String(fromConfig.id),
        toChain: String(toConfig.id),
        fromToken: String(fromTokenAddr),
        toToken: String(targetTokenAddr),
        fromAmount: amountRaw.toString(),
        fromAddress: String(account.address),
        toContractAddress: String(toConfig.vault),
        allowDestinationCall: "true" 
    });

    console.log(`🔄 Requesting Testnet Route from LI.FI Staging...`);
    const res = await fetch(`${LIFI_API}?${params.toString()}`);
    const quote = await res.json();

    if (!quote.transactionRequest) {
        console.error("❌ LI.FI Detail:", quote.errors || quote.message);
        throw new Error(`LI.FI Route Not Found on Testnet.`);
    }
    const walletClient = createWalletClient({
        account,
        chain: fromConfig.viemChain,
        transport: http(fromConfig.rpc)
    });

    console.log(`🚀 Route Found via ${quote.tool}. Executing...`);
    
    const hash = await walletClient.sendTransaction({
        to: quote.transactionRequest.to,
        data: quote.transactionRequest.data,
        value: BigInt(quote.transactionRequest.value || 0),
        account
    });

    console.log(`✅ Success! Hash: ${hash}`);
}

async function main() {
    try {
        const vaultStates = await scanAllVaults();
        console.table(vaultStates);

        const decision = await askAIForStrategy(vaultStates);
        
        if (decision.action === "SWAP") {
            console.log(`🎯 AI Decision: Move ${decision.amount} ${decision.sourceToken} to ${decision.targetToken}`);
            console.log(`🗣️ Reason: ${decision.reason}`);
            await executeStrategy(decision);
        } else {
            console.log("💤 AI decided to wait.");
        }
    } catch (error) {
        console.error("💥 Agent Error:", error);
    }
}

main();
