"""
backend/alert_manager.py — Unified Alert System

Sends trading alerts to Discord and/or Telegram.
Configuration via environment variables:
  DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
  TELEGRAM_BOT_TOKEN=1234:abc...
  TELEGRAM_CHAT_ID=-100...

Usage:
  from alert_manager import alert_manager
  await alert_manager.send_signal_alert(symbol, action, price, confidence, reason)
  await alert_manager.send_risk_alert(message)
  await alert_manager.send_error_alert(context, error)
"""
import os
import httpx
import asyncio
from datetime import datetime, timezone
from logger import setup_logger

logger = setup_logger("ldm.alerts")


class AlertManager:
    """
    Sends alerts to Discord and/or Telegram.
    Channels are enabled only when env vars are set.
    Non-blocking: errors are logged but never raise.
    """

    def __init__(self):
        self.discord_url = os.getenv("DISCORD_WEBHOOK_URL", "").strip()
        self.tg_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
        self.tg_chat_id = os.getenv("TELEGRAM_CHAT_ID", "").strip()
        self._enabled = bool(self.discord_url or (self.tg_token and self.tg_chat_id))

        if self._enabled:
            channels = []
            if self.discord_url:
                channels.append("Discord")
            if self.tg_token and self.tg_chat_id:
                channels.append("Telegram")
            logger.info(f"Alert manager ready — channels: {', '.join(channels)}")
        else:
            logger.info("Alert manager: no channels configured (set DISCORD_WEBHOOK_URL or TELEGRAM env vars)")

    # ─── Low-level send methods ───────────────────────────────────────────────
    async def _send_discord(self, content: str, embeds: list | None = None) -> None:
        if not self.discord_url:
            return
        payload: dict = {"content": content}
        if embeds:
            payload["embeds"] = embeds
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(self.discord_url, json=payload)
                if resp.status_code not in (200, 204):
                    logger.warning(f"Discord alert failed: HTTP {resp.status_code}")
        except Exception as e:
            logger.error(f"Discord alert error: {e}")

    async def _send_telegram(self, text: str, parse_mode: str = "HTML") -> None:
        if not (self.tg_token and self.tg_chat_id):
            return
        url = f"https://api.telegram.org/bot{self.tg_token}/sendMessage"
        payload = {"chat_id": self.tg_chat_id, "text": text, "parse_mode": parse_mode}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code != 200:
                    logger.warning(f"Telegram alert failed: HTTP {resp.status_code} — {resp.text[:200]}")
        except Exception as e:
            logger.error(f"Telegram alert error: {e}")

    async def _broadcast(self, discord_content: str, telegram_text: str,
                          discord_embeds: list | None = None) -> None:
        """Send to all configured channels concurrently."""
        if not self._enabled:
            return
        tasks = [
            self._send_discord(discord_content, discord_embeds),
            self._send_telegram(telegram_text),
        ]
        await asyncio.gather(*tasks, return_exceptions=True)

    # ─── High-level alert methods ─────────────────────────────────────────────
    async def send_signal_alert(
        self,
        symbol: str,
        action: str,          # "BUY" | "SELL" | "HOLD"
        price: float,
        confidence: float,
        reason: str,
        model_type: str = "Kronos",
    ) -> None:
        """Fired after every non-HOLD AI decision."""
        if action == "HOLD":
            return  # Don't spam HOLD signals

        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        action_emoji = "🟢" if action == "BUY" else "🔴"
        conf_bar = "█" * int(confidence / 10) + "░" * (10 - int(confidence / 10))

        # Discord embed
        color = 0x10b981 if action == "BUY" else 0xef4444  # emerald / rose
        discord_embeds = [{
            "title": f"{action_emoji} {symbol} — {action}",
            "description": f"**Model:** {model_type}\n**Price:** ${price:,.4f}\n**Confidence:** {confidence:.1f}% [{conf_bar}]\n\n{reason}",
            "color": color,
            "footer": {"text": f"LDM AI Trading • {now}"},
        }]
        discord_content = f"{action_emoji} **{symbol}** — `{action}` @ ${price:,.4f}"

        # Telegram HTML
        telegram_text = (
            f"{action_emoji} <b>{symbol} — {action}</b>\n"
            f"💵 Price: <code>${price:,.4f}</code>\n"
            f"🎯 Confidence: <code>{confidence:.1f}%</code>\n"
            f"🤖 Model: {model_type}\n"
            f"📝 {reason[:200]}\n"
            f"🕐 {now}"
        )

        await self._broadcast(discord_content, telegram_text, discord_embeds)
        logger.info(f"Signal alert sent — {symbol} {action} @ {price}")

    async def send_risk_alert(self, message: str) -> None:
        """Fired when risk manager halts trading or raises a warning."""
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

        discord_embeds = [{
            "title": "⚠️ Risk Alert",
            "description": message,
            "color": 0xf59e0b,  # amber
            "footer": {"text": f"LDM Risk Manager • {now}"},
        }]
        telegram_text = f"⚠️ <b>Risk Alert</b>\n{message}\n🕐 {now}"

        await self._broadcast("⚠️ **Risk Alert**", telegram_text, discord_embeds)
        logger.warning(f"Risk alert sent: {message}")

    async def send_error_alert(self, context: str, error: str) -> None:
        """Fired on critical system errors."""
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

        discord_embeds = [{
            "title": "🚨 System Error",
            "description": f"**Context:** {context}\n**Error:** {error[:500]}",
            "color": 0xef4444,
            "footer": {"text": f"LDM Backend • {now}"},
        }]
        telegram_text = f"🚨 <b>System Error</b>\n<i>{context}</i>\n<code>{error[:300]}</code>\n🕐 {now}"

        await self._broadcast("🚨 **System Error**", telegram_text, discord_embeds)

    async def send_daily_summary(
        self,
        balance: float,
        initial_balance: float,
        trade_count: int,
        win_count: int,
        total_pnl: float,
    ) -> None:
        """Optional daily summary alert."""
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        roi = ((balance - initial_balance) / initial_balance * 100) if initial_balance else 0
        win_rate = (win_count / trade_count * 100) if trade_count else 0
        pnl_emoji = "📈" if total_pnl >= 0 else "📉"

        discord_embeds = [{
            "title": f"📊 Daily Summary — {now}",
            "fields": [
                {"name": "Balance", "value": f"${balance:,.2f}", "inline": True},
                {"name": "ROI", "value": f"{roi:+.2f}%", "inline": True},
                {"name": "PnL", "value": f"{pnl_emoji} ${total_pnl:+.2f}", "inline": True},
                {"name": "Trades", "value": str(trade_count), "inline": True},
                {"name": "Win Rate", "value": f"{win_rate:.1f}%", "inline": True},
            ],
            "color": 0x6366f1,
        }]
        telegram_text = (
            f"📊 <b>Daily Summary — {now}</b>\n"
            f"💰 Balance: ${balance:,.2f} ({roi:+.2f}%)\n"
            f"{pnl_emoji} PnL: ${total_pnl:+.2f}\n"
            f"📋 Trades: {trade_count} | Win Rate: {win_rate:.1f}%"
        )
        await self._broadcast("📊 **Daily Summary**", telegram_text, discord_embeds)


# ─── Singleton ────────────────────────────────────────────────────────────────
alert_manager = AlertManager()
