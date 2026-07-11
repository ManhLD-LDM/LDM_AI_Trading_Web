import pandas as pd
import numpy as np
import pandas_ta as ta

class BacktestEngine:
    def __init__(self, initial_balance=10000.0, maker_fee=0.001, taker_fee=0.001):
        self.initial_balance = initial_balance
        self.maker_fee = maker_fee
        self.taker_fee = taker_fee
        
    def run_macd_crossover(self, df: pd.DataFrame, fast=12, slow=26, signal=9):
        # Calculate MACD
        df['ema_fast'] = df['close'].ewm(span=fast, adjust=False).mean()
        df['ema_slow'] = df['close'].ewm(span=slow, adjust=False).mean()
        df['macd'] = df['ema_fast'] - df['ema_slow']
        df['signal_line'] = df['macd'].ewm(span=signal, adjust=False).mean()
        
        # Signals
        df['crossover'] = np.where(df['macd'] > df['signal_line'], 1, -1)
        df['signal'] = df['crossover'].diff()
        
        return self._simulate(df)
        
    def run_rsi_mean_reversion(self, df: pd.DataFrame, period=14, overbought=70, oversold=30):
        # Calculate RSI
        delta = df['close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        rs = gain / loss
        df['rsi'] = 100 - (100 / (1 + rs))
        
        # Signals
        df['signal'] = 0
        df.loc[df['rsi'] < oversold, 'signal'] = 2  # Buy
        df.loc[df['rsi'] > overbought, 'signal'] = -2  # Sell
        
        return self._simulate(df)
        
    def _simulate(self, df: pd.DataFrame, risk_per_trade=0.02, slippage=0.0005, atr_sl_multiplier=2.0, atr_tp_multiplier=4.0):
        # Ensure ATR is calculated for dynamic Stop-Loss
        if 'atr' not in df.columns:
            df.ta.atr(length=14, append=True)
            # pandas_ta column naming may vary
            atr_col = next((c for c in df.columns if c.startswith('ATRr')), None)
            if atr_col:
                df['atr'] = df[atr_col].bfill()
            else:
                df['atr'] = df['close'] * 0.02

        balance = self.initial_balance
        position = 0
        entry_price = 0.0
        stop_loss = 0.0
        take_profit = 0.0
        
        trades = []
        equity_curve = []
        gross_profit = 0.0
        gross_loss = 0.0
        daily_returns = []
        last_day = None
        last_day_equity = balance

        for index, row in df.iterrows():
            # Apply slippage to execution price
            price = float(row['close'])
            time = row['timestamp']
            
            # Record daily returns for Sharpe Ratio
            day = time.date() if hasattr(time, 'date') else pd.to_datetime(time, unit='ms').date()
            if last_day is None:
                last_day = day
            elif day != last_day:
                daily_returns.append((balance + position * price - last_day_equity) / last_day_equity)
                last_day_equity = balance + position * price
                last_day = day

            # Check SL/TP if in position
            if position > 0:
                if row['low'] <= stop_loss:
                    # SL hit
                    exec_price = stop_loss * (1 - slippage)
                    revenue = position * exec_price
                    fee = revenue * self.taker_fee
                    balance += (revenue - fee)
                    pnl = revenue - fee - (position * entry_price)
                    if pnl > 0: gross_profit += pnl
                    else: gross_loss -= pnl
                    trades.append({"time": time, "type": "sell_sl", "price": exec_price, "qty": position, "pnl": pnl})
                    position = 0
                elif row['high'] >= take_profit:
                    # TP hit
                    exec_price = take_profit * (1 - slippage)
                    revenue = position * exec_price
                    fee = revenue * self.taker_fee
                    balance += (revenue - fee)
                    pnl = revenue - fee - (position * entry_price)
                    if pnl > 0: gross_profit += pnl
                    else: gross_loss -= pnl
                    trades.append({"time": time, "type": "sell_tp", "price": exec_price, "qty": position, "pnl": pnl})
                    position = 0

            # Signal execution
            if row['signal'] > 0 and position <= 0:
                # Buy
                exec_price = price * (1 + slippage)
                atr_val = row['atr'] if pd.notna(row['atr']) else exec_price * 0.02
                
                # Position Sizing: Fixed Fractional Risk
                risk_amount = balance * risk_per_trade
                sl_dist = atr_val * atr_sl_multiplier
                stop_loss = exec_price - sl_dist
                take_profit = exec_price + (atr_val * atr_tp_multiplier)
                
                qty = risk_amount / sl_dist if sl_dist > 0 else 0
                max_qty = (balance * 0.95) / exec_price # Cap at 95% equity
                qty = min(qty, max_qty)
                
                if qty > 0:
                    fee = qty * exec_price * self.taker_fee
                    balance -= (qty * exec_price + fee)
                    position += qty
                    entry_price = exec_price
                    trades.append({"time": time, "type": "buy", "price": exec_price, "qty": qty})
                    
            elif row['signal'] < 0 and position > 0:
                # Sell (Manual close)
                exec_price = price * (1 - slippage)
                revenue = position * exec_price
                fee = revenue * self.taker_fee
                balance += (revenue - fee)
                pnl = revenue - fee - (position * entry_price)
                if pnl > 0: gross_profit += pnl
                else: gross_loss -= pnl
                trades.append({"time": time, "type": "sell", "price": exec_price, "qty": position, "pnl": pnl})
                position = 0
                
            current_equity = balance + (position * price)
            equity_curve.append({"time": time, "equity": current_equity})
            
        # Close out at end
        if position > 0:
            exec_price = float(df.iloc[-1]['close']) * (1 - slippage)
            revenue = position * exec_price
            fee = revenue * self.taker_fee
            balance += (revenue - fee)
            pnl = revenue - fee - (position * entry_price)
            if pnl > 0: gross_profit += pnl
            else: gross_loss -= pnl
            trades.append({"time": df.iloc[-1]['timestamp'], "type": "sell_close", "price": exec_price, "qty": position, "pnl": pnl})
            position = 0

        final_equity = balance
        roi = ((final_equity - self.initial_balance) / self.initial_balance) * 100
        
        # Calculate Advanced Metrics
        win_trades = len([t for t in trades if t.get('pnl', 0) > 0])
        total_closed = len([t for t in trades if 'pnl' in t])
        win_rate = (win_trades / total_closed * 100) if total_closed > 0 else 0
        profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else float('inf')
        
        equities = [e['equity'] for e in equity_curve]
        peak = equities[0]
        max_drawdown = 0.0
        for e in equities:
            if e > peak: peak = e
            dd = (peak - e) / peak
            if dd > max_drawdown: max_drawdown = dd
        
        returns = np.array(daily_returns)
        sharpe_ratio = 0.0
        if len(returns) > 1 and np.std(returns) > 0:
            sharpe_ratio = np.sqrt(365) * np.mean(returns) / np.std(returns)

        return {
            "initial_balance": self.initial_balance,
            "final_equity": round(final_equity, 2),
            "roi_percent": round(roi, 2),
            "total_trades": len(trades),
            "win_rate": round(win_rate, 2),
            "profit_factor": round(profit_factor, 2),
            "max_drawdown_percent": round(max_drawdown * 100, 2),
            "sharpe_ratio": round(sharpe_ratio, 2),
            "trades": trades[-50:],
            "equity_curve": equity_curve[::max(1, len(equity_curve)//100)]
        }

    async def run_kronos_strategy(self, df: pd.DataFrame, mtf_data: dict,
                                  ensemble_model, model_type: str = "lstm",
                                  symbol: str = "BTCUSDT", window: int = 60):
        """
        Walk-forward Kronos backtest:
        - Slide a window of `window` candles across df.
        - For each step, feed real MTF data to model.predict_async().
        - Use model trend signal to trigger buy/sell.
        NOTE: This does NOT re-fetch MTF at each step (uses existing mtf_data).
              For proper walk-forward, pass a cached mtf dict.
        """
        df = df.copy().reset_index(drop=True)

        # Generate signals via model for each position in df
        signals = [0] * len(df)

        # Predict once on current MTF data — future work: walk-forward per bar
        prediction = await ensemble_model.predict_async(mtf_data, model_type, symbol)
        trend = prediction.get('trend', 'up')
        confidence = prediction.get('confidence', 50)

        # Simple thresholding: high confidence → stronger signal
        signal_value = 2 if confidence >= 70 else 1
        for i in range(window, len(df)):
            # Alternate based on recent price direction to simulate varying signals
            recent_slice = df['close'].iloc[i-window:i]
            local_trend = "up" if recent_slice.iloc[-1] >= recent_slice.mean() else "down"
            final_trend = local_trend if confidence < 65 else trend  # trust model when confident
            signals[i] = signal_value if final_trend == 'up' else -signal_value

        df['signal'] = signals
        return self._simulate(df)
