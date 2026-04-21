import os
import win32com.client

def export_slides(pptx_path, target_slides, output_dir):
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    # Convert to absolute path
    pptx_path = os.path.abspath(pptx_path)
    output_dir = os.path.abspath(output_dir)

    print("Opening PowerPoint application...")
    powerpoint = win32com.client.Dispatch("PowerPoint.Application")
    
    print(f"Opening presentation: {pptx_path}")
    presentation = powerpoint.Presentations.Open(pptx_path, WithWindow=False)

    try:
        for slide_num in target_slides:
            # Slides are 1-indexed in COM
            try:
                slide = presentation.Slides(slide_num)
                output_path = os.path.join(output_dir, f"slide_{slide_num}.png")
                slide.Export(output_path, "PNG")
                print(f"Exported: {output_path}")
            except Exception as e:
                print(f"Failed to export slide {slide_num}: {e}")
    finally:
        presentation.Close()
        # powerpoint.Quit() - better not to quit in case user has other presentations open.

if __name__ == "__main__":
    pptx_file = r"C:\Users\tetsu\Desktop\尾瀬デュエル：地域課題を「連鎖」で解き明かす振り返りセッション デザイン変更_zh-TW.pptx"
    out_dir = r"C:\Users\tetsu\Desktop\翻訳対象スライド画像"
    slides_to_extract = [1, 3, 4, 5, 6, 23]
    
    export_slides(pptx_file, slides_to_extract, out_dir)
    print("Done!")
