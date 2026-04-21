"""
pdf_genre_sorter.py
====================
指定フォルダ内の PDF を Gemini AI でジャンル判定し、
自動的にサブフォルダに振り分けるスクリプト。

使い方:
    python pdf_genre_sorter.py <対象フォルダのパス>

例:
    python pdf_genre_sorter.py "D:\\MyPDFs"
"""

import sys
import os
import re
import shutil
import fitz           # PyMuPDF
import google.generativeai as genai

# ================================================================
# ★ Gemini API キーをここに設定してください ★
# 環境変数 GEMINI_API_KEY でも OK
# ================================================================
API_KEY = os.environ.get("GEMINI_API_KEY", "YOUR_API_KEY_HERE")

# 1ファイルあたりに読み込む最大文字数（多すぎると API コストが増える）
MAX_CHARS_PER_PDF = 3000

# 不明ファイルを入れるフォルダ名
UNKNOWN_FOLDER = "不明"


def extract_text(pdf_path: str) -> str:
    """PyMuPDF で PDF からテキストを抽出（最大 MAX_CHARS_PER_PDF 文字）"""
    text_parts = []
    try:
        with fitz.open(pdf_path) as doc:
            for page in doc:
                text_parts.append(page.get_text())
                if sum(len(t) for t in text_parts) >= MAX_CHARS_PER_PDF:
                    break
    except Exception as e:
        print(f"  [警告] テキスト抽出失敗: {e}")
    full_text = " ".join(text_parts)
    return full_text[:MAX_CHARS_PER_PDF]


def classify_genre(model, filename: str, text: str) -> str:
    """
    Gemini にジャンルを判定してもらう。
    フォルダ名として使える短い日本語カテゴリ名を返す。
    """
    prompt = f"""
以下のPDFファイルのファイル名と内容（抜粋）を読んで、このPDFが属するジャンル（カテゴリ）を
**日本語で1〜4語**の短いフォルダ名として答えてください。

ルール:
- フォルダ名として使えるシンプルな名称にする（例: 技術書, 小説, 料理レシピ, 医療・健康, ビジネス, 法律, 旅行ガイド, マンガ, 学術論文, 語学, 契約書, マニュアル など）
- ジャンルが判断できない場合は「{UNKNOWN_FOLDER}」とだけ答えてください
- 回答はフォルダ名のみ。説明不要。

ファイル名: {filename}

内容（抜粋）:
{text if text.strip() else "（テキストなし・スキャン画像の可能性あり）"}
"""
    try:
        response = model.generate_content(prompt)
        genre = response.text.strip()
        # ファイル名に使えない文字を除去
        genre = re.sub(r'[\\/:*?"<>|]', '', genre)
        genre = genre.strip()
        return genre if genre else UNKNOWN_FOLDER
    except Exception as e:
        print(f"  [API エラー] {e}")
        return UNKNOWN_FOLDER


def safe_move(src: str, dest_dir: str):
    """ファイルを dest_dir に移動（同名ファイルがある場合は連番を付ける）"""
    os.makedirs(dest_dir, exist_ok=True)
    basename = os.path.basename(src)
    dest = os.path.join(dest_dir, basename)

    if os.path.abspath(src) == os.path.abspath(dest):
        return  # 移動先が同じ

    # 同名ファイルがある場合は連番を付ける
    if os.path.exists(dest):
        name, ext = os.path.splitext(basename)
        i = 1
        while os.path.exists(dest):
            dest = os.path.join(dest_dir, f"{name}_{i}{ext}")
            i += 1

    shutil.move(src, dest)
    print(f"  → 移動先: {dest}")


def main():
    if len(sys.argv) < 2:
        print("使い方: python pdf_genre_sorter.py <フォルダのパス>")
        sys.exit(1)

    target_dir = sys.argv[1]

    if not os.path.isdir(target_dir):
        print(f"[エラー] フォルダが見つかりません: {target_dir}")
        sys.exit(1)

    if API_KEY == "YOUR_API_KEY_HERE":
        print("[エラー] Gemini API キーが設定されていません。")
        print("  スクリプト内の API_KEY を編集するか、")
        print("  環境変数 GEMINI_API_KEY を設定してください。")
        sys.exit(1)

    # Gemini 設定
    genai.configure(api_key=API_KEY)
    model = genai.GenerativeModel("gemini-1.5-flash")

    # PDF ファイル一覧（サブフォルダを含む場合は walk に変更）
    pdf_files = [
        os.path.join(target_dir, f)
        for f in os.listdir(target_dir)
        if f.lower().endswith(".pdf") and os.path.isfile(os.path.join(target_dir, f))
    ]

    if not pdf_files:
        print("PDF ファイルが見つかりませんでした。")
        sys.exit(0)

    print(f"\n対象フォルダ: {target_dir}")
    print(f"PDF ファイル数: {len(pdf_files)}\n")
    print("=" * 60)

    results = []

    for i, pdf_path in enumerate(pdf_files, 1):
        filename = os.path.basename(pdf_path)
        print(f"[{i}/{len(pdf_files)}] {filename}")

        # テキスト抽出
        text = extract_text(pdf_path)
        char_count = len(text.strip())
        print(f"  テキスト抽出: {char_count} 文字")

        # ジャンル判定
        genre = classify_genre(model, filename, text)
        print(f"  ジャンル判定: 【{genre}】")

        # ファイル移動
        dest_dir = os.path.join(target_dir, genre)
        safe_move(pdf_path, dest_dir)
        results.append((filename, genre))

    # 結果サマリー
    print("\n" + "=" * 60)
    print("完了！振り分け結果サマリー:")
    genre_map: dict[str, list[str]] = {}
    for fname, genre in results:
        genre_map.setdefault(genre, []).append(fname)
    for genre, files in sorted(genre_map.items()):
        print(f"\n📁 {genre}/ ({len(files)} ファイル)")
        for f in files:
            print(f"    - {f}")


if __name__ == "__main__":
    main()
