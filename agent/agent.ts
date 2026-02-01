import { createWalletClient, http, encodeAbiParameters, parseAbiParameters } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import Groq from "groq-sdk";
import * as dotenv from 'dotenv';

dotenv.config();

const groq = new Groq({ apiKey: process.env.OPENAI_API_KEY });
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

const POOL_KEY = {
    currency0: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
    currency1: '0x4200000000000000000000000000000000000006' as `0x${string}`,
    fee: 3000,
    tickSpacing: 60,
    hooks: '0x0000000000000000000000000000000000000000' as `0x${string}`
} as const;

async function getAgentDecision(marketContext: string) {
    const response = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [{
            role: "system",
            content: `Tu es un gestionnaire de fonds DeFi ultra-conservateur. 
                - Tu ne déclenches un swap (shouldSwap: true) QUE si l'opportunité est claire (ex: chute brutale de prix). 
                - Si le prix est stable, en hausse, ou s'il n'y a pas d'avantage financier clair, tu réponds 'shouldSwap: false'. 
                - Sois très sélectif sur l'utilisation du capital.
                Réponds UNIQUEMENT en JSON: {"shouldSwap": bool, "reason": string}`
        }, {
            role: "user",
            content: marketContext
        }],
        response_format: { type: "json_object" }
    });
    return JSON.parse(response.choices[0].message.content || '{}');
}

function encodeVaultInstruction(amount: bigint) {
    const swapParams = {
        zeroForOne: true,
        amountSpecified: -amount,
        sqrtPriceLimitX96: 4295128739n
    };

    return encodeAbiParameters(
        [
            { type: 'tuple', components: [
                { name: 'currency0', type: 'address' },
                { name: 'currency1', type: 'address' },
                { name: 'fee', type: 'uint24' },
                { name: 'tickSpacing', type: 'int24' },
                { name: 'hooks', type: 'address' }
            ]},
            { type: 'tuple', components: [
                { name: 'zeroForOne', type: 'bool' },
                { name: 'amountSpecified', type: 'int256' },
                { name: 'sqrtPriceLimitX96', type: 'uint160' }
            ]}
        ],
        [POOL_KEY, swapParams]
    );
}

async function executeCrossChainSwap(payload: string, amount: string) {
    const params = new URLSearchParams({
        fromChain: 'POL',
        toChain: 'BAS',
        fromToken: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        toToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        fromAmount: amount,
        fromAddress: account.address,
        contractCalls: JSON.stringify([{
            callTo: '0x57598c33c9e9549958913a4c8f3bafbfcb428cd6',
            callData: payload,
        }])
    });
    console.log("🔍 Recherche de la meilleure route sur LI.FI...");
    const response = await fetch(`https://li.quest/v1/quote?${params.toString()}`);
    const quote = (await response.json()) as any;
    if (!quote || !quote.transactionRequest) {
        console.error("❌ Pas de route trouvée ou erreur LI.FI :", quote.message || "Erreur inconnue");
        return;
    }
    console.log("⛽ Route trouvée ! Prix estimé :", quote.estimate.toAmount);
    console.log("🚀 Transaction prête à être envoyée vers le Diamond de LI.FI");
    console.log("Destinataire final : AgentVault sur Base");
}

async function main() {
    console.log("🤖 Agent en cours de surveillance...");   
    const decision = await getAgentDecision("Le prix de l'ETH a chuté de 5% sur Base, opportunité détectée.");
    if (decision.shouldSwap) {
        console.log("✅ Décision de l'IA :", decision.reason);
        const amount = "10000000";         
        const payload = encodeVaultInstruction(1000000000000000000n);
        console.log("📦 Payload généré :", payload);
        await executeCrossChainSwap(payload, amount);
    } else {
        console.log("⏳ En attente d'opportunité...");
    }
}

import { createPublicClient } from 'viem';

const baseClient = createPublicClient({chain: base, transport: http("URL_RPC_BASE")});

async function checkSwapSuccess(tokenAddress: `0x${string}`, vaultAddress: `0x${string}`, initialBalance: bigint) {
    console.log("⏳ Attente de l'exécution sur Base (cela peut prendre 2-5 min)...");
    
    for (let i = 0; i < 20; i++) {
        const currentBalance = await baseClient.readContract({
            address: tokenAddress,
            abi: [{ "inputs": [{ "name": "account", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" }],
            functionName: 'balanceOf',
            args: [vaultAddress]
        }) as bigint;

        if (currentBalance > initialBalance) {
            console.log(`✅ Succès ! Le Vault a reçu ${currentBalance - initialBalance} jetons sur Base.`);
            return true;
        }
        
        await new Promise(resolve => setTimeout(resolve, 30000));
    }
    console.error("❌ Le swap semble avoir échoué ou prend trop de temps.");
    return false;
}

main();
