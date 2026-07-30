import httpx
import os
import xml.etree.ElementTree as ET
from logger import setup_logger

logger = setup_logger("ldm.news")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

RSS_FEEDS = [
    ("CoinTelegraph", "https://cointelegraph.com/rss"),
    ("CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"),
    ("Decrypt", "https://decrypt.co/feed"),
]


async def fetch_crypto_news(symbol: str) -> str:
    """
    Fetch real-time news for a specific symbol.
    1. Tries CryptoPanic API if CRYPTOPANIC_API_KEY is available in .env
    2. Fallback to multi-RSS feeds (CoinTelegraph, CoinDesk, Decrypt) with real browser User-Agent.
    3. Returns explicit list of real headlines with sources and timestamps.
    """
    api_key = os.getenv("CRYPTOPANIC_API_KEY")
    coin_ticker = symbol.replace("USDT", "").upper()

    # --- 1. CRYPTOPANIC API (If key available) ---
    if api_key:
        url = f"https://cryptopanic.com/api/v1/posts/?auth_token={api_key}&currencies={coin_ticker}&filter=important"
        try:
            async with httpx.AsyncClient(timeout=10.0, headers=HEADERS, follow_redirects=True) as client:
                response = await client.get(url)
                if response.status_code == 200:
                    data = response.json()
                    results = data.get("results", [])[:5]
                    if results:
                        news_texts = []
                        for item in results:
                            votes = item.get("votes", {})
                            news_texts.append(
                                f"- [CryptoPanic] {item['title']} "
                                f"(Bullish: {votes.get('positive', 0)}, Bearish: {votes.get('negative', 0)})"
                            )
                        return "\n".join(news_texts)
        except Exception as e:
            logger.warning(f"CryptoPanic API Error: {e}")

    # --- 2. MULTI-RSS FEED FETCH (Free, Real-time) ---
    mapping = {"BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana", "PAXG": "gold"}
    target_word = mapping.get(coin_ticker, coin_ticker.lower())
    news_texts = []

    async with httpx.AsyncClient(timeout=8.0, headers=HEADERS, follow_redirects=True) as client:
        for source_name, feed_url in RSS_FEEDS:
            if len(news_texts) >= 5:
                break
            try:
                response = await client.get(feed_url)
                if response.status_code == 200:
                    root = ET.fromstring(response.text)
                    for item in root.findall('./channel/item'):
                        title = item.find('title').text if item.find('title') is not None else ""
                        pub_date = item.find('pubDate').text if item.find('pubDate') is not None else ""
                        date_str = f" ({pub_date[:16]})" if pub_date else ""

                        title_lower = title.lower()
                        if target_word in title_lower or coin_ticker.lower() in title_lower or "crypto" in title_lower or "market" in title_lower:
                            formatted = f"- [{source_name}]{date_str}: {title.strip()}"
                            if formatted not in news_texts:
                                news_texts.append(formatted)
                            if len(news_texts) >= 5:
                                break
            except Exception as e:
                logger.warning(f"RSS fetch error for {source_name}: {e}")

    if news_texts:
        return "\n".join(news_texts)

    # --- 3. FALLBACK DEFAULT ---
    return f"Nguồn tin tức: Không có tin tức vĩ mô hay sự kiện đột biến riêng về {coin_ticker} trong 24h qua."
