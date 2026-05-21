"""
Scraper do Rio Iguaçu — Fonte: vvale.com.br/clima/
Dados horários reais fornecidos pela Copel, disponíveis via HTML estático.
Agendado 8x/dia via LaunchAgent.
"""
import requests
import json
import os
import re
import time
from datetime import datetime, date, timedelta, timezone

import firebase_admin
from firebase_admin import credentials, db

FIREBASE_URL = "https://umvale-default-rtdb.firebaseio.com/cache/river.json"
FIREBASE_DB_URL = "https://umvale-default-rtdb.firebaseio.com"
SERVICE_ACCOUNT_PATHS = [
    os.environ.get("UMVALE_SERVICE_ACCOUNT"),
    os.path.join(os.path.dirname(os.path.dirname(__file__)), ".secrets", "serviceAccountKey.json"),
    os.path.join(os.getcwd(), ".secrets", "serviceAccountKey.json"),
    "/Users/allluz/.umvale_scripts/serviceAccountKey.json",
    "/Users/allluz/.umvale/serviceAccountKey.json",
    "/Users/allluz/Documents/Allluz/Allluz Os/umvale/.secrets/serviceAccountKey.json",
]
VVALE_URL = "https://www.vvale.com.br/clima/"
COPEL_PREVISAO_URL = "https://www.copel.com/mhbweb/paginas/previsao.jsf"
BRT = timezone(timedelta(hours=-3))
USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
]

def now_brt():
    return datetime.now(BRT)

def ts_ms(dt):
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=BRT)
    return int(dt.timestamp() * 1000)

def parse_brt_datetime(value):
    return datetime.strptime(value, "%d/%m/%Y %H:%M").replace(tzinfo=BRT)

def fetch_vvale(max_attempts=3):
    """Busca a página do vvale com retry e rotação de User-Agent."""
    for attempt in range(max_attempts):
        ua = USER_AGENTS[attempt % len(USER_AGENTS)]
        try:
            print(f"[vvale] Tentativa {attempt+1}/{max_attempts}...")
            r = requests.get(VVALE_URL, timeout=15, headers={"User-Agent": ua})
            if r.status_code == 200 and len(r.text) > 1000:
                return r.text
            else:
                print(f"[vvale] HTTP {r.status_code}")
        except Exception as e:
            print(f"[vvale] Erro {attempt+1}: {e}")
        if attempt < max_attempts - 1:
            time.sleep(5)
    return None

def clean_html_text(html):
    clean = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL)
    clean = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL)
    clean = re.sub(r'<[^>]+>', ' ', clean)
    clean = clean.replace('&nbsp;', ' ').replace('\xa0', ' ')
    return re.sub(r'\s+', ' ', clean).strip()

def fetch_copel_last_value(max_attempts=2):
    """Busca somente o 'Último valor considerado' da Copel, nunca a tabela de previsão."""
    max_future_ts = ts_ms(now_brt()) + (15 * 60 * 1000)
    for attempt in range(max_attempts):
        ua = USER_AGENTS[attempt % len(USER_AGENTS)]
        try:
            url = f"{COPEL_PREVISAO_URL}?t={int(time.time() * 1000)}"
            print(f"[copel] Tentativa {attempt+1}/{max_attempts}...")
            response = requests.get(url, timeout=20, headers={"User-Agent": ua})
            if response.status_code != 200 or len(response.text) < 1000:
                print(f"[copel] HTTP {response.status_code}")
                continue
            clean = clean_html_text(response.text)
            match = re.search(
                r'[UÚ]ltimo\s+[Vv]alor\s+[Cc]onsiderado:?\s*'
                r'(\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2})\s+'
                r'Leitura\s+da\s+r[eé]gua\s+\(m\)\s+'
                r'N[ií]vel\s+de\s+[aá]gua\s+\(m\)\s+'
                r'Vaz[aã]o\s+\(m[³3]/s\)\s+'
                r'([\d,]+)\s+([\d,]+)\s+([\d,.]+)',
                clean,
                re.IGNORECASE
            )
            if not match:
                print("[copel] Último valor considerado não encontrado.")
                continue

            dt_str, reg_str, niv_str, vaz_str = match.groups()
            dt_obj = parse_brt_datetime(dt_str)
            reading_ts = ts_ms(dt_obj)
            if reading_ts > max_future_ts:
                print(f"[copel] Último valor futuro ignorado: {dt_str}")
                return None
            print(f"[copel] Último valor real: {dt_str} → {reg_str}m")
            return {
                "ts": reading_ts,
                "timeStr": dt_str,
                "value": float(reg_str.replace(',', '.')),
                "valueBr": reg_str,
                "source": "copel-cota",
                "waterLevel": f"{niv_str}m",
                "flow": f"{vaz_str} m³/s",
            }
        except Exception as e:
            print(f"[copel] Erro {attempt+1}: {e}")
        if attempt < max_attempts - 1:
            time.sleep(3)
    return None

