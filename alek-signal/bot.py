import os, json, urllib.request, urllib.parse, datetime, math, pathlib
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'ALEKSignal/1.0'}),timeout=15) as r: return json.load(r)
def market_klines(symbol,interval,limit=200):
    # Perpetual futures ONLY. No spot fallback, even when every futures provider fails.
    minutes=int(interval.rstrip('m'))
    errors=[]
    for provider in ('okx','bitget','gate'):
        try:
            if provider=='okx':
                inst=symbol.replace('USDT','-USDT-SWAP')
                url='https://www.okx.com/api/v5/market/candles?'+urllib.parse.urlencode(dict(instId=inst,bar=interval,limit=min(limit+5,300)))
                payload=get(url)
                if payload.get('code')!='0':raise ValueError(str(payload.get('msg')))
                raw=payload['data']
                rows=[[int(r[0]),r[1],r[2],r[3],r[4],r[5],int(r[0])+minutes*60000-1] for r in raw if len(r)>=9 and str(r[8])=='1']
            elif provider=='bitget':
                url='https://api.bitget.com/api/v2/mix/market/candles?'+urllib.parse.urlencode(dict(symbol=symbol,productType='USDT-FUTURES',granularity=interval,limit=min(limit+5,200)))
                payload=get(url)
                if payload.get('code')!='00000':raise ValueError(str(payload.get('msg')))
                rows=[[int(r[0]),r[1],r[2],r[3],r[4],r[5],int(r[0])+minutes*60000-1] for r in payload['data']]
            else:
                contract=symbol.replace('USDT','_USDT')
                url='https://api.gateio.ws/api/v4/futures/usdt/candlesticks?'+urllib.parse.urlencode(dict(contract=contract,interval=interval,limit=min(limit,200)))
                raw=get(url)
                if not isinstance(raw,list):raise ValueError('Unexpected Gate futures response')
                rows=[[int(r['t'])*1000,r['o'],r['h'],r['l'],r['c'],r.get('v','0'),int(r['t'])*1000+minutes*60000-1] for r in raw]
            now=int(datetime.datetime.now(datetime.timezone.utc).timestamp()*1000)
            rows=[r for r in rows if int(r[6])<now]
            rows.sort(key=lambda r:int(r[0]))
            rows=[r for r in rows if all(math.isfinite(float(r[k])) for k in (1,2,3,4))]
            if len(rows)<min(limit,100):raise ValueError('Insufficient closed perpetual futures candles: got '+str(len(rows))+' required '+str(min(limit,100)))
            if any(int(rows[i][0])>=int(rows[i+1][0]) for i in range(len(rows)-1)):raise ValueError('Nonmonotonic candle timestamps')
            if now-int(rows[-1][6])>minutes*60000*3:raise ValueError('Stale futures candles')
            return rows[-limit:],provider+' USDT perpetual'
        except Exception as exc:
            detail=provider+': '+type(exc).__name__+' '+str(exc)[:180]
            errors.append(detail)
            print('Futures provider failed:',provider,flush=True)
            print('  Symbol:',symbol,'Interval:',interval,flush=True)
            print('  Reason:',type(exc).__name__,str(exc)[:180],flush=True)
    raise RuntimeError('All perpetual futures data providers failed; no spot fallback: '+'; '.join(errors))

def ema(a,n):
    x=a[0];out=[]
    for v in a:
        x=x*(n-1)/(n+1)+v*2/(n+1);out.append(x)
    return out
def rsi(a,n=14):
    d=[a[i]-a[i-1] for i in range(1,len(a))];g=sum(max(v,0) for v in d[:n])/n;l=sum(max(-v,0) for v in d[:n])/n
    for v in d[n:]:g=(g*(n-1)+max(v,0))/n;l=(l*(n-1)+max(-v,0))/n
    return 50 if g==l==0 else 100 if l==0 else 100-100/(1+g/l)
