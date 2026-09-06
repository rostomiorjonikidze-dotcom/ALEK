import { createAppKit } from '@reown/appkit'
import { EthersAdapter } from '@reown/appkit-adapter-ethers'
import { mainnet } from '@reown/appkit/networks'

const PROJECT_ID = '15a319297e48913a316f8f756c08db92'
const CONTRACT = '0xE06f0383c58D85Ef7dD70B696f19a7A52fB70d8F'
const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com'
const $ = id => document.getElementById(id)

const modal = createAppKit({
  adapters: [new EthersAdapter()],
  networks: [mainnet],
  defaultNetwork: mainnet,
  metadata: {
    name: 'ALEK',
    description: 'ALEK Web3 Utility',
    url: 'https://alek.best',
    icons: ['https://alek.best/alek-logo.png']
  },
  projectId: PROJECT_ID,
  features: {
    analytics: false,
    email: false,
    socials: [],
    onramp: false,
    swaps: false
  },
  defaultAccountTypes: { eip155: 'eoa' },
  universalProviderConfigOverride: {
    methods: {
      eip155: [
        'eth_sendTransaction',
        'personal_sign',
        'eth_signTypedData',
        'eth_signTypedData_v4'
      ]
    },
    chains: {
      eip155: ['1']
    },
    events: {
      eip155: ['chainChanged', 'accountsChanged']
    },
    rpcMap: {
      'eip155:1': 'https://ethereum-rpc.publicnode.com'
    },
    defaultChain: 'eip155:1'
  },
  themeMode: 'dark'
})

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function toast(message) {
  const el = $('toast')
  if (!el) return
  el.textContent = message
  el.classList.add('show')
  clearTimeout(toast.timer)
  toast.timer = setTimeout(() => el.classList.remove('show'), 3500)
}

function short(address) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ''
}

function balanceOfData(address) {
  return '0x70a08231' + address.toLowerCase().replace(/^0x/, '').padStart(64, '0')
}

function formatWei(hex, decimals = 18, max = 5) {
  const n = BigInt(hex || '0x0')
  const base = 10n ** BigInt(decimals)
  const whole = n / base
  const fraction = (n % base)
    .toString()
    .padStart(decimals, '0')
    .slice(0, max)
    .replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : `${whole}`
}

async function sepoliaRpc(method, params = []) {
  const response = await fetch(SEPOLIA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  })
  const json = await response.json()
  if (json.error) throw new Error(json.error.message || 'Sepolia RPC error')
  return json.result
}

async function loadSepoliaBalances(address) {
  try {
    const [eth, alk] = await Promise.all([
      sepoliaRpc('eth_getBalance', [address, 'latest']),
      sepoliaRpc('eth_call', [{ to: CONTRACT, data: balanceOfData(address) }, 'latest'])
    ])
    $('ethBalance').textContent = `${formatWei(eth)} ETH`
    $('alkBalance').textContent = `${formatWei(alk)} ALK`
  } catch (error) {
    console.error(error)
    $('status').textContent = 'Connected · Sepolia balance unavailable'
  }
}

async function showConnected(address) {
  if (!address) return false
  $('walletTitle').textContent = 'Wallet Connected ✓'
  $('walletAddress').textContent = address
  $('heroWallet').textContent = `Connected: ${short(address)}`
  $('status').textContent = 'Wallet Connected ✓'
  $('chain').textContent = 'Ethereum wallet · Sepolia balances'
  $('disconnectBtn').hidden = false
  await loadSepoliaBalances(address)
  return true
}

function showDisconnected() {
  $('walletTitle').textContent = 'Not connected'
  $('walletAddress').textContent = 'Press Connect Wallet to choose a wallet.'
  $('heroWallet').textContent = 'Not connected'
  $('alkBalance').textContent = '—'
  $('ethBalance').textContent = '—'
  $('status').textContent = 'Ready'
  $('chain').textContent = 'Sepolia balances'
  $('disconnectBtn').hidden = true
}

async function sync(state = {}) {
  let address = state.address || modal.getAddress?.()
  let provider = state.provider || modal.getWalletProvider?.()

  if (!provider) {
    const providers = modal.getProviders?.()
    provider = providers?.eip155
  }

  if (!address && provider?.request) {
    try {
      const accounts = await provider.request({ method: 'eth_accounts' })
      address = accounts?.[0]
    } catch {}
  }

  if (address) return showConnected(address)
  if (state.isConnected === false) showDisconnected()
  return false
}

modal.subscribeProvider?.(state => sync(state))
modal.subscribeProviders?.(providers => {
  if (providers?.eip155) sync({ provider: providers.eip155 })
})

async function retrySync() {
  for (const delay of [0, 250, 500, 1000, 2000, 3000, 5000]) {
    if (delay) await sleep(delay)
    if (await sync()) return true
  }
  return false
}

async function connect() {
  try {
    if (await retrySync()) return
    await modal.open()
    setTimeout(retrySync, 500)
  } catch (error) {
    console.error(error)
    toast('Wallet connection could not open.')
  }
}

document.querySelectorAll('.connectBtn').forEach(button => {
  button.addEventListener('click', connect)
})

$('disconnectBtn')?.addEventListener('click', async () => {
  try {
    await modal.disconnect?.()
    showDisconnected()
  } catch (error) {
    console.error(error)
  }
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') retrySync()
})
window.addEventListener('pageshow', retrySync)
window.addEventListener('focus', retrySync)

retrySync()
