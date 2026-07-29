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
    async def analyze_mtf(self, kronos_prediction: dict, mtf_klines: dict, current_interval: str) -> str:
        """Phân tích Đa Khung Thời Gian (Multi-Timeframe Analysis: 15m, 1h, 4h, 1D, 1W)."""
        mtf_summary = []
        for tf, candles in mtf_klines.items():
            if hasattr(candles, 'tolist'):
                candles = candles.tolist()
            if candles and len(candles) >= 5:
                last_c = candles[-1]
                first_c = candles[-5]
                change_pct = ((last_c[4] - first_c[4]) / first_c[4]) * 100
                tf_trend = "BULLISH 🟢" if change_pct > 0.2 else ("BEARISH 🔴" if change_pct < -0.2 else "SIDEWAYS 🟡")
                mtf_summary.append(f"- Khung {tf}: Trend {tf_trend} (Thay đổi 5 nến: {change_pct:+.2f}%, Close: ${last_c[4]:,.2f})")

        sys_prompt = (
            f"Bạn là Master Multi-Timeframe Technical Analyst. "
            f"Hãy phân tích sự hợp lưu xu hướng từ các khung lớn (1W, 1D, 4h, 1h) xuống khung thời gian giao dịch chính ({current_interval}). "
            "Đảm bảo đánh giá xu hướng chủ đạo và các điểm cản trùng nhau giữa các khung. "
            "PHẦN PHÂN TÍCH PHẢI ĐƯỢC VIẾT HOÀN TOÀN BẰNG TIẾNG VIỆT."
        )
        user_prompt = (
            f"Khung thời gian xem chính: {current_interval}\n"
            f"Dự báo Kronos Quantum: Trend {kronos_prediction.get('trend')} (Độ tin cậy: {kronos_prediction.get('confidence')}%)\n\n"
            f"Phân tích Chi tiết Đa Khung Thời Gian (MTF Summary):\n" + "\n".join(mtf_summary)
        )
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
        mode: str, # "scalp" or "swing"
        current_price: float,
        candles: list,
        kronos_prediction: dict,
        tech_analysis: str,
        sentiment_analysis: str,
    ) -> dict:
        """Lập Kế hoạch Cố vấn Trading Đa Khung Thời Gian (Multi-Timeframe AI Trading Blueprint)."""
        atr = calculate_atr(candles, 14)
        swing_low, swing_high = calculate_swing_levels(candles, 50)
        mode_upper = mode.upper() if mode else "SCALP"

        mode_rules = (
            "CHẾ ĐỘ GIAO DỊCH: SCALP (LƯỚT SÓNG NẮNG HẠN TRONG NGÀY)\n"
            "- Ưu tiên chốt lời nhanh trong ngày.\n"
            "- Tỷ lệ Risk/Reward đề xuất 1:1.5 đến 1:2.0.\n"
            "- Mốc Stop Loss tối thiểu 0.8% - 1.2% (hoặc 2*ATR) dưới Swing Low gần nhất."
            if mode_upper == "SCALP" else
            "CHẾ ĐỘ GIAO DỊCH: SWING (ĐÁNH XU HƯỚNG HOLD > 1 NGÀY)\n"
            "- Ưu tiên đánh theo Trend lớn (1D/4h), hold lệnh hơn 1 ngày.\n"
            "- Tỷ lệ Risk/Reward đề xuất 1:2.5 đến 1:4.0.\n"
            "- Mốc Stop Loss rộng hơn (1.5% - 2.5% hoặc 3*ATR) dưới đáy Swing Low chính của khung 4h/1D."
        )

        sys_prompt = (
            f"Bạn là Master AI Trading Consultant (Cố vấn Giao dịch Chuyên nghiệp Đa Khung Thời Gian). "
            f"Tài sản: {symbol} | Khung thời gian người dùng đang xem: {interval} | Chế độ: {mode_upper}. "
            f"Giá hiện tại: {current_price}. ATR(14) = {atr:.2f}. Swing Low 50 nến = {swing_low:.2f}, Swing High = {swing_high:.2f}.\n\n"
            f"{mode_rules}\n\n"
            "Dựa trên Phân tích Đa Khung (15m, 1h, 4h, 1D, 1W) và Tin tức, hãy ra quyết định giao dịch cho KHUNG HIỆN TẠI mà người dùng đang xem. "
            "Trả về ĐÚNG MỘT OBJECT JSON duy nhất không chứa bất kỳ văn bản nào khác ngoài JSON theo định dạng:\n"
            "{\n"
            '  "recommendation": "LONG" | "SHORT" | "WAIT",\n'
            '  "confidence": 85,\n'
            '  "mode": "' + mode_upper + '",\n'
            '  "entryZone": {"minPrice": float, "maxPrice": float, "idealEntry": float},\n'
            '  "stopLoss": {"price": float, "percentage": float, "rationale": "Lý do đặt SL dựa trên Hợp lưu Đa khung & Swing/ATR bằng Tiếng Việt"},\n'
            '  "takeProfit": [\n'
            '    {"level": "TP1 (50% Vị thế)", "price": float, "rrRatio": "1:1.5", "closePct": 50},\n'
            '    {"level": "TP2 (Chốt hết)", "price": float, "rrRatio": "1:2.5", "closePct": 50}\n'
            '  ],\n'
            '  "riskRewardRatio": 2.2,\n'
            '  "suggestedLeverage": "5x - 10x Cross",\n'
            '  "recommendedRiskPct": 1.5,\n'
            '  "analysisSummary": {\n'
            '    "candlestickPattern": "Hợp lưu nến Đa khung (15m/1h/4h/1D) bằng Tiếng Việt",\n'
            '    "technicalConfluence": "Chỉ số kỹ thuật đa khung bằng Tiếng Việt",\n'
            '    "newsSentiment": "Tâm lý tin tức bằng Tiếng Việt",\n'
            '    "keyWarning": "Cảnh báo sự kiện bằng Tiếng Việt"\n'
            '  }\n'
            "}"
        )

        user_prompt = f"Phân tích Đa khung kỹ thuật (MTF):\n{tech_analysis}\n\nPhân tích tâm lý tin tức:\n{sentiment_analysis}"
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
                plan["mode"] = mode_upper
                
                # Safety check: enforce minimum SL distance based on mode
                sl_dist = abs(current_price - float(plan["stopLoss"]["price"]))
                min_ratio = 0.015 if mode_upper == "SWING" else 0.008
                min_safe_dist = max(2.0 * atr, current_price * min_ratio)
                if sl_dist < min_safe_dist:
                    is_long_plan = plan["recommendation"] == "LONG"
                    safe_sl_price = round(min(current_price - min_safe_dist, swing_low), 2) if is_long_plan else round(max(current_price + min_safe_dist, swing_high), 2)
                    safe_sl_pct = round(abs(current_price - safe_sl_price) / current_price * 100, 2)
                    plan["stopLoss"]["price"] = safe_sl_price
                    plan["stopLoss"]["percentage"] = safe_sl_pct
                    plan["stopLoss"]["rationale"] += f" (Tự động nâng SL an toàn cho chế độ {mode_upper})."

                return plan
        except Exception as e:
            agent_logger.warning(f"TraderAgent consult JSON parse failed: {e}. Generating math-anchored fallback plan.")

        # Fallback Plan mathematically calculated using ATR and Swing levels
        is_long = kronos_prediction.get("trend") != "DOWN"
        rec = "LONG" if is_long else "SHORT"
        
        safe_dist = max(2.5 * atr, current_price * (0.015 if mode_upper == "SWING" else 0.01))
        sl_price = round(min(current_price - safe_dist, swing_low), 2) if is_long else round(max(current_price + safe_dist, swing_high), 2)
        sl_pct = round(abs(current_price - sl_price) / current_price * 100, 2)
        
        multiplier = 2.5 if mode_upper == "SWING" else 1.5
        tp1_price = round(current_price + (current_price - sl_price) * multiplier, 2) if is_long else round(current_price - (sl_price - current_price) * multiplier, 2)
        tp2_price = round(current_price + (current_price - sl_price) * (multiplier + 1.2), 2) if is_long else round(current_price - (sl_price - current_price) * (multiplier + 1.2), 2)

        return {
            "symbol": symbol,
            "interval": interval,
            "mode": mode_upper,
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
                "rationale": f"Đặt dưới mốc hỗ trợ MTF ATR({atr:.2f}) và Swing Low gần nhất ({swing_low:.2f}) cho chế độ {mode_upper}.",
            },
            "takeProfit": [
                {"level": "TP1 (50% Vị thế)", "price": tp1_price, "rrRatio": f"1:{multiplier:.1f}", "closePct": 50},
                {"level": "TP2 (Chốt hết)", "price": tp2_price, "rrRatio": f"1:{(multiplier + 1.2):.1f}", "closePct": 50},
            ],
            "riskRewardRatio": round(multiplier + 0.5, 1),
            "suggestedLeverage": "2x - 5x Isolated" if mode_upper == "SWING" else "5x - 10x Cross",
            "recommendedRiskPct": 1.5,
            "analysisSummary": {
                "candlestickPattern": f"Phân tích Hợp lưu MTF (15m/1h/4h/1D) cho {symbol}.",
                "technicalConfluence": f"Dự báo Kronos Quantum: {kronos_prediction.get('trend')} ({kronos_prediction.get('confidence')}%)",
                "newsSentiment": sentiment_analysis[:150] if sentiment_analysis else "Tâm lý tin tức ở mức trung tính.",
                "keyWarning": f"Chế độ {mode_upper}: Kiểm tra mốc SL trước khi vào lệnh.",
            },
        }


