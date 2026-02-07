'use client'; // <--- THIS IS MANDATORY FOR THE NEW NEXT.JS

import { useState } from 'react';
import { ethers } from 'ethers';
import axios from 'axios';

// ⚠️ REPLACE THIS with your actual Ngrok URL
const API_URL = "https://your-ngrok-url.ngrok-free.app"; 

export default function Home() {
  const [account, setAccount] = useState<string | null>(null);
  const [vault, setVault] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const connect = async () => {
    if (typeof window !== 'undefined' && window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        setAccount(await signer.getAddress());
      } catch (err) {
        addLog("❌ User rejected connection");
      }
    } else {
      alert("Please install MetaMask!");
    }
  };

  const deployVault = async () => {
    const mockVault = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"; 
    setVault(mockVault);
    
    try {
      await axios.post(`${API_URL}/register-vault`, { address: mockVault });
      addLog(`✅ Vault Deployed at ${mockVault}`);
      addLog(`👉 Action: Send USDC to this address on Sepolia!`);
    } catch (e: any) {
        addLog(`❌ Server Error: Is your backend running?`);
    }
  };

  const runAgent = async () => {
    setLoading(true);
    addLog("🤖 AI is Scanning the blockchain...");
    try {
      const res = await axios.get(`${API_URL}/run-agent`);
      addLog(`🧠 AI Decision: ${res.data.decision.action}`);
      if (res.data.decision.reason) addLog(`🗣️ Reason: ${res.data.decision.reason}`);
      if (res.data.txHash) addLog(`🚀 Transaction Sent: ${res.data.txHash}`);
    } catch (e: any) {
      addLog(`❌ Error: ${e.message}`);
    }
    setLoading(false);
  };

  const addLog = (msg: string) => setLogs(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);

  return (
    <div className="min-h-screen bg-slate-900 text-white p-10 font-mono">
      <header className="flex justify-between items-center mb-10">
        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600">
          OmniYield AI Agent
        </h1>
        <button onClick={connect} className="bg-blue-600 px-6 py-2 rounded hover:bg-blue-700 transition-colors">
          {account ? `${account.slice(0,6)}...${account.slice(-4)}` : "Connect Wallet"}
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        
        <div className="space-y-6">
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
            <h2 className="text-xl mb-4 font-semibold text-green-400">1. Deploy Your AI Vault</h2>
            {!vault ? (
              <button onClick={deployVault} className="w-full bg-green-600 py-3 rounded font-bold hover:bg-green-700 transition-all">
                Deploy Test Vault
              </button>
            ) : (
              <div className="p-4 bg-slate-900 rounded border border-green-900/50">
                <p className="text-sm text-gray-400">Your Vault Address:</p>
                <p className="text-green-400 break-all font-mono">{vault}</p>
              </div>
            )}
          </div>

          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
            <h2 className="text-xl mb-4 font-semibold text-purple-400">2. Manage Agent</h2>
            <p className="mb-4 text-gray-400 text-sm">Click below to force the AI to scan your vault and rebalance funds.</p>
            <button 
              onClick={runAgent} 
              disabled={loading}
              className={`w-full py-3 rounded font-bold transition-all ${loading ? 'bg-gray-600 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700 shadow-[0_0_15px_rgba(147,51,234,0.5)]'}`}
            >
              {loading ? "Thinking..." : "⚡ Run AI Agent"}
            </button>
          </div>
        </div>

        {/* Right Panel: Live Terminal */}
        <div className="bg-black p-6 rounded-xl border border-gray-800 font-mono text-sm h-[500px] overflow-y-auto shadow-2xl relative">
          <div className="absolute top-0 left-0 w-full h-8 bg-gray-900 flex items-center px-4 border-b border-gray-800">
             <div className="flex space-x-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
             </div>
             <div className="ml-4 text-gray-500 text-xs">agent@omniyield:~</div>
          </div>
          <div className="mt-8">
            <p className="text-green-500 mb-2">root@omniyield:~$ agent --watch</p>
            {logs.map((log, i) => (
                <div key={i} className="mb-1 border-b border-gray-900/50 pb-1 last:border-0">
                <span className="text-blue-500 font-bold">{">"}</span> <span className="text-gray-300">{log}</span>
                </div>
            ))}
            {loading && <div className="animate-pulse text-purple-400 mt-2">...analyzing liquidity routes via LI.FI...</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
