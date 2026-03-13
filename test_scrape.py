
import requests
from bs4 import BeautifulSoup
import re

def search_movies(query):
    url = f"https://bollyflix.sarl/?s={query}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    }
    try:
        response = requests.get(url, headers=headers, timeout=10)
        soup = BeautifulSoup(response.text, 'html.parser')
        results = []
        for item in soup.select('h2.entry-title a'):
            results.append({
                'title': item.get_text().strip(),
                'link': item['href']
            })
        return results
    except Exception as e:
        return f"Error: {e}"

def get_movie_links(movie_url):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    }
    try:
        response = requests.get(movie_url, headers=headers, timeout=10)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Look for buttons that contain "Download Links" or "Google Drive"
        # Often these are <a> tags with specific classes or text
        links = []
        for btn in soup.select('a.maxbutton-1, a.maxbutton-2, a.maxbutton'):
            text = btn.get_text().strip()
            if "Download Links" in text or "Google Drive" in text or "G-Direct" in text:
                links.append({
                    'text': text,
                    'url': btn['href']
                })
        return links
    except Exception as e:
        return f"Error: {e}"

if __name__ == "__main__":
    query = "Avatar"
    print(f"Searching for: {query}")
    results = search_movies(query)
    if isinstance(results, list) and results:
        print(f"Found {len(results)} results.")
        first_movie = results[0]
        print(f"Getting links for: {first_movie['title']}")
        links = get_movie_links(first_movie['link'])
        print(f"Links found: {len(links)}")
        for l in links:
            print(f"- {l['text']}: {l['url']}")
    else:
        print(f"No results or error: {results}")
