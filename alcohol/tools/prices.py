#!/usr/bin/env python3
"""Melbourne liquor price checker.

Reads prices from stores whose robots.txt allows it and whose pages carry the price
without running JavaScript:
  coles        Coles (liquor supplied by Liquorland)   search page data
  bottlestop   Bottle-Stop (Boozebud)                  Shopify product JSON
  bhs          Blackhearts & Sparrows (Melbourne)      product page schema.org data
  thirsty      Thirsty Camel                           product page schema.org data
  purvis       Purvis Beer (Richmond)                  Shopify product JSON
  boccaccio    Boccaccio Cellars (Balwyn)              Shopify product JSON
  liquorloot   Liquor Loot (online)                    Shopify product JSON
  ourcellar    OurCellar (online)                      product page schema.org data
Dan Murphy's and BWS allow bots but only show prices after JavaScript runs, so their prices
come from search snapshots added by the daily check (via "snapshot"), or are typed in by hand.
Liquorland, First Choice and Vintage Cellars allow AI agents in robots.txt but sit behind bot protection,
so they are not read (prices are typed in by hand). Blackhearts & Sparrows blocks AI *training* crawlers
(ClaudeBot) and allows reference use, which is what this checker does.

Usage:
  prices.py find  DATA.json   add listings for products/sizes that have none (searches stores)
  prices.py check DATA.json   re-read every page listing and append today's price to its history
  prices.py sync  DATA.json   copy new drinks (and search words) from seed.py into data.json
"""
import json, os, re, sys, time, unicodedata, urllib.parse, urllib.request, datetime, gzip
from zoneinfo import ZoneInfo

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
TODAY = datetime.datetime.now(ZoneInfo("Australia/Melbourne")).date().isoformat()
PAUSE = 0.6
_cache = {}


def get(url, tries=2):
    if url in _cache:
        return _cache[url]
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-AU,en;q=0.9", "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=30) as r:
                b = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    b = gzip.decompress(b)
                t = b.decode("utf-8", "replace")
                _cache[url] = t
                time.sleep(PAUSE)
                return t
        except Exception as e:  # noqa
            last = e
            time.sleep(1.5)
    raise last


def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    s = s.replace("’", "").replace("'", "").replace("&", " ")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9.%]+", " ", s)).strip()


def key_of(n, ml):
    if n and n > 1:
        return f"{n}x{int(ml)}ml"
    return "1L" if ml == 1000 else f"{int(ml)}ml"


def parse_size(text):
    t = norm(text).replace("litre", "l").replace("liter", "l")
    m = re.search(r"\b(\d{1,2})\s*x\s*(\d{3})\s*ml\b", t)
    if m:
        return key_of(int(m.group(1)), int(m.group(2)))
    ml = None
    m = re.search(r"\b(\d{2,4})\s*ml\b", t)
    if m:
        ml = int(m.group(1))
    else:
        m = re.search(r"\b(\d(?:\.\d+)?)\s*l\b", t)
        if m:
            ml = int(round(float(m.group(1)) * 1000))
    m = re.search(r"\b(\d{1,2})\s*(?:pack|pk|block|case|cans|bottles|stubbies)\b", t) or re.search(r"\b(?:case|pack|carton) of (\d{1,2})\b", t)
    n = int(m.group(1)) if m else 1
    if ml is None:
        return None
    return key_of(n, ml)


GLOBAL_AVOID = ["limited", "edition", "vap", "gift", "tumbler", "glasses", "glass pack", "hamper", "bundle", "mixed", "giftbox", "with glass", "mini", "miniature", "sample", "keg", "cask"]


GENERIC = set("ml l litre can cans bottle bottles stubby stubbies pack pk case block each nv the and of with original classic premium".split())


def extra_words(p, title):
    """How many words in a store's title aren't part of the drink's own name: fewer means a closer match."""
    allowed = set(norm(" ".join([p["name"], p["brand"], p.get("type", ""), p.get("q", "")])).split()) | GENERIC
    return len([w for w in norm(title).split() if w not in allowed and not re.search(r"\d", w)])


