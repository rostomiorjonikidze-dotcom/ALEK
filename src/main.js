import { createAppKit } from '@reown/appkit'
import { EthersAdapter } from '@reown/appkit-adapter-ethers'
import { mainnet } from '@reown/appkit/networks'
import { BrowserProvider, Contract, parseEther } from 'ethers'
const PROJECT_ID = '15a319297e48913a316f8f756c08db92'
const ALK_CONTRACT = '0x6B6Ecc1B213aF556E240290E677A09D565D085c4'
const MAINNET_RPCS = [
  'https://ethereum-rpc.publicnode.com',
  'https://eth.llamarpc.com',
  'https://rpc.ankr.com/eth'
]
const SUSHI_ROUTER = '0xd9e1cE17f2641F24aE83637aB66a2cca9C378B9F'
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const $ = id => document.getElementById(id)

const modal = createAppKit({
  adapters: [new EthersAdapter()],
  networks: [mainnet],
  defaultNetwork: mainnet,
  projectId: PROJECT_ID,
  metadata: {
    name: 'ALEK',
    description: 'ALEK Web3 Utility',
    url: 'https://alek.best',
    icons: ['https://alek.best/alek-logo.png']
  },
  features: { analytics: false, email: false, socials: [], onramp: false, swaps: false }
})

const short = a => a ? `${a.slice(0,6)}…${a.slice(-4)}` : ''
const sleep = ms => new Promise(r => setTimeout(r, ms))

function setText(id, value) {
  const el = $(id)
  if (el) el.textContent = value
}

function disconnected() {
  setText('walletTitle', 'Not connected')
  setText('walletAddress', 'Press Connect Wallet to choose a wallet.')
  setText('heroWallet', 'Not connected')
  setText('status', 'Ready')
  setText('chain', 'Ethereum Mainnet balances')
  setText('ethBalance', '—')
  setText('alkBalance', '—')
  const d = $('disconnectBtn')
  if (d) d.hidden = true
}

function format18(hex, places=5) {
  const n = BigInt(hex || '0x0')
  const base = 10n ** 18n
  const whole = n / base
  let frac = (n % base).toString().padStart(18,'0').slice(0,places).replace(/0+$/,'')
  return frac ? `${whole}.${frac}` : `${whole}`
}

async function rpc(method, params) {
  let lastError
  for (const url of MAINNET_RPCS) {
    try {
      const r = await fetch(url, {
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({jsonrpc:'2.0', id:1, method, params})
      })
      if (!r.ok) throw new Error(`RPC HTTP ${r.status}`)
      const j = await r.json()
      if (j.error) throw new Error(j.error.message)
      return j.result
    } catch (e) {
      lastError = e
    }
  }
  throw lastError || new Error('Ethereum Mainnet RPC unavailable')
}

async function balances(address) {
  setText('alkBalance', 'Loading…')
  setText('ethBalance', 'Loading…')

  const padded = address.toLowerCase().replace(/^0x/,'').padStart(64,'0')
  const data = '0x70a08231' + padded

  const eth = await rpc('eth_getBalance', [address, 'latest'])
  setText('ethBalance', `${format18(eth)} ETH`)

  const alk = await rpc('eth_call', [{to: ALK_CONTRACT, data}, 'latest'])
  const alkFormatted = format18(alk, 4)
  setText('alkBalance', `${alkFormatted} ALK`)

  const hint = $('alkHint')
  if (hint) {
    hint.textContent = BigInt(alk || '0x0') === 0n
      ? 'This connected Ethereum Mainnet address currently returns 0 ALK from the ALEK token contract.'
      : `Verified on-chain balance for ${short(address)}`
  }
}

async function connected(address) {
  setText('walletTitle', 'ALEK Wallet Connected ✓')
  setText('walletAddress', address)
  setText('heroWallet', `Connected: ${short(address)}`)
  setText('status', 'ALEK Wallet Connected ✓')
  setText('chain', 'Ethereum Mainnet · ALK')
  const d = $('disconnectBtn')
  if (d) d.hidden = false
  try { await balances(address) }
  catch (e) {
    console.error(e)
    setText('ethBalance', 'Unavailable')
    setText('alkBalance', 'Unavailable')
  }
}

function extractAccountAddress(state = {}) {
  return state?.accountState?.address || state?.address || null
}

async function applyConnectedAddress(address) {
  if (!address) return false
  await connected(address)
  document.querySelectorAll('.connectBtn').forEach(btn => {
    btn.textContent = short(address)
  })
  return true
}

async function syncFromAppKit() {
  const address = modal.getAddress?.()
  if (address) return applyConnectedAddress(address)

  const providers = modal.getProviders?.()
  const provider = providers?.eip155 || modal.getWalletProvider?.()
  if (provider?.request) {
    try {
      const accounts = await provider.request({ method: 'eth_accounts' })
      if (accounts?.[0]) return applyConnectedAddress(accounts[0])
    } catch (e) {
      console.debug('ALEK eth_accounts restore:', e)
    }
  }
  return false
}

modal.subscribeAccount?.(state => {
  const address = extractAccountAddress(state)
  if (address) {
    applyConnectedAddress(address)
  } else if (state?.accountState?.isConnected === false || state?.isConnected === false) {
    disconnected()
  }
})

modal.subscribeProvider?.(state => {
  if (state?.address) applyConnectedAddress(state.address)
  else if (state?.isConnected === false) disconnected()
})

