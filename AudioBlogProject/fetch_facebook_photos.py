import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

# Configuration
URL = "https://www.facebook.com/fukushima.kumasanobu/photos"
MAX_PHOTOS = 1000  # Upper limit as requested
SCROLL_PAUSE_TIME = 2

def init_driver():
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--disable-gpu")
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=chrome_options)
    driver.get(URL)
    time.sleep(SCROLL_PAUSE_TIME)  # Wait for page load
    return driver

def scroll_to_load_all(driver):
    """Scrolls the page until no new photos are loaded or limit reached."""
    photos = set()
    last_height = driver.execute_script("return document.body.scrollHeight")
    while len(photos) < MAX_PHOTOS:
        # Scroll down
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(SCROLL_PAUSE_TIME)
        # Extract photo elements
        elems = driver.find_elements(By.XPATH, "//a[contains(@href, '/photo.php')]")
        for e in elems:
            href = e.get_attribute('href')
            if href:
                photos.add(href)
        # Check if we reached the bottom
        new_height = driver.execute_script("return document.body.scrollHeight")
        if new_height == last_height:
            break
        last_height = new_height
    return list(photos)[:MAX_PHOTOS]

def extract_captions(driver, photo_urls):
    """Visit each photo URL and extract its caption (if any)."""
    data = []
    for url in photo_urls:
        driver.get(url)
        time.sleep(SCROLL_PAUSE_TIME)
        try:
            caption_elem = driver.find_element(By.XPATH, "//div[contains(@class, 'userContent')]")
            caption = caption_elem.text.strip()
        except Exception:
            caption = ""
        data.append({"url": url, "caption": caption})
    return data

def main():
    driver = init_driver()
    try:
        photo_urls = scroll_to_load_all(driver)
        print(f"Found {len(photo_urls)} photo URLs (capped at {MAX_PHOTOS})")
        data = extract_captions(driver, photo_urls)
        # Output as Markdown table
        print("| No. | Photo URL | Caption |")
        print("| --- | --------- | ------- |")
        for i, item in enumerate(data, 1):
            caption = item["caption"].replace("|", "\\|")  # Escape pipe
            print(f"| {i} | {item['url']} | {caption} |")
    finally:
        driver.quit()

if __name__ == "__main__":
    main()