def candidate(symbol,interval):
    rows,source=market_klines(symbol,interval,200)
    now=int(datetime.datetime.now(datetime.timezone.utc).timestamp()*1000)
    rows=[r for r in rows if int(r[6])<now]
    if len(rows)<100 or now-int(rows[-1][6])>(10*60*1000 if interval=='5m' else 30*60*1000):return None
    close=[float(r[4]) for r in rows];a=ema(close,9);b=ema(close,21);t=ema(close,50);momentum=rsi(close)
    up=(a[-1]>b[-1] and close[-1]>t[-1] and momentum>=52 and (a[-2]<=b[-2] or (close[-2]<=a[-2] and close[-1]>a[-1])))
    down=(a[-1]<b[-1] and close[-1]<t[-1] and momentum<=48 and (a[-2]>=b[-2] or (close[-2]>=a[-2] and close[-1]<a[-1])))
    if not(up or down):return None
    tr=[]
    for i,r in enumerate(rows):
        high,low=float(r[2]),float(r[3]);prev=float(rows[i-1][4]) if i else float(r[4]);tr.append(max(high-low,abs(high-prev),abs(low-prev)))
    atr=sum(tr[:14])/14
    for v in tr[14:]:atr=(atr*13+v)/14
    direction=1 if up else -1;price=close[-1]
    if not math.isfinite(atr) or atr<=0:return None
    return dict(symbol=symbol,interval=interval,direction='LONG' if up else 'SHORT',entry=price,tp1=price+direction*atr,tp2=price+direction*2*atr,sl=price-direction*1.5*atr,close_time=int(rows[-1][6]),source=source,candles=rows[-80:])

def send_chart(s, caption, test=False):
    import io, uuid
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle
    rows=s.get('candles')
    if not rows:
        rows,_=market_klines(s['symbol'],s['interval'],80)
    candles=[tuple(float(r[k]) for k in (1,2,3,4)) for r in rows if int(r[6])<=s['close_time']][-45:]
    if not candles: raise RuntimeError('Chart has no candles')
    fig,ax=plt.subplots(figsize=(10,6),dpi=140)
    fig.patch.set_facecolor('#101827');ax.set_facecolor('#101827')
    for i,(o,h,l,cl) in enumerate(candles):
        color='#20d5a1' if cl>=o else '#ff637a'
        ax.vlines(i,l,h,color=color)
        ax.add_patch(Rectangle((i-.3,min(o,cl)),.6,max(abs(cl-o),.01),color=color))
    if not test:
        for key,color in [('entry','#f4cf65'),('tp1','#20d5a1'),('tp2','#20d5a1'),('sl','#ff637a')]:
            ax.axhline(s[key],color=color,linestyle='--')
            ax.text(len(candles)-1,s[key],f"{key.upper()} {s[key]:,.2f}",color=color,ha='right',va='bottom',bbox={'facecolor':'#101827','edgecolor':'none'})
    ax.set_xlim(-1,len(candles)+1)
    ax.tick_params(colors='white');ax.grid(alpha=.1)
    ax.set_title('ALEK SIGNAL VIP | '+s['symbol']+' | '+s['direction']+(' | LIVE DATA TEST' if test else ''),color='white')
    fig.tight_layout();buffer=io.BytesIO();fig.savefig(buffer,format='png',facecolor=fig.get_facecolor());plt.close(fig)
    boundary='alek'+uuid.uuid4().hex
    def field(name,value):
        return ('--'+boundary+'\r\nContent-Disposition: form-data; name="'+name+'"\r\n\r\n'+str(value)+'\r\n').encode()
    body=field('chat_id',os.environ['CHAT_ID'])+field('caption',caption)+('--'+boundary+'\r\nContent-Disposition: form-data; name="photo"; filename="chart.png"\r\nContent-Type: image/png\r\n\r\n').encode()+buffer.getvalue()+('\r\n--'+boundary+'--\r\n').encode()
    req=urllib.request.Request('https://api.telegram.org/bot'+os.environ['BOT_TOKEN']+'/sendPhoto',data=body,headers={'Content-Type':'multipart/form-data; boundary='+boundary})
    with urllib.request.urlopen(req,timeout=35) as response:return bool(json.load(response).get('ok'))

