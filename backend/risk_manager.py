"""
backend/risk_manager.py — Position & Trade Risk Management

Centralised risk engine kiểm tra mọi lệnh trước khi execute (paper or live).
Gọi RiskManager.check() trước khi cho phép trade.

Các rule hiện tại:
- Max position size (% of balance)
- Max drawdown guard (% from peak)
- Max consecutive losses
- Min/Max position value in USDT
- Duplicate signal cooldown (tránh spam lệnh)
"""
import time
from dataclasses import dataclass, field
from logger import setup_logger

logger = setup_logger("ldm.risk")


@dataclass
class RiskConfig:
    max_position_pct: float = 0.10        # Tối đa 10% portfolio mỗi lệnh
    max_drawdown_pct: float = 0.20        # Dừng trading khi drawdown > 20%
    max_consecutive_losses: int = 5       # Dừng sau 5 lệnh thua liên tiếp
    min_position_usdt: float = 10.0       # Lệnh tối thiểu 10 USDT
    max_position_usdt: float = 50_000.0   # Lệnh tối đa 50,000 USDT
    signal_cooldown_seconds: int = 60     # Không spam cùng symbol trong 60s
    daily_loss_limit_pct: float = 0.05    # Dừng ngày khi mất > 5% balance ngày


@dataclass
class TradeState:
    """Tracks running trade statistics per user session."""
    peak_equity: float = 10_000.0
    consecutive_losses: int = 0
    daily_start_balance: float = 10_000.0
    daily_pnl: float = 0.0
    last_signal_time: dict = field(default_factory=dict)  # symbol -> timestamp
    trading_halted: bool = False
    halt_reason: str = ""


@dataclass
class RiskCheckResult:
    allowed: bool
    reason: str
    adjusted_quantity: float | None = None  # If position was capped


class RiskManager:
    """
    Stateless validator — call check() before every trade attempt.
    State is passed in (works with MongoDB-backed or in-memory state).
    """

    def __init__(self, config: RiskConfig | None = None):
        self.config = config or RiskConfig()

    def check(
        self,
        symbol: str,
        action: str,           # "buy" or "sell"
        quantity: float,
        price: float,
        balance: float,
        positions: dict,
        state: TradeState,
    ) -> RiskCheckResult:
        """
        Run all risk checks. Returns RiskCheckResult with allowed=True/False.
        Pass TradeState to preserve session memory across calls.
        """
        cfg = self.config
        position_value = quantity * price

        # ── Guard 0: Trading halted ───────────────────────────────────────────
        if state.trading_halted:
            return RiskCheckResult(False, f"Trading halted: {state.halt_reason}")

        # ── Guard 1: Min / Max position value ────────────────────────────────
        if position_value < cfg.min_position_usdt:
            return RiskCheckResult(False, f"Position too small: ${position_value:.2f} < min ${cfg.min_position_usdt}")
        if position_value > cfg.max_position_usdt:
            # Cap instead of reject
            capped_qty = cfg.max_position_usdt / price
            logger.warning(f"[{symbol}] Position capped {quantity:.6f} → {capped_qty:.6f}")
            quantity = capped_qty
            position_value = cfg.max_position_usdt

        # ── Guard 2: Max position size (% of portfolio equity) ───────────────
        if action == "buy":
            total_equity = balance + sum(p.get("quantity", 0) * p.get("avg_price", 0) for p in positions.values())
            if total_equity > 0:
                pct = position_value / total_equity
                if pct > cfg.max_position_pct:
                    max_allowed = total_equity * cfg.max_position_pct
                    capped_qty = max_allowed / price
                    logger.warning(f"[{symbol}] Position size {pct:.1%} > {cfg.max_position_pct:.1%}, capping to {capped_qty:.6f}")
                    quantity = capped_qty
                    position_value = max_allowed

        # ── Guard 3: Max drawdown ─────────────────────────────────────────────
        current_equity = balance + sum(p.get("quantity", 0) * p.get("avg_price", 0) for p in positions.values())
        if state.peak_equity > 0:
            drawdown = (state.peak_equity - current_equity) / state.peak_equity
            if drawdown >= cfg.max_drawdown_pct:
                state.trading_halted = True
                state.halt_reason = f"Max drawdown {drawdown:.1%} ≥ {cfg.max_drawdown_pct:.1%}"
                logger.warning(f"[{symbol}] TRADING HALTED — {state.halt_reason}")
                return RiskCheckResult(False, state.halt_reason)

        # ── Guard 4: Consecutive losses ────────────────────────────────────────
        if state.consecutive_losses >= cfg.max_consecutive_losses:
            state.trading_halted = True
            state.halt_reason = f"{cfg.max_consecutive_losses} consecutive losses"
            logger.warning(f"[{symbol}] TRADING HALTED — {state.halt_reason}")
            return RiskCheckResult(False, state.halt_reason)

        # ── Guard 5: Daily loss limit ─────────────────────────────────────────
        if state.daily_start_balance > 0:
            daily_loss_pct = -state.daily_pnl / state.daily_start_balance
            if daily_loss_pct >= cfg.daily_loss_limit_pct:
                return RiskCheckResult(False, f"Daily loss limit {daily_loss_pct:.1%} ≥ {cfg.daily_loss_limit_pct:.1%}")

        # ── Guard 6: Signal cooldown (anti-spam) ──────────────────────────────
        now = time.time()
        last_time = state.last_signal_time.get(symbol, 0)
        if now - last_time < cfg.signal_cooldown_seconds:
            remaining = int(cfg.signal_cooldown_seconds - (now - last_time))
            return RiskCheckResult(False, f"Signal cooldown for {symbol}: {remaining}s remaining")
        state.last_signal_time[symbol] = now

        # ── All checks passed ─────────────────────────────────────────────────
        logger.info(f"[{symbol}] Risk check PASSED — {action.upper()} {quantity:.6f} @ {price} = ${position_value:.2f}")
        return RiskCheckResult(True, "OK", adjusted_quantity=quantity)

    def update_after_trade(self, state: TradeState, pnl: float | None, balance: float, positions: dict) -> None:
        """
        Call after each trade to update running statistics.
        pnl=None for BUY orders (no realised P&L yet).
        """
        if pnl is not None:
            state.daily_pnl += pnl
            if pnl < 0:
                state.consecutive_losses += 1
            else:
                state.consecutive_losses = 0

        # Update peak equity
        current_equity = balance + sum(p.get("quantity", 0) * p.get("avg_price", 0) for p in positions.values())
        if current_equity > state.peak_equity:
            state.peak_equity = current_equity

    def reset_daily(self, state: TradeState, current_balance: float) -> None:
        """Call once per day (e.g. at midnight UTC) to reset daily limits."""
        state.daily_pnl = 0.0
        state.daily_start_balance = current_balance
        state.trading_halted = False
        state.halt_reason = ""
        logger.info(f"Daily risk state reset. Starting balance: ${current_balance:.2f}")


# ─── Shared in-memory state (per-process, reset on restart) ──────────────────
# For production, persist TradeState in MongoDB.
_default_config = RiskConfig()
default_risk_manager = RiskManager(_default_config)

# In-memory user risk states (email -> TradeState)
_user_states: dict[str, TradeState] = {}


def get_user_risk_state(email: str) -> TradeState:
    if email not in _user_states:
        _user_states[email] = TradeState()
    return _user_states[email]
