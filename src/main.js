import { createAppKit } from '@reown/appkit'
import { EthersAdapter } from '@reown/appkit-adapter-ethers'
import { mainnet } from '@reown/appkit/networks'
import { BrowserProvider, Contract, parseEther } from 'ethers'

const PROJECT_ID = '15a319297e48913a316f8f756c08db92'

const ALK_CONTRACT = '0x6b6ecc1b213af556e240290e677a09d565d085c4'
const SUSHI_ROUTER = '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f'
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'

const MAINNET_RPCS = [
  'https://ethereum-rpc.publicnode.com',
  'https://eth.llamarpc.com',
  'https://rpc.ankr.com/eth'
]

const ROUTER_ABI = [
  'function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)',
  'function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256[] amounts)',
  'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)'
]

const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
]

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
  features: {
    analytics: false,
    email: false,
    socials: [],
    onramp: false,
    swaps: false
  }
})

const $ = id => document.getElementById(id)
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const short = address => address ? `${address.slice(0, 6)}â¦${address.slice(-4)}` : ''

function setText(id, value) {
  const el = $(id)
  if (el) el.textContent = value
}

function setMarketMessage(text) {
  setText('marketMessage', text)
}

function disconnected() {
  setText('walletTitle', 'Not connected')
  setText('walletAddress', 'Press Connect Wallet to choose a wallet.')
  setText('heroWallet', 'Not connected')
  setText('status', 'Ready')
  setText('chain', 'Ethereum Mainnet balances')
  setText('ethBalance', 'â')
  setText('alkBalance', 'â')

  const d = $('disconnectBtn')
  if (d) d.hidden = true

  document.querySelectorAll('.connectBtn').forEach(btn => {
    btn.textContent = 'Connect Wallet'
  })
}

function format18(hexOrBigInt, places = 5) {
  const n = typeof hexOrBigInt === 'bigint'
    ? hexOrBigInt
    : BigInt(hexOrBigInt || '0x0')

  const base = 10n ** 18n
  const whole = n / base
  let frac = (n % base).toString().padStart(18, '0').slice(0, places)
  frac = frac.replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : `${whole}`
}

async function rpc(method, params) {
  let lastError

  for (const url of MAINNET_RPCS) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
      })

      if (!r.ok) throw new Error(`RPC HTTP ${r.status}`)

      const j = await r.json()
      if (j.error) throw new Error(j.error.message || 'Ethereum RPC error')
      return j.result
    } catch (e) {
      lastError = e
    }
  }

  throw lastError || new Error('Ethereum Mainnet RPC unavailable')
}

async function balances(address) {
  if (!address) return

  setText('alkBalance', 'Loadingâ¦')
  setText('ethBalance', 'Loadingâ¦')

  try {
    const eth = await rpc('eth_getBalance', [address, 'latest'])
    setText('ethBalance', `${format18(eth)} ETH`)

    const padded = address.toLowerCase().replace(/^0x/, '').padStart(64, '0')
    const data = '0x70a08231' + padded
    const alk = await rpc('eth_call', [{ to: ALK_CONTRACT, data }, 'latest'])

    const alkFormatted = format18(alk, 4)
    setText('alkBalance', `${alkFormatted} ALK`)
  } catch (e) {
    console.error(e)
    setText('ethBalance', 'Unavailable')
    setText('alkBalance', 'Unavailable')
  }
}

async function connected(address) {
  setText('walletTitle', 'ALEK Wallet Connected â')
  setText('walletAddress', address)
  setText('heroWallet', `Connected: ${short(address)}`)
  setText('status', 'ALEK Wallet Connected â')
  setText('chain', 'Ethereum Mainnet Â· ALK')

  const d = $('disconnectBtn')
  if (d) d.hidden = false

  document.querySelectorAll('.connectBtn').forEach(btn => {
    btn.textContent = short(address)
  })

  await balances(address)
}

function extractAccountAddress(state = {}) {
  return state?.accountState?.address || state?.address || null
}

async function getWalletProvider() {
  const direct = modal.getWalletProvider?.()
  if (direct?.request) return direct

  const providers = modal.getProviders?.()
  const eip155 = providers?.eip155

  if (eip155?.request) return eip155

  if (eip155 && typeof eip155 === 'object') {
    const nested = Object.values(eip155).find(p => p?.request)
    if (nested) return nested
  }

  if (window.ethereum?.request) return window.ethereum

  return null
}

async function currentAddress() {
  const appKitAddress = modal.getAddress?.()
  if (appKitAddress) return appKitAddress

  const walletProvider = await getWalletProvider()
  if (!walletProvider?.request) return null

  try {
    const accounts = await walletProvider.request({ method: 'eth_accounts' })
    return accounts?.[0] || null
  } catch {
    return null
  }
}

async function syncFromAppKit() {
  const address = await currentAddress()
  if (!address) return false
  await connected(address)
  return true
}

