"""
pdf_genre_sorter_gui.py
========================
PDF ジャンル自動分類ツール（GUI版）
- フォルダをボタンで選択
- 【AIモード】Gemini API でジャンル判定
- 【キーワードモード】APIなしでファイル名・本文キーワード判定
- ログをリアルタイム表示
- 処理が終わったらサマリーを表示
"""

import os
import re
import json
import time
import shutil
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext
import fitz  # PyMuPDF

# ─────────────────────────────
# 設定
# ─────────────────────────────
MAX_CHARS_PER_PDF = 3000
UNKNOWN_FOLDER    = "不明"
CONFIG_FILE       = os.path.join(os.path.dirname(__file__), ".pdf_sorter_config.json")
GEMINI_MODEL      = "gemini-2.0-flash-lite"
REQUEST_INTERVAL  = 5
MAX_RETRY         = 1

# カラーパレット（ダークテーマ）
BG      = "#1e1e2e"
BG2     = "#2a2a3e"
ACCENT  = "#7c6af7"
ACCENT2 = "#a78bfa"
SUCCESS = "#4ade80"
WARNING = "#facc15"
ERROR   = "#f87171"
TEXT    = "#e2e8f0"
TEXT_DIM= "#94a3b8"
BORDER  = "#3f3f5a"


# ─────────────────────────────
# キーワード辞書（APIなしモード用）
# ─────────────────────────────
KEYWORD_GENRES = [
    ("技術書・IT", [
        "python", "java", "javascript", "typescript", "programming", "プログラム",
        "software", "ソフトウェア", "html", "css", "api", "algorithm", "アルゴリズム",
        "database", "データベース", "linux", "windows", "network", "ネットワーク",
        "code", "コード", "git", "docker", "cloud", "クラウド", "ai", "machine learning",
        "deep learning", "データサイエンス", "開発", "エンジニア"
    ]),
    ("ビジネス・経営", [
        "business", "ビジネス", "management", "経営", "strategy", "戦略",
        "marketing", "マーケティング", "sales", "営業", "profit", "利益",
        "revenue", "売上", "project", "プロジェクト", "budget", "予算",
        "企業", "会社", "組織", "マネジメント", "リーダーシップ", "起業",
        "生産性", "productivity", "仕事術"
    ]),
    ("法律・契約", [
        "contract", "契約", "agreement", "法律", "legal", "law", "規約",
        "terms", "利用規約", "著作権", "copyright", "special", "condition",
        "条例", "規制", "法令", "弁護士", "司法", "裁判"
    ]),
    ("医療・健康", [
        "health", "健康", "medical", "医療", "doctor", "医師", "disease",
        "病気", "treatment", "治療", "hospital", "病院", "薬", "medicine",
        "nutrition", "栄養", "diet", "ダイエット", "運動", "exercise", "wellness"
    ]),
    ("料理・レシピ", [
        "recipe", "レシピ", "food", "食", "cook", "料理", "ingredient", "食材",
        "restaurant", "レストラン", "kitchen", "調理", "お菓子", "sweets",
        "baking", "和食", "洋食", "中華", "味", "栄養素"
    ]),
    ("旅行・観光", [
        "travel", "旅行", "hotel", "ホテル", "tour", "観光", "trip", "旅",
        "flight", "航空", "destination", "地域", "観光地", "温泉", "abroad",
        "海外", "国内", "guidebook", "ガイドブック"
    ]),
    ("学術・論文", [
        "research", "研究", "study", "論文", "paper", "analysis", "分析",
        "journal", "学術", "university", "大学", "abstract", "introduction",
        "conclusion", "methodology", "実験", "experiment", "学会", "citation"
    ]),
    ("語学・教育", [
        "english", "英語", "japanese", "日本語", "chinese", "中国語",
        "language", "語学", "vocabulary", "単語", "grammar", "文法",
        "toeic", "toefl", "study", "勉強", "学習", "教育", "education",
        "teaching", "lesson", "練習", "テスト", "資格", "検定"
    ]),
    ("金融・投資", [
        "finance", "金融", "investment", "投資", "stock", "株", "money",
        "お金", "bank", "銀行", "tax", "税", "確定申告", "節税", "資産",
        "asset", "fund", "ファンド", "不動産投資", "配当", "dividend"
    ]),
    ("不動産・住宅", [
        "real estate", "不動産", "apartment", "マンション", "house", "住宅",
        "rent", "賃貸", "property", "物件", "間取り", "建築", "interior",
        "リフォーム", "住まい", "家賃", "管理"
    ]),
    ("マニュアル・手順書", [
        "manual", "マニュアル", "guide", "ガイド", "instruction", "手順",
        "how to", "howto", "setup", "セットアップ", "install", "インストール",
        "操作", "使い方", "tutorial", "チュートリアル", "readme"
    ]),
    ("農業・環境", [
        "農業", "agriculture", "farm", "植物", "plant", "forest", "林業",
        "竹", "bamboo", "伐採", "環境", "environment", "ecology", "エコ",
        "自然", "nature", "土壌", "水", "organic", "有機"
    ]),
    ("自己啓発・心理", [
        "achievement", "達成", "goal", "目標", "success", "成功", "habit",
        "習慣", "mindset", "マインド", "diary", "日記", "motivation", "モチベーション",
        "self", "自己", "growth", "成長", "mandalart", "マンダラート",
        "haruta", "原田", "手帳", "planner"
    ]),
    ("デザイン・アート", [
        "design", "デザイン", "art", "アート", "illustration", "イラスト",
        "graphic", "グラフィック", "typography", "color", "色", "UI", "UX",
        "photoshop", "illustrator", "creative"
    ]),
    ("小説・文学", [
        "novel", "小説", "story", "物語", "fiction", "chapter", "文学",
        "literature", "poetry", "詩", "エッセイ", "essay"
    ]),
]


