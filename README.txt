ALEK FINAL MARKET — WORKING WALLET BASE

This package is based directly on ALEK-FINAL-CLEAN, the version where wallet connection worked.

Changes only:
- Reown external On-Ramp / Buy Crypto disabled.
- Reown Swap disabled.
- Added on-site Buy / Sell ALK section.
- Existing wallet connection logic was not replaced.
- Existing connected address, Sepolia ETH and ALK balance logic was kept.

Use the existing GitHub Actions workflow that runs npm install, npm run build, then deploys ./dist.
