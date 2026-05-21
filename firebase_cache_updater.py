#!/usr/bin/env python3
"""
UM Vale - Firebase Cache Updater
Mantém o cache do Firebase sempre atualizado para o app abrir instantâneo.
Agende no cron (a cada 10-15min) ou rode manualmente.

Instalação:
  pip install firebase-admin requests

  Baixe a service account key em:
    Firebase Console > Configurações > Contas de serviço > Gerar nova chave privada
  Salve como .secrets/serviceAccountKey.json ou defina UMVALE_SERVICE_ACCOUNT.
"""

import json
import os
import time
import re
from datetime import datetime
from xml.etree import ElementTree
from email.utils import parsedate_to_datetime

import requests
import firebase_admin
from firebase_admin import credentials, db

FIREBASE_DB_URL = "https://umvale-default-rtdb.firebaseio.com"
CACHE_BASE = "/cache"

RIVER_URL = lambda: f"https://www.copel.com/mhbweb/paginas/previsao.jsf?t={int(time.time() * 1000)}"
NEWS_TAGS = [
    "", "radar-iguacu", "esportes", "valeplural", "oportunidades", "guiavale",
    "policial", "cultura", "politica", "educacao"
]
UMVALE_PORTAL = "https://umvale.wordpress.com"
WEATHER_LAT = -26.2311
WEATHER_LON = -51.0869

SERVICE_ACCOUNT_PATHS = [
    os.environ.get("UMVALE_SERVICE_ACCOUNT"),
    os.path.join(os.path.dirname(__file__), ".secrets", "serviceAccountKey.json"),
    os.path.expanduser("~/.umvale/serviceAccountKey.json")
]


def init_firebase():
    service_account_path = get_service_account_path()
    if service_account_path:
        cred = credentials.Certificate(service_account_path)
        firebase_admin.initialize_app(cred, {"databaseURL": FIREBASE_DB_URL})
        print("[firebase] Admin SDK inicializado")
    else:
        print("[firebase] ERRO: service account não encontrada")
        print("        Baixe em: Firebase Console > Configurações > Contas de serviço")
        print("        Salve como .secrets/serviceAccountKey.json ou defina UMVALE_SERVICE_ACCOUNT")
        exit(1)


def get_service_account_path():
    for path in SERVICE_ACCOUNT_PATHS:
        if path and os.path.isfile(path):
            return path
    return None


def fb_put(path, data):
    ref = db.reference(path)
    ref.set(data)


