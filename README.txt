ALEK — Sepolia Balance + Market Ready

What changed:
- AppKit now targets Ethereum Sepolia instead of Ethereum mainnet.
- Wallet section is labeled ALEK Wallet.
- ALK balance is read directly from the verified ALK contract:
  0xE06f0383c58D85Ef7dD70B696f19a7A52fB70d8F
- Multiple Sepolia RPC fallbacks are used for more reliable ALK/ETH balance loading.
- If the connected address owns 1,000,000 ALK on-chain, the page will show 1,000,000 ALK.
- Added on-site Buy ALK / Sell ALK UI.
- Added contracts/ALEKMarket.sol, a deploy-ready Sepolia test market.

Important:
The market UI cannot execute trades until ALEKMarket.sol is deployed and funded.
After deployment, put its address into MARKET_CONTRACT in src/main.js.
For sells, the market also needs Sepolia ETH liquidity and the seller must approve ALK to the market contract.

Testnet only. No real-money value.
