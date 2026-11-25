"""Past prices for tracked listings from Common Crawl.
Usage: python3 cchist.py data.json out.json CRAWL [CRAWL...]
For each crawl it downloads the cluster index, keeps the lines for the tracked stores,
reads the matching cdx blocks, fetches each listing page's archived copy, and reads the price."""
import json,re,sys,os,subprocess,zlib,gzip,html,time,bisect
D='https://data.commoncrawl.org/'
import tempfile
TMP=os.path.join(tempfile.gettempdir(),'cc-index')
os.makedirs(TMP,exist_ok=True)
def curl(args,binary=True):
    for i in range(4):
        r=subprocess.run(['curl','-s','-f','-m','90']+args,capture_output=True)
        if r.returncode==0:return r.stdout
        time.sleep(2+3*i)
    return None
def rng(url,a,b):return curl(['-r',f'{a}-{b}',url])
def surt(u):
    u=re.sub(r'^https?://','',u.strip());host,_,path=u.partition('/')
    host=host.lower().split(':')[0]
    if host.startswith('www.'):host=host[4:]
    path=path.split('#')[0].lower()
    return ','.join(reversed(host.split('.')))+')/'+path
def nokey(k):return k.split('?')[0].rstrip('/')
def ml_of(s):
    m=re.search(r'(\d{2,3})\s*ml',s,re.I);return int(m.group(1)) if m else None
def price_from(page,l):
    ml=l['ml'];host=l['url'].split('/')[2]
    # Shopify product meta
    m=re.search(r'var meta = (\{"product":.*?\});\s*\n',page)
    if m:
        try:
            vs=json.loads(m.group(1))['product']['variants']
            def vml(v):return ml_of((v.get('public_title') or '')+' '+(v.get('name') or ''))
            hit=[v for v in vs if vml(v)==ml]
            if not hit and len(vs)==1:hit=vs
            if not hit and 'bujairami' in host and ml==100:hit=[v for v in vs if vml(v) is None][:1]
            if not hit and 'aerre' in host and ml==50:hit=[v for v in vs if vml(v) is None][:1]
            if hit:return hit[0]['price']/100
        except Exception:pass
    # JSON-LD offers
    for blk in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>',page,re.S):
        try:j=json.loads(html.unescape(blk.strip()))
        except Exception:continue
        items=j if isinstance(j,list) else j.get('@graph',[j]) if isinstance(j,dict) else []
        for it in items:
            if not isinstance(it,dict) or 'Product' not in str(it.get('@type')):continue
            offs=it.get('offers');offs=offs if isinstance(offs,list) else [offs] if offs else []
            cands=[]
            for o in offs:
                if not isinstance(o,dict):continue
                p=o.get('price') or o.get('lowPrice')
                try:p=float(str(p).replace(',',''))
                except Exception:continue
                cands.append((ml_of(str(o.get('name',''))+' '+str(o.get('sku',''))),p,o.get('@type')))
            sized=ml_of(str(it.get('name','')))==ml or ml_of(l['url'])==ml
            hit=[c for c in cands if c[0]==ml] or ([c for c in cands if c[2]!='AggregateOffer'] if len(cands)==1 and sized else [])
            if hit:return hit[0][1]
    # Mecca single price, Harvey Norman offerPrice
    m=re.search(r'"isPriceRange\\?":false,\\?"singlePrice\\?":\{\\?"currentPrice\\?":\\?"\$([\d,.]+)',page)
    if m:return float(m.group(1).replace(',',''))
    m=re.search(r"'offerPrice': \"([\d.]+)\"",page)
    if m:return float(m.group(1))
    m=re.search(r'<meta[^>]+(?:product:price:amount|og:price:amount)[^>]+content="([\d.,]+)"',page)
    if m:return float(m.group(1).replace(',',''))
    return None
def run(data,crawls):
    L=data['listings'];fx=data['meta'].get('fx',{})
    keys={}
    for k,l in L.items():
        if l.get('url') and l.get('price') is not None:keys.setdefault(nokey(surt(l['url'])),[]).append(k)
    hosts=sorted({k.split(')/')[0]+')/' for k in keys})
    found={}
    for coll in crawls:
        f=os.path.join(TMP,coll+'.idx')
        if not os.path.exists(f) or os.path.getsize(f)<1e6:
            b=curl([D+f'cc-index/collections/{coll}/indexes/cluster.idx'])
            if not b:print('no index',coll,flush=True);continue
            open(f,'wb').write(b)
        lines=open(f,encoding='utf-8',errors='ignore').read().split('\n')
        os.remove(f)
        ks=[x.split(' ')[0] for x in lines]
        blocks=set()
        for h in hosts:
            i=max(0,bisect.bisect_left(ks,h)-1);j=bisect.bisect_left(ks,h[:-1]+'*')
            for x in lines[i:j+1]:
                p=x.split('\t')
                if len(p)>=4:blocks.add((p[1],int(p[2]),int(p[3])))
        caps={}
        for fn,off,ln in sorted(blocks):
            raw=rng(D+f'cc-index/collections/{coll}/indexes/{fn}',off,off+ln-1)
            if not raw:continue
            for row in zlib.decompress(raw,16+zlib.MAX_WBITS).decode(errors='ignore').split('\n'):
                if not row:continue
                k,ts,js=row.split(' ',2);nk=nokey(k)
                if nk in keys:
                    r=json.loads(js)
                    if r.get('status')=='200' and r.get('mime','').startswith('text/html'):
                        old=caps.get(nk)
                        if not old or ('?' in old[1]['url'] and '?' not in r['url']):caps[nk]=(ts,r)
        print(coll,'blocks',len(blocks),'captures',len(caps),flush=True)
        for nk,(ts,r) in caps.items():
            raw=rng(D+r['filename'],int(r['offset']),int(r['offset'])+int(r['length'])-1)
            if not raw:continue
            try:page=gzip.decompress(raw).split(b'\r\n\r\n',2)[2].decode(errors='ignore')
            except Exception:continue
            d=f'{ts[:4]}-{ts[4:6]}-{ts[6:8]}'
            for lk in keys[nk]:
                l=L[lk];p=price_from(page,l)
                if p is None or p<=0:continue
                if not (l['price']/2<=p<=l['price']*2):continue
                rate=1 if l.get('cur','AUD')=='AUD' else fx.get(l['cur'])
                if not rate:continue
                found.setdefault(lk,{})[d]=round(p*rate,2)
        print(coll,'listings with a past price so far',len(found),flush=True)
    return found
if __name__=='__main__':
    data=json.load(open(sys.argv[1]));out=run(data,sys.argv[3:])
    json.dump(out,open(sys.argv[2],'w'),indent=0)
    print('done',len(out),sum(len(v) for v in out.values()))