def matches(p, title):
    t = " " + norm(title) + " "
    for w in p["must"]:  # each required word must start a word in the title ("rose" isn't in "prosecco")
        if not re.search(r"(?<![a-z0-9])" + re.escape(norm(w)), t):
            return False
    for w in p.get("avoid", []) + GLOBAL_AVOID:
        w = norm(w)
        if re.search(r"(?<![a-z0-9])" + re.escape(w) + r"(?![a-z0-9])", t):
            return False
    return True


def ld_offer(html):
    """name, description, price, availability from schema.org Product data."""
    for m in re.findall(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', html, re.S):
        try:
            d = json.loads(m)
        except Exception:
            continue
        stack = d if isinstance(d, list) else [d]
        while stack:
            x = stack.pop()
            if isinstance(x, list):
                stack += x
                continue
            if not isinstance(x, dict):
                continue
            if "@graph" in x:
                stack += x["@graph"]
            if x.get("@type") == "Product":
                off = x.get("offers")
                if isinstance(off, dict):
                    off = [off]
                for o in off or []:
                    pr = o.get("price") or o.get("lowPrice")
                    if pr is None:
                        continue
                    av = str(o.get("availability", ""))
                    st = "out" if "OutOfStock" in av else "in" if "InStock" in av else "unknown"
                    return dict(name=x.get("name", ""), desc=re.sub("<[^>]+>", " ", x.get("description") or ""), price=float(pr), stock=st)
    return None


# ---------------------------------------------------------------- Coles
def coles_search(q):
    url = "https://www.coles.com.au/search/products?q=" + urllib.parse.quote(q)
    for i in range(3):
        h = get(url)
        m = re.search(r'id="__NEXT_DATA__"[^>]*>(.*?)</script>', h, re.S)
        if m:
            break
        _cache.pop(url, None)
        time.sleep(10 * (i + 1))
    else:
        raise RuntimeError("Coles search page had no product data")
    res = (json.loads(m.group(1))["props"]["pageProps"].get("searchResults") or {}).get("results") or []
    out = []
    for r in res:
        if r.get("_type") != "PRODUCT" or not (r.get("pricing") or {}).get("now"):
            continue
        if (r.get("merchandiseHeir") or {}).get("tradeProfitCentre") != "LIQUOR":
            continue
        title = f"{r.get('brand','')} {r.get('name','')} {r.get('size','')}"
        slug = re.sub(r"[^a-z0-9]+", "-", f"{r.get('brand','')} {r.get('name','')}".lower()).strip("-")
        out.append(dict(title=title, size=parse_size(title), price=float(r["pricing"]["now"]), was=r["pricing"].get("was") or None,
                        url=f"https://www.coles.com.au/product/{slug}-{r['id']}", key=str(r["id"]), stock="unknown"))
    return out


def coles_check(l, p):
    for r in coles_search(p["q"]) + coles_search(p["brand"] + " " + p["name"]):
        if r["key"] == l.get("key"):
            return r
    return None


# ---------------------------------------------------------------- Shopify stores
SHOPIFY = {
    "bottlestop": "https://bottle-stop.com.au",      # Bottle-Stop (Boozebud), Melbourne stores
    "purvis": "https://www.purvisbeer.com.au",        # Purvis Beer, Richmond
    "boccaccio": "https://www.boccaccio.com.au",      # Boccaccio Cellars, Balwyn
    "liquorloot": "https://liquorloot.com",           # Liquor Loot, online
}


def _bs_variants(prod):
    """One entry per online variant. Bottle-Stop names store-only variants "... - <suburb>" and gives
    pack sizes as "Pack (6)" / "Case (24)"; other stores usually have one "Default Title" variant."""
    base = parse_size(prod["title"])
    m = re.search(r"(\d+)ml$", base or "")
    ml = int(m.group(1)) if m else (1000 if base == "1L" else None)
    out = []
    for v in prod["variants"]:
        if " - " in v["title"] or ml is None:
            continue
        n = re.search(r"\((\d+)\)", v["title"]) or re.search(r"\b(\d{1,2})\s*(?:pack|pk|case|block)\b", v["title"], re.I)
        size = key_of(int(n.group(1)), ml) if n else base
        st = "unknown" if "available" not in v else ("in" if v["available"] else "out")
        out.append(dict(variant=v["title"], size=size, price=float(v["price"]), stock=st))
    return out


_shop_sm = {}


def shopify_sitemap(rid):
    """Product URLs from a Shopify store's sitemap (its own search box can miss products)."""
    if rid not in _shop_sm:
        base, locs = SHOPIFY[rid], []
        try:
            for sm in re.findall(r"<loc>\s*([^<\s]+)", get(base + "/sitemap.xml")):
                if "sitemap_products" in sm:
                    locs += [u for u in re.findall(r"<loc>\s*([^<\s]+)", get(sm.replace("&amp;", "&"))) if "/products/" in u]
        except Exception:
            pass
        _shop_sm[rid] = locs
    return _shop_sm[rid]


def shopify_search(rid, p):
    base = SHOPIFY[rid]
    t = get(base + "/search/suggest.json?" + urllib.parse.urlencode({"q": p["q"], "resources[type]": "product", "resources[limit]": 10}))
    urls = [base + r["url"].split("?")[0] for r in json.loads(t)["resources"]["results"].get("products", []) if matches(p, r["title"])]
    words = [norm(w).replace(" ", "") for w in p["must"]]
    for u in shopify_sitemap(rid):
        slug = norm(urllib.parse.unquote(u.rsplit("/", 1)[-1]).replace("-", " ")).replace(" ", "")
        if all(w in slug for w in words) and u not in urls:
            urls.append(u)
    out = []
    for url in urls[:12]:
        try:
            prod = json.loads(get(url + ".json"))["product"]
        except Exception:
            continue
        if not matches(p, prod["title"]):
            continue
        for v in _bs_variants(prod):
            out.append(dict(title=prod["title"], url=url, **v))
    return out


def shopify_check(l, p):
    prod = json.loads(get(l["url"] + ".json"))["product"]
    for v in _bs_variants(prod):
        if v["size"] == l["size"] and (not l.get("variant") or v["variant"] == l["variant"]):
            return dict(title=prod["title"], price=v["price"], stock=v["stock"])
    return None


# ---------------------------------------------------------------- sitemap stores
_sm = {}


def sitemap(rid):
    if rid not in _sm:
        if rid == "ourcellar":
            _sm[rid] = re.findall(r"<loc>\s*([^<\s]+)", get("https://www.ourcellar.com.au/content/sitemap_products.xml"))
        else:
            url = {"bhs": "https://www.blackheartsandsparrows.com.au/products/sitemap.xml", "thirsty": "https://www.thirstycamel.com.au/api/sitemap-products.xml"}[rid]
            _sm[rid] = re.findall(r"<loc>([^<]+)</loc>", get(url))
    return _sm[rid]


def page_read(url):
    o = ld_offer(get(url))
    if not o:
        return None
    title = o["name"]
    size = parse_size(title)
    if not size:
        size = parse_size(title + " " + o["desc"]) or parse_size(url.rsplit("/", 2)[-2].replace("-", " "))
    if not size and url.rstrip("/").split("/")[-2].endswith("-single"):
        size = "750ml"
    return dict(title=title, size=size, price=o["price"], url=url, stock=o["stock"])


def sitemap_search(rid, p):
    words = [norm(w) for w in p["must"]]
    out = []
    for u in sitemap(rid):
        slug = norm(urllib.parse.unquote(u).replace("-", " "))
        if "/bundle/" not in u and all(w.replace(" ", "") in slug.replace(" ", "") for w in words):
            out.append(u)
    res = []
    for u in out[:12]:
        try:
            r = page_read(u)
        except Exception:
            r = None
        if r:
            res.append(r)
    return res


STORES = {
    "coles": dict(search=lambda p: coles_search(p["q"]), check=coles_check),
    **{rid: dict(search=lambda p, rid=rid: shopify_search(rid, p), check=shopify_check) for rid in SHOPIFY},
    "bhs": dict(search=lambda p: sitemap_search("bhs", p), check=lambda l, p: page_read(l["url"])),
    "thirsty": dict(search=lambda p: sitemap_search("thirsty", p), check=lambda l, p: page_read(l["url"])),
    "ourcellar": dict(search=lambda p: sitemap_search("ourcellar", p), check=lambda l, p: page_read(l["url"])),
}


def add_hist(l, price):
    h = [x for x in l.get("hist", []) if x.get("d") != TODAY]
    h.append({"d": TODAY, "a": round(price, 2)})
    l["hist"] = h[-400:]


def find(data, only=None):
    added = 0
    for p in data["products"].values():
        if only and p["id"] not in only:
            continue
        for rid, st in STORES.items():
            if os.environ.get("ONLY_STORES") and rid not in os.environ["ONLY_STORES"].split(","):
                continue
            have = {l["size"] for l in data["listings"].values() if l["pid"] == p["id"] and l["rid"] == rid}
            if set(p["sizes"]) <= have:
                continue
            try:
                res = st["search"](p)
            except Exception as e:
                print("  !", rid, p["id"], e, file=sys.stderr)
                continue
            for r in sorted(res, key=lambda r: (extra_words(p, r["title"]), len(r["title"]))):
                if r["size"] in p["sizes"] and r["size"] not in have and matches(p, r["title"]):
                    lid = f"{p['id']}-{rid}-{r['size'].lower()}"
                    l = dict(pid=p["id"], rid=rid, size=r["size"], url=r["url"], cur="AUD", price=r["price"], aud=r["price"],
                             stock=r.get("stock", "unknown"), checked=TODAY, via="page", title=r["title"], hist=[])
                    for f in ("key", "variant"):
                        if r.get(f):
                            l[f] = r[f]
                    if r.get("was"):
                        l["was"] = float(r["was"])
                    add_hist(l, r["price"])
                    data["listings"][lid] = l
                    have.add(r["size"])
                    added += 1
                    print(f"  + {lid}: {r['title']!r} ${r['price']}")
    return added


def check(data):
    ok = bad = 0
    for lid, l in data["listings"].items():
        st = STORES.get(l["rid"])
        if not st or l.get("via") == "manual":
            continue
        p = data["products"].get(l["pid"])
        try:
            r = st["check"](l, p)
        except Exception as e:
            r = None
            print("  !", lid, e, file=sys.stderr)
        if r and r.get("price"):
            l.update(price=r["price"], aud=r["price"], checked=TODAY, via="page")
            if r.get("stock"):
                l["stock"] = r["stock"]
            if r.get("was"):
                l["was"] = float(r["was"])
            else:
                l.pop("was", None)
            l.pop("note", None)
            add_hist(l, r["price"])
            ok += 1
        else:
            d = datetime.date.fromisoformat(TODAY)
            l["note"] = f"Couldn't read the price on {d.day} {d.strftime('%b')}"
            bad += 1
    return ok, bad


if __name__ == "__main__":
    cmd, path = sys.argv[1], sys.argv[2]
    data = json.load(open(path))
    if cmd == "find":
        n = find(data, set(sys.argv[3:]) or None)
        print(f"added {n} listings")
    elif cmd == "sync":
        import os
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from seed import P
        for i, p in enumerate(P):
            q = data["products"].setdefault(p["id"], dict(p, order=i, fav=False, target=None))
            for k in ("q", "must", "avoid", "sizes", "main", "abv"):
                q[k] = p[k]
        print(f"{len(data['products'])} drinks")
    elif cmd == "check":
        ok, bad = check(data)
        print(f"checked {ok} prices, {bad} couldn't be read")
    json.dump(data, open(path, "w"), ensure_ascii=False, separators=(",", ":"))
