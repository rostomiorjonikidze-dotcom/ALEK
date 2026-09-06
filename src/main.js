import { createAppKit } from '@reown/appkit'
import { EthersAdapter } from '@reown/appkit-adapter-ethers'
import { mainnet, sepolia } from '@reown/appkit/networks'

const PROJECT_ID = '15a319297e48913a316f8f756c08db92'
const CONTRACT = '0xE06f0383c58D85Ef7dD70B696f19a7A52fB70d8F'
const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com'
const $ = id => document.getElementById(id)

const modal = createAppKit({
  adapters: [new EthersAdapter()],
  networks: [mainnet, sepolia],
  defaultNetwork: mainnet,
  metadata: {
    name: 'ALEK',
    description: 'ALEK Web3 Utility',
    url: 'https://alek.best',
    icons: ['https://alek.best/alek-logo.png']
  },
  projectId: PROJECT_ID,
  features: { analytics: false, email: false, socials: [] },
  themeMode: 'dark'
})

const sleep = ms => new Promise(r => setTimeout(r, ms))
function toast(msg){ const t=$('toast'); if(!t)return; t.textContent=msg; t.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>t.classList.remove('show'),3500) }
function short(a){ return a ? `${a.slice(0,6)}…${a.slice(-4)}` : '' }
function balanceOfData(a){ return '0x70a08231'+a.toLowerCase().replace(/^0x/,'').padStart(64,'0') }
function formatWei(hex, decimals=18, max=5){ const n=BigInt(hex||'0x0'), b=10n**BigInt(decimals), w=n/b; const f=(n%b).toString().padStart(decimals,'0').slice(0,max).replace(/0+$/,''); return f?`${w}.${f}`:`${w}` }
async function rpc(method,params=[]){ const r=await fetch(SEPOLIA_RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}); const j=await r.json(); if(j.error) throw new Error(j.error.message||'RPC error'); return j.result }
async function balances(address){ try{ const [eth,alk]=await Promise.all([rpc('eth_getBalance',[address,'latest']),rpc('eth_call',[{to:CONTRACT,data:balanceOfData(address)},'latest'])]); $('ethBalance').textContent=formatWei(eth)+' ETH'; $('alkBalance').textContent=formatWei(alk)+' ALK' }catch(e){ console.error(e); $('status').textContent='Connected · Sepolia balance unavailable' } }
async function connected(address, chainId){ if(!address)return false; $('walletTitle').textContent='Wallet connected'; $('walletAddress').textContent=address; $('heroWallet').textContent=short(address); $('status').textContent='Connected'; $('chain').textContent=(String(chainId).includes('11155111'))?'Sepolia':'Ethereum'; $('disconnectBtn').hidden=false; await balances(address); return true }
function disconnected(){ $('walletTitle').textContent='Not connected'; $('walletAddress').textContent='Press Connect Wallet to choose a wallet.'; $('heroWallet').textContent='Not connected'; $('alkBalance').textContent='—'; $('ethBalance').textContent='—'; $('status').textContent='Ready'; $('disconnectBtn').hidden=true }
async function sync(state={}){ let address=state.address || modal.getAddress?.(); const chainId=state.chainId || modal.getChainId?.(); let provider=state.provider || modal.getWalletProvider?.() || modal.getProviders?.()?.eip155; if(!address && provider?.request){ try{ address=(await provider.request({method:'eth_accounts'}))?.[0] }catch{} } if(address)return connected(address,chainId); if(state.isConnected===false)disconnected(); return false }
modal.subscribeProvider?.(s=>sync(s))
modal.subscribeProviders?.(p=>{ if(p?.eip155) sync({provider:p.eip155}) })
async function retrySync(){ for(const ms of [0,250,500,1000,2000,3000]){ if(ms)await sleep(ms); if(await sync())return true } return false }
async function connect(){ try{ if(await retrySync())return; await modal.open({view:'Connect'}); setTimeout(retrySync,500) }catch(e){ console.error(e); toast('Wallet connection could not open.') } }
document.querySelectorAll('.connectBtn').forEach(b=>b.addEventListener('click',connect))
$('disconnectBtn')?.addEventListener('click',async()=>{ try{ await modal.disconnect?.(); disconnected() }catch(e){ console.error(e) } })
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible')retrySync() })
window.addEventListener('pageshow',retrySync)
window.addEventListener('focus',retrySync)
retrySync()