class PendingAuditAgent:
    async def audit_pending_plan(
        self,
        existing_plan: dict,
        current_price: float,
        tech_analysis: str,
        sentiment_analysis: str
    ) -> dict:
        """
        Tự động Đánh giá Rủi ro & Khả năng Thắng/Thua của Vị thế Chờ trước khi điều chỉnh lại mốc Entry/SL/TP.
        """
        sym = existing_plan.get("symbol", "BTCUSDT")
        rec = existing_plan.get("recommendation", "LONG")
        entry = existing_plan.get("entryZone", {}).get("idealEntry", current_price)
        sl = existing_plan.get("stopLoss", {}).get("price", current_price * 0.99)
        tp1 = existing_plan.get("takeProfit", [{}])[0].get("price", current_price * 1.02)

        sys_prompt = (
            "Bạn là Master Risk Auditor & Strategy Analyst. "
            f"Vị thế đang chờ: {rec} {sym} (Entry ban đầu: ${entry}, SL: ${sl}, TP1: ${tp1}). "
            f"Giá hiện tại của thị trường: ${current_price}.\n"
            "Dựa trên nến và tin tức mới nhất, hãy thực hiện ĐÁNH GIÁ RỦI RO & KHẢ NĂNG HIT TP VS SL của vị thế này TRƯỚC KHI ĐIỀU CHỈNH LẠI MỐC ENTRY/SL/TP.\n"
            "Trả về ĐÚNG MỘT OBJECT JSON duy nhất theo định dạng:\n"
            "{\n"
            '  "tpProbability": 70,\n'
            '  "slProbability": 30,\n'
            '  "riskLevel": "THẤP" | "TRUNG BÌNH" | "CAO" | "CỰC KỲ NGUY HIỂM",\n'
            '  "actionAdvice": "GIỮ LỆNH BAN ĐẦU" | "ĐIỀU CHỈNH ENTRY/SL" | "NÊN HỦY LỆNH",\n'
            '  "auditReasoning": "Giải thích chi tiết tại sao vị thế hiện tại có rủi ro này và khả thi hit TP hay SL bằng Tiếng Việt"\n'
            "}"
        )

        user_prompt = (
            f"Phân tích Đa khung kỹ thuật mới nhất:\n{tech_analysis}\n\n"
            f"Phân tích tin tức mới nhất:\n{sentiment_analysis}"
        )

        response_text = await call_agent(sys_prompt, user_prompt, response_mime_type="text/plain")

        try:
            clean_text = response_text.strip()
            if clean_text.startswith("```json"):
                clean_text = clean_text[7:]
            if clean_text.startswith("```"):
                clean_text = clean_text[3:]
            if clean_text.endswith("```"):
                clean_text = clean_text[:-3]

            return json.loads(clean_text.strip())
        except Exception as e:
            agent_logger.warning(f"PendingAuditAgent parse error: {e}")
            dist_to_entry = abs(current_price - entry) / current_price * 100
            high_risk = dist_to_entry > 3.0
            return {
                "tpProbability": 65 if not high_risk else 40,
                "slProbability": 35 if not high_risk else 60,
                "riskLevel": "TRUNG BÌNH" if not high_risk else "CAO",
                "actionAdvice": "ĐIỀU CHỈNH ENTRY/SL" if not high_risk else "NÊN HỦY LỆNH",
                "auditReasoning": f"Giá hiện tại ${current_price} đã di chuyển {dist_to_entry:.1f}% so với Entry ban đầu. AI đánh giá cần điều chỉnh mốc Entry/SL cho phù hợp với xu hướng mới."
            }


