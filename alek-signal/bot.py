import os, json, urllib.request, urllib.parse, datetime, math
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'ALEKSignal/1.0'}),timeout=15) as r: return json.load(r)
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
    rows=get('https://fapi.binance.com/fapi/v1/klines?'+urllib.parse.urlencode(dict(symbol=symbol,interval=interval,limit=200)))
    now=int(datetime.datetime.now(datetime.timezone.utc).timestamp()*1000)
    rows=[r for r in rows if int(r[6])<now]
    if len(rows)<100 or now-int(rows[-1][6])>90000:return None
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
def send(s):
    title='🟢 LONG' if s['direction']=='LONG' else '🔴 SHORT'
    msg=(f"💎 ALEK SIGNAL VIP\n\n{title} | {s['symbol']} | {s['interval']}\n\n📍 ENTRY: {s['entry']:,.2f}\n🎯 TP1: {s['tp1']:,.2f}\n🎯 TP2: {s['tp2']:,.2f}\n🛑 STOP LOSS: {s['sl']:,.2f}\n\n⚠️ ექსპერიმენტული სიგნალი. მოგება გარანტირებული არ არის.")
    payload=json.dumps(dict(chat_id=os.environ['CHAT_ID'],text=msg)).encode()
    req=urllib.request.Request('https://api.telegram.org/bot'+os.environ['BOT_TOKEN']+'/sendMessage',data=payload,headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=20) as r:return json.load(r)['ok']
def main():
    for symbol in ('BTCUSDT','ETHUSDT'):
        for interval in ('5m','15m'):
            try:
                s=candidate(symbol,interval)
                if s:
                    print('Sending',symbol,interval,s['close_time']);send(s)
            except Exception as exc:print('Error',symbol,interval,type(exc).__name__)
if __name__=='__main__':main()
