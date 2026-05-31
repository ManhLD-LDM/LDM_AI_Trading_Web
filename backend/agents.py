import os
import google.generativeai as genai
import httpx
import asyncio
from dotenv import load_dotenv

load_dotenv()

# Cấu hình Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    
# Sử dụng model flash miễn phí và nhanh
model = genai.GenerativeModel('gemini-1.5-flash')

async def call_agent(system_prompt: str, user_prompt: str) -> str:
    """Gọi Gemini API bất đồng bộ"""
    if not GEMINI_API_KEY:
        return "MOCK_RESPONSE: Missing Gemini API Key"
    
    try:
        # Wrap the synchronous call in a thread
        loop = asyncio.get_event_loop()
        prompt = f"{system_prompt}\n\nUSER INPUT:\n{user_prompt}"
        response = await loop.run_in_executor(None, lambda: model.generate_content(prompt))
        return response.text
    except Exception as e:
        print(f"Agent error: {e}")
        return f"ERROR: {str(e)}"

class TechnicalAgent:
    async def analyze(self, kronos_prediction: dict, price_data: dict) -> str:
        sys_prompt = "Bạn là Technical Analyst. Hãy phân tích dự đoán từ model lượng tử (Kronos) và giá hiện tại."
        user_prompt = f"Kronos dự báo trend: {kronos_prediction.get('trend')} với độ tin cậy {kronos_prediction.get('confidence')}%. Giá hiện tại: {price_data}."
        return await call_agent(sys_prompt, user_prompt)

class SentimentAgent:
    async def analyze(self, symbol: str) -> str:
        # Trong thực tế, có thể dùng CryptoPanic API hoặc News API
        # Ở đây mock tin tức cơ bản để AI phân tích
        sys_prompt = "Bạn là Sentiment Analyst. Dựa vào tin tức tiêu đề, hãy đánh giá tâm lý thị trường (Bullish, Bearish hay Neutral)."
        user_prompt = f"Tin tức gần đây về {symbol}: Lượng người dùng tăng, lạm phát Mỹ giảm, FED giữ nguyên lãi suất."
        return await call_agent(sys_prompt, user_prompt)

class TraderAgent:
    async def decide(self, tech_analysis: str, sentiment_analysis: str) -> dict:
        sys_prompt = "Bạn là Master Trader. Hãy đưa ra quyết định BUY, SELL hoặc HOLD dựa trên phân tích kỹ thuật và tâm lý. Trả về format JSON chứa action (BUY/SELL/HOLD), reason và confidence (0-100)."
        user_prompt = f"Kỹ thuật:\n{tech_analysis}\n\nTâm lý:\n{sentiment_analysis}"
        response_text = await call_agent(sys_prompt, user_prompt)
        
        # Trong thực tế, sẽ parse JSON từ response_text
        # Đây là fallback đơn giản:
        action = "HOLD"
        if "BUY" in response_text.upper():
            action = "BUY"
        elif "SELL" in response_text.upper():
            action = "SELL"
            
        return {
            "action": action,
            "reason": response_text[:200], # Truncate for safety
            "confidence": 80
        }

async def send_discord_alert(webhook_url: str, message: str):
    if not webhook_url: return
    async with httpx.AsyncClient() as client:
        payload = {"content": message}
        await client.post(webhook_url, json=payload)

async def send_telegram_alert(bot_token: str, chat_id: str, message: str):
    if not bot_token or not chat_id: return
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {"chat_id": chat_id, "text": message}
    async with httpx.AsyncClient() as client:
        await client.post(url, json=payload)
