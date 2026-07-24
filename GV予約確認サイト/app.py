import csv
import time
from flask import Flask, jsonify, request, send_from_directory
import requests

app = Flask(__name__, static_folder='static')

# Google Sheets 設定
# 公開スプレッドシートのCSVエクスポートAPIを利用（認証不要）
SPREADSHEET_ID = "14w-lnEjJjbXw_kpBYDJTov7GjpFtb1ENHr0K6X4q-EM"
SHEET_NAME = "2026年"
CSV_URL = f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet={SHEET_NAME}"

# 出席者名（ガイド）リスト
ATTENDEES = ["哲さん", "英さん", "羽山さん", "Rez", "バボちゃん", "五島", "FW（どんどん）", "FW（ゆげっち）"]

# キャッシュ用グローバル変数 (有効期限: 5分)
cache_data = None
cache_timestamp = 0
CACHE_DURATION = 300  # 秒

def get_sheet_data_csv(force_refresh=False):
    """GoogleスプレッドシートからCSV形式でデータを取得してパースする（キャッシュ対応）"""
    global cache_data, cache_timestamp
    current_time = time.time()
    
    # キャッシュが有効な場合はキャッシュから返す
    if not force_refresh and cache_data is not None and (current_time - cache_timestamp) < CACHE_DURATION:
        print("Using cached sheet data.")
        return cache_data

    try:
        print(f"Fetching sheet data from Google Sheets (Refresh: {force_refresh})...")
        response = requests.get(CSV_URL, timeout=10)
        response.raise_for_status()
        
        # レスポンスのエンコーディングを設定
        response.encoding = 'utf-8'
        
        # CSVをパース
        csv_data = response.text.splitlines()
        reader = csv.reader(csv_data)
        values = list(reader)
        
        if not values or len(values) < 2:
            print("No data found or sheet is empty.")
            return []

        parsed_events = parse_event_data(values)
        
        # キャッシュを更新
        cache_data = parsed_events
        cache_timestamp = current_time
        
        return parsed_events
    except Exception as e:
        print(f"Error fetching or parsing sheet data: {e}")
        # エラー発生時、過去のキャッシュがあれば一時的にフォールバック
        if cache_data is not None:
            print("Falling back to stale cache data due to error.")
            return cache_data
        raise e

def parse_event_data(values):
    """CSVから取得した二次元配列をパースしてイベントリストを作成"""
    headers = values[0]
    
    # 各列のインデックスを特定（見つからない場合のデフォルト値を設定）
    date_idx = 0
    time_idx = 1
    school_idx = 2
    students_idx = 3
    teachers_idx = 4
    memo_idx = len(headers) - 1
    
    # 日本語ヘッダー名からインデックスを探索
    leader_idx = -1
    for i, header in enumerate(headers):
        h_clean = header.strip()
        if h_clean == "日付":
            date_idx = i
        elif h_clean == "開始時間":
            time_idx = i
        elif h_clean == "学校名":
            school_idx = i
        elif h_clean == "生徒":
            students_idx = i
        elif h_clean == "教員":
            teachers_idx = i
        elif "運営リーダー" in h_clean or "リーダー" in h_clean:
            leader_idx = i
        elif h_clean in ["メモ", "備考", "連絡事項"]:
            memo_idx = i

    if leader_idx == -1:
        leader_idx = 19  # CSV上のデフォルト位置（20列目）

    # U列（出席者開始列）を探す。通常はAから数えて21列目 (0-indexedで20)
    attendees_start_idx = None
    for i, header in enumerate(headers):
        if header.strip().upper() == "U":
            attendees_start_idx = i
            break
            
    if attendees_start_idx is None:
        # デフォルトはU列（21列目、0-indexedで20）
        attendees_start_idx = 20

    events = []
    
    # 2行目以降がデータ
    for row_idx in range(1, len(values)):
        row = values[row_idx]
        
        # 行のデータ長が足りない場合はスキップまたは拡張
        if len(row) <= date_idx:
            continue
            
        date = row[date_idx].strip() if date_idx < len(row) else ""
        
        # 日付が空の場合はスキップ
        if not date or date == "":
            continue
            
        time_val = row[time_idx].strip() if time_idx < len(row) else ""
        school = row[school_idx].strip() if school_idx < len(row) else ""
        students = row[students_idx].strip() if students_idx < len(row) else ""
        teachers = row[teachers_idx].strip() if teachers_idx < len(row) else ""
        memo = row[memo_idx].strip() if memo_idx < len(row) else ""
        leader = row[leader_idx].strip() if leader_idx < len(row) else ""
        
        # 出席者を抽出（○、〇、o、O、1 などの印が入っているガイドを抽出）
        attendees = []
        for i, attendee_name in enumerate(ATTENDEES):
            col_idx = attendees_start_idx + i
            if col_idx < len(row):
                cell_value = row[col_idx].strip()
                # ○や〇などの文字が入っている場合に出席とみなす
                if cell_value in ["○", "〇", "o", "O", "OK", "1", "出席"]:
                    attendees.append(attendee_name)
                    
        events.append({
            "id": row_idx,  # 行番号を一意なIDとする
            "date": date,
            "time": time_val,
            "school": school,
            "students": students,
            "teachers": teachers,
            "attendees": attendees,
            "leader": leader,
            "memo": memo
        })
        
    return events

@app.route('/')
def index():
    """フロントエンドのHTMLを返却"""
    return send_from_directory('static', 'index.html')

@app.route('/static/<path:path>')
def send_static(path):
    """静的ファイルを返却"""
    return send_from_directory('static', path)

@app.route('/api/dates', methods=['GET'])
def get_dates():
    """日付の一覧を取得（一意・ソート済み）"""
    try:
        force_refresh = request.args.get('refresh', 'false').lower() == 'true'
        events = get_sheet_data_csv(force_refresh=force_refresh)
        
        # 重複を除去して日付リストを作成
        # 日付文字列が空でないものを対象とする
        dates = sorted(list(set(event['date'] for event in events if event['date'])))
        return jsonify({"dates": dates})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/event/<path:date>', methods=['GET'])
def get_event(date):
    """特定の日付のイベント詳細を取得"""
    try:
        force_refresh = request.args.get('refresh', 'false').lower() == 'true'
        events = get_sheet_data_csv(force_refresh=force_refresh)
        
        # 指定日付に一致するイベントを探す
        matched_events = [event for event in events if event['date'] == date]
        
        if not matched_events:
            return jsonify({"error": f"No events found for date: {date}"}), 404
            
        # 同一日に複数イベントがある可能性も考慮してリストで返すが、
        # フロントエンドが単一オブジェクトを期待している場合は最初のものを返す
        # ここでは1日のイベントをすべてリストで返し、フロント側で処理できるようにする
        return jsonify({"events": matched_events})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/refresh', methods=['POST'])
def refresh_cache():
    """キャッシュを強制クリアし、最新データを再取得する"""
    try:
        events = get_sheet_data_csv(force_refresh=True)
        return jsonify({"success": True, "message": "Cache refreshed successfully", "count": len(events)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    # 外部（iPhone等）からのアクセスを許可するため host='0.0.0.0' で起動
    app.run(debug=True, host='0.0.0.0', port=5000)
