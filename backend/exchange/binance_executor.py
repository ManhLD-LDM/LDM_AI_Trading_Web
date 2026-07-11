"""
backend/exchange/binance_executor.py

Binance Order Execution Engine.
Hỗ trợ:
  - Market BUY + auto OCO (TP + SL)
  - Market SELL
  - Balance check
  - Cancel open orders

QUAN TRỌNG: Luôn dùng testnet=True cho đến khi bạn sẵn sàng dùng tiền thật.
Binance Testnet: https://testnet.binance.vision
"""
import asyncio
import math
from logger import setup_logger

logger = setup_logger("ldm.executor")


class BinanceExecutor:
    def __init__(self, api_key: str, api_secret: str, testnet: bool = True):
        from binance.client import Client
        self.testnet = testnet
        self.client = Client(api_key, api_secret, testnet=testnet)
        mode = "TESTNET" if testnet else "⚠️  LIVE (real money)"
        logger.info(f"BinanceExecutor initialized — mode={mode}")

    # ─── Market Data ───────────────────────────────────────────────────────────
    async def get_current_price(self, symbol: str) -> float:
        """Lấy giá hiện tại của symbol từ Binance ticker."""
        ticker = await asyncio.to_thread(self.client.get_symbol_ticker, symbol=symbol)
        return float(ticker["price"])

    async def get_symbol_filters(self, symbol: str) -> dict:
        """
        Lấy LOT_SIZE và PRICE_FILTER để round đúng precision khi đặt lệnh.
        Binance sẽ reject order nếu quantity/price không đúng step size.
        """
        info = await asyncio.to_thread(self.client.get_symbol_info, symbol)
        if not info:
            raise ValueError(f"Symbol {symbol} not found on Binance")

        result = {
            "step_size": 0.001,
            "min_qty": 0.001,
            "tick_size": 0.01,
            "min_notional": 10.0,
        }
        for f in info["filters"]:
            ft = f["filterType"]
            if ft == "LOT_SIZE":
                result["step_size"] = float(f["stepSize"])
                result["min_qty"] = float(f["minQty"])
            elif ft == "PRICE_FILTER":
                result["tick_size"] = float(f["tickSize"])
            elif ft in ("MIN_NOTIONAL", "NOTIONAL"):
                result["min_notional"] = float(f.get("minNotional", f.get("minVal", 10)))
        return result

    # ─── Precision Helpers ─────────────────────────────────────────────────────
    def _round_step(self, value: float, step: float) -> float:
        """Round xuống (floor) theo Binance step size."""
        if step <= 0:
            return value
        precision = max(0, len(f"{step:.10f}".rstrip("0").split(".")[-1]))
        return round(math.floor(value / step) * step, precision)

    def _price_precision(self, tick_size: float) -> int:
        """Số chữ số thập phân cho price."""
        if tick_size <= 0:
            return 2
        return max(0, len(f"{tick_size:.10f}".rstrip("0").split(".")[-1]))

    # ─── Account ───────────────────────────────────────────────────────────────
    async def get_account_balance(self) -> dict[str, dict]:
        """
        Lấy toàn bộ balances của tài khoản.
        Returns: {asset: {free: float, locked: float}}
        """
        account = await asyncio.to_thread(self.client.get_account)
        balances = {}
        for b in account["balances"]:
            free = float(b["free"])
            locked = float(b["locked"])
            if free > 0 or locked > 0:
                balances[b["asset"]] = {"free": free, "locked": locked}
        return balances

    async def get_usdt_balance(self) -> float:
        """Trả về USDT free balance."""
        balances = await self.get_account_balance()
        return balances.get("USDT", {}).get("free", 0.0)

    # ─── Orders ────────────────────────────────────────────────────────────────
    async def place_market_buy_with_oco(
        self,
        symbol: str,
        usdt_amount: float,
        stop_loss_pct: float = 0.02,
        take_profit_pct: float = 0.04,
    ) -> dict:
        """
        Quy trình:
        1. Kiểm tra symbol filters & validate
        2. Đặt Market BUY
        3. Sau khi fill → đặt OCO order (TP limit + SL stop-limit)

        Args:
            symbol: e.g. "BTCUSDT"
            usdt_amount: số USDT muốn mua
            stop_loss_pct: 0.02 = 2% SL dưới fill price
            take_profit_pct: 0.04 = 4% TP trên fill price

        Returns:
            dict với success, order_id, oco_order_id, fill_price, sl, tp
        """
        try:
            filters = await self.get_symbol_filters(symbol)
            step_size = filters["step_size"]
            tick_size = filters["tick_size"]
            min_notional = filters["min_notional"]
            min_qty = filters["min_qty"]
            price_prec = self._price_precision(tick_size)

            current_price = await self.get_current_price(symbol)
            raw_qty = usdt_amount / current_price
            qty = self._round_step(raw_qty, step_size)

            # Validate trước khi gửi
            if qty < min_qty:
                return {"success": False, "error": f"Quantity {qty} < minimum {min_qty}. Increase usdt_amount."}
            order_value = qty * current_price
            if order_value < min_notional:
                return {"success": False, "error": f"Order value ${order_value:.2f} < minimum notional ${min_notional}"}

            logger.info(
                f"[{symbol}] MARKET BUY — qty={qty}, ~${order_value:.0f} "
                f"@ ${current_price:.4f} | testnet={self.testnet}"
            )

            # ── Step 1: Market Buy ─────────────────────────────────────────
            order = await asyncio.to_thread(
                self.client.order_market_buy,
                symbol=symbol,
                quantity=qty,
            )

            # Tính fill price trung bình có trọng số
            fills = order.get("fills", [])
            if fills:
                total_qty = sum(float(f["qty"]) for f in fills)
                fill_price = (
                    sum(float(f["price"]) * float(f["qty"]) for f in fills) / total_qty
                )
            else:
                fill_price = current_price

            filled_qty = self._round_step(float(order.get("executedQty", qty)), step_size)

            logger.info(
                f"[{symbol}] BUY filled — qty={filled_qty}, avg_price={fill_price:.4f}"
            )

            # ── Step 2: OCO (TP + SL) ─────────────────────────────────────
            tp_price = round(fill_price * (1 + take_profit_pct), price_prec)
            sl_price = round(fill_price * (1 - stop_loss_pct), price_prec)
            # Limit price phải thấp hơn stop price một chút
            sl_limit = round(sl_price * 0.999, price_prec)

            oco = await asyncio.to_thread(
                self.client.order_oco_sell,
                symbol=symbol,
                quantity=filled_qty,
                price=str(tp_price),
                stopPrice=str(sl_price),
                stopLimitPrice=str(sl_limit),
                stopLimitTimeInForce="GTC",
            )

            logger.info(
                f"[{symbol}] OCO placed — TP={tp_price}, SL={sl_price}, "
                f"list_id={oco.get('orderListId')}"
            )

            return {
                "success": True,
                "symbol": symbol,
                "side": "BUY",
                "quantity": filled_qty,
                "fill_price": round(fill_price, price_prec),
                "take_profit": tp_price,
                "stop_loss": sl_price,
                "order_id": order["orderId"],
                "oco_order_id": oco.get("orderListId"),
                "usdt_spent": round(filled_qty * fill_price, 2),
                "testnet": self.testnet,
            }

        except Exception as e:
            logger.error(f"[{symbol}] Order execution failed: {e}")
            return {"success": False, "error": str(e)}

    async def place_market_sell(self, symbol: str, quantity: float) -> dict:
        """
        Đặt Market SELL cho toàn bộ quantity.
        Dùng khi muốn exit thủ công (trước SL/TP trigger).
        """
        try:
            filters = await self.get_symbol_filters(symbol)
            qty = self._round_step(quantity, filters["step_size"])
            if qty <= 0:
                return {"success": False, "error": "Quantity too small to sell"}

            logger.info(f"[{symbol}] MARKET SELL — qty={qty} | testnet={self.testnet}")

            order = await asyncio.to_thread(
                self.client.order_market_sell,
                symbol=symbol,
                quantity=qty,
            )

            fills = order.get("fills", [])
            if fills:
                total_qty = sum(float(f["qty"]) for f in fills)
                fill_price = (
                    sum(float(f["price"]) * float(f["qty"]) for f in fills) / total_qty
                )
            else:
                fill_price = await self.get_current_price(symbol)

            logger.info(f"[{symbol}] SELL filled — qty={qty}, price={fill_price:.4f}")

            return {
                "success": True,
                "symbol": symbol,
                "side": "SELL",
                "quantity": qty,
                "fill_price": round(fill_price, self._price_precision(filters["tick_size"])),
                "order_id": order["orderId"],
                "testnet": self.testnet,
            }

        except Exception as e:
            logger.error(f"[{symbol}] Sell order failed: {e}")
            return {"success": False, "error": str(e)}

    async def cancel_all_open_orders(self, symbol: str) -> int:
        """
        Hủy tất cả open orders (kể cả OCO) cho symbol.
        Trả về số orders đã hủy.
        """
        try:
            orders = await asyncio.to_thread(self.client.get_open_orders, symbol=symbol)
            cancelled = 0
            for order in orders:
                try:
                    await asyncio.to_thread(
                        self.client.cancel_order,
                        symbol=symbol,
                        orderId=order["orderId"],
                    )
                    cancelled += 1
                except Exception as e:
                    logger.warning(f"Could not cancel order {order['orderId']}: {e}")
            logger.info(f"[{symbol}] Cancelled {cancelled}/{len(orders)} open orders")
            return cancelled
        except Exception as e:
            logger.error(f"[{symbol}] cancel_all_open_orders failed: {e}")
            return 0

    async def get_open_orders(self, symbol: str | None = None) -> list[dict]:
        """Lấy danh sách open orders, optional filter theo symbol."""
        kwargs = {"symbol": symbol} if symbol else {}
        orders = await asyncio.to_thread(self.client.get_open_orders, **kwargs)
        return [
            {
                "order_id": o["orderId"],
                "symbol": o["symbol"],
                "side": o["side"],
                "type": o["type"],
                "quantity": float(o["origQty"]),
                "price": float(o["price"]),
                "status": o["status"],
                "time": o["time"],
            }
            for o in orders
        ]
