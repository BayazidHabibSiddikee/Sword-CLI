import os
import asyncio
from pathlib import Path
try:
    from PIL import Image
except ImportError:
    Image = None

async def fetch_screenshot_and_crop(url: str, output_path: str):
    """
    Uses camoufox (from the user's web-scraper tools) to visit a URL,
    take a screenshot, and crop out a central figure.
    """
    try:
        from camoufox.async_api import AsyncCamoufox
    except ImportError:
        print("Camoufox not installed. Cannot take screenshot.")
        return False
        
    print(f"Scraper: Visiting {url} for screenshot...")
    
    # We take a screenshot of the page, ideally targeting an image or standard content area
    try:
        async with AsyncCamoufox(headless=True) as browser:
            page = await browser.new_page()
            await page.goto(url, timeout=30000)
            
            # Wait for images to load
            await page.wait_for_load_state("networkidle", timeout=10000)
            
            # Try to find a prominent image (e.g., infobox image on Wikipedia, or main article image)
            img_element = await page.query_selector('table.infobox img, figure img, article img, main img')
            
            if img_element:
                print("Scraper: Found a prominent image, taking element screenshot.")
                await img_element.screenshot(path=output_path)
            else:
                print("Scraper: Taking full page screenshot and cropping...")
                temp_path = str(output_path) + "_temp.png"
                await page.screenshot(path=temp_path, full_page=False)
                
                # If PIL is available, crop the center of the viewport
                if Image and os.path.exists(temp_path):
                    with Image.open(temp_path) as img:
                        width, height = img.size
                        # Crop a 600x400 box from the center-top
                        left = (width - 600)/2
                        top = 100
                        right = (width + 600)/2
                        bottom = top + 400
                        img = img.crop((left, top, right, bottom))
                        img.save(output_path)
                    os.remove(temp_path)
                else:
                    # Rename if PIL is not there
                    os.rename(temp_path, output_path)
                    
        return True
    except Exception as e:
        print(f"Scraper error taking screenshot: {e}")
        return False

def get_theory_image(query: str, run_dir: str):
    """
    Finds a URL for the query, scrapes a screenshot, and returns the path.
    """
    output_path = os.path.join(run_dir, "figs", "theory_img.png")
    
    print(f"Scraper: Finding reference page for '{query}'...")
    try:
        from duckduckgo_search import DDGS
        results = DDGS().text(query, max_results=1)
        if not results:
            return ""
            
        first_url = results[0].get("href")
        if not first_url:
            return ""
            
        success = asyncio.run(fetch_screenshot_and_crop(first_url, output_path))
        if success and os.path.exists(output_path):
            return output_path
    except ImportError:
        print("Scraper: duckduckgo-search not installed. Skipping theory image.")
    except Exception as e:
        print(f"Scraper pipeline error: {e}")
        
    return ""
