import { createWalletClient, http, encodeAbiParameters, parseAbi, encodeFunctionData, parseUnits, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, arbitrumSepolia, optimismSepolia, polygonAmoy, sepolia } from 'viem/chains';
import Groq from "groq-sdk";
import * as dotenv from 'dotenv';

dotenv.config();

const NATIVE_ETH = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
import { setDefaultResultOrder } from 'node:dns';
setDefaultResultOrder('ipv4first');

const CHAINS_CONFIG: any = {
    'POL': {
        id: 80002,
        viemChain: polygonAmoy,
        rpc: process.env.RPC_POLYGON,
        tokens: {
            'USDC': '0x41e94404177098296ffc483f217743d833633d45',
            'WETH': '0x02777053ED3a1999942a178dE649E943aBe473a2',
            'ETH': NATIVE_ETH
        }
    },
    'BAS': { 
        id : 84532,
        viemChain: baseSepolia,
        rpc: process.env.RPC_BASE,
        vault: process.env.VAULT_BASE,
        tokens: {
            'USDC': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
            'WETH': '0x4200000000000000000000000000000000000006',
            'ETH': NATIVE_ETH
        }
    },
    'ARB': { 
        id: 421614, 
        viemChain: arbitrumSepolia, 
        rpc: process.env.RPC_ARBITRUM, 
        vault: process.env.VAULT_ARBITRUM,
        tokens: {
            'USDC': '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
            'WETH': '0x980B6951f8D039580b429991c486189999999999',
            'ETH': NATIVE_ETH
        }
    },
    'OPT': { 
        id: 11155420, 
        viemChain: optimismSepolia, 
        rpc: process.env.RPC_OPTIMISM, 
        vault: process.env.VAULT_OPTIMISM,
        tokens: {
            'USDC': '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
            'WETH': '0x4200000000000000000000000000000000000006',
            'ETH': NATIVE_ETH
        }
    },
    'SEP': { 
        id: 11155111,
        viemChain: sepolia, 
        rpc: process.env.RPC_ETHEREUM_SEPOLIA,
        vault: process.env.VAULT_SEP,
        tokens: {
            'USDC': '0x1c7D4B196Cb0234831493d703c94d5d0FCdfdbBb',
            'WETH': '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9',
            'ETH': NATIVE_ETH
        }
    }
};

function encodeVaultInstruction(tokenIn: string, tokenOut: string, amount: bigint) {
    const types = [
        { name: 'tokenIn', type: 'address' },
        { name: 'tokenOut', type: 'address' },
        { name: 'amount', type: 'uint256' }
    ];
    return encodeAbiParameters(
        types,
        [tokenIn as `0x${string}`, tokenOut as `0x${string}`, amount]
    );
}

async function getLifiQuote(fromChainKey: string, toChainKey: string, fromToken: string, toToken: string, amount: string, fromAddress: string) {
    const fromChain = CHAINS_CONFIG[fromChainKey].id;
    const toChain = CHAINS_CONFIG[toChainKey].id;
    try {
        const url = `https://li.quest/v1/quote?fromChain=${fromChain}&toChain=${toChain}&fromToken=${fromToken}&toToken=${toToken}&fromAddress=${fromAddress}&fromAmount=${amount}`;
        const response = await fetch(url);
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error("Erreur LiFi:", error);
        return null;
    }
}

async function analyzeAllOpportunities(currentChainKey: string, amountInUSDC: string) {
    console.log(`🧠 L'agent scan the interesting chain and token ${currentChainKey}...`);
    const allChains = Object.keys(CHAINS_CONFIG);
    const targetChains = allChains.filter(c => c !== currentChainKey);
    const targetTokens = ['WETH', 'USDC', 'ETH'];
    
    let opportunities = [];
    
    for (const dest of targetChains) {
        for (const tokenSymbol of targetTokens) {
            if (tokenSymbol === 'USDC') continue;
            const quote = await getLifiQuote(
                currentChainKey, 
                dest,
                CHAINS_CONFIG[currentChainKey].tokens['USDC'], 
                CHAINS_CONFIG[dest].tokens[tokenSymbol], 
                amountInUSDC, 
                account.address
            );
        
            if (quote && quote.estimate) {
                opportunities.push({
                    toChain: dest,
                    toToken: tokenSymbol,
                    amountReceived: formatUnits(BigInt(quote.estimate.toAmount), tokenSymbol === 'WBTC' ? 8 : 18),
                    feeUSD: quote.estimate.gasCosts?.[0]?.amountUSD || '0',
                    netValueUSD: quote.estimate.toAmountUSD
                });
            }
        }
    }

    console.log(`📊 ${opportunities.length} oportunity find, check with the AI...`);
    opportunities.push({
        toChain: "BAS",
        toToken: "WETH",
        amountReceived: "0.01",
        feeUSD: "0.5",
        netValueUSD: "25.0"
    });
    const response = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [{
            role: "system",
            content: `Tu es un hedge fund agressif. Si une opportunité est présente, choisis-la.
                Réponds UNIQUEMENT en JSON sous ce format: 
                {"action": "SWAP", "targetChain": "BAS", "targetToken": "WETH", "reason": "Test"}`
        }, {
            role: "user",
            content: `Capital: ${amountInUSDC} units (USDC). Opportunités: ${JSON.stringify(opportunities)}`
        }],
        response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message.content || '{}');
}

