import os
import time
import requests
from io import BytesIO
from PIL import Image
import pytesseract
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

# 設定
URL = "https://www.facebook.com/fukushima.kumasanobu/photos"
MAX_PHOTOS = 1000
SCROLL_PAUSE_TIME = 2

def init_driver():
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--disable-gpu")
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=chrome_options)
    driver.get(URL)
    time.sleep(SCROLL_PAUSE_TIME)
    return driver

def scroll_to_load_all(driver):
    photos = set()
    last_height = driver.execute_script("return document.body.scrollHeight")
    while len(photos) < MAX_PHOTOS:
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(SCROLL_PAUSE_TIME)
        elems = driver.find_elements(By.XPATH, "//a[contains(@href, '/photo.php')]")
        for e in elems:
            href = e.get_attribute('href')
            if href:
                photos.add(href)
        new_height = driver.execute_script("return document.body.scrollHeight")
        if new_height == last_height:
            break
        last_height = new_height
    return list(photos)[:MAX_PHOTOS]

def download_image(url):
    resp = requests.get(url, stream=True)
    resp.raise_for_status()
    return Image.open(BytesIO(resp.content)).convert('RGB')

def ocr_image(image):
    # pytesseract がインストールされ、tesseract 実行ファイルが PATH にある前提
    return pytesseract.image_to_string(image, lang='jpn')

def main():
    driver = init_driver()
    try:
        photo_urls = scroll_to_load_all(driver)
        print(f"Found {len(photo_urls)} photo URLs (capped at {MAX_PHOTOS})")
        # Markdown ヘッダー出力
        print("| No. | Photo URL | Extracted Text |")
        print("| --- | --------- | -------------- |")
        for i, url in enumerate(photo_urls, 1):
            # 画像ページへ遷移し、画像の直接リンクを取得
            driver.get(url)
            time.sleep(SCROLL_PAUSE_TIME)
            try:
                img_elem = driver.find_element(By.XPATH, "//img[contains(@src, 'scontent')]")
                img_url = img_elem.get_attribute('src')
            except Exception:
                img_url = None
            extracted = ""
            if img_url:
                try:
                    img = download_image(img_url)
                    extracted = ocr_image(img).strip().replace("|", "\\|")
                except Exception as e:
                    extracted = f"Error: {e}"
            print(f"| {i} | {url} | {extracted} |")
    finally:
        driver.quit()

if __name__ == "__main__":
    main()
