// server.ts
import express from 'express';
import cors from 'cors';
import { scanAllVaults, askAIForStrategy, executeStrategy } from './agent';

const app = express();
app.use(cors());
app.use(express.json());

// Store vault addresses that users deploy from the website
let userVaults: string[] = []; 

app.post('/register-vault', (req, res) => {
    const { address } = req.body;
    if (address && !userVaults.includes(address)) {
        console.log(`🆕 New Judge Vault Registered: ${address}`);
        userVaults.push(address);
    }
    res.json({ status: 'registered', count: userVaults.length });
});

app.get('/run-agent', async (req, res) => {
    try {
        console.log("⚡ Triggering Agent Run for ALL Vaults...");
        // Modify your scan function to loop through 'userVaults' too
        const states = await scanAllVaults(userVaults); 
        const decision = await askAIForStrategy(states);
        
        let txHash = null;
        if (decision.action === "SWAP") {
             txHash = await executeStrategy(decision);
        }
        
        res.json({ success: true, decision, txHash });
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(3001, () => console.log('🤖 Agent Server running on port 3001'));
