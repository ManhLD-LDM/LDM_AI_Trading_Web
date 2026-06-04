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
            model='gemini-2.5-flash-lite',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type=response_mime_type,
            )
        )
        return response.text
    except Exception as e:
        print(f"Agent error: {e}")
        if response_mime_type == "application/json":
            return json.dumps({"action": "HOLD", "reason": f"API Quota/Error: {str(e)[:100]}", "confidence": 50})
        return f"ERROR: {str(e)}"

class TechnicalAgent:
    async def analyze(self, kronos_prediction: dict, recent_candles: list, interval: str) -> str:
        sys_prompt = "Bạn là Technical Analyst. Hãy phân tích dự đoán từ model lượng tử (Kronos) và dữ liệu nến gần nhất."
        candles_str = "\n".join([f"Open: {c[0]}, High: {c[1]}, Low: {c[2]}, Close: {c[3]}, Vol: {c[4]}" for c in recent_candles])
        user_prompt = f"Khung thời gian (Timeframe): {interval}\nKronos dự báo trend: {kronos_prediction.get('trend')} với độ tin cậy {kronos_prediction.get('confidence')}%. \n{len(recent_candles)} nến gần nhất:\n{candles_str}"
        return await call_agent(sys_prompt, user_prompt)

class SentimentAgent:
    async def analyze(self, symbol: str) -> str:
        sys_prompt = "Bạn là Sentiment Analyst. Dựa vào tin tức tiêu đề, hãy đánh giá tâm lý thị trường (Bullish, Bearish hay Neutral)."
        import random
        scenarios = [
            f"Lượng người dùng {symbol} tăng mạnh, các quỹ ETF tiếp tục mua vào.",
            f"Thị trường lo ngại về quy định mới của SEC, dòng tiền rút khỏi {symbol}.",
            f"Thị trường đi ngang, khối lượng giao dịch {symbol} sụt giảm chờ tin tức vĩ mô.",
            f"Cá voi vừa chuyển một lượng lớn {symbol} lên sàn giao dịch, áp lực bán tăng.",
            f"Bản nâng cấp mạng lưới mới của {symbol} thành công tốt đẹp, phí giao dịch giảm mạnh."
        ]
        news = random.choice(scenarios)
        user_prompt = f"Tin tức gần đây về {symbol}: {news}"
        return await call_agent(sys_prompt, user_prompt)

class TraderAgent:
    async def decide(self, tech_analysis: str, sentiment_analysis: str, interval: str) -> dict:
        sys_prompt = f"Bạn là Master Trader giao dịch trên khung thời gian {interval}. Hãy đưa ra quyết định BUY, SELL hoặc HOLD dựa trên phân tích kỹ thuật và tâm lý. Khung thời gian nhỏ (1m, 5m, 15m) thì ưu tiên lướt sóng, khung thời gian lớn (1h, 4h, 1d) thì đánh theo xu hướng. Trả về ĐÚNG MỘT object JSON chứa action (BUY/SELL/HOLD), reason và confidence (0-100)."
        user_prompt = f"Khung thời gian giao dịch: {interval}\n\nKỹ thuật:\n{tech_analysis}\n\nTâm lý:\n{sentiment_analysis}"
        response_text = await call_agent(sys_prompt, user_prompt, response_mime_type="application/json")
        
        try:
            decision = json.loads(response_text)
            return {
                "action": decision.get("action", "HOLD").upper(),
                "reason": decision.get("reason", "No reason provided"),
                "confidence": int(decision.get("confidence", 80))
            }
        except Exception as e:
            print(f"Failed to parse JSON from TraderAgent: {e}. Fallback to HOLD.")
            return {
                "action": "HOLD",
                "reason": response_text,
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