def keyword_classify(filename: str, text: str) -> str:
    """ファイル名＋テキストのキーワードでジャンルを判定"""
    target = (filename + " " + text).lower()
    scores: dict[str, int] = {}
    for genre, keywords in KEYWORD_GENRES:
        score = sum(1 for kw in keywords if kw.lower() in target)
        if score > 0:
            scores[genre] = score
    if not scores:
        return UNKNOWN_FOLDER
    return max(scores, key=lambda g: scores[g])


# ─────────────────────────────
# 設定ファイル
# ─────────────────────────────
def load_config() -> dict:
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_config(data: dict):
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


# ─────────────────────────────
# PDF 処理関数
# ─────────────────────────────
def extract_text(pdf_path: str) -> str:
    parts = []
    try:
        with fitz.open(pdf_path) as doc:
            for page in doc:
                parts.append(page.get_text())
                if sum(len(t) for t in parts) >= MAX_CHARS_PER_PDF:
                    break
    except Exception:
        return ""
    return " ".join(parts)[:MAX_CHARS_PER_PDF]


def classify_with_ai(client, filename: str, text: str) -> tuple[str, str | None]:
    """Gemini API でジャンル判定。(ジャンル名, エラー or None) を返す"""
    prompt = f"""
以下のPDFのファイル名と内容（抜粋）を読んで、このPDFが属するジャンルを
**日本語で1〜4語**の短いフォルダ名として答えてください。

ルール:
- フォルダ名として使えるシンプルな名称にする（例: 技術書, 小説, 料理レシピ, 医療・健康, ビジネス, 法律, 旅行ガイド, マンガ, 学術論文, 語学, 契約書, マニュアル など）
- ジャンルが判断できない場合は「{UNKNOWN_FOLDER}」とだけ答えてください
- 回答はフォルダ名のみ。説明不要。

ファイル名: {filename}
内容（抜粋）:
{text.strip() if text.strip() else "（テキストなし・スキャン画像の可能性あり）"}
"""
    last_err = None
    for attempt in range(MAX_RETRY + 1):
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt
            )
            genre = response.text.strip()
            genre = re.sub(r'[\\/:*?"<>|]', '', genre).strip()
            return (genre if genre else UNKNOWN_FOLDER, None)
        except Exception as e:
            last_err = str(e)
            if "429" in last_err and attempt < MAX_RETRY:
                wait = 45
                m = re.search(r'retry in (\d+)', last_err, re.IGNORECASE)
                if not m:
                    m = re.search(r"retryDelay[^0-9]+(\d+)", last_err, re.IGNORECASE)
                if m:
                    wait = min(int(m.group(1)) + 5, 60)
                return (UNKNOWN_FOLDER, f"RETRY_NEEDED:{wait}:{last_err}")
    return (UNKNOWN_FOLDER, last_err)


