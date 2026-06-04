import os
from google import genai
from google.genai import types
import httpx
import asyncio
import json
from dotenv import load_dotenv

load_dotenv()

# Cấu hình Gemini SDK mới
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
client = None
if GEMINI_API_KEY:
    client = genai.Client(api_key=GEMINI_API_KEY)

async def call_agent(system_prompt: str, user_prompt: str, response_mime_type: str = "text/plain") -> str:
    """Gọi Gemini API bất đồng bộ"""
    if not client:
        return "MOCK_RESPONSE: Missing Gemini API Key"
    
    try:
        prompt = f"{system_prompt}\n\nUSER INPUT:\n{user_prompt}"
        response = await asyncio.to_thread(
            client.models.generate_content,
            model='gemini-3.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type=response_mime_type,
            )
        )
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
        sys_prompt = "Bạn là Master Trader. Hãy đưa ra quyết định BUY, SELL hoặc HOLD dựa trên phân tích kỹ thuật và tâm lý. Trả về ĐÚNG MỘT object JSON chứa action (BUY/SELL/HOLD), reason và confidence (0-100)."
        user_prompt = f"Kỹ thuật:\n{tech_analysis}\n\nTâm lý:\n{sentiment_analysis}"
        response_text = await call_agent(sys_prompt, user_prompt, response_mime_type="application/json")
        
        try:
            decision = json.loads(response_text)
            return {
                "action": decision.get("action", "HOLD").upper(),
                "reason": decision.get("reason", "No reason provided")[:200],
                "confidence": int(decision.get("confidence", 80))
            }
        except Exception as e:
            print(f"Failed to parse JSON from TraderAgent: {e}. Fallback to HOLD.")
            return {
                "action": "HOLD",
                "reason": response_text[:200],
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
