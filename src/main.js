import { createAppKit } from '@reown/appkit'
import { EthersAdapter } from '@reown/appkit-adapter-ethers'
import { sepolia } from '@reown/appkit/networks'

const PROJECT_ID = '15a319297e48913a316f8f756c08db92'
const ALK_CONTRACT = '0xE06f0383c58D85Ef7dD70B696f19a7A52fB70d8F'
const SEPOLIA_RPCS = [
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://rpc.sepolia.org',
  'https://ethereum-sepolia.publicnode.com'
]
const MARKET_CONTRACT = '' // Fill after deploying contracts/ALEKMarket.sol
const $ = id => document.getElementById(id)

const modal = createAppKit({
  adapters: [new EthersAdapter()],
  networks: [sepolia],
  defaultNetwork: sepolia,
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
  setText('chain', 'Sepolia balances')
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
  for (const url of SEPOLIA_RPCS) {
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
  throw lastError || new Error('Sepolia RPC unavailable')
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
      ? 'This connected Sepolia address currently returns 0 ALK from the verified token contract.'
      : `Verified on-chain balance for ${short(address)}`
  }
}

async function connected(address) {
  setText('walletTitle', 'ALEK Wallet Connected ✓')
  setText('walletAddress', address)
  setText('heroWallet', `Connected: ${short(address)}`)
  setText('status', 'ALEK Wallet Connected ✓')
  setText('chain', 'Ethereum Sepolia · ALK')
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
    document.querySelectorAll('.connectBtn').forEach(btn => { btn.textContent = 'Connect Wallet' })
  }
})


function marketReady() {
  return /^0x[a-fA-F0-9]{40}$/.test(MARKET_CONTRACT)
}

function setMarketMessage(text) {
  setText('marketMessage', text)
}

function hexQuantityFromEthInput(value) {
  const s = String(value || '').trim()
  if (!/^\d+(\.\d{0,18})?$/.test(s)) throw new Error('Enter a valid ETH amount')
  const [whole, frac=''] = s.split('.')
  const wei = BigInt(whole) * 10n**18n + BigInt((frac + '0'.repeat(18)).slice(0,18))
  if (wei <= 0n) throw new Error('Amount must be greater than 0')
  return '0x' + wei.toString(16)
}

function uint256Word(value) {
  return BigInt(value).toString(16).padStart(64, '0')
}

async function getWalletProvider() {
  const providers = modal.getProviders?.()
  return providers?.eip155 || modal.getWalletProvider?.() || null
}

async function buyALK() {
  if (!marketReady()) {
    setMarketMessage('ALK Market contract is not deployed yet. Deploy contracts/ALEKMarket.sol first.')
    return
  }
  const provider = await getWalletProvider()
  const from = modal.getAddress?.()
  if (!provider?.request || !from) {
    await modal.open()
    return
  }
  try {
    setMarketMessage('Confirm the Buy ALK transaction in your wallet…')
    const value = hexQuantityFromEthInput($('buyEth')?.value)
    const tx = await provider.request({
      method: 'eth_sendTransaction',
      params: [{ from, to: MARKET_CONTRACT, value, data: '0xa6f2ae3a' }]
    })
    setMarketMessage(`Buy submitted: ${tx}`)
    setTimeout(() => balances(from), 5000)
  } catch (e) {
    console.error(e)
    setMarketMessage(e?.message || 'Buy transaction failed')
  }
}

async function sellALK() {
  if (!marketReady()) {
    setMarketMessage('ALK Market contract is not deployed yet. Deploy contracts/ALEKMarket.sol first.')
    return
  }
  setMarketMessage('Sell requires ALK approval to the market contract first. The market deployment step will enable this safely.')
}

$('buyAlkBtn')?.addEventListener('click', buyALK)
$('sellAlkBtn')?.addEventListener('click', sellALK)

if (!marketReady()) {
  setMarketMessage('Trading UI is ready. The on-chain ALK Market contract still needs to be deployed and funded on Sepolia.')
}

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
