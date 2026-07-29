import os
from google import genai
from google.genai import types
import httpx
import asyncio
import json
import math
from dotenv import load_dotenv
from logger import agent_logger

load_dotenv()

# Cấu hình Gemini SDK mới
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
client = None
if GEMINI_API_KEY:
    client = genai.Client(api_key=GEMINI_API_KEY)

FALLBACK_MODEL = "gemini-2.0-flash"  # Khi Gemma 500, dùng Gemini làm fallback


def calculate_atr(candles, period: int = 14) -> float:
    """Tính chỉ số ATR (Average True Range) từ danh sách nến [[ts, open, high, low, close, vol], ...]"""
    if hasattr(candles, 'tolist'):
        candles = candles.tolist()
    if candles is None or len(candles) < 2:
        return 10.0
    
    true_ranges = []
    for i in range(1, len(candles)):
        high = float(candles[i][2])
        low = float(candles[i][3])
        prev_close = float(candles[i - 1][4])
        tr = max(high - low, abs(high - prev_close), abs(low - prev_close))
        true_ranges.append(tr)
    
    recent_tr = true_ranges[-period:] if len(true_ranges) >= period else true_ranges
    return sum(recent_tr) / len(recent_tr) if recent_tr else 10.0


def calculate_swing_levels(candles, window: int = 50) -> tuple[float, float]:
    """Tính mốc Swing Low và Swing High của 50 nến gần nhất để có cản hỗ trợ/kháng cự chuẩn xác"""
    if hasattr(candles, 'tolist'):
        candles = candles.tolist()
    if candles is None or len(candles) == 0:
        return 0.0, 0.0
    
    recent = candles[-window:]
    lows = [float(c[3]) for c in recent]
    highs = [float(c[2]) for c in recent]
    return min(lows), max(highs)


async def call_agent(system_prompt: str, user_prompt: str, response_mime_type: str = "text/plain") -> str:
    """Gọi Gemma / Gemini API bất đồng bộ với retry & fallback."""
    if not client:
        return "MOCK_RESPONSE: Missing Gemini API Key"

    prompt = f"{system_prompt}\n\nUSER INPUT:\n{user_prompt}"

    # --- Primary: Gemma ---
    for attempt in range(3):
        try:
            response = await asyncio.to_thread(
                client.models.generate_content,
                model='gemma-4-31b-it',
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="text/plain",
                ),
            )
            return response.text
        except Exception as e:
            agent_logger.warning(f"Gemma API attempt {attempt + 1}/3 failed: {e}")
            if attempt < 2:
                await asyncio.sleep(2 ** attempt)

    # --- Fallback: Gemini ---
    agent_logger.warning(f"Gemma failed after 3 attempts — falling back to {FALLBACK_MODEL}")
    try:
        response = await asyncio.to_thread(
            client.models.generate_content,
            model=FALLBACK_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type=response_mime_type,
            ),
        )
        agent_logger.info(f"Fallback to {FALLBACK_MODEL} succeeded.")
        return response.text
    except Exception as fallback_err:
        agent_logger.error(f"Fallback {FALLBACK_MODEL} also failed: {fallback_err}")
        return f"ERROR: {str(fallback_err)}"


class TechnicalAgent:
    async def analyze(self, kronos_prediction: dict, recent_candles: list, interval: str) -> str:
        sys_prompt = "Bạn là Technical Analyst chuyên nghiệp. Hãy đọc dữ liệu nến và dự báo xu hướng. PHẦN PHÂN TÍCH PHẢI ĐƯỢC VIẾT HOÀN TOÀN BẰNG TIẾNG VIỆT."
        candles_str = "\n".join([f"Open: {c[1]}, High: {c[2]}, Low: {c[3]}, Close: {c[4]}, Vol: {c[5]}" for c in recent_candles[-20:]])
        user_prompt = f"Timeframe: {interval}\nKronos Quantum Trend: {kronos_prediction.get('trend')} (Confidence: {kronos_prediction.get('confidence')}%)\n20 nến gần nhất:\n{candles_str}"
        return await call_agent(sys_prompt, user_prompt)


