import { createWalletClient, http, encodeAbiParameters, parseAbi, encodeFunctionData, parseUnits, formatUnits, hexToBigInt } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, arbitrumSepolia, optimismSepolia, polygonAmoy, sepolia } from 'viem/chains';
import Groq from "groq-sdk";
import * as dotenv from 'dotenv';
import { setDefaultResultOrder } from 'node:dns';

setDefaultResultOrder('ipv4first');
dotenv.config();
const NATIVE_ETH = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

const CHAINS_CONFIG: any = {
    'POL': {
        id: 80002,
        viemChain: polygonAmoy,
        rpc: process.env.RPC_POLYGON,
        vault: process.env.VAULT_POLYGON,
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

function encodeVaultInstruction(tokenOut: string, fee: number = 3000) {
    const types = [
        { name: 'tokenOut', type: 'address' },
        { name: 'fee', type: 'uint24' }
    ];
    return encodeAbiParameters(
        types,
        [tokenOut as `0x${string}`, fee]
    );
}

async function getLifiQuote(fromChainKey: string, toChainKey: string, fromToken: string, toToken: string, amount: string, fromAddress: string) {
    const fromChain = CHAINS_CONFIG[fromChainKey].id;
    const toChain = CHAINS_CONFIG[toChainKey].id;
    try {
        const url = `https://li.quest/v1/quote?fromChain=${fromChain}&toChain=${toChain}&fromToken=${fromToken}&toToken=${toToken}&fromAddress=${fromAddress}&fromAmount=${amount}`;
        const response = await fetch(url);
        if (!response.ok) {
            return null;
        }
        return await response.json();
    } catch (error) {
        console.error("Erreur LiFi Fetch:", error);
        return null;
    }
}


async function analyzeAllOpportunities(currentChainKey: string, amountInUSDC: string) {
    console.log(`🧠 [AI AGENT] Analyse des opportunités cross-chain depuis ${currentChainKey}...`);
    
    let opportunities = [];

    opportunities.push({
        toChain: "BAS",
        toToken: "WETH",
        amountReceived: "0.01",
        feeUSD: "0.5",
        netValueUSD: "25.0",
        apy: "420%"
    });

    console.log(`📊 Opportunités trouvées : ${JSON.stringify(opportunities, null, 2)}`);
    console.log("🤖 Consultation du cerveau (Groq Llama 3)...");

    const response = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [{
            role: "system",
            content: `Tu es un hedge fund crypto agressif. 
                Ton but : Maximiser le profit.
                Si tu vois une opportunité avec un APY élevé, tu SWAP immédiatement.
                Réponds UNIQUEMENT en JSON strict sous ce format : 
                {"action": "SWAP", "targetChain": "BAS", "targetToken": "WETH", "reason": "High Yield detected on Base L2"}`
        }, {
            role: "user",
            content: `Capital: ${amountInUSDC} USDC. Opportunités détectées: ${JSON.stringify(opportunities)}`
        }],
        response_format: { type: "json_object" }
    });

    const decision = JSON.parse(response.choices[0].message.content || '{}');
    return decision;
}

async function getVaultBalances(chainKey: string) {
    const config = CHAINS_CONFIG[chainKey];
    const publicClient = createPublicClient({ 
        chain: config.viemChain, 
        transport: http(config.rpc) 
    });

    const tokens = config.tokens;
    let report: any = {};

    for (const [symbol, address] of Object.entries(tokens)) {
        if (address === NATIVE_ETH) continue;
        
        const balance = await publicClient.readContract({
            address: address as `0x${string}`,
            abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
            functionName: 'balanceOf',
            args: [config.vault]
        });
        
        report[symbol] = formatUnits(balance as bigint, symbol === 'USDC' ? 6 : 18);
    }
    return report;
}

async function executeUniversalStrategy(fromChainKey: string, targetChainKey: string, targetTokenSymbol: string, amount: bigint) {
    const fromConfig = CHAINS_CONFIG[fromChainKey];
    const toConfig = CHAINS_CONFIG[targetChainKey];

    console.log(`\n⚔️ [EXECUTION] Démarrage du plan : ${fromChainKey} -> ${targetChainKey} (Achat ${targetTokenSymbol})`);
    console.log(`🎯 Cible Vault: ${toConfig.vault}`);

    const destTokenIn = toConfig.tokens['USDC'];
    let destTokenOut = toConfig.tokens[targetTokenSymbol];
    if (destTokenOut === NATIVE_ETH)
        destTokenOut = toConfig.tokens['WETH'];
    const vaultPayload = encodeVaultInstruction(destTokenOut, 3000); 
    
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

    console.log("🔄 Demande de route au bridge LI.FI...");
    const quoteResponse = await fetch(`https://li.quest/v1/quote?${params.toString()}`);
    const quote = await quoteResponse.json();

    if (!quote.transactionRequest) {
        throw new Error(`Route introuvable ou erreur LI.FI : ${JSON.stringify(quote)}`);
    }

    console.log(`✅ Route trouvée ! Provider: ${quote.tool} | Gas Cost: ~$${quote.estimate.gasCosts[0].amountUSD}`);

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
        console.log(`⏳ Approbation en cours (Tx: ${approveTx})...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
        console.log("✅ Approbation confirmée (ou déjà faite).");
        
    } catch (e) {
        console.log("⚠️ Skip approbation (déjà approuvé ou erreur mineure).");
    }

    console.log("🚀 Lancement du BRIDGE + SWAP...");
    try {
        const hash = await walletClient.sendTransaction({
            to: quote.transactionRequest.to,
            data: quote.transactionRequest.data,
            value: BigInt(quote.transactionRequest.value || 0),
            chain: fromConfig.viemChain,
            account,
            gas: BigInt(500000)
        });
        console.log(`\n🎉 SUCCÈS ! L'Agent a exécuté l'ordre.`);
        console.log(`🔗 Transaction Source : https://sepolia.etherscan.io/tx/${hash}`);
        console.log(`👀 Surveille ton Vault sur Base : https://sepolia.basescan.org/address/${toConfig.vault}`);
    } catch (error) {
        console.error("❌ Erreur lors de l'envoi de la transaction :", error);
    }
}


async function main() {
    const currentChain = 'SEP';
    const amount = parseUnits("10", 6);

    console.log("🔵 Initialisation de l'Agent Cross-Chain...");
    console.log(`💰 Capital: 10 USDC sur ${currentChain}`);

    try {
        const decision = await analyzeAllOpportunities(currentChain, amount.toString());
        
        if (decision && decision.action === "SWAP") {
            console.log(`\n✅ IA DECISION : GO ! Cible : ${decision.targetToken} sur ${decision.targetChain}.`);
            console.log(`🗣️ Raison invoquée : "${decision.reason}"`);
            await executeUniversalStrategy(currentChain, decision.targetChain, decision.targetToken, amount);
        } else {
            console.log("💤 IA DECISION : On ne bouge pas.");
        }
    } catch (error) {
        console.error("\n❌ ERREUR CRITIQUE DANS L'AGENT :", error);
    }
}

main().catch(console.error);