def parse_vvale(html):
    """
    Extrai leituras horárias do bloco:
    'Leitura da Régua Em metros 01h - 3,44m 21h - 3,45m ...'
    E a timestamp de atualização: 'Dados fornecidos por COPEL © em 17/05/2026 02:00'
    """
    clean = clean_html_text(html)

    # Extrair data de atualização: 'em 17/05/2026 02:00'
    update_date_str = None
    update_match = re.search(r'COPEL\s*[©®]?\s*em\s*(\d{2}/\d{2}/\d{4})\s+(\d{2}:\d{2})', clean, re.IGNORECASE)
    if update_match:
        update_date_str = update_match.group(1)  # ex: '17/05/2026'
        print(f"[parse] Data de referência: {update_date_str} atualizado às {update_match.group(2)}")

    # Extrair todas as leituras horárias: 'XXh - 3,45m'
    hourly_matches = re.findall(r'(\d{1,2})h\s*[-–]\s*([\d,]+)m', clean)
    if not hourly_matches:
        print("[parse] Nenhuma leitura horária encontrada.")
        return []

    print(f"[parse] {len(hourly_matches)} leituras encontradas: {hourly_matches}")

    brt_now = now_brt()
    now_ts = ts_ms(brt_now)
    max_future_ts = now_ts + (15 * 60 * 1000)
    today_str = brt_now.strftime("%d/%m/%Y")
    yesterday_dt = brt_now - timedelta(days=1)
    yesterday_str = yesterday_dt.strftime("%d/%m/%Y")

    # ref_date = data indicada pelo vvale, ou hoje
    ref_date = update_date_str or today_str

    # Extrair hora do update para saber ponto de corte entre hoje e ontem
    # ex: atualizado às 18:00 → horas > 18 são do dia anterior ao ref_date
    update_hour = int(update_match.group(2).split(':')[0]) if update_match else brt_now.hour
    if update_match:
        try:
            update_dt = parse_brt_datetime(f"{update_date_str} {update_match.group(2)}")
            if ts_ms(update_dt) > max_future_ts:
                print(f"[parse] Data futura da fonte ignorada: {update_date_str} {update_match.group(2)}")
                ref_date = today_str
                update_hour = brt_now.hour
        except Exception:
            pass

    # Calcular o dia anterior ao ref_date corretamente
    try:
        ref_dt = datetime.strptime(ref_date, "%d/%m/%Y")
        prev_ref_str = (ref_dt - timedelta(days=1)).strftime("%d/%m/%Y")
    except Exception:
        prev_ref_str = yesterday_str

    readings = []
    for hour_str, val_str in hourly_matches:
        hour = int(hour_str)
        val_float = float(val_str.replace(',', '.'))
        val_br = val_str  # mantém formato original com vírgula (ex: '3,42')

        # Horas maiores que o update_hour pertencem ao dia anterior ao ref_date
        if hour > update_hour:
            date_for_hour = prev_ref_str
        else:
            date_for_hour = ref_date

        dt_str = f"{date_for_hour} {hour:02d}:00"
        try:
            dt_obj = parse_brt_datetime(dt_str)
            ts = ts_ms(dt_obj)
        except Exception:
            continue

        if ts > max_future_ts:
            print(f"[parse] Leitura futura ignorada: {dt_str} ({val_br}m)")
            continue

        readings.append({
            "ts": ts,
            "timeStr": dt_str,
            "value": val_float,
            "valueBr": val_br,  # ex: '3,42' para exibição no app
        })

    # Ordenar por timestamp decrescente (mais recente primeiro)
    readings.sort(key=lambda x: x['ts'], reverse=True)
    return readings

LOCAL_HISTORY_FILE = os.environ.get(
    "UMVALE_RIVER_HISTORY_FILE",
    os.path.expanduser("~/.umvale_scripts/rio_history.json")
)

def load_local_history():
    """Carrega histórico do arquivo local (mais confiável que o Firebase)."""
    try:
        with open(LOCAL_HISTORY_FILE, 'r') as f:
            h = json.load(f)
            if isinstance(h, list):
                return h
    except Exception:
        pass
    return []

def save_local_history(history):
    """Persiste o histórico em arquivo local para sobreviver a sobrescritas no Firebase."""
    try:
        os.makedirs(os.path.dirname(LOCAL_HISTORY_FILE), exist_ok=True)
        with open(LOCAL_HISTORY_FILE, 'w') as f:
            json.dump(history, f)
    except Exception as e:
        print(f"[local] Aviso: não salvou histórico local: {e}")

