# TokenWise Dashboard: Real-Time Solana SPL Token Analytics

TokenWise is a powerful, real-time dashboard for monitoring on-chain activity for any SPL token on the Solana blockchain. It provides an intelligent, live feed of buys, sells, protocol usage, and top token holders, giving users an accurate pulse of a token's market sentiment.

The application uses a Node.js backend to connect directly to the Solana network via a high-performance Helius RPC. It intelligently parses live transaction data to identify the true direction of trades and pushes this information instantly to a sleek frontend dashboard using WebSockets.

## Features

- **Live Transaction Feed:** See buys and sells populate in real-time.
- **Accurate Net Direction:** Intelligently calculates true buy/sell pressure by identifying the transaction signer.
- **Protocol Usage:** A live-updating chart shows which DEXs (Jupiter, Raydium, Orca) are being used for trades.
- **Top Holder Tracking:** Displays a continuously refreshed list of the top 150 token holders.
- **Secure & Configurable:** Uses a `.env` file to securely manage your RPC keys and target token address.

---

## Dashboard Preview



![TokenWise Dashboard Preview](https://github.com/user-attachments/assets/f8f6c7e5-2ad1-4d10-9036-94068d1b540a)

---

## How to Run the Project

Follow these steps to get the TokenWise dashboard running on your local machine.

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (v18.0 or higher recommended)
- `npm` or `yarn` package manager

### 2. Clone the Repository

Clone this project to your local machine:

```bash
git clone <your-repository-url>
cd <repository-folder>
```

### 3. Install Dependencies

Install the necessary `npm` packages for both the server and the frontend:

```bash
npm install
```

### 4. Set Up Environment Variables

The application requires a `.env` file for configuration.

-   Create a new file named `.env` in the root of the project.
-   Copy the following content into it and replace the placeholder values with your own.

```env
# Your Helius RPC URL with API Key
HELIUS_RPC_URL="httpsy://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY_HERE"

# The mint address of the SPL token you want to monitor
TOKEN_MINT_ADDRESS="9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump"
```

### 5. Run the Development Server

Start the Node.js server. It will automatically serve the frontend and begin listening for blockchain events.

```bash
npm run dev
```

The application will now be running at `http://localhost:3000`. Open this URL in your browser to see the live dashboard.

---

## Architecture

Here's the flowchart that visualizes the data flow from the Solana blockchain to the end-user:

_(Here's where you can add the flowchart image)_

![TokenWise Architecture Flowchart](https://github.com/user-attachments/assets/105a5fe3-98d3-4f15-895c-420706c99621)