class SentimentAgent:
    async def analyze(self, symbol: str) -> str:
        sys_prompt = "Bạn là Sentiment Analyst. Đánh giá tin tức thị trường và cộng đồng. PHẦN ĐÁNH GIÁ PHẢI ĐƯỢC VIẾT HOÀN TOÀN BẰNG TIẾNG VIỆT."
        from news_analyzer import fetch_crypto_news
        news = await fetch_crypto_news(symbol)
        user_prompt = f"Tin tức gần đây về {symbol}:\n{news}"
        return await call_agent(sys_prompt, user_prompt)


class TraderAgent:
    async def consult(
        self,
        symbol: str,
        interval: str,
        current_price: float,
        candles: list,
        kronos_prediction: dict,
        tech_analysis: str,
        sentiment_analysis: str,
    ) -> dict:
        """Lập Kế hoạch Cố vấn Trading hoàn chỉnh (AI Trading Blueprint)."""
        atr = calculate_atr(candles, 14)
        swing_low, swing_high = calculate_swing_levels(candles, 20)

        sys_prompt = (
            f"Bạn là Master AI Trading Consultant (Cố vấn Giao dịch Chuyên nghiệp). "
            f"Tài sản: {symbol} | Timeframe: {interval} | Giá hiện tại: {current_price}. "
            f"Chỉ số ATR(14) = {atr:.2f}. Mốc Swing Low 20 nến = {swing_low:.2f}, Swing High = {swing_high:.2f}. "
            "Dựa trên phân tích kỹ thuật và tin tức, hãy lập một Kế hoạch Giao dịch Vị thế (Trading Blueprint) hoàn chỉnh. "
            "QUY TẮC QUẢN TRỊ RỦI RO BẮT BUỘC:\n"
            "1. Khoảng cách Stop Loss (SL) KHÔNG ĐƯỢC quá hẹp (tối thiểu 0.8% - 1.5% hoặc ít nhất 2*ATR) để tránh bị quét râu nến (Stop Hunting).\n"
            "2. Với lệnh LONG, SL phải nằm dưới mốc Swing Low hỗ trợ. Với lệnh SHORT, SL phải nằm trên mốc Swing High kháng cự.\n"
            "Trả về ĐÚNG MỘT OBJECT JSON duy nhất không chứa bất kỳ văn bản nào khác ngoài JSON theo đúng định dạng:\n"
            "{\n"
            '  "recommendation": "LONG" | "SHORT" | "WAIT",\n'
            '  "confidence": 85,\n'
            '  "entryZone": {"minPrice": float, "maxPrice": float, "idealEntry": float},\n'
            '  "stopLoss": {"price": float, "percentage": float, "rationale": "Lý do đặt SL dựa trên Swing/ATR bằng Tiếng Việt"},\n'
            '  "takeProfit": [\n'
            '    {"level": "TP1 (50% Vị thế)", "price": float, "rrRatio": "1:1.5", "closePct": 50},\n'
            '    {"level": "TP2 (Chốt hết)", "price": float, "rrRatio": "1:2.5", "closePct": 50}\n'
            '  ],\n'
            '  "riskRewardRatio": 2.2,\n'
            '  "suggestedLeverage": "5x - 10x Cross",\n'
            '  "recommendedRiskPct": 1.5,\n'
            '  "analysisSummary": {\n'
            '    "candlestickPattern": "Lý do đọc nến bằng Tiếng Việt",\n'
            '    "technicalConfluence": "Chỉ số kỹ thuật bằng Tiếng Việt",\n'
            '    "newsSentiment": "Tâm lý tin tức bằng Tiếng Việt",\n'
            '    "keyWarning": "Cảnh báo sự kiện/biến động bằng Tiếng Việt"\n'
            '  }\n'
            "}"
        )

        user_prompt = f"Phân tích kỹ thuật:\n{tech_analysis}\n\nPhân tích tâm lý tin tức:\n{sentiment_analysis}"
        response_text = await call_agent(sys_prompt, user_prompt, response_mime_type="text/plain")

        try:
            clean_text = response_text.strip()
            if clean_text.startswith("```json"):
                clean_text = clean_text[7:]
            if clean_text.startswith("```"):
                clean_text = clean_text[3:]
            if clean_text.endswith("```"):
                clean_text = clean_text[:-3]

            plan = json.loads(clean_text.strip())
            if "recommendation" in plan and "entryZone" in plan and "stopLoss" in plan:
                plan["symbol"] = symbol
                plan["interval"] = interval
                
                # Safety check: enforce minimum SL distance (at least 0.8% or 2*ATR) to prevent noise stop-outs
                sl_dist = abs(current_price - float(plan["stopLoss"]["price"]))
                min_safe_dist = max(2.0 * atr, current_price * 0.008)
                if sl_dist < min_safe_dist:
                    is_long_plan = plan["recommendation"] == "LONG"
                    safe_sl_price = round(min(current_price - min_safe_dist, swing_low), 2) if is_long_plan else round(max(current_price + min_safe_dist, swing_high), 2)
                    safe_sl_pct = round(abs(current_price - safe_sl_price) / current_price * 100, 2)
                    plan["stopLoss"]["price"] = safe_sl_price
                    plan["stopLoss"]["percentage"] = safe_sl_pct
                    plan["stopLoss"]["rationale"] += f" (Đã tự động nới rộng SL an toàn >0.8% để tránh quét râu nến)."

                return plan
        except Exception as e:
            agent_logger.warning(f"TraderAgent consult JSON parse failed: {e}. Generating math-anchored fallback plan.")

        # Fallback Plan mathematically calculated using ATR and Swing levels
        is_long = kronos_prediction.get("trend") != "DOWN"
        rec = "LONG" if is_long else "SHORT"
        
        safe_dist = max(2.0 * atr, current_price * 0.01)
        sl_price = round(min(current_price - safe_dist, swing_low), 2) if is_long else round(max(current_price + safe_dist, swing_high), 2)
        sl_pct = round(abs(current_price - sl_price) / current_price * 100, 2)
        
        tp1_price = round(current_price + (current_price - sl_price) * 1.5, 2) if is_long else round(current_price - (sl_price - current_price) * 1.5, 2)
        tp2_price = round(current_price + (current_price - sl_price) * 2.5, 2) if is_long else round(current_price - (sl_price - current_price) * 2.5, 2)

        return {
            "symbol": symbol,
            "interval": interval,
            "recommendation": rec,
            "confidence": kronos_prediction.get("confidence", 80),
            "entryZone": {
                "minPrice": round(current_price * (0.998 if is_long else 1.001), 2),
                "maxPrice": round(current_price * (1.002 if is_long else 1.003), 2),
                "idealEntry": current_price,
            },
            "stopLoss": {
                "price": sl_price,
                "percentage": sl_pct,
                "rationale": f"Đặt dưới mốc hỗ trợ ATR({atr:.2f}) và Swing Low gần nhất ({swing_low:.2f})." if is_long else f"Đặt trên mốc kháng cự ATR({atr:.2f}) và Swing High gần nhất ({swing_high:.2f}).",
            },
            "takeProfit": [
                {"level": "TP1 (50% Vị thế)", "price": tp1_price, "rrRatio": "1:1.5", "closePct": 50},
                {"level": "TP2 (Chốt hết)", "price": tp2_price, "rrRatio": "1:2.5", "closePct": 50},
            ],
            "riskRewardRatio": 2.2,
            "suggestedLeverage": "5x - 10x Cross",
            "recommendedRiskPct": 1.5,
            "analysisSummary": {
                "candlestickPattern": tech_analysis[:150] if tech_analysis else "Tín hiệu nến ổn định tại vùng cản.",
                "technicalConfluence": f"Dự báo Kronos: {kronos_prediction.get('trend')} ({kronos_prediction.get('confidence')}%)",
                "newsSentiment": sentiment_analysis[:150] if sentiment_analysis else "Tâm lý tin tức ở mức trung tính.",
                "keyWarning": "Kiểm tra lại vùng giá Entry trước khi bấm duyệt đặt lệnh.",
            },
        }


async def send_discord_alert(webhook_url: str, message: str):
    if not webhook_url:
        return
    async with httpx.AsyncClient() as http:
        payload = {"content": message}
        await http.post(webhook_url, json=payload)


async def send_telegram_alert(bot_token: str, chat_id: str, message: str):
    if not bot_token or not chat_id:
        return
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {"chat_id": chat_id, "text": message}
    async with httpx.AsyncClient() as http:
        await http.post(url, json=payload)
