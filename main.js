import { createAppKit } from '@reown/appkit'
import { EthersAdapter } from '@reown/appkit-adapter-ethers'
import { sepolia } from '@reown/appkit/networks'

const PROJECT_ID = '15a319297e48913a316f8f756c08db92'
const CONTRACT = '0xE06f0383c58D85Ef7dD70B696f19a7A52fB70d8F'
const RPC = 'https://ethereum-sepolia-rpc.publicnode.com'
const $ = id => document.getElementById(id)
let currentAddress = null

const metadata = {
  name: 'ALEK',
  description: 'ALEK Web3 Utility',
  url: window.location.origin,
  icons: [`${window.location.origin}/alek-logo.png`]
}

const modal = createAppKit({
  adapters: [new EthersAdapter()],
  networks: [sepolia],
  defaultNetwork: sepolia,
  metadata,
  projectId: PROJECT_ID,
  features: { analytics: true, email: false, socials: [] },
  themeMode: 'dark'
})

function toast(msg){
  const t=$('toast'); if(!t) return
  t.textContent=msg; t.classList.add('show')
  clearTimeout(toast.x); toast.x=setTimeout(()=>t.classList.remove('show'),3500)
}
function short(a){ return a ? `${a.slice(0,6)}…${a.slice(-4)}` : '' }
function pad64(s){ return s.padStart(64,'0') }
function balanceOfData(address){ return '0x70a08231'+pad64(address.toLowerCase().replace(/^0x/,'')) }
function formatWei(hex,decimals=18,max=5){
  const n=BigInt(hex||'0x0'), base=10n**BigInt(decimals), whole=n/base
  const frac=(n%base).toString().padStart(decimals,'0').slice(0,max).replace(/0+$/,'')
  return frac ? `${whole}.${frac}` : `${whole}`
}
async function rpc(method,params=[]){
  const r=await fetch(RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})})
  const j=await r.json(); if(j.error) throw new Error(j.error.message||'RPC error'); return j.result
}
async function refreshBalances(address){
  try{
    const [eth,alk]=await Promise.all([
      rpc('eth_getBalance',[address,'latest']),
      rpc('eth_call',[{to:CONTRACT,data:balanceOfData(address)},'latest'])
    ])
    $('ethBalance').textContent=formatWei(eth)+' ETH'
    $('alkBalance').textContent=formatWei(alk)+' ALK'
  }catch(e){ console.error(e); $('status').textContent='Connected · balance unavailable' }
}
async function showConnected(address, chainId){
  if(!address) return false
  currentAddress=address
  $('walletTitle').textContent='Wallet connected'
  $('walletAddress').textContent=address
  $('heroWallet').textContent=short(address)
  $('status').textContent='Connected'
  $('chain').textContent=String(chainId)==='11155111' || String(chainId)==='eip155:11155111' ? 'Sepolia' : 'Sepolia'
  $('disconnectBtn').hidden=false
  await refreshBalances(address)
  return true
}
function showDisconnected(){
  currentAddress=null
  $('walletTitle').textContent='Not connected'
  $('walletAddress').textContent='Press Connect Wallet to choose a wallet.'
  $('heroWallet').textContent='Not connected'
  $('alkBalance').textContent='—'; $('ethBalance').textContent='—'
  $('status').textContent='Ready'; $('disconnectBtn').hidden=true
}
async function sync(state={}){
  let address=state.address || modal.getAddress?.()
  let chainId=state.chainId || modal.getChainId?.()
  const provider=state.provider || modal.getWalletProvider?.() || modal.getProviders?.()?.eip155
  if(!address && provider?.request){
    try{ const accounts=await provider.request({method:'eth_accounts'}); address=accounts?.[0] }catch(_){}
  }
  if(address) return showConnected(address,chainId)
  if(state.isConnected===false) showDisconnected()
  return false
}

modal.subscribeProvider?.(state => sync(state))
modal.subscribeProviders?.(providers => {
  if(providers?.eip155) sync({provider:providers.eip155})
})

async function retrySync(){
  for(let i=0;i<12;i++){
    if(await sync()) return
    await new Promise(r=>setTimeout(r,500))
  }
}
async function connect(){
  try{
    if(await sync()) return
    await modal.open({view:'Connect'})
  }catch(e){ console.error(e); toast('Wallet connection could not open.') }
}
document.querySelectorAll('.connectBtn').forEach(b=>b.addEventListener('click',connect))
$('disconnectBtn')?.addEventListener('click', async()=>{
  try{ await modal.disconnect?.(); showDisconnected() }
  catch(e){ console.error(e); await modal.open({view:'Account'}) }
})
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') retrySync() })
window.addEventListener('pageshow',retrySync)
window.addEventListener('focus',retrySync)
retrySync()
