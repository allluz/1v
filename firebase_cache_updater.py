#!/usr/bin/env python3
"""
UM Vale - Firebase Cache Updater
Mantém o cache do Firebase sempre atualizado para o app abrir instantâneo.
Agende no cron (a cada 10-15min) ou rode manualmente.

Instalação:
  pip install firebase-admin requests

  Baixe a service account key em:
    Firebase Console > Configurações > Contas de serviço > Gerar nova chave privada
  Salve como serviceAccountKey.json na mesma pasta deste script.
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
    "radar-iguacu", "esporte", "plural", "guiavale",
    "policial", "cultura", "politica", "educacao"
]
UMVALE_PORTAL = "https://umvale.wordpress.com"
WEATHER_LAT = -26.2311
WEATHER_LON = -51.0869

SERVICE_ACCOUNT_PATH = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")


def init_firebase():
    if fire_admin_available():
        cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
        firebase_admin.initialize_app(cred, {"databaseURL": FIREBASE_DB_URL})
        print("[firebase] Admin SDK inicializado")
    else:
        print("[firebase] ERRO: serviceAccountKey.json não encontrado")
        print("        Baixe em: Firebase Console > Configurações > Contas de serviço")
        print("        Salve como serviceAccountKey.json na pasta do script")
        exit(1)


def fire_admin_available():
    return os.path.isfile(SERVICE_ACCOUNT_PATH)


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

        # "Com chuva" columns: Leitura da régua / Nível / Vazão
        data_row = re.search(
            r'(\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2})\s+([\d,]+)\s+([\d,]+)\s+([\d,.]+)'
            r'\s+([\d,]+)\s+([\d,]+)\s+([\d,.]+)',
            clean
        )
        if data_row:
            return {
                "value": f"{data_row.group(2)}m",
                "time": f"Copel • {data_row.group(1)}",
                "source": "copel-cota",
                "waterLevel": f"{data_row.group(3)}m",
                "flow": f"{data_row.group(4)} m³/s"
            }
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
        feed_url = f"{UMVALE_PORTAL}/tag/{tag}/feed/"
        items = parse_rss(feed_url)
        for item in items:
            key = (item["link"] or item["title"]).strip().rstrip("/")
            if key in seen:
                continue
            seen.add(key)
            all_items.append({**item, "label": tag})
    all_items.sort(key=lambda x: x.get("pub", 0), reverse=True)
    return all_items[:100]


def fetch_events():
    ics_url = "https://calendar.google.com/calendar/ical/umvalenews%40gmail.com/private-eee641ec0ceb07e720225f41edb52d91/basic.ics"
    try:
        r = requests.get(ics_url, timeout=12)
        events = []
        for block in re.finditer(r"BEGIN:VEVENT(.*?)END:VEVENT", r.text, re.DOTALL):
            text = block.group(1)

            def extract(name):
                m = re.search(rf"{name}:?(.*?)(?:\r?\n)", text)
                return m.group(1).strip() if m else ""

            dtstart = extract("DTSTART")
            dtend = extract("DTEND")
            summary = extract("SUMMARY")
            location = extract("LOCATION")
            desc = extract("DESCRIPTION")[:300]
            if not summary:
                continue
            clean_dt = lambda d: re.sub(r'(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})', r'\1-\2-\3T\4:\5:\6', d)
            start_str = clean_dt(dtstart)
            end_str = clean_dt(dtend) if dtend else ""
            events.append({
                "summary": summary,
                "start": start_str,
                "end": end_str,
                "location": location,
                "description": desc[:200]
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


# ────────────────────────────────────────────────────────

def main():
    print(f"[{datetime.now().isoformat()}] Iniciando atualização do cache Firebase...")
    init_firebase()

    river = fetch_river()
    if river:
        fb_put(f"{CACHE_BASE}/river/data", river)
        fb_put(f"{CACHE_BASE}/river/updatedAt", int(time.time() * 1000))
        print(f"  [river] {river['value']}")

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

    app_cache = {
        "river": river or {},
        "weather": weather or {},
        "news": news or [],
        "events": events or []
    }
    fb_put(f"{CACHE_BASE}/app/data", app_cache)
    fb_put(f"{CACHE_BASE}/app/updatedAt", int(time.time() * 1000))
    print(f"  [app] cache completo salvo")

    print(f"[{datetime.now().isoformat()}] Concluído!")


if __name__ == "__main__":
    main()
