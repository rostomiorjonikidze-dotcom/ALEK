import { createAppKit } from '@reown/appkit'
import { EthersAdapter } from '@reown/appkit-adapter-ethers'
import { mainnet } from '@reown/appkit/networks'

const PROJECT_ID = '15a319297e48913a316f8f756c08db92'
const ALK_CONTRACT = '0xE06f0383c58D85Ef7dD70B696f19a7A52fB70d8F'
const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com'
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
  const r = await fetch(SEPOLIA_RPC, {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0', id:1, method, params})
  })
  const j = await r.json()
  if (j.error) throw new Error(j.error.message)
  return j.result
}

async function balances(address) {
  const padded = address.toLowerCase().replace(/^0x/,'').padStart(64,'0')
  const data = '0x70a08231' + padded
  const [eth, alk] = await Promise.all([
    rpc('eth_getBalance', [address, 'latest']),
    rpc('eth_call', [{to: ALK_CONTRACT, data}, 'latest'])
  ])
  setText('ethBalance', `${format18(eth)} ETH`)
  setText('alkBalance', `${format18(alk)} ALK`)
}

async function connected(address) {
  setText('walletTitle', 'Wallet Connected ✓')
  setText('walletAddress', address)
  setText('heroWallet', `Connected: ${short(address)}`)
  setText('status', 'Wallet Connected ✓')
  setText('chain', 'Ethereum wallet · Sepolia balances')
  const d = $('disconnectBtn')
  if (d) d.hidden = false
  try { await balances(address) }
  catch (e) {
    console.error(e)
    setText('ethBalance', 'Unavailable')
    setText('alkBalance', 'Unavailable')
  }
}

async function resolveConnectedAddress(state = {}) {
  // 1. AppKit provider-state address
  if (state.address) return state.address

  // 2. AppKit account getter
  const appKitAddress = modal.getAddress?.()
  if (appKitAddress) return appKitAddress

  // 3. Wallet provider accounts (important after WalletConnect return)
  let provider = state.provider || modal.getWalletProvider?.()
  if (!provider) {
    const providers = modal.getProviders?.()
    provider = providers?.eip155
  }
  if (provider?.request) {
    try {
      const accounts = await provider.request({ method: 'eth_accounts' })
      if (accounts?.[0]) return accounts[0]
    } catch (e) {
      console.debug('ALEK account restore:', e)
    }
  }
  return null
}

async function sync(state = {}) {
  const address = await resolveConnectedAddress(state)
  const connectedFlag =
    state.isConnected ??
    modal.getIsConnected?.() ??
    Boolean(address)

  if (connectedFlag && address) {
    await connected(address)
    return true
  }

  if (state.isConnected === false) disconnected()
  return false
}

modal.subscribeProvider?.(state => {
  sync(state)
})

modal.subscribeProviders?.(providers => {
  const provider = providers?.eip155
  if (provider) sync({ provider, isConnected: true })
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
  try { await modal.disconnect() } finally { disconnected() }
})

async function restore() {
  for (const delay of [0, 150, 300, 600, 1000, 1800, 3000, 5000]) {
    if (delay) await sleep(delay)
    if (await sync()) return
  }
}
window.addEventListener('pageshow', restore)
window.addEventListener('focus', restore)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') restore()
})
restore()