def fetch_river():
    try:
        r = requests.get(RIVER_URL(), timeout=15, headers={
            "User-Agent": "Mozilla/5.0 (compatible; UMValeCache/1.0)"
        })
        text = r.text
        if not text or len(text) < 100:
            raise ValueError("resposta vazia")

        clean = text.replace("<br>", "\n").replace("<br/>", "\n")
        clean = re.sub(r'<script[^>]*>.*?</script>', '', clean, flags=re.DOTALL)
        clean = re.sub(r'<style[^>]*>.*?</style>', '', clean, flags=re.DOTALL)
        clean = re.sub(r'<[^>]+>', ' ', clean)
        clean = clean.replace('&nbsp;', ' ').replace('\xa0', ' ')
        clean = re.sub(r'\s+', ' ', clean).strip()

        import time, datetime
        now_ts = int(time.time() * 1000)

        # Padrão robusto para "Último valor considerado" com Régua + Nível + Vazão
        main_value = None
        pat = r'[U\u00da]ltimo\s*[Vv]alor\s*[Cc]onsiderado:?\s*(\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2})\s+Leitura\s+da\s+r\u00e9gua\s+\(m\)\s+N\u00edvel\s+de\s+\u00e1gua\s+\(m\)\s+Vaz\u00e3o\s+\(m\u00b3/s\)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)'
        m = re.search(pat, clean)
        if m:
            dt_str, reg_str, niv_str, vaz_str = m.groups()
            try:
                dt_obj = datetime.datetime.strptime(dt_str, "%d/%m/%Y %H:%M")
                ts = int(dt_obj.timestamp() * 1000)
            except Exception:
                ts = now_ts
            
            # Rejeitar data futura
            if ts > now_ts + 300000:
                print(f"[river] Data futura ignorada: {dt_str}")
                main_value = None
            else:
                main_value = {
                    "value": f"{reg_str}m",
                    "time": f"Copel \u2022 {dt_str}",
                    "source": "copel-cota",
                    "waterLevel": f"{niv_str}m",
                    "flow": f"{vaz_str} m\u00b3/s",
                    "ts": ts
                }

        # Fallback: regex simples do "Último valor considerado" (sem as colunas)
        if not main_value:
            last_match = re.search(r'[U\u00da]ltimo\s*[Vv]alor\s*[Cc]onsiderado:?\s*(\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}).*?([\d]+[,.]\d+)', clean)
            if last_match:
                dt_str, reg = last_match.groups()
                try:
                    dt_obj = datetime.datetime.strptime(dt_str, "%d/%m/%Y %H:%M")
                    ts = int(dt_obj.timestamp() * 1000)
                except Exception:
                    ts = now_ts
                if ts <= now_ts + 300000:  # Nunca aceitar data futura
                    main_value = {
                        "value": f"{reg}m",
                        "time": f"Copel \u2022 {dt_str}",
                        "source": "copel-cota",
                    }

        if main_value:
            return main_value

        print("[river] Nenhum padr\u00e3o v\u00e1lido encontrado (datas futuras ignoradas)")
        return None
    except Exception as e:
        print(f"[river] erro: {e}")
        return None

def fetch_weather():
    try:
        url = (
            f"https://api.open-meteo.com/v1/forecast"
            f"?latitude={WEATHER_LAT}&longitude={WEATHER_LON}"
            f"&current=temperature_2m,weather_code,wind_speed_10m"
            f"&hourly=temperature_2m,weather_code"
            f"&daily=temperature_2m_max,temperature_2m_min,weather_code"
            f"&forecast_days=3&timezone=America/Sao_Paulo"
            f"&models=ecmwf_ifs"
        )
        r = requests.get(url, timeout=10)
        data = r.json()
        return {"current": data["current"], "daily": data.get("daily"), "_source": "ECMWF"}
    except Exception as e:
        print(f"[weather] erro: {e}")
        return None


def parse_rss(url):
    try:
        r = requests.get(url, timeout=10, headers={
            "User-Agent": "Mozilla/5.0 (compatible; UMValeCache/1.0)"
        })
        root = ElementTree.fromstring(r.content)
        channel = root.find("channel") or root
        items = []
        for item in channel.findall(".//item"):
            title = item.findtext("title", "").strip()
            link = item.findtext("link", "").strip()
            pub_text = item.findtext("pubDate", "")
            pub = 0
            if pub_text:
                try:
                    pub = int(parsedate_to_datetime(pub_text).timestamp() * 1000)
                except Exception:
                    pass
            ns = {"content": "http://purl.org/rss/1.0/modules/content/"}
            content_encoded = item.findtext("content:encoded", "", ns)
            desc = item.findtext("description", "")
            content_html = content_encoded or desc or ""
            img_match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', content_html)
            image = img_match.group(1) if img_match else ""
            cats = [c.text for c in item.findall("category") if c.text]
            items.append({
                "title": title, "link": link, "pub": pub,
                "image": image, "categories": cats, "contentHtml": content_html[:500]
            })
        return items
    except Exception as e:
        print(f"[rss] erro {url}: {e}")
        return []


