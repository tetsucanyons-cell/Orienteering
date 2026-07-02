# -*- coding: utf-8 -*-
import os
import glob
import csv
import json
import re
from flask import Flask, jsonify, request, send_from_directory

app = Flask(__name__, static_folder='static')

SETTINGS_FILE = os.path.join(os.path.dirname(__file__), 'settings.json')

def load_settings():
    if os.path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {"directories": [], "keywords": []}

def save_settings(settings):
    with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
        json.dump(settings, f, ensure_ascii=False, indent=2)

def clean_amount(val):
    """金額文字列を数値にクレンジングする"""
    if not val:
        return 0
    # 数字、マイナス以外の文字を削除
    cleaned = re.sub(r'[^\d\-]', '', val)
    try:
        return int(cleaned) if cleaned else 0
    except ValueError:
        return 0

def parse_csv_files():
    settings = load_settings()
    directories = settings.get("directories", [])
    keywords = settings.get("keywords", [])
    
    extracted_items = []
    
    # キーワードの部分一致判定用（大文字小文字、全角半角のゆらぎに対応するため小文字化）
    # ただし今回はシンプルに「含まれているか」で判定
    keywords_lower = [k.lower() for k in keywords]

    for directory in directories:
        if not os.path.exists(directory):
            continue
            
        csv_files = glob.glob(os.path.join(directory, "*.csv"))
        for filepath in csv_files:
            filename = os.path.basename(filepath)
            # ファイル名から請求月 (YYYYMM) を抽出
            billing_match = re.search(r'(\d{6})', filename)
            if not billing_match:
                continue
            
            raw_billing_month = billing_match.group(1)
            billing_month = f"{raw_billing_month[:4]}-{raw_billing_month[4:]}" # YYYY-MM
            
            try:
                # 三井住友カードのCSVは通常 Shift_JIS (cp932)
                with open(filepath, 'r', encoding='cp932', errors='replace') as f:
                    reader = csv.reader(f)
                    
                    # 1行目はカード情報
                    header = next(reader, None)
                    card_name = "不明なカード"
                    card_number = ""
                    if header:
                        # 例: 塩野　哲也　様,4980-00**-****-****,三井住友ゴールドＶＩＳＡ（ＮＬ）
                        if len(header) >= 3:
                            card_name = header[2].strip()
                            card_number = header[1].strip()
                        elif len(header) >= 2:
                            card_name = header[1].strip()
                            
                    # 明細行の処理
                    for row in reader:
                        if len(row) < 3:
                            continue
                            
                        # 利用日 (YYYY/MM/DD)
                        usage_date = row[0].strip()
                        # 利用店名
                        store = row[1].strip()
                        # 利用金額（通常3列目。インデックス2）
                        # 支払金額（通常6列目。インデックス5）
                        amount_str = row[2].strip()
                        if len(row) >= 6 and row[5].strip():
                            amount_str = row[5].strip()
                            
                        # 日付フォーマットの検証 (YYYY/MM/DD)
                        if not re.match(r'^\d{4}/\d{2}/\d{2}$', usage_date):
                            continue
                            
                        # 携帯料金キーワード判定
                        is_target = False
                        store_lower = store.lower()
                        matched_keyword = ""
                        for kw in keywords_lower:
                            if kw in store_lower:
                                is_target = True
                                matched_keyword = kw
                                break
                                
                        if is_target:
                            amount = clean_amount(amount_str)
                            # 利用月から利用年月 (YYYY-MM) を算出
                            usage_month = usage_date[:7].replace('/', '-')
                            
                            extracted_items.append({
                                "billing_month": billing_month,
                                "usage_month": usage_month,
                                "usage_date": usage_date,
                                "card_name": card_name,
                                "card_number": card_number,
                                "store": store,
                                "amount": amount,
                                "matched_keyword": matched_keyword
                            })
            except Exception as e:
                print(f"Error parsing file {filepath}: {e}")
                
    # 日付順にソート
    extracted_items.sort(key=lambda x: x['usage_date'])
    return extracted_items

# キャッシュ用変数
_cached_data = None

def get_data(force_reload=False):
    global _cached_data
    if _cached_data is None or force_reload:
        _cached_data = parse_csv_files()
    return _cached_data

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def static_proxy(path):
    return send_from_directory(app.static_folder, path)

@app.route('/api/data', methods=['GET'])
def api_data():
    force_reload = request.args.get('reload', 'false').lower() == 'true'
    data = get_data(force_reload)
    return jsonify(data)

@app.route('/api/settings', methods=['GET', 'POST'])
def api_settings():
    if request.method == 'POST':
        new_settings = request.json
        save_settings(new_settings)
        # 設定変更時はデータを再読み込みする
        get_data(force_reload=True)
        return jsonify({"status": "success", "settings": new_settings})
    else:
        return jsonify(load_settings())

@app.route('/api/reload', methods=['POST'])
def api_reload():
    data = get_data(force_reload=True)
    return jsonify({"status": "success", "count": len(data)})

if __name__ == '__main__':
    # staticディレクトリの作成を確認
    os.makedirs(os.path.join(os.path.dirname(__file__), 'static'), exist_ok=True)
    print("Starting Flask app on http://0.0.0.0:5000 (Accessible from other devices)")
    app.run(host='0.0.0.0', port=5000, debug=True)
