"""
backend/math_plan_builder.py

100% Math-Based Trading Plan Builder.
Tất cả mức giá Entry/SL/TP được tính toán hoàn toàn bằng toán học (ATR, Swing, S/R).
LLM KHÔNG được phép quyết định bất kỳ mức giá nào.

Người dùng có thể override TP/SL bằng giá trị tùy chỉnh — mặc định vẫn dùng giá trị đề xuất.
"""
import math


def calculate_atr(candles, period: int = 14) -> float:
    """Tính ATR (Average True Range) từ danh sách nến [[ts, open, high, low, close, vol], ...]"""
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
    """Tính Swing Low / Swing High từ N nến gần nhất."""
    if hasattr(candles, 'tolist'):
        candles = candles.tolist()
    if candles is None or len(candles) == 0:
        return 0.0, 0.0

    recent = candles[-window:]
    lows = [float(c[3]) for c in recent]
    highs = [float(c[2]) for c in recent]
    return min(lows), max(highs)


def calculate_support_resistance(candles, window: int = 100) -> dict:
    """
    Tìm các mức S/R bằng pivot-based approach:
    - Support = các điểm mà giá chạm Low rồi bật lên ít nhất 2 lần
    - Resistance = các điểm mà giá chạm High rồi bật xuống ít nhất 2 lần
    """
    if hasattr(candles, 'tolist'):
        candles = candles.tolist()
    if candles is None or len(candles) < 10:
        return {"supports": [], "resistances": []}

    recent = candles[-window:]
    lows = [float(c[3]) for c in recent]
    highs = [float(c[2]) for c in recent]
    closes = [float(c[4]) for c in recent]

    current_price = closes[-1]
    tolerance = current_price * 0.002  # 0.2% cluster tolerance

    # Find local minima (supports) and maxima (resistances)
    supports = []
    resistances = []

    for i in range(2, len(recent) - 2):
        # Local minimum
        if lows[i] < lows[i - 1] and lows[i] < lows[i - 2] and lows[i] < lows[i + 1] and lows[i] < lows[i + 2]:
            supports.append(lows[i])
        # Local maximum
        if highs[i] > highs[i - 1] and highs[i] > highs[i - 2] and highs[i] > highs[i + 1] and highs[i] > highs[i + 2]:
            resistances.append(highs[i])

    # Cluster nearby levels
    supports = _cluster_levels(sorted(supports), tolerance)
    resistances = _cluster_levels(sorted(resistances), tolerance)

    return {"supports": supports, "resistances": resistances}


def _cluster_levels(levels: list[float], tolerance: float) -> list[float]:
    """Gom các mức giá gần nhau thành 1 cluster trung bình."""
    if not levels:
        return []

    clusters = []
    current_cluster = [levels[0]]

    for i in range(1, len(levels)):
        if abs(levels[i] - current_cluster[-1]) <= tolerance:
            current_cluster.append(levels[i])
        else:
            clusters.append(sum(current_cluster) / len(current_cluster))
            current_cluster = [levels[i]]

    clusters.append(sum(current_cluster) / len(current_cluster))
    return [round(c, 2) for c in clusters]