def safe_move(src: str, dest_dir: str) -> str:
    os.makedirs(dest_dir, exist_ok=True)
    basename = os.path.basename(src)
    dest = os.path.join(dest_dir, basename)
    if os.path.abspath(src) == os.path.abspath(dest):
        return dest
    if os.path.exists(dest):
        name, ext = os.path.splitext(basename)
        i = 1
        while os.path.exists(dest):
            dest = os.path.join(dest_dir, f"{name}_{i}{ext}")
            i += 1
    shutil.move(src, dest)
    return dest


def safe_delete(file_path: str) -> bool:
    """ファイルを削除する前にユーザーに確認する安全な削除関数（今後の拡張用）"""
    basename = os.path.basename(file_path)
    if messagebox.askyesno("削除の確認", f"本当に以下のファイルを削除しますか？\n\n{basename}"):
        try:
            os.remove(file_path)
            return True
        except Exception as e:
            messagebox.showerror("削除エラー", f"削除に失敗しました:\n{e}")
            return False
    return False


# ─────────────────────────────
# GUI アプリ
# ─────────────────────────────
class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("📂 PDF ジャンル自動分類ツール")
        self.geometry("820x660")
        self.minsize(640, 500)
        self.configure(bg=BG)

        cfg = load_config()
        self.folder_path  = tk.StringVar(value=cfg.get("last_folder", ""))
        self.api_key_var  = tk.StringVar(
            value=cfg.get("api_key", os.environ.get("GEMINI_API_KEY", ""))
        )
        self.use_ai = tk.BooleanVar(value=cfg.get("use_ai", False))
        self._show_key = False
        self._build_ui()

    # ── UI 構築 ──────────────────
    def _build_ui(self):
        # ヘッダー
        header = tk.Frame(self, bg=BG, pady=16)
        header.pack(fill="x", padx=28)
        tk.Label(header, text="📂  PDF ジャンル自動分類ツール",
                 font=("Segoe UI", 18, "bold"), bg=BG, fg=ACCENT2).pack(anchor="w")
        tk.Label(header,
                 text="フォルダを選んで ▶ スタートを押すだけ。ジャンルを自動判定してフォルダ振り分けします。",
                 font=("Segoe UI", 10), bg=BG, fg=TEXT_DIM).pack(anchor="w", pady=(2, 0))

        tk.Frame(self, bg=BORDER, height=1).pack(fill="x", padx=28)

        # ─ モード選択 ─
        mode_frame = tk.Frame(self, bg=BG2, pady=10)
        mode_frame.pack(fill="x", padx=28, pady=(14, 0))
        mode_frame.configure(highlightthickness=1, highlightbackground=BORDER)

        tk.Label(mode_frame, text="  分類モード：", font=("Segoe UI", 10, "bold"),
                 bg=BG2, fg=TEXT).pack(side="left", padx=(8, 4))

        self.kw_radio = tk.Radiobutton(
            mode_frame, text="🔤 キーワードモード（APIキー不要・即時）",
            font=("Segoe UI", 10), bg=BG2, fg=SUCCESS,
            selectcolor=BG2, activebackground=BG2, activeforeground=SUCCESS,
            variable=self.use_ai, value=False,
            command=self._on_mode_change
        )
        self.kw_radio.pack(side="left", padx=(0, 16))

        self.ai_radio = tk.Radiobutton(
            mode_frame, text="🤖 AIモード（Gemini API使用）",
            font=("Segoe UI", 10), bg=BG2, fg=ACCENT2,
            selectcolor=BG2, activebackground=BG2, activeforeground=ACCENT2,
            variable=self.use_ai, value=True,
            command=self._on_mode_change
        )
        self.ai_radio.pack(side="left")

        # ─ フォーム ─
        form = tk.Frame(self, bg=BG, pady=14)
        form.pack(fill="x", padx=28)
        form.columnconfigure(1, weight=1)

        # API キー行
        tk.Label(form, text="API キー", font=("Segoe UI", 10, "bold"),
                 bg=BG, fg=TEXT, width=10, anchor="w"
                 ).grid(row=0, column=0, sticky="w", pady=(0, 10))

        api_outer = tk.Frame(form, bg=BG2, highlightthickness=1,
                             highlightbackground=BORDER)
        api_outer.grid(row=0, column=1, sticky="ew", padx=(8, 0), pady=(0, 10))
        api_inner = tk.Frame(api_outer, bg=BG2)
        api_inner.pack(fill="x", padx=10, pady=7)

        self.api_entry = tk.Entry(
            api_inner, textvariable=self.api_key_var, show="*",
            font=("Consolas", 10), bg=BG2, fg=TEXT,
            insertbackground=TEXT, bd=0, relief="flat"
        )
        self.api_entry.pack(side="left", fill="x", expand=True)

        self.eye_btn = tk.Button(
            api_inner, text="👁", font=("Segoe UI", 9),
            bg=BG2, fg=TEXT_DIM, relief="flat", bd=0,
            cursor="hand2", activebackground=BG2,
            command=self._toggle_key_visibility
        )
        self.eye_btn.pack(side="right", padx=(4, 0))

        # フォルダ選択行
        tk.Label(form, text="対象フォルダ", font=("Segoe UI", 10, "bold"),
                 bg=BG, fg=TEXT, width=10, anchor="w"
                 ).grid(row=1, column=0, sticky="w")

        folder_row = tk.Frame(form, bg=BG)
        folder_row.grid(row=1, column=1, sticky="ew", padx=(8, 0))
        folder_row.columnconfigure(0, weight=1)

        path_frame = tk.Frame(folder_row, bg=BG2, highlightthickness=1,
                              highlightbackground=BORDER)
        path_frame.grid(row=0, column=0, sticky="ew")
        tk.Label(path_frame, textvariable=self.folder_path,
                 font=("Segoe UI", 10), bg=BG2, fg=TEXT_DIM,
                 anchor="w", padx=10, pady=7).pack(fill="x")

        tk.Button(folder_row, text=" 参照… ",
                  font=("Segoe UI", 10), bg=BG2, fg=ACCENT2,
                  relief="flat", bd=0, cursor="hand2",
                  activebackground=BORDER, activeforeground=ACCENT2,
                  command=self._browse_folder, padx=10, pady=6
                  ).grid(row=0, column=1, padx=(8, 0))

        # ─ ログ ─
        log_bar = tk.Frame(self, bg=BG)
        log_bar.pack(fill="x", padx=28, pady=(10, 4))
        tk.Label(log_bar, text="ログ", font=("Segoe UI", 10, "bold"),
                 bg=BG, fg=TEXT).pack(side="left")
        self.status_label = tk.Label(log_bar, text="⏸ 待機中",
                                     font=("Segoe UI", 9), bg=BG, fg=TEXT_DIM)
        self.status_label.pack(side="right")

        self.log_box = scrolledtext.ScrolledText(
            self, font=("Consolas", 9), bg=BG2, fg=TEXT,
            insertbackground=TEXT, bd=0, relief="flat",
            state="disabled", wrap="word",
            highlightthickness=1, highlightbackground=BORDER
        )
        self.log_box.pack(fill="both", expand=True, padx=28, pady=(0, 12))
        self.log_box.tag_config("info",    foreground=TEXT)
        self.log_box.tag_config("genre",   foreground=ACCENT2)
        self.log_box.tag_config("success", foreground=SUCCESS)
        self.log_box.tag_config("warn",    foreground=WARNING)
        self.log_box.tag_config("error",   foreground=ERROR)
        self.log_box.tag_config("head",    foreground=ACCENT,
                                font=("Consolas", 9, "bold"))

        # ─ ボタン列 ─
        btn_frame = tk.Frame(self, bg=BG)
        btn_frame.pack(fill="x", padx=28, pady=(0, 18))

        tk.Button(btn_frame, text="ログをクリア",
                  font=("Segoe UI", 10), bg=BG2, fg=TEXT_DIM,
                  relief="flat", bd=0, cursor="hand2",
                  activebackground=BORDER, activeforeground=TEXT,
                  command=self._clear_log, padx=12, pady=7
                  ).pack(side="left")

        self.start_btn = tk.Button(
            btn_frame, text="▶  スタート",
            font=("Segoe UI", 11, "bold"),
            bg=ACCENT, fg="#ffffff", relief="flat", bd=0,
            activebackground=ACCENT2, activeforeground="#ffffff",
            cursor="hand2", command=self._start,
            padx=22, pady=9
        )
        self.start_btn.pack(side="right")

        # 初期モード反映
        self._on_mode_change()

    # ── モード切り替え ──────────────
    def _on_mode_change(self):
        if self.use_ai.get():
            self.api_entry.configure(state="normal")
            self.eye_btn.configure(state="normal")
        else:
            self.api_entry.configure(state="disabled")
            self.eye_btn.configure(state="disabled")

    # ── イベント ──────────────────
    def _toggle_key_visibility(self):
        self._show_key = not self._show_key
        self.api_entry.configure(show="" if self._show_key else "*")
        self.eye_btn.configure(fg=ACCENT2 if self._show_key else TEXT_DIM)

    def _browse_folder(self):
        path = filedialog.askdirectory(title="PDFが入っているフォルダを選んでください")
        if path:
            self.folder_path.set(path)

    def _clear_log(self):
        self.log_box.configure(state="normal")
        self.log_box.delete("1.0", "end")
        self.log_box.configure(state="disabled")

    def _log(self, text: str, tag: str = "info"):
        self.log_box.configure(state="normal")
        self.log_box.insert("end", text + "\n", tag)
        self.log_box.see("end")
        self.log_box.configure(state="disabled")

    def _set_status(self, text: str, color: str = TEXT_DIM):
        self.status_label.configure(text=text, fg=color)

    def _start(self):
        folder  = self.folder_path.get().strip()
        use_ai  = self.use_ai.get()
        api_key = self.api_key_var.get().strip()

        if not folder:
            messagebox.showwarning("フォルダ未選択", "対象フォルダを選んでください。")
            return
        if use_ai and not api_key:
            messagebox.showwarning("APIキー未入力",
                "AIモードを使うにはGemini APIキーが必要です。\n"
                "キーワードモードならAPIキー不要です。")
            return
        if not os.path.isdir(folder):
            messagebox.showerror("エラー", f"フォルダが見つかりません:\n{folder}")
            return

        save_config({"last_folder": folder, "api_key": api_key, "use_ai": use_ai})

        self.start_btn.configure(state="disabled", text="⏳ 処理中...")
        self._set_status("🔄 処理中...", ACCENT2)
        threading.Thread(
            target=self._run_sort,
            args=(folder, use_ai, api_key),
            daemon=True
        ).start()

    def _run_sort(self, folder: str, use_ai: bool, api_key: str):
        # AIクライアント初期化
        client = None
        if use_ai:
            try:
                from google import genai as google_genai
                client = google_genai.Client(api_key=api_key)
            except Exception as e:
                self.after(0, self._log, f"[エラー] API設定失敗: {e}", "error")
                self.after(0, self._finish)
                return

        # PDF 一覧
        pdf_files = sorted([
            os.path.join(folder, f)
            for f in os.listdir(folder)
            if f.lower().endswith(".pdf") and
               os.path.isfile(os.path.join(folder, f))
        ])

        if not pdf_files:
            self.after(0, self._log, "⚠ PDF ファイルが見つかりませんでした。", "warn")
            self.after(0, self._finish)
            return

        mode_tag = "🤖 AIモード" if use_ai else "🔤 キーワードモード"
        self.after(0, self._log,
                   "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "head")
        self.after(0, self._log, f"  モード       : {mode_tag}", "info")
        self.after(0, self._log, f"  対象フォルダ  : {folder}", "info")
        self.after(0, self._log, f"  PDF ファイル数 : {len(pdf_files)} 件", "info")
        self.after(0, self._log,
                   "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n", "head")

        results = []
        for i, pdf_path in enumerate(pdf_files, 1):
            filename = os.path.basename(pdf_path)
            self.after(0, self._log, f"[{i}/{len(pdf_files)}] {filename}", "head")
            self.after(0, self._set_status,
                       f"🔄 {i}/{len(pdf_files)} {filename[:25]}…", ACCENT2)

            text = extract_text(pdf_path)
            chars = len(text.strip())
            self.after(0, self._log, f"  📄 テキスト: {chars} 文字", "info")

            if use_ai:
                # ── AI モード ──
                genre, err = classify_with_ai(client, filename, text)

                # 429 リトライ（1回）
                if err and err.startswith("RETRY_NEEDED:"):
                    parts    = err.split(":", 2)
                    wait_sec = int(parts[1])
                    self.after(0, self._log,
                               f"  ⏳ レート制限。{wait_sec}秒待ってリトライ…", "warn")
                    self.after(0, self._set_status, f"⏳ 待機中 {wait_sec}秒…", WARNING)
                    time.sleep(wait_sec)
                    genre, err = classify_with_ai(client, filename, text)

                # リトライ後もダメならキーワードにフォールバック
                if err:
                    if err.startswith("RETRY_NEEDED:") or "429" in err or "quota" in err.lower():
                        self.after(0, self._log,
                                   "  ⚠ APIクォータ枯渇 → キーワードモードで代替判定", "warn")
                        genre = keyword_classify(filename, text)
                    else:
                        self.after(0, self._log, f"  ⚠ API エラー: {err[:100]}", "error")
                        genre = keyword_classify(filename, text)
                        self.after(0, self._log, "  💡 キーワードモードで代替判定", "warn")

                    self.after(0, self._log, f"  🏷  ジャンル: 【{genre}】（代替）", "warn")
                else:
                    self.after(0, self._log, f"  🏷  ジャンル: 【{genre}】", "genre")

                if i < len(pdf_files):
                    time.sleep(REQUEST_INTERVAL)

            else:
                # ── キーワード モード ──
                genre = keyword_classify(filename, text)
                self.after(0, self._log, f"  🏷  ジャンル: 【{genre}】", "genre")

            dest_dir = os.path.join(folder, genre)
            try:
                dest = safe_move(pdf_path, dest_dir)
                self.after(0, self._log, f"  ✅ 移動完了 → {dest}\n", "success")
            except Exception as e:
                self.after(0, self._log, f"  ❌ 移動失敗: {e}\n", "error")
                genre = "移動失敗"

            results.append((filename, genre))

        # サマリー
        self.after(0, self._log,
                   "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "head")
        self.after(0, self._log, "  ✨  完了！振り分け結果", "head")
        self.after(0, self._log,
                   "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "head")

        genre_map: dict = {}
        for fname, g in results:
            genre_map.setdefault(g, []).append(fname)
        for g, files in sorted(genre_map.items()):
            self.after(0, self._log, f"\n  📁 {g}/  ({len(files)} ファイル)", "genre")
            for f in files:
                self.after(0, self._log, f"      - {f}", "info")

        self.after(0, self._set_status, "✅ 完了！", SUCCESS)
        self.after(0, self._finish)

    def _finish(self):
        self.start_btn.configure(state="normal", text="▶  スタート")


if __name__ == "__main__":
    app = App()
    app.mainloop()