def fetch_news():
    all_items = []
    seen = set()
    for tag in NEWS_TAGS:
        feed_url = f"{UMVALE_PORTAL}/feed/" if not tag else f"{UMVALE_PORTAL}/tag/{tag}/feed/"
        items = parse_rss(feed_url)
        for item in items:
            key = (item["link"] or item["title"]).strip().rstrip("/")
            if key in seen:
                continue
            seen.add(key)
            all_items.append({**item, "label": tag})
    all_items.sort(key=lambda x: x.get("pub", 0), reverse=True)
    return all_items[:100]


def unfold_ics(text):
    # Unfold wrapped lines in iCalendar format
    return re.sub(r'\r?\n[ \t]', '', text)


def fetch_events():
    ics_url = "https://calendar.google.com/calendar/ical/umvalenews%40gmail.com/private-eee641ec0ceb07e720225f41edb52d91/basic.ics"
    try:
        r = requests.get(ics_url, timeout=12)
        r.encoding = 'utf-8' # Force utf-8 parsing
        text = unfold_ics(r.text)
        
        events = []
        for block in re.finditer(r"BEGIN:VEVENT(.*?)END:VEVENT", text, re.DOTALL):
            vevent_text = block.group(1)

            def extract_property(prop_key):
                # Matches key followed by semicolon or colon, capturing up to the end of line
                m = re.search(rf"^{prop_key}[;:][^\r\n]*", vevent_text, re.MULTILINE)
                if not m:
                    return ""
                line = m.group(0)
                parts = line.split(":", 1)
                if len(parts) < 2:
                    return ""
                val = parts[1].strip()
                # Unescape ical standard characters
                val = val.replace("\\,", ",").replace("\\;", ";").replace("\\n", "\n").replace("\\\\", "\\")
                return val

            summary = extract_property("SUMMARY")
            if not summary:
                continue

            dtstart = extract_property("DTSTART")
            dtend = extract_property("DTEND")
            location = extract_property("LOCATION") or "Vale do Iguaçu"
            desc = extract_property("DESCRIPTION")

            def clean_dt(d):
                if not d:
                    return ""
                d = d.strip()
                # Match YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
                m = re.match(r'^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$', d)
                if m:
                    g = m.groups()
                    tz_suffix = "Z" if g[6] else ""
                    return f"{g[0]}-{g[1]}-{g[2]}T{g[3]}:{g[4]}:{g[5]}{tz_suffix}"
                # Match YYYYMMDD (all day date)
                m = re.match(r'^(\d{4})(\d{2})(\d{2})$', d)
                if m:
                    g = m.groups()
                    return f"{g[0]}-{g[1]}-{g[2]}"
                return d

            start_str = clean_dt(dtstart)
            end_str = clean_dt(dtend) if dtend else ""
            is_all_day = 'T' not in start_str

            events.append({
                "title": summary,
                "start": start_str,
                "end": end_str,
                "allDay": is_all_day,
                "location": location,
                "description": desc[:200],
                "source": "calendar-cache"
            })
        return events
    except Exception as e:
        print(f"[events] erro: {e}")
        return []


# ─── GAME DATA ──────────────────────────────────────────
GAME_WORDS = [
    ["VALE","LAGO","RIOS"], ["PONTE","PINHO","GEMEA"], ["IGUAÇU","TRILHO","BARRO"],
    ["SERRA","MATO","FLOR"], ["CHUVA","NEVOA","VENTO"], ["MONGE","BENZE","MATE"],
    ["CASCO","TRIL","VAGAO"], ["APITO","ESTRI","BITU"], ["LARAN","CACHA","MELAO"],
    ["BANDE","BARRO","AREIA"], ["PONTE","PEDRA","RIO"], ["MORRO","VALE","LAGO"]
]

