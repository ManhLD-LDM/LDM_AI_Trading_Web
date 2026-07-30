"""Test script for math_plan_builder and model changes."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

print("=" * 60)
print("TEST 1: Math Plan Builder — LONG SCALP")
print("=" * 60)
from math_plan_builder import build_math_plan
plan = build_math_plan("LONG", 80, 100000, 500, 99000, 101000, "SCALP")
assert plan["stopLoss"]["price"] < 100000, f"SL should be < entry, got {plan['stopLoss']['price']}"
assert plan["takeProfit"][0]["price"] > 100000, f"TP1 should be > entry, got {plan['takeProfit'][0]['price']}"
assert plan["takeProfit"][1]["price"] > plan["takeProfit"][0]["price"], "TP2 should be > TP1"
print(f"  SL = {plan['stopLoss']['price']}")
print(f"  TP1 = {plan['takeProfit'][0]['price']}")
print(f"  TP2 = {plan['takeProfit'][1]['price']}")
print(f"  SL method = {plan['stopLoss']['method']}")
print("  ✅ PASSED")

print()
print("=" * 60)
print("TEST 2: Math Plan Builder — SHORT SWING")
print("=" * 60)
plan2 = build_math_plan("SHORT", 70, 100000, 500, 99000, 101000, "SWING")
assert plan2["stopLoss"]["price"] > 100000, f"SHORT SL should be > entry, got {plan2['stopLoss']['price']}"
assert plan2["takeProfit"][0]["price"] < 100000, f"SHORT TP1 should be < entry, got {plan2['takeProfit'][0]['price']}"
print(f"  SL = {plan2['stopLoss']['price']}")
print(f"  TP1 = {plan2['takeProfit'][0]['price']}")
print(f"  Mode = {plan2['mode']}")
print("  ✅ PASSED")

print()
print("=" * 60)
print("TEST 3: Math Plan Builder — WAIT signal")
print("=" * 60)
plan3 = build_math_plan("WAIT", 50, 100000, 500, 99000, 101000, "SCALP")
assert plan3["recommendation"] == "WAIT"
assert plan3["riskRewardRatio"] == 0
assert len(plan3["takeProfit"]) == 0
print(f"  Recommendation = {plan3['recommendation']}")
print(f"  R:R = {plan3['riskRewardRatio']}")
print("  ✅ PASSED")

print()
print("=" * 60)
print("TEST 4: User Override TP/SL")
print("=" * 60)
plan4 = build_math_plan("LONG", 75, 100000, 500, 99000, 101000, "SCALP",
                        user_sl_price=98500, user_tp1_price=102000)
assert plan4["stopLoss"]["price"] == 98500, f"User SL override failed: {plan4['stopLoss']['price']}"
assert plan4["takeProfit"][0]["price"] == 102000, f"User TP1 override failed"
assert "[User Override]" in plan4["stopLoss"]["method"]
assert "[User]" in plan4["takeProfit"][0]["level"]
print(f"  SL = {plan4['stopLoss']['price']} (user override)")
print(f"  TP1 = {plan4['takeProfit'][0]['price']} (user override)")
print(f"  TP2 = {plan4['takeProfit'][1]['price']} (math default)")
print("  ✅ PASSED")

print()
print("=" * 60)
print("TEST 5: Model architectures — 3-class output shape")
print("=" * 60)
import torch
from trainers.models import LSTMModel, TCNModel, TransformerModel
dummy = torch.randn(1, 60, 65)
for name, Model in [("LSTM", LSTMModel), ("TCN", TCNModel), ("Transformer", TransformerModel)]:
    m = Model(65)
    out = m(dummy)
    assert out.shape == (1, 3), f"{name} expected (1,3) got {out.shape}"
    print(f"  {name}: output shape = {out.shape} ✅")

print()
print("=" * 60)
print("TEST 6: Triple Barrier Label function")
print("=" * 60)
import numpy as np
import pandas as pd
from trainers.data_utils import triple_barrier_label

# Create synthetic data with clear uptrend
np.random.seed(42)
n = 100
prices = 100 + np.cumsum(np.random.randn(n) * 0.5)
df_test = pd.DataFrame({
    "open": prices,
    "high": prices + abs(np.random.randn(n)),
    "low": prices - abs(np.random.randn(n)),
    "close": prices,
    "volume": np.random.randint(100, 1000, n),
})
labels = triple_barrier_label(df_test, max_holding_bars=15, tp_atr_mult=2.0, sl_atr_mult=1.5)
unique, counts = np.unique(labels, return_counts=True)
label_dist = dict(zip(unique, counts))
print(f"  Label distribution: {label_dist}")
print(f"  Total labels: {len(labels)}")
assert 0 in label_dist, "Should have WAIT labels"
assert len(labels) == n, f"Label count mismatch: {len(labels)} vs {n}"
print("  ✅ PASSED")

print()
print("=" * 60)
print("TEST 7: Full import chain (main, agents, signal_scorer, math_plan_builder)")
print("=" * 60)
import signal_scorer
import shared_features
import math_plan_builder
print("  signal_scorer ✅")
print("  shared_features ✅")
print("  math_plan_builder ✅")

print()
print("=" * 60)
print("ALL TESTS PASSED ✅")
print("=" * 60)
