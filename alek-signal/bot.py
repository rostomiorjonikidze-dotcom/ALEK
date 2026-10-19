import os, json, urllib.request, urllib.parse, datetime, math, pathlib
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'ALEKSignal/1.0'}),timeout=15) as r: return json.load(r)
def market_klines(symbol,interval,limit=200):
    # Public Bybit USDT perpetual market data. Never label it Binance execution data.
    minutes=int(interval.rstrip('m'))
    url='https://api.bybit.com/v5/market/kline?'+urllib.parse.urlencode(dict(category='linear',symbol=symbol,interval=str(minutes),limit=limit))
    payload=get(url)
    if payload.get('retCode')!=0:
        raise RuntimeError('Bybit market data: '+str(payload.get('retMsg','unknown error')))
    raw=payload.get('result',{}).get('list',[])
    if not isinstance(raw,list) or len(raw)<min(limit,50):
        raise RuntimeError('Bybit returned insufficient candle data')
    rows=[]
    for candle in reversed(raw):
        start=int(candle[0])
        # Normalize to Binance-style OHLC row with a calculated closing timestamp.
        rows.append([start,candle[1],candle[2],candle[3],candle[4],candle[5],start+minutes*60000-1])
    if any(int(rows[i][0])>=int(rows[i+1][0]) for i in range(len(rows)-1)):
        raise RuntimeError('Non-monotonic Bybit candle timestamps')
    return rows

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
    rows=market_klines(symbol,interval,200)
    now=int(datetime.datetime.now(datetime.timezone.utc).timestamp()*1000)
    rows=[r for r in rows if int(r[6])<now]
    if len(rows)<100 or now-int(rows[-1][6])>(10*60*1000 if interval=='5m' else 30*60*1000):return None
    close=[float(r[4]) for r in rows];a=ema(close,9);b=ema(close,21);t=ema(close,50);momentum=rsi(close)
    up=a[-2]<=b[-2] and a[-1]>b[-1] and close[-1]>t[-1] and momentum>50
    down=a[-2]>=b[-2] and a[-1]<b[-1] and close[-1]<t[-1] and momentum<50
    if not(up or down):return None
    tr=[]
    for i,r in enumerate(rows):
        high,low=float(r[2]),float(r[3]);prev=float(rows[i-1][4]) if i else float(r[4]);tr.append(max(high-low,abs(high-prev),abs(low-prev)))
    atr=sum(tr[:14])/14
    for v in tr[14:]:atr=(atr*13+v)/14
    direction=1 if up else -1;price=close[-1]
    if not math.isfinite(atr) or atr<=0:return None
    return dict(symbol=symbol,interval=interval,direction='LONG' if up else 'SHORT',entry=price,tp1=price+direction*atr,tp2=price+direction*2*atr,sl=price-direction*1.5*atr,close_time=int(rows[-1][6]))

def send_chart(s, caption, test=False):
    import io, uuid
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle
    rows=market_klines(s['symbol'],s['interval'],80)
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
    direction='⬆️ მოსალოდნელი მიმართულება: ზემოთ' if s['direction']=='LONG' else '⬇️ მოსალოდნელი მიმართულება: ქვემოთ'
    msg=(f"💎 ALEK SIGNAL VIP | Bybit USDT Perpetual\n\n{title} | {s['symbol']} | {s['interval']}\n{direction}\n\n📍 ENTRY: {s['entry']:,.2f}\n🎯 TP1: {s['tp1']:,.2f}\n🎯 TP2: {s['tp2']:,.2f}\n🛑 STOP LOSS: {s['sl']:,.2f}\n⏰ სანთლის დახურვა: {timestamp}\n\n⚠️ ექსპერიმენტული სიგნალი. Entry არის სანთლის დახურვის ფასი და არა გარანტირებული შესვლის ფასი. მოგება გარანტირებული არ არის.")
    return send_chart(s,msg)

def main():
    missing=[key for key in ('BOT_TOKEN','CHAT_ID') if not os.getenv(key)]
    if missing:
        raise RuntimeError('Missing GitHub Actions secrets: '+', '.join(missing))
    print('ALEK Signal scan started',datetime.datetime.now(datetime.timezone.utc).isoformat(),flush=True)
    if os.getenv('TELEGRAM_TEST')=='true':
        rows=market_klines('BTCUSDT','5m',80)
        now=int(datetime.datetime.now(datetime.timezone.utc).timestamp()*1000)
        closed=[r for r in rows if int(r[6])<now]
        if len(closed)<45:raise RuntimeError('Not enough live Bybit candles')
        latest=closed[-1]
        stamp=datetime.datetime.fromtimestamp(int(latest[6])/1000,datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
        sample=dict(symbol='BTCUSDT',interval='5m',direction='MARKET',close_time=int(latest[6]))
        test_msg=f'📊 ALEK SIGNAL VIP — რეალური Bybit Futures გრაფიკის ტესტი\nBTCUSDT | 5m\nბოლო დახურული სანთელი: {float(latest[4]):,.2f} USDT\nდრო: {stamp}\n\n⚠️ ეს არის რეალური ბაზრის მონაცემების ტექნიკური ტესტი, არა LONG/SHORT სავაჭრო სიგნალი.'
        if not send_chart(sample,test_msg,test=True):raise RuntimeError('Telegram rejected real-market chart')
        print('Real Bybit chart test confirmed',flush=True)
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
                    print('No qualified signal',symbol,interval,flush=True)
            except Exception as exc:
                failures.append((symbol,interval,type(exc).__name__,str(exc)[:160]))
                print('Error',symbol,interval,type(exc).__name__,str(exc)[:160])
    print('Scan completed; sent',signals,'signals; failures',len(failures),flush=True)
    if failures:
        raise RuntimeError('Signal scan failures: '+repr(failures))
if __name__=='__main__':main()
