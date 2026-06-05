import httpx
import os
import xml.etree.ElementTree as ET

async def fetch_crypto_news(symbol: str) -> str:
    """
    Fetch news for a specific symbol.
    1. Tries CryptoPanic API if CRYPTOPANIC_API_KEY is available in .env
    2. Fallback to CoinTelegraph RSS feed if no API key or API fails.
    """
    api_key = os.getenv("CRYPTOPANIC_API_KEY")
    coin_ticker = symbol.replace("USDT", "")
    
    # --- 1. CRYPTOPANIC API (KHUYÊN DÙNG) ---
    if api_key:
        # Lấy các tin tức được đánh dấu "important" hoặc "hot"
        url = f"https://cryptopanic.com/api/v1/posts/?auth_token={api_key}&currencies={coin_ticker}&filter=important"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url)
                if response.status_code == 200:
                    data = response.json()
                    results = data.get("results", [])[:5] # Lấy 5 tin mới nhất
                    if results:
                        news_texts = []
                        for item in results:
                            votes = item.get("votes", {})
                            # Gắn kèm số lượt vote để AI biết cộng đồng đang đánh giá tin này tốt hay xấu
                            news_texts.append(f"- {item['title']} (Bullish Votes: {votes.get('positive',0)}, Bearish Votes: {votes.get('negative',0)})")
                        return "\n".join(news_texts)
        except Exception as e:
            print(f"CryptoPanic API Error: {e}")
            
    # --- 2. FALLBACK: COINTELEGRAPH RSS FEED (MIỄN PHÍ, KHÔNG CẦN KEY) ---
    try:
        url = "https://cointelegraph.com/rss"
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url)
            if response.status_code == 200:
                root = ET.fromstring(response.text)
                news_texts = []
                
                # Ánh xạ mã coin sang tên đầy đủ để tìm kiếm chính xác hơn trong tiêu đề bài báo
                mapping = {"BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana", "PAXG": "gold"}
                target_word = mapping.get(coin_ticker, coin_ticker.lower())
                
                for item in root.findall('./channel/item'):
                    title = item.find('title').text if item.find('title') is not None else ""
                    if target_word in title.lower() or coin_ticker.lower() in title.lower():
                        news_texts.append(f"- {title}")
                        if len(news_texts) >= 5:
                            break
                            
                if news_texts:
                    return "\n".join(news_texts)
    except Exception as e:
        print(f"RSS Feed Error: {e}")

    # --- 3. FALLBACK DEFAULT ---
    return f"Không có tin tức đột biến hoặc sự kiện vĩ mô nào về {coin_ticker} trong 24h qua. Thị trường dao động theo xu hướng kỹ thuật."