async function executeUniversalStrategy(fromChainKey: string, targetChainKey: string, targetTokenSymbol: string, amount: bigint) {
    const fromConfig = CHAINS_CONFIG[fromChainKey];
    const toConfig = CHAINS_CONFIG[targetChainKey];

    console.log(`⚔️ PRÉPARATION : ${fromChainKey} -> ${targetChainKey} (Purchase of ${targetTokenSymbol})`);

    const destTokenIn = toConfig.tokens['USDC']; 
    let destTokenOut = toConfig.tokens[targetTokenSymbol];
    if (destTokenOut === NATIVE_ETH) destTokenOut = toConfig.tokens['WETH'];

    const vaultPayload = encodeVaultInstruction(destTokenIn, destTokenOut, amount); 
    
    const vaultAbi = parseAbi(["function onFundsReceived(address token, uint256 amount, bytes calldata data) external"]);    
    const executionData = encodeFunctionData({
        abi: vaultAbi,
        functionName: 'onFundsReceived',
        args: [destTokenIn, 0n, vaultPayload]
    });

    const sourceToken = fromConfig.tokens['USDC'];
    const params = new URLSearchParams({
        fromChain: fromConfig.id.toString(),
        toChain: toConfig.id.toString(),
        fromToken: sourceToken,
        toToken: destTokenIn,
        fromAmount: amount.toString(),
        fromAddress: account.address,
        toContractAddress: toConfig.vault,
        contractCalls: JSON.stringify([{
            callTo: toConfig.vault,
            callData: executionData
        }])
    });

    console.log("🔄 Ask the road to LiFi");
    const quote = await fetch(`https://li.quest/v1/quote?${params.toString()}`).then(res => res.json());

    if (!quote.transactionRequest) {
        throw new Error(`LiFi doesn't find any road, Reason: ${JSON.stringify(quote)}`);
    }

    const walletClient = createWalletClient({
        account, 
        chain: fromConfig.viemChain,
        transport: http(fromConfig.rpc)
    });

    console.log("🔓 Vérification de l'approbation USDC...");
    const spender = quote.transactionRequest.to;
    const erc20Abi = parseAbi(['function approve(address spender, uint256 amount) public returns (bool)']);
    
    try {
        const approveTx = await walletClient.writeContract({
            address: sourceToken as `0x${string}`,
            abi: erc20Abi,
            functionName: 'approve',
            args: [spender, amount],
            chain: fromConfig.viemChain,
            account
        });
        console.log(`⏳ Approbation envoyée (Tx: ${approveTx}). Pause de 15s pour validation...`);
        
        await new Promise(resolve => setTimeout(resolve, 15000));
        console.log("✅ Approbation probablement validée.");
        
    } catch (e) {
        console.log("⚠️ L'approbation a peut-être échoué ou était déjà faite. On tente le swap...");
    }

    console.log("🚀 Envoi de la transaction de Bridge...");
    const hash = await walletClient.sendTransaction({
        to: quote.transactionRequest.to,
        data: quote.transactionRequest.data,
        value: BigInt(quote.transactionRequest.value || 0),
        chain: fromConfig.viemChain,
        account
    });

    console.log(`🎉 SUCCÈS ! Transaction envoyée. Hash : ${hash}`);
    console.log(`Suis la transaction sur Etherscan Sepolia : https://sepolia.etherscan.io/tx/${hash}`);
}

async function main() {
    const currentChain = 'SEP'; 
    const amount = parseUnits("10", 6);

    try {
        const decision = await analyzeAllOpportunities(currentChain, amount.toString());
        
        if (decision && decision.action === "SWAP") {
            console.log(`✅ IA DECISION : Go pour ${decision.targetToken} sur ${decision.targetChain}.`);
            console.log(`Raison: ${decision.reason}`);
            await executeUniversalStrategy(currentChain, decision.targetChain, decision.targetToken, amount);
        } else {
            console.log("💤 IA DECISION : Statu quo.");
            console.log(`Raison : ${decision?.reason || "Pas d'opportunité intéressante"}`);
        }
    } catch (error) {
        console.error("❌ ERREUR CRITIQUE :", error);
    }
}

main().catch(console.error);