def merge_and_save(new_readings):
    """Mescla com histórico LOCAL (resiliente) e salva no Firebase."""
    # Fonte primária: arquivo local (não pode ser sobrescrito externamente)
    existing_history = load_local_history()

    # Fallback: Firebase (caso local esteja vazio)
    if not existing_history:
        try:
            r = requests.get(FIREBASE_URL, timeout=10)
            if r.status_code == 200:
                old = r.json()
                if old and "data" in old and "history" in old["data"]:
                    h = old["data"]["history"]
                    if isinstance(h, list) and len(h) > 0:
                        existing_history = h
                        print(f"[merge] Histórico recuperado do Firebase: {len(h)} registros")
        except Exception as e:
            print(f"[firebase] Aviso carregar histórico: {e}")

    now_ts = ts_ms(now_brt())
    max_future_ts = now_ts + (15 * 60 * 1000)
    existing_history = [
        h for h in existing_history
        if isinstance(h, dict) and int(h.get("ts", 0) or 0) <= max_future_ts
    ]
    new_readings = [
        h for h in new_readings
        if isinstance(h, dict) and int(h.get("ts", 0) or 0) <= max_future_ts
    ]

    existing_by_ts = {int(h["ts"]): h for h in existing_history}
    added = 0
    for reading in new_readings:
        reading_ts = int(reading["ts"])
        if reading_ts in existing_by_ts:
            for key in ("timeStr", "value", "valueBr", "source", "waterLevel", "flow"):
                if reading.get(key):
                    existing_by_ts[reading_ts][key] = reading[key]
        else:
            existing_history.append(reading)
            existing_by_ts[reading_ts] = reading
            added += 1

    existing_history.sort(key=lambda x: x['ts'], reverse=True)
    existing_history = existing_history[:48]  # até 48 leituras (~2 dias)

    if not existing_history:
        print("[merge] Sem dados para salvar.")
        return False

    save_local_history(existing_history)

    latest = existing_history[0]
    # Usa valueBr (formato com vírgula) se disponível, senão formata o float
    val_display = latest.get('valueBr') or str(latest['value']).replace('.', ',')
    payload = {
        "data": {
            "value": f"{val_display}m",
            "time": f"Copel • {latest['timeStr']}",
            "source": latest.get("source") or "vvale",
            "ts": latest["ts"],
            "waterLevel": latest.get("waterLevel", ""),
            "flow": latest.get("flow", ""),
            "history": existing_history
        },
        "updatedAt": int(time.time() * 1000)
    }
    if not save_firebase_payload(payload):
        print(f"[{now_brt().isoformat()}] ❌ Firebase não atualizado. Histórico local preservado com {len(existing_history)} registros.")
        return False

    print(f"[{now_brt().isoformat()}] ✅ Salvo: {payload['data']['value']} em {payload['data']['time']} | +{added} novas | Total: {len(existing_history)}")
    return True

def resolve_service_account_path():
    for path in SERVICE_ACCOUNT_PATHS:
        try:
            with open(path, "rb") as handle:
                handle.read(1)
            return path
        except Exception as e:
            print(f"[firebase] Service account indisponível em {path}: {e}")
    return None

def init_firebase_admin():
    if firebase_admin._apps:
        return True
    service_account_path = resolve_service_account_path()
    if not service_account_path:
        raise RuntimeError("Nenhuma service account acessível para gravar o nível do rio.")
    cred = credentials.Certificate(service_account_path)
    firebase_admin.initialize_app(cred, {"databaseURL": FIREBASE_DB_URL})
    print(f"[firebase] Admin SDK usando {service_account_path}")
    return True

def save_firebase_payload(payload):
    try:
        init_firebase_admin()
        db.reference("/cache/river").set(payload)
        return True
    except Exception as e:
        print(f"[firebase] Falha ao gravar /cache/river via Admin SDK: {e}")
        return False


def fetch_river():
    readings = []

    html = fetch_vvale()
    if html:
        readings.extend(parse_vvale(html))
    else:
        print(f"[{now_brt().isoformat()}] ⚠️ vvale.com.br não respondeu; tentando último valor oficial da Copel.")

    copel_latest = fetch_copel_last_value()
    if copel_latest:
        readings.append(copel_latest)

    if not readings:
        print(f"[{now_brt().isoformat()}] ❌ Falha: nenhuma leitura extraída.")
        return False

    return merge_and_save(readings)

if __name__ == "__main__":
    raise SystemExit(0 if fetch_river() else 1)
