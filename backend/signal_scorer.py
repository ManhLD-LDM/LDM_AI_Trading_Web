"""
backend/signal_scorer.py

Deterministic Technical Signal Scorer.
Calculates technical indicators across multiple timeframes and returns an objective score [-100, +100]
to guide trading decisions deterministically instead of relying solely on LLM text output.
"""
import pandas as pd
import numpy as np
from shared_features import compute_indicators, MTF_INTERVALS


class TechnicalScorer:
    """
    Evaluates multi-timeframe technical indicator alignment and price action rules.
    Outputs:
      total_score: int in range [-100, +100] (positive = bullish, negative = bearish)
      signal: "LONG" | "SHORT" | "WAIT"
      confidence: int in range [50, 95]
      breakdown: dict detailing point contributions per indicator rule
    """

    def evaluate(
        self,
        mtf_data: dict,
        current_interval: str = "15m",
        kronos_prediction: dict | None = None
    ) -> dict:
        total_score = 0
        breakdown = {}
        reasons = []

        # 1. Evaluate Primary Interval Indicators
        primary_klines = mtf_data.get(current_interval, [])
        if not primary_klines and mtf_data:
            primary_klines = list(mtf_data.values())[0]

        if primary_klines and len(primary_klines) >= 20:
            df = pd.DataFrame(primary_klines, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
            for col in ['open', 'high', 'low', 'close', 'volume']:
                df[col] = df[col].astype(float)

            ind = compute_indicators(df)
            last_row = ind.iloc[-1]
            prev_row = ind.iloc[-2]

            # Rule A: EMA 20/50 Cross & Alignment (Max ±20 pts)
            ema20 = last_row['EMA_20']
            ema50 = last_row['EMA_50']
            close = last_row['close']

            if close > ema20 > ema50:
                score_ema = 20
                reasons.append(f"Strong Bullish EMA alignment ({current_interval})")
            elif close < ema20 < ema50:
                score_ema = -20
                reasons.append(f"Strong Bearish EMA alignment ({current_interval})")
            elif ema20 > ema50:
                score_ema = 10
                reasons.append(f"Bullish EMA20 > EMA50 ({current_interval})")
            elif ema20 < ema50:
                score_ema = -10
                reasons.append(f"Bearish EMA20 < EMA50 ({current_interval})")
            else:
                score_ema = 0
            total_score += score_ema
            breakdown['ema_alignment'] = score_ema

            # Rule B: RSI Zones (Max ±15 pts)
            rsi = last_row['RSI_14']
            if rsi < 30:
                score_rsi = 15  # Oversold rebound opportunity
                reasons.append(f"RSI Oversold ({rsi:.1f})")
            elif rsi > 70:
                score_rsi = -15 # Overbought rejection opportunity
                reasons.append(f"RSI Overbought ({rsi:.1f})")
            elif 50 <= rsi <= 65:
                score_rsi = 10  # Bullish momentum zone
            elif 35 <= rsi < 50:
                score_rsi = -10 # Bearish momentum zone
            else:
                score_rsi = 0
            total_score += score_rsi
            breakdown['rsi_zone'] = score_rsi

            # Rule C: MACD Signal Cross (Max ±15 pts)
            macd_line = last_row['MACD_line']
            macd_sig = last_row['MACD_signal']
            prev_macd = prev_row['MACD_line']
            prev_sig = prev_row['MACD_signal']

            if prev_macd <= prev_sig and macd_line > macd_sig:
                score_macd = 15
                reasons.append("Bullish MACD Golden Cross")
            elif prev_macd >= prev_sig and macd_line < macd_sig:
                score_macd = -15
                reasons.append("Bearish MACD Death Cross")
            elif macd_line > macd_sig:
                score_macd = 8
            elif macd_line < macd_sig:
                score_macd = -8
            else:
                score_macd = 0
            total_score += score_macd
            breakdown['macd_cross'] = score_macd

            # Rule D: Bollinger Band Extreme Rejections (Max ±15 pts)
            bb_upper = last_row['BB_upper']
            bb_lower = last_row['BB_lower']
            if close <= bb_lower:
                score_bb = 15
                reasons.append("Price touching lower Bollinger Band")
            elif close >= bb_upper:
                score_bb = -15
                reasons.append("Price touching upper Bollinger Band")
            else:
                score_bb = 0
            total_score += score_bb
            breakdown['bollinger_bands'] = score_bb

        # 2. Multi-Timeframe Trend Confluence (Max ±20 pts)
        mtf_bullish_count = 0
        mtf_bearish_count = 0
        valid_tfs = 0

        for tf in MTF_INTERVALS:
            kl = mtf_data.get(tf, [])
            if len(kl) >= 5:
                valid_tfs += 1
                first_c = float(kl[-5][4])
                last_c = float(kl[-1][4])
                change_pct = ((last_c - first_c) / first_c) * 100
                if change_pct > 0.15:
                    mtf_bullish_count += 1
                elif change_pct < -0.15:
                    mtf_bearish_count += 1

        if valid_tfs > 0:
            if mtf_bullish_count >= 4:
                score_mtf = 20
                reasons.append(f"Multi-Timeframe Bullish Confluence ({mtf_bullish_count}/{valid_tfs} TFs)")
            elif mtf_bearish_count >= 4:
                score_mtf = -20
                reasons.append(f"Multi-Timeframe Bearish Confluence ({mtf_bearish_count}/{valid_tfs} TFs)")
            elif mtf_bullish_count > mtf_bearish_count:
                score_mtf = 10
            elif mtf_bearish_count > mtf_bullish_count:
                score_mtf = -10
            else:
                score_mtf = 0
            total_score += score_mtf
            breakdown['mtf_confluence'] = score_mtf

        # 3. Model Prediction Weight (Max ±15 pts)
        if kronos_prediction:
            trend = kronos_prediction.get('trend', '').lower()
            conf = float(kronos_prediction.get('confidence', 50))
            if trend == 'up' and conf >= 60:
                score_model = int(15 * (conf / 100))
                reasons.append(f"Kronos AI Ensemble Bullish prediction ({conf:.0f}%)")
            elif trend == 'down' and conf >= 60:
                score_model = -int(15 * (conf / 100))
                reasons.append(f"Kronos AI Ensemble Bearish prediction ({conf:.0f}%)")
            elif trend == 'neutral':
                score_model = 0  # Model says WAIT → no influence on score
                reasons.append(f"Kronos AI Ensemble Neutral/WAIT ({conf:.0f}%)")
            else:
                score_model = 0
            total_score += score_model
            breakdown['kronos_model'] = score_model

        # Clamp total_score to [-100, +100]
        total_score = max(-100, min(100, total_score))

        # Determine Recommendation & Confidence
        if total_score >= 25:
            signal = "LONG"
            confidence = int(min(95, 60 + (total_score * 0.35)))
        elif total_score <= -25:
            signal = "SHORT"
            confidence = int(min(95, 60 + (abs(total_score) * 0.35)))
        else:
            signal = "WAIT"
            confidence = 50

        return {
            "total_score": total_score,
            "signal": signal,
            "confidence": confidence,
            "reasons": reasons,
            "breakdown": breakdown
        }


technical_scorer = TechnicalScorer()