def send(s):
    title='🟢 LONG' if s['direction']=='LONG' else '🔴 SHORT'
    timestamp=datetime.datetime.fromtimestamp(s['close_time']/1000,datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    direction='⬆️ Expected direction: UP' if s['direction']=='LONG' else '⬇️ Expected direction: DOWN'
    msg=(f"💎 ALEK SIGNAL VIP | USDT Perpetual Futures\n\n{title} | {s['symbol']} | {s['interval']}\n{direction}\n\n📍 ENTRY: {s['entry']:,.2f}\n🎯 TP1: {s['tp1']:,.2f}\n🎯 TP2: {s['tp2']:,.2f}\n🛑 STOP LOSS: {s['sl']:,.2f}\n⏰ Candle closed: {timestamp}\n📡 Futures data: {s['source']} (prices may vary across exchanges)\n\n⚠️ Experimental signal. Entry is the candle closing price, not a guaranteed execution price. Profits are not guaranteed.")
    return send_chart(s,msg)

def main():
    missing=[key for key in ('BOT_TOKEN','CHAT_ID') if not os.getenv(key)]
    if missing:
        raise RuntimeError('Missing GitHub Actions secrets: '+', '.join(missing))
    print('ALEK Signal scan started',datetime.datetime.now(datetime.timezone.utc).isoformat(),flush=True)
    if os.getenv('TELEGRAM_TEST')=='true':
        try:
            rows,source=market_klines('BTCUSDT','5m',80)
        except Exception as exc:
            print('Futures chart diagnostic failed; proceeding to real market scan',flush=True)
            print('  Reason:',str(exc),flush=True)
            rows=None
        now=int(datetime.datetime.now(datetime.timezone.utc).timestamp()*1000)
        closed=[r for r in rows if int(r[6])<now] if rows else []
        if rows and len(closed)<45:raise RuntimeError('Not enough live futures candles')
        if rows:
            latest=closed[-1]
            stamp=datetime.datetime.fromtimestamp(int(latest[6])/1000,datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
            sample=dict(symbol='BTCUSDT',interval='5m',direction='MARKET',close_time=int(latest[6]),candles=rows,source=source)
            test_msg=f'📊 ALEK SIGNAL VIP — LIVE FUTURES CHART TEST\nBTCUSDT Perpetual | 5m | {source}\nLast closed candle: {float(latest[4]):,.2f} USDT\nTime: {stamp}\n\n⚠️ Live futures market data connectivity test only. NOT a LONG/SHORT trading signal.'
            if not send_chart(sample,test_msg,test=True):raise RuntimeError('Telegram rejected real-market chart')
            print('Real perpetual futures chart test confirmed',flush=True)
    state_path=pathlib.Path('alek-signal/signal-state.json')
    try: state=json.loads(state_path.read_text()) if state_path.exists() else {}
    except (ValueError,OSError): state={}
    failures=[]
    signals=0
    for symbol in ('BTCUSDT','ETHUSDT'):
        for interval in ('5m','15m'):
            try:
                s=candidate(symbol,interval)
                if s:
                    key=symbol+':'+interval
                    if int(state.get(key,0))>=s['close_time']:
                        print('Duplicate signal skipped',key,s['close_time'],flush=True)
                        continue
                    print('Sending',symbol,interval,s['close_time'],flush=True)
                    if not send(s): raise RuntimeError('Telegram did not confirm send')
                    state[key]=s['close_time']
                    state_path.parent.mkdir(parents=True,exist_ok=True)
                    state_path.write_text(json.dumps(state,sort_keys=True))
                    signals+=1
                else:
                    print('No qualified signal',symbol,interval,'— awaiting a confirmed futures setup',flush=True)
            except Exception as exc:
                failures.append((symbol,interval,type(exc).__name__,str(exc)[:160]))
                print('Error',symbol,interval,type(exc).__name__,str(exc)[:160])
    print('Scan completed; sent',signals,'signals; failures',len(failures),flush=True)
    if failures:
        raise RuntimeError('Signal scan failures: '+repr(failures))
if __name__=='__main__':main()