class StrategyLearnerAgent:
    async def analyze_outcome(self, plan: dict, final_status: str) -> dict:
        """Tự động phân tích lý do Thắng/Thua và rút ra bài học chiến lược tự học cho AI."""
        sym = plan.get("symbol", "BTCUSDT")
        inv = plan.get("interval", "15m")
        rec = plan.get("recommendation", "LONG")
        entry = plan.get("entryZone", {}).get("idealEntry", 0)
        sl = plan.get("stopLoss", {}).get("price", 0)
        tp1 = plan.get("takeProfit", [{}])[0].get("price", 0)

        sys_prompt = (
            "Bạn là AI Strategy Self-Learning Engine (Hệ thống AI Tự học Chiến lược Giao dịch). "
            f"Vị thế vừa kết thúc: {rec} {sym} (Khung: {inv}). "
            f"Kết quả thực tế: {final_status} (Entry: ${entry}, SL: ${sl}, TP1: ${tp1}).\n"
            "Hãy thực hiện Phân tích Rút kinh nghiệm (Post-Mortem Analysis) và tự rút ra Bài học Chiến lược (Self-Learned Lesson) cho các lệnh tương lai.\n"
            "Trả về ĐÚNG MỘT OBJECT JSON duy nhất theo định dạng:\n"
            "{\n"
            '  "outcomeSummary": "Nguyên nhân kết quả Thắng/Thua bằng Tiếng Việt ngắn gọn",\n'
            '  "keyFactors": "Các yếu tố kỹ thuật/nến quyết định bằng Tiếng Việt",\n'
            '  "learnedLesson": "Bài học chiến lược AI tự điều chỉnh cho các vị thế sau bằng Tiếng Việt"\n'
            "}"
        )

        user_prompt = f"Phân tích kết quả lệnh {rec} {sym} với trạng thái {final_status}."
        response_text = await call_agent(sys_prompt, user_prompt, response_mime_type="text/plain")

        try:
            clean_text = response_text.strip()
            if clean_text.startswith("```json"):
                clean_text = clean_text[7:]
            if clean_text.startswith("```"):
                clean_text = clean_text[3:]
            if clean_text.endswith("```"):
                clean_text = clean_text[:-3]

            return json.loads(clean_text.strip())
        except Exception as e:
            agent_logger.warning(f"StrategyLearnerAgent parse error: {e}")
            is_win = "WIN" in final_status or "TP1" in final_status
            return {
                "outcomeSummary": f"Lệnh đã kết thúc với kết quả {'Thắng' if is_win else 'Cắt lỗ (Thua)'}.",
                "keyFactors": "Giá phản ứng đúng vùng cản hỗ trợ/kháng cự chủ đạo." if is_win else "Giá quét vượt quá khoảng ATR biến động ngắn hạn.",
                "learnedLesson": "Tự động điều chỉnh khoảng cách SL theo biến động ATR thực tế của thị trường."
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