GAME_QUIZ = [
    {"q":"Qual rio une as Gêmeas?", "o":["Iguaçu","Paraná","Negro"], "a":0},
    {"q":"Ano do acordo de limites?", "o":["1912","1916","1920"], "a":1},
    {"q":"O monge lendário foi...", "o":["João Maria","Padre Cícero","Zé Maria"], "a":0},
    {"q":"Maior ponte da região?", "o":["Ponte Affonso Camargo","Pe. P Veloso","P. dos Arcos"], "a":0},
    {"q":"Bituruna é conhecida por?", "o":["Carvão","Pinheiro","Vinho"], "a":2},
    {"q":"Bairro mais populoso?", "o":["São Bernardo","Navegantes","Rio D'Areia"], "a":0},
    {"q":"Qual cidade não é gêmea?", "o":["Cruz Machado","Porto União","União da Vitória"], "a":0},
    {"q":"Altitude média de UVA?", "o":["750m","850m","950m"], "a":0},
    {"q":"Principal festival local?", "o":["ExpoUnião","Festa do Pinhão","Oktoberfest"], "a":1},
    {"q":"Ano de fundação de UVA?", "o":["1857","1890","1910"], "a":1},
]

GAME_SOLETRA = [
    {"c":"A","o":["G","U","I","L","O","R"],"t":"AGUA"},
    {"c":"V","o":["A","L","E","P","O","R"],"t":"VALE"},
    {"c":"I","o":["G","U","A","Ç","U","R"],"t":"IGUAÇU"},
    {"c":"P","o":["O","N","T","E","S","R"],"t":"PONTE"},
    {"c":"M","o":["O","R","R","O","N","T"],"t":"MORRO"},
    {"c":"S","o":["E","R","R","A","L","V"],"t":"SERRA"},
    {"c":"C","o":["H","U","V","A","N","T"],"t":"CHUVA"},
    {"c":"F","o":["L","O","R","E","S","T"],"t":"FLOR"},
    {"c":"B","o":["E","N","Z","E","D","R"],"t":"BENZE"},
    {"c":"R","o":["I","B","E","I","R","O"],"t":"RIBEIRO"},
]

GAME_TIMELINE = [
    {"t":"Ferrovia","y":1906},{"t":"Contestado","y":1912},{"t":"Porto União","y":1917},
    {"t":"Fundação UVA","y":1890},{"t":"Ponte Affonso","y":1948},{"t":"Casa da Memória","y":1998},
    {"t":"Fim da Guerra","y":1916},{"t":"Estação Ferroviária","y":1904},{"t":"1º Jornal","y":1910},
    {"t":"Energia Elétrica","y":1922},{"t":"Asfalto BR","y":1960},{"t":"Campus UVA","y":1972},
]


def generate_game_data():
    today = datetime.now().strftime("%Y-%m-%d")
    day_of_year = datetime.now().timetuple().tm_yday

    def pick(pool, count=3):
        return [pool[(day_of_year + i) % len(pool)] for i in range(count)]

    return {
        "palavra": pick(GAME_WORDS),
        "quiz": pick(GAME_QUIZ),
        "soletra": pick(GAME_SOLETRA),
        "timeline": pick(GAME_TIMELINE),
        "updatedAt": today
    }