function normalizeDecimal(value) {
  return String(value ?? '').trim().replace(/\s+/g, '').replace(',', '.')
}

function findInputNearButton(buttonId) {
  let el = $(buttonId)

  for (let i = 0; i < 8 && el; i++) {
    const input = el.querySelector?.('input')
    if (input) return input
    el = el.parentElement
  }

  throw new Error('Amount input not found')
}

async function ensureMainnet(walletProvider) {
  const chainId = await walletProvider.request({ method: 'eth_chainId' })
  if (String(chainId).toLowerCase() === '0x1') return

  try {
    await walletProvider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x1' }]
    })
  } catch {
    throw new Error('Please switch your wallet to Ethereum Mainnet')
  }
}

async function getTradeSigner() {
  let walletProvider = await getWalletProvider()

  if (!walletProvider?.request) {
    await modal.open()
    await sleep(500)
    walletProvider = await getWalletProvider()
  }

  if (!walletProvider?.request) {
    throw new Error('Wallet provider not available. Please reconnect your wallet.')
  }

  await ensureMainnet(walletProvider)

  const provider = new BrowserProvider(walletProvider)
  return provider.getSigner()
}

async function buyALK() {
  try {
    const input = findInputNearButton('buyAlkBtn')
    const valueText = normalizeDecimal(input.value)

    if (!/^\d+(\.\d{0,18})?$/.test(valueText) || Number(valueText) <= 0) {
      throw new Error('Enter a valid ETH amount')
    }

    const signer = await getTradeSigner()
    const from = await signer.getAddress()
    const value = parseEther(valueText)

    const router = new Contract(SUSHI_ROUTER, ROUTER_ABI, signer)

    setMarketMessage('Getting SushiSwap quoteâ¦')

    const amounts = await router.getAmountsOut(value, [WETH, ALK_CONTRACT])
    const amountOutMin = amounts[1] * 95n / 100n
    const deadline = Math.floor(Date.now() / 1000) + 1200

    setMarketMessage('Confirm Buy ALK transaction in your walletâ¦')

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
    await balances(from)
  } catch (e) {
    console.error(e)
    const msg = e?.shortMessage || e?.reason || e?.info?.error?.message || e?.message || 'Buy transaction failed'
    setMarketMessage(msg)
    alert(msg)
  }
}

async function sellALK() {
  try {
    const input = findInputNearButton('sellAlkBtn')
    const valueText = normalizeDecimal(input.value)

    if (!/^\d+(\.\d{0,18})?$/.test(valueText) || Number(valueText) <= 0) {
      throw new Error('Enter a valid ALK amount')
    }

    const signer = await getTradeSigner()
    const from = await signer.getAddress()
    const amountIn = parseEther(valueText)

    const router = new Contract(SUSHI_ROUTER, ROUTER_ABI, signer)
    const alk = new Contract(ALK_CONTRACT, ERC20_ABI, signer)

    const allowance = await alk.allowance(from, SUSHI_ROUTER)

    if (allowance < amountIn) {
      setMarketMessage('Confirm ALK approval in your walletâ¦')
      const approvalTx = await alk.approve(SUSHI_ROUTER, amountIn)
      await approvalTx.wait()
    }

    setMarketMessage('Getting SushiSwap quoteâ¦')

    const amounts = await router.getAmountsOut(amountIn, [ALK_CONTRACT, WETH])
    const amountOutMin = amounts[1] * 95n / 100n
    const deadline = Math.floor(Date.now() / 1000) + 1200

    setMarketMessage('Confirm Sell ALK transaction in your walletâ¦')

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
    await balances(from)
  } catch (e) {
    console.error(e)
    const msg = e?.shortMessage || e?.reason || e?.info?.error?.message || e?.message || 'Sell transaction failed'
    setMarketMessage(msg)
    alert(msg)
  }
}

function bindUI() {
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
    try {
      await modal.disconnect()
    } finally {
      disconnected()
    }
  })

  $('buyAlkBtn')?.addEventListener('click', buyALK)
  $('sellAlkBtn')?.addEventListener('click', sellALK)

  setMarketMessage('Trading is live through SushiSwap V2 on Ethereum Mainnet.')
}

modal.subscribeAccount?.(state => {
  const address = extractAccountAddress(state)
  if (address) connected(address)
  else if (state?.accountState?.isConnected === false || state?.isConnected === false) disconnected()
})

modal.subscribeProvider?.(state => {
  if (state?.address) connected(state.address)
  else if (state?.isConnected === false) disconnected()
})

async function restore() {
  for (const delay of [0, 150, 300, 600, 1000, 1800, 3000, 5000]) {
    if (delay) await sleep(delay)
    if (await syncFromAppKit()) return
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    bindUI()
    restore()
  }, { once: true })
} else {
  bindUI()
  restore()
}

window.addEventListener('pageshow', restore)
window.addEventListener('focus', restore)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') restore()
})