def build_math_plan(
    signal: str,            # "LONG" | "SHORT" | "WAIT" — từ TechnicalScorer
    confidence: int,        # 50-95 — từ TechnicalScorer
    current_price: float,
    atr: float,
    swing_low: float,
    swing_high: float,
    mode: str = "SCALP",    # "SCALP" | "SWING"
    support_levels: list[float] | None = None,
    resistance_levels: list[float] | None = None,
    # ── User overrides (tùy chỉnh từ người dùng) ──
    user_sl_price: float | None = None,
    user_tp1_price: float | None = None,
    user_tp2_price: float | None = None,
) -> dict:
    """
    Tính toán Entry Zone, SL, TP1, TP2 hoàn toàn bằng toán học.

    SCALP mode:
      - Entry: Current price ± 0.1-0.2%
      - SL: max(2.0 * ATR, 0.8% * price) dưới Swing Low (LONG) / trên Swing High (SHORT)
      - TP1: 1.5 * SL distance (R:R = 1:1.5)
      - TP2: 2.5 * SL distance (R:R = 1:2.5)

    SWING mode:
      - Entry: Current price ± 0.2-0.5%
      - SL: max(3.0 * ATR, 1.5% * price) dưới nearest support (LONG) / trên nearest resistance (SHORT)
      - TP1: 2.5 * SL distance (R:R = 1:2.5)
      - TP2: 4.0 * SL distance (R:R = 1:4.0)

    User có thể override SL/TP bằng user_sl_price, user_tp1_price, user_tp2_price.
    """

    if signal == "WAIT":
        return _build_wait_plan(current_price, atr, mode, confidence)

    is_long = signal == "LONG"
    mode = mode.upper()

    # ── Entry Zone ──
    entry_spread = 0.002 if mode == "SCALP" else 0.005
    entry_zone = {
        "minPrice": round(current_price * (1 - entry_spread / 2), 2),
        "maxPrice": round(current_price * (1 + entry_spread / 2), 2),
        "idealEntry": round(current_price, 2),
    }

    # ── Stop Loss (math default) ──
    if mode == "SCALP":
        min_sl_dist = max(2.0 * atr, current_price * 0.008)
        tp1_mult, tp2_mult = 1.5, 2.5
    else:  # SWING
        min_sl_dist = max(3.0 * atr, current_price * 0.015)
        tp1_mult, tp2_mult = 2.5, 4.0

    if is_long:
        anchor = swing_low
        if support_levels:
            nearby = [s for s in support_levels if s < current_price]
            if nearby:
                anchor = max(nearby)
        sl_price = round(min(current_price - min_sl_dist, anchor * 0.998), 2)
    else:
        anchor = swing_high
        if resistance_levels:
            nearby = [r for r in resistance_levels if r > current_price]
            if nearby:
                anchor = min(nearby)
        sl_price = round(max(current_price + min_sl_dist, anchor * 1.002), 2)

    # Apply user SL override if provided
    if user_sl_price is not None:
        sl_price = round(float(user_sl_price), 2)

    sl_distance = abs(current_price - sl_price)
    sl_pct = round(sl_distance / current_price * 100, 2)
    sl_method = f"ATR({atr:.2f}) anchor={'Swing Low' if is_long else 'Swing High'}({anchor:.2f})"
    if user_sl_price is not None:
        sl_method += " [User Override]"

    # ── Take Profit (R:R ratio based) ──
    if is_long:
        tp1_price = round(current_price + sl_distance * tp1_mult, 2)
        tp2_price = round(current_price + sl_distance * tp2_mult, 2)
    else:
        tp1_price = round(current_price - sl_distance * tp1_mult, 2)
        tp2_price = round(current_price - sl_distance * tp2_mult, 2)

    # Apply user TP overrides if provided
    tp1_label = "TP1 (50% Vị thế)"
    tp2_label = "TP2 (Chốt hết)"
    tp1_rr = f"1:{tp1_mult}"
    tp2_rr = f"1:{tp2_mult}"

    if user_tp1_price is not None:
        tp1_price = round(float(user_tp1_price), 2)
        tp1_dist = abs(tp1_price - current_price)
        tp1_rr = f"1:{round(tp1_dist / sl_distance, 1)}" if sl_distance > 0 else "N/A"
        tp1_label += " [User]"

    if user_tp2_price is not None:
        tp2_price = round(float(user_tp2_price), 2)
        tp2_dist = abs(tp2_price - current_price)
        tp2_rr = f"1:{round(tp2_dist / sl_distance, 1)}" if sl_distance > 0 else "N/A"
        tp2_label += " [User]"

    # ── Risk parameters ──
    rr_ratio = round(tp1_mult, 1)
    leverage = "2x - 5x Isolated" if mode == "SWING" else "5x - 10x Cross"
    risk_pct = 1.0 if mode == "SWING" else 1.5

    return {
        "recommendation": signal,
        "confidence": confidence,
        "mode": mode,
        "entryZone": entry_zone,
        "stopLoss": {
            "price": sl_price,
            "percentage": sl_pct,
            "method": sl_method,
        },
        "takeProfit": [
            {"level": tp1_label, "price": tp1_price, "rrRatio": tp1_rr, "closePct": 50},
            {"level": tp2_label, "price": tp2_price, "rrRatio": tp2_rr, "closePct": 50},
        ],
        "riskRewardRatio": rr_ratio,
        "suggestedLeverage": leverage,
        "recommendedRiskPct": risk_pct,
    }


def _build_wait_plan(current_price: float, atr: float, mode: str, confidence: int) -> dict:
    """Khi signal = WAIT, trả về plan trung tính (chỉ quan sát, không vào lệnh)."""
    return {
        "recommendation": "WAIT",
        "confidence": confidence,
        "mode": mode.upper(),
        "entryZone": {
            "minPrice": round(current_price, 2),
            "maxPrice": round(current_price, 2),
            "idealEntry": round(current_price, 2),
        },
        "stopLoss": {
            "price": 0,
            "percentage": 0,
            "method": "N/A — Signal is WAIT (no trade recommended)",
        },
        "takeProfit": [],
        "riskRewardRatio": 0,
        "suggestedLeverage": "N/A",
        "recommendedRiskPct": 0,
    }