# ─── SPORTS DATA ────────────────────────────────────────
def fetch_sports():
    """Retorna dados de futebol com base no dia do ano (determinístico).
    No futuro, integrar com API football-data.org ou similar."""
    day_of_year = datetime.now().timetuple().tm_yday

    def rotate(lst, n=3):
        return [(day_of_year * 7 + i * 11) % len(lst) for i in range(n)]

    BRASILEIRAO_TEAMS = [
        "Botafogo", "Palmeiras", "Flamengo", "Fortaleza", "Internacional",
        "São Paulo", "Corinthians", "Bahia", "Cruzeiro", "Vasco",
        "Grêmio", "Santos", "Sport", "Mirassol", "Red Bull Bragantino",
        "Vitória", "Athletico-PR", "Cuiabá", "Atlético-GO", "Juventude"
    ]
    PARANAENSE_TEAMS = [
        "Athletico-PR", "Operário", "Maringá", "Londrina", "Coritiba",
        "São Joseense", "Rio Branco", "Cascavel", "Azuriz", "Andraus",
        "Galático", "PSTC"
    ]
    CATARINENSE_TEAMS = [
        "Avaí", "Criciúma", "Chapecoense", "Brusque", "Figueirense",
        "Joinville", "Hercílio Luz", "Concórdia", "Barra", "Caravaggio",
        "Marcílio Dias", "Santa Catarina"
    ]

    def gen_standings(teams, n_top=20):
        shuffled = rotate(teams, len(teams))
        out = []
        for i, idx in enumerate(shuffled):
            pts = (len(teams) - i) * 3 + (day_of_year % 5)
            w = (len(teams) - i) * 2
            d = len(teams) - i
            l = i
            gp = w + d + l
            wins_seq = ["W"] * min(3, 5)
            draws_seq = ["D"] * min(1, 5 - len(wins_seq))
            losses_seq = ["L"] * min(1, 5 - len(wins_seq) - len(draws_seq))
            last5 = (wins_seq + draws_seq + losses_seq)[:5]
            pos = i + 1
            out.append({
                "pos": pos,
                "name": teams[idx],
                "pts": pts,
                "gp": gp,
                "w": w,
                "d": d,
                "l": l,
                "last5": last5
            })
        return out

    return [
        {"league": "brasileirao", "teams": gen_standings(BRASILEIRAO_TEAMS)},
        {"league": "paranaense", "teams": gen_standings(PARANAENSE_TEAMS)},
        {"league": "catarinense", "teams": gen_standings(CATARINENSE_TEAMS)}
    ]

# ────────────────────────────────────────────────────────

def main():
    print(f"[{datetime.now().isoformat()}] Iniciando atualização do cache Firebase...")
    init_firebase()

    # [river] DESABILITADO — gerenciado exclusivamente pelo rio_scraper.py (vvale.com.br)
    # com histórico horário. Não alterar aqui para não sobrescrever o histórico acumulado.
    # river = fetch_river()


    weather = fetch_weather()
    if weather:
        fb_put(f"{CACHE_BASE}/weather/data", weather)
        fb_put(f"{CACHE_BASE}/weather/updatedAt", int(time.time() * 1000))
        print(f"  [weather] {weather['current'].get('temperature_2m')}°C")

    news = fetch_news()
    if news:
        fb_put(f"{CACHE_BASE}/news/data", news)
        fb_put(f"{CACHE_BASE}/news/updatedAt", int(time.time() * 1000))
        print(f"  [news] {len(news)} itens")

    events = fetch_events()
    if events:
        fb_put(f"{CACHE_BASE}/events/data", events)
        fb_put(f"{CACHE_BASE}/events/updatedAt", int(time.time() * 1000))
        print(f"  [events] {len(events)} eventos")

    game_data = generate_game_data()
    fb_put("/games", game_data)
    print(f"  [games] {len(game_data['palavra'])} palavras, {len(game_data['quiz'])} quizzes, {len(game_data['soletra'])} soletras, {len(game_data['timeline'])} timelines")

    sports = fetch_sports()
    if sports:
        fb_put(f"{CACHE_BASE}/sports/data", sports)
        fb_put(f"{CACHE_BASE}/sports/updatedAt", int(time.time() * 1000))
        print(f"  [sports] {len(sports)} ligas geradas")

    app_cache = {
        "river": {},  # gerenciado pelo rio_scraper.py — não sobrescrever aqui
        "weather": weather or {},
        "news": news or [],
        "events": events or [],
        "sports": sports or []
    }
    fb_put(f"{CACHE_BASE}/app/data", app_cache)
    fb_put(f"{CACHE_BASE}/app/updatedAt", int(time.time() * 1000))
    print(f"  [app] cache completo salvo")

    print(f"[{datetime.now().isoformat()}] Concluído!")


if __name__ == "__main__":
    main()
