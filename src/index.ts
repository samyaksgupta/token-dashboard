import express from 'express';
import http from 'http';
import WebSocket from 'ws';
import cors from 'cors';
import { Connection, PublicKey, ParsedTransactionWithMeta, Finality } from '@solana/web3.js';
import path from 'path';

// --- CONFIGURATION ---
const PORT = 3000;
// IMPORTANT: Replace with your own Helius RPC URL stored in env
const HELIUS_RPC_URL = 'GET_API_FROM_HELIUS'; 
const TOKEN_MINT_ADDRESS = 'MINT TOKEN HERE';

// Known DEX Program IDs for protocol identification
const PROTOCOL_MAP: { [key: string]: string } = {
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'Jupiter',
    '675kPX9MHTjS2zt1qfr1ciDcq2z9VLzthqo3DzaGuDE': 'Raydium',
    'whirLbMiicVdio4iFvTrYcF24GfbExcYxSjS4s9eGAY': 'Orca',
};

// --- TYPES ---
interface TopHolder {
    address: string;
    amount: number;
    uiAmount: number;
}

interface MonitoredTransaction {
    signature: string;
    timestamp: number;
    walletAddress: string;
    type: 'buy' | 'sell';
    amount: number;
    protocol: string;
}

// --- STATE ---
let topHolders: Map<string, TopHolder> = new Map();
let historicalTransactions: MonitoredTransaction[] = [];

// --- SOLANA CONNECTION ---
const connection = new Connection(HELIUS_RPC_URL, 'confirmed');

// --- UTILITY FUNCTIONS ---
/**
 * Fetches the top 150 token holders for the specified mint address.
 */
async function fetchTopHolders() {
    console.log('Fetching top 150 token holders...');
    try {
        const largestAccounts = await connection.getTokenLargestAccounts(new PublicKey(TOKEN_MINT_ADDRESS));
        const newHolders = new Map<string, TopHolder>();
        largestAccounts.value.slice(0, 150).forEach(account => {
            if (account.uiAmount && account.address) {
                const holder: TopHolder = {
                    address: account.address.toBase58(),
                    amount: Number(account.amount),
                    uiAmount: account.uiAmount,
                };
                newHolders.set(holder.address, holder);
            }
        });
        topHolders = newHolders;
        console.log(`Successfully fetched ${topHolders.size} top holders.`);
    } catch (error) {
        console.error('Error fetching top holders:', error);
    }
}

/**
 * Parses a transaction to identify relevant activity from top holders.
 * @param signature - The transaction signature.
 */
async function parseTransaction(signature: string) {
    try {
        const tx = await connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
        });

        if (!tx || !tx.meta || !tx.blockTime) return;

        const { meta, blockTime, transaction } = tx;

        // The first account key is the fee-payer and primary signer.
        if (transaction.message.accountKeys.length === 0) return;
        const signer = transaction.message.accountKeys[0].pubkey.toBase58();
        
        const involvedPrograms = new Set(transaction.message.instructions.map(ix => ix.programId.toBase58()));

        // Identify protocol
        let protocol = 'Unknown';
        for (const programId in PROTOCOL_MAP) {
            if (involvedPrograms.has(programId)) {
                protocol = PROTOCOL_MAP[programId];
                break;
            }
        }

        const preBalances = meta.preTokenBalances?.filter(b => b.mint === TOKEN_MINT_ADDRESS) || [];
        const postBalances = meta.postTokenBalances?.filter(b => b.mint === TOKEN_MINT_ADDRESS) || [];

        // Find the balance change for the transaction signer. This tells us the user's side of the trade.
        const signerBalanceChange = postBalances.find(balance => balance.owner === signer);

        if (!signerBalanceChange) {
            // This can happen in complex transactions (e.g. routing through multiple pools)
            // For this dashboard, we can safely ignore these.
            return;
        }

        const preBalance = preBalances.find(b => b.owner === signer && b.accountIndex === signerBalanceChange.accountIndex);
        const preAmount = preBalance ? BigInt(preBalance.uiTokenAmount.amount) : BigInt(0);
        const postAmount = BigInt(signerBalanceChange.uiTokenAmount.amount);
        const amountChange = postAmount - preAmount;

        if (amountChange !== BigInt(0)) {
            const uiAmountChange = Number(amountChange) / (10 ** signerBalanceChange.uiTokenAmount.decimals);
            const type = amountChange > 0 ? 'buy' : 'sell';

            const newTx: MonitoredTransaction = {
                signature,
                timestamp: blockTime * 1000,
                walletAddress: signer,
                type,
                amount: Math.abs(uiAmountChange),
                protocol,
            };

            // Avoid duplicates - only log one event per signature.
            if (!historicalTransactions.some(t => t.signature === signature)) {
                console.log(`[${protocol}] ${type.toUpperCase()} by ${signer.slice(0, 6)}...: ${Math.abs(uiAmountChange).toFixed(2)}`);
                historicalTransactions.unshift(newTx);
                
                // Cap historical transactions to prevent memory leak
                if (historicalTransactions.length > 200) {
                    historicalTransactions.length = 200;
                }
                
                broadcast(JSON.stringify({ type: 'new_transaction', payload: newTx }));
            }
        }
    } catch (error) {
        console.error(`Error parsing transaction ${signature}:`, error);
    }
}

/**
 * Subscribes to logs related to the token mint to monitor real-time activity.
 */
function subscribeToTokenLogs() {
    console.log(`Subscribing to logs for token: ${TOKEN_MINT_ADDRESS}`);
    
    const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const INVALID_SIGNATURE = '1111111111111111111111111111111111111111111111111111111111111111';

    connection.onLogs(
        TOKEN_PROGRAM_ID,
        (logs, context) => {
            if (logs.err || !logs.logs || logs.signature === INVALID_SIGNATURE) return;

            // Check if the logs contain our token mint address
            const mintInvolved = logs.logs.some(log => log.includes(TOKEN_MINT_ADDRESS));
            
            if (mintInvolved) {
                // Heuristic to check for transfer instructions (common pattern)
                const isTransfer = logs.logs.some(log => log.includes("Instruction: Transfer"));
                if (isTransfer) {
                     console.log(`[LOG] Transfer involving ${TOKEN_MINT_ADDRESS} detected in tx: ${logs.signature}`);
                    parseTransaction(logs.signature);
                }
            }
        },
        'confirmed' as Finality
    );
}

// --- SERVER SETUP ---
const app = express();
app.use(cors());
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function broadcast(data: string) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket.');
    // Send initial data to the newly connected client
    ws.send(JSON.stringify({ type: 'initial_data', payload: {
        holders: Array.from(topHolders.values()),
        transactions: historicalTransactions.slice(0, 50) // Send recent 50 txs
    }}));

    ws.on('close', () => {
        console.log('Client disconnected.');
    });
});

// --- API ENDPOINTS ---
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// Endpoint to manually fetch current state (useful for debugging or other clients)
app.get('/api/data', (req, res) => {
    res.json({
        holders: Array.from(topHolders.values()),
        transactions: historicalTransactions,
    });
});

// --- INITIALIZATION ---
server.listen(PORT, async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Initial fetch of top holders
    await fetchTopHolders();
    
    // Periodically refresh the top holders list (e.g., every 15 minutes)
    setInterval(fetchTopHolders, 15 * 60 * 1000);
    
    // Start listening for real-time transactions
    subscribeToTokenLogs();
});