modal.subscribeProviders?.(providers => {
  const provider = providers?.eip155
  if (!provider?.request) return
  provider.request({ method: 'eth_accounts' })
    .then(accounts => accounts?.[0] && applyConnectedAddress(accounts[0]))
    .catch(() => {})
})

document.querySelectorAll('.connectBtn').forEach(btn => {
  btn.addEventListener('click', async () => {
    try {
      await modal.open()
    } catch (e) {
      console.error(e)
      setText('status', 'Connection error')
    }
  })
})

$('disconnectBtn')?.addEventListener('click', async () => {
  try { await modal.disconnect() } finally {
    disconnected()
    document.querySelectorAll('.connectBtn').forEach(btn => { btn.textContent = 'Connect' })
function setMarketMessage(text) {
  setText('marketMessage', text)
}

async function getWalletProvider() {
  const providers = modal.getProviders?.()
  return providers?.eip155 || modal.getWalletProvider?.()
}

function findInputNearButton(buttonId) {
  let el = $(buttonId)

  for (let i = 0; i < 6 && el; i++) {
    const input = el.querySelector?.('input')
    if (input) return input
    el = el.parentElement
  }

  throw new Error('Amount input not found')
}

const ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)',
  'function swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline) payable returns (uint[] amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[] amounts)'
]

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)'
]

async function getTradeSigner() {
  const walletProvider = await getWalletProvider()

  if (!walletProvider?.request) {
    await modal.open()
    return null
  }

  const provider = new BrowserProvider(walletProvider)
  const network = await provider.getNetwork()

  if (network.chainId !== 1n) {
    throw new Error('Please switch wallet to Ethereum Mainnet')
  }

  return provider.getSigner()
}

async function buyALK() {
  try {
    const signer = await getTradeSigner()
    if (!signer) return

    const input = findInputNearButton('buyAlkBtn')
    const valueText = String(input.value || '').trim()

    if (!valueText || Number(valueText) <= 0) {
      throw new Error('Enter ETH amount')
    }

    const value = parseEther(valueText)
    const from = await signer.getAddress()

    const router = new Contract(
      SUSHI_ROUTER,
      ROUTER_ABI,
      signer
    )

    setMarketMessage('Getting SushiSwap quote...')

    const amounts = await router.getAmountsOut(
      value,
      [WETH, ALK_CONTRACT]
    )

    // 5% slippage protection
    const amountOutMin = amounts[1] * 95n / 100n
    const deadline = Math.floor(Date.now() / 1000) + 1200

    setMarketMessage('Confirm Buy ALK transaction in your wallet...')

    const tx = await router.swapExactETHForTokens(
      amountOutMin,
      [WETH, ALK_CONTRACT],
      from,
      deadline,
      { value }
    )

    setMarketMessage(`Buy submitted: ${tx.hash}`)

    await tx.wait()

    setMarketMessage('Buy ALK completed successfully.')

    setTimeout(() => balances(from), 2000)

  } catch (e) {
    console.error(e)
    setMarketMessage(
      e?.shortMessage ||
      e?.reason ||
      e?.message ||
      'Buy transaction failed'
    )
  }
}

async function sellALK() {
  try {
    const signer = await getTradeSigner()
    if (!signer) return

    const input = findInputNearButton('sellAlkBtn')
    const valueText = String(input.value || '').trim()

    if (!valueText || Number(valueText) <= 0) {
      throw new Error('Enter ALK amount')
    }

    const amountIn = parseEther(valueText)
    const from = await signer.getAddress()

    const router = new Contract(
      SUSHI_ROUTER,
      ROUTER_ABI,
      signer
    )

    const alk = new Contract(
      ALK_CONTRACT,
      ERC20_ABI,
      signer
    )

    setMarketMessage('Approve ALK for SushiSwap...')

    const approvalTx = await alk.approve(
      SUSHI_ROUTER,
      amountIn
    )

    await approvalTx.wait()

    setMarketMessage('Getting SushiSwap quote...')

    const amounts = await router.getAmountsOut(
      amountIn,
      [ALK_CONTRACT, WETH]
    )

    // 5% slippage protection
    const amountOutMin = amounts[1] * 95n / 100n
    const deadline = Math.floor(Date.now() / 1000) + 1200

    setMarketMessage('Confirm Sell ALK transaction in your wallet...')

    const tx = await router.swapExactTokensForETH(
      amountIn,
      amountOutMin,
      [ALK_CONTRACT, WETH],
      from,
      deadline
    )

    setMarketMessage(`Sell submitted: ${tx.hash}`)

    await tx.wait()

    setMarketMessage('Sell ALK completed successfully.')

    setTimeout(() => balances(from), 2000)

  } catch (e) {
    console.error(e)
    setMarketMessage(
      e?.shortMessage ||
      e?.reason ||
      e?.message ||
      'Sell transaction failed'
    )
  }
}

$('buyAlkBtn')?.addEventListener('click', buyALK)
$('sellAlkBtn')?.addEventListener('click', sellALK)

setMarketMessage('Trading is live through SushiSwap V2 on Ethereum Mainnet.')
async function restore() {
  for (const delay of [0, 150, 300, 600, 1000, 1800, 3000, 5000]) {
    if (delay) await sleep(delay)
    if (await syncFromAppKit()) return
  }
}
window.addEventListener('pageshow', restore)
window.addEventListener('focus', restore)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') restore()
})
restore()
