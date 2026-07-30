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


from signal_scorer import technical_scorer

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
        sys_prompt = (
            "Bạn là Crypto Sentiment Analyst. "
            "Nhiệm vụ của bạn là đọc danh sách tin tức thực tế bên dưới và tóm tắt ngắn gọn (2-3 câu).\n\n"
            "QUY TẮC BẮT BUỘC:\n"
            "1. Chỉ tóm tắt dựa trên CÁC TIÊU ĐỀ TIN TỨC THỰC TẾ được cung cấp trong USER INPUT.\n"
            "2. TUYỆT ĐỐI KHÔNG tự vẽ ra tin tức vĩ mô (như ETF, thị trường Nhật Bản, quỹ phòng hộ...) nếu không có trong danh sách.\n"
            "3. Nếu nguồn ghi 'Không có tin tức vĩ mô...', bạn BẮT BUỘC phải ghi: 'Không có tin tức vĩ mô đột biến trong 24h qua cho tài sản này.'"
        )
        from news_analyzer import fetch_crypto_news
        news = await fetch_crypto_news(symbol)
        user_prompt = f"Danh sách tiêu đề tin tức thực tế vừa cào được về {symbol}:\n{news}"
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
        mtf_klines: dict | None = None,
        # User overrides for TP/SL
        user_sl_price: float | None = None,
        user_tp1_price: float | None = None,
        user_tp2_price: float | None = None,
    ) -> dict:
        """
        AI Trading Consultant — Lập Kế hoạch Cố vấn Đa Khung Thời Gian.

        Architecture:
        1. TechnicalScorer → signal direction (LONG/SHORT/WAIT) + confidence
        2. math_plan_builder → Entry/SL/TP (100% math, 0% LLM)
        3. LLM (Gemini) → narrative analysis only (giải thích bằng tiếng Việt)
        """
        from math_plan_builder import (
            build_math_plan,
            calculate_atr,
            calculate_swing_levels,
            calculate_support_resistance,
        )

        atr = calculate_atr(candles, 14)
        swing_low, swing_high = calculate_swing_levels(candles, 50)
        sr_levels = calculate_support_resistance(candles, 100)
        mode_upper = mode.upper() if mode else "SCALP"

        # ── Step 1: Deterministic Technical Signal Evaluation ──
        mtf_data_eval = mtf_klines or {interval: candles}
        tech_score = technical_scorer.evaluate(mtf_data_eval, interval, kronos_prediction)

        # ── Step 2: MATH calculates Entry/SL/TP (deterministic, 100%) ──
        math_plan = build_math_plan(
            signal=tech_score["signal"],
            confidence=tech_score["confidence"],
            current_price=current_price,
            atr=atr,
            swing_low=swing_low,
            swing_high=swing_high,
            mode=mode_upper,
            support_levels=sr_levels.get("supports"),
            resistance_levels=sr_levels.get("resistances"),
            user_sl_price=user_sl_price,
            user_tp1_price=user_tp1_price,
            user_tp2_price=user_tp2_price,
        )

        # ── Step 3: LLM ONLY writes narrative analysis (NO price decisions) ──
        score_info = (
            f"ĐIỂM KỸ THUẬT CỨNG: {tech_score['total_score']}/100 → {tech_score['signal']} "
            f"(Confidence: {tech_score['confidence']}%). "
            f"Lý do: {', '.join(tech_score['reasons'])}"
        )

        sys_prompt = (
            f"Bạn là AI Trading Consultant (Cố vấn Giao dịch). "
            f"Tài sản: {symbol} | Khung: {interval} | Chế độ: {mode_upper}. "
            f"Giá hiện tại: {current_price}. ATR(14) = {atr:.2f}.\n"
            f"{score_info}\n\n"
            "QUAN TRỌNG:\n"
            "1. KHÔNG được đề xuất bất kỳ mức giá Entry, SL, hay TP nào — chúng đã được tính toán bằng toán học.\n"
            "2. Trong mục 'newsSentiment': Tóm tắt chính xác dựa trên thông tin thực tế từ phần phân tích tin tức. "
            "TUYỆT ĐỐI KHÔNG tự bịa ra thông tin về ETF, Nhật Bản, hay chính sách vĩ mô không có trong dữ liệu!\n\n"
            "Trả về ĐÚNG MỘT OBJECT JSON (không markdown, không ```json```):\n"
            "{\n"
            '  "candlestickPattern": "Nhận diện mẫu nến hợp lưu đa khung (15m/1h/4h/1D) bằng Tiếng Việt",\n'
            '  "technicalConfluence": "Phân tích chỉ số kỹ thuật đa khung bằng Tiếng Việt",\n'
            '  "newsSentiment": "Tóm tắt tâm lý tin tức thực tế bằng Tiếng Việt",\n'
            '  "keyWarning": "Cảnh báo rủi ro và sự kiện quan trọng bằng Tiếng Việt"\n'
            "}"
        )

        user_prompt = (
            f"Phân tích Đa khung kỹ thuật (MTF):\n{tech_analysis}\n\n"
            f"Phân tích tâm lý tin tức:\n{sentiment_analysis}"
        )

        try:
            response_text = await call_agent(sys_prompt, user_prompt, response_mime_type="text/plain")
            narrative = _parse_narrative(response_text)
        except Exception as e:
            agent_logger.warning(f"TraderAgent LLM narrative failed: {e}. Using fallback.")
            narrative = {
                "candlestickPattern": f"Phân tích Hợp lưu MTF (15m/1h/4h/1D) cho {symbol}.",
                "technicalConfluence": f"Chấm điểm kỹ thuật cứng: {tech_score['total_score']}/100. {', '.join(tech_score['reasons'])}",
                "newsSentiment": sentiment_analysis[:200] if sentiment_analysis else "Tâm lý tin tức ở mức trung tính.",
                "keyWarning": f"Chế độ {mode_upper}: Luôn kiểm tra mốc SL trước khi vào lệnh.",
            }

        # ── Step 4: Merge math plan + LLM narrative ──
        math_plan["symbol"] = symbol
        math_plan["interval"] = interval
        math_plan["analysisSummary"] = narrative
        math_plan["techScore"] = {
            "total": tech_score["total_score"],
            "breakdown": tech_score.get("breakdown", {}),
            "reasons": tech_score["reasons"],
        }

        return math_plan


def _parse_narrative(response_text: str) -> dict:
    """Parse LLM narrative JSON response, with fallback for malformed output."""
    clean_text = response_text.strip()
    if clean_text.startswith("```json"):
        clean_text = clean_text[7:]
    if clean_text.startswith("```"):
        clean_text = clean_text[3:]
    if clean_text.endswith("```"):
        clean_text = clean_text[:-3]

    try:
        parsed = json.loads(clean_text.strip())
        # Ensure all expected keys exist
        return {
            "candlestickPattern": parsed.get("candlestickPattern", "Không có dữ liệu."),
            "technicalConfluence": parsed.get("technicalConfluence", "Không có dữ liệu."),
            "newsSentiment": parsed.get("newsSentiment", "Tâm lý trung tính."),
            "keyWarning": parsed.get("keyWarning", "Không có cảnh báo đặc biệt."),
        }
    except Exception:
        return {
            "candlestickPattern": "Không thể phân tích mẫu nến.",
            "technicalConfluence": response_text[:300] if response_text else "Không có dữ liệu.",
            "newsSentiment": "Tâm lý trung tính.",
            "keyWarning": "Hãy kiểm tra kỹ trước khi vào lệnh.",
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
