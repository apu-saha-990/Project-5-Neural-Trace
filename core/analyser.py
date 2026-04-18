"""
neural-trace/core/analyser.py
──────────────────────────────
Pure analysis logic for the Monitor engine.
Takes fetched transactions, returns structured results.

No API calls here. No file I/O here. Just data in, analysis out.
"""

import logging
from collections import defaultdict
from datetime import datetime, timezone
from config.settings import (
    SPIKE_USD,
    STRUCTURING_MIN_TXS,
    STRUCTURING_BAND_PCT,
    STRUCTURING_WINDOW_HRS,
    STRUCTURING_MIN_TOTAL,
)

log = logging.getLogger("neuraltrace.analyser")


# ── Wallet Analysis ───────────────────────────────────────────────────────────

def analyse_wallet(address: str, label: str,
                   normal_txs: list, usdt_txs: list,
                   eth_price: float) -> dict:
    """
    Analyse a single wallet's transactions.
    Returns structured dict with volumes, counts, spikes and structuring alerts.
    """
    addr = address.lower()

    # ── ETH volumes ───────────────────────────────────────────────────────────
    eth_in  = sum(int(tx["value"]) for tx in normal_txs
                  if tx.get("to", "").lower() == addr
                  and tx.get("isError", "0") == "0")
    eth_out = sum(int(tx["value"]) for tx in normal_txs
                  if tx.get("from", "").lower() == addr
                  and tx.get("isError", "0") == "0")

    eth_in_val  = eth_in  / 1e18
    eth_out_val = eth_out / 1e18

    # ── USDT volumes ──────────────────────────────────────────────────────────
    usdt_in  = sum(int(tx["value"]) for tx in usdt_txs
                   if tx.get("to", "").lower() == addr)
    usdt_out = sum(int(tx["value"]) for tx in usdt_txs
                   if tx.get("from", "").lower() == addr)

    usdt_in_val  = usdt_in  / 1e6
    usdt_out_val = usdt_out / 1e6

    # ── Spike detection ───────────────────────────────────────────────────────
    spikes = []

    for tx in normal_txs:
        if tx.get("to", "").lower() == addr and tx.get("isError", "0") == "0":
            val_usd = (int(tx["value"]) / 1e18) * eth_price
            if val_usd >= SPIKE_USD:
                spikes.append({
                    "hash":       tx["hash"],
                    "from":       tx["from"],
                    "amount_eth": round(int(tx["value"]) / 1e18, 6),
                    "amount_usd": round(val_usd, 2),
                    "timestamp":  int(tx["timeStamp"]),
                    "token":      "ETH",
                })

    for tx in usdt_txs:
        if tx.get("to", "").lower() == addr:
            val_usd = int(tx["value"]) / 1e6
            if val_usd >= SPIKE_USD:
                spikes.append({
                    "hash":        tx["hash"],
                    "from":        tx["from"],
                    "amount_usdt": round(val_usd, 2),
                    "amount_usd":  round(val_usd, 2),
                    "timestamp":   int(tx["timeStamp"]),
                    "token":       "USDT",
                })

    # ── Structuring detection ─────────────────────────────────────────────────
    structuring = detect_structuring(address, label, usdt_txs)

    return {
        "address":          address,
        "label":            label,
        "tx_count_normal":  len(normal_txs),
        "tx_count_usdt":    len(usdt_txs),
        "eth_in":           round(eth_in_val, 6),
        "eth_out":          round(eth_out_val, 6),
        "eth_in_usd":       round(eth_in_val  * eth_price, 2),
        "eth_out_usd":      round(eth_out_val * eth_price, 2),
        "usdt_in":          round(usdt_in_val, 2),
        "usdt_out":         round(usdt_out_val, 2),
        "total_in_usd":     round(eth_in_val  * eth_price + usdt_in_val,  2),
        "total_out_usd":    round(eth_out_val * eth_price + usdt_out_val, 2),
        "spikes":           spikes,
        "spike_count":      len(spikes),
        "structuring":      structuring,
    }


def build_batch_totals(results: list) -> dict:
    """Aggregate totals across all wallet results."""
    return {
        "total_in_usd":   round(sum(w["total_in_usd"]  for w in results), 2),
        "total_out_usd":  round(sum(w["total_out_usd"] for w in results), 2),
        "total_eth_in":   round(sum(w["eth_in"]        for w in results), 6),
        "total_eth_out":  round(sum(w["eth_out"]       for w in results), 6),
        "total_usdt_in":  round(sum(w["usdt_in"]       for w in results), 2),
        "total_usdt_out": round(sum(w["usdt_out"]      for w in results), 2),
        "spike_count":    sum(w["spike_count"]          for w in results),
        "structuring_count": sum(len(w["structuring"])  for w in results),
        "wallets_active": sum(
            1 for w in results
            if w["tx_count_normal"] + w["tx_count_usdt"] > 0
        ),
    }


def collect_all_spikes(results: list) -> list:
    """Flatten spikes from all wallet results into a single list."""
    all_spikes = []
    for w in results:
        for s in w.get("spikes", []):
            all_spikes.append({
                **s,
                "wallet":       w["address"],
                "wallet_label": w["label"],
            })
    return sorted(all_spikes, key=lambda x: x["amount_usd"], reverse=True)


def collect_all_structuring(results: list) -> list:
    """Flatten structuring alerts from all wallet results."""
    alerts = []
    for w in results:
        alerts.extend(w.get("structuring", []))
    return alerts


# ── Structuring Detection ─────────────────────────────────────────────────────

def detect_structuring(address: str, label: str, usdt_txs: list) -> list:
    """
    Detect structured / smurfing patterns in USDT transactions.

    Flags when:
    - 3+ transactions from same sender
    - All within 20% of each other in value
    - All within 6 hours
    - Combined total above $30,000

    USDT only — ETH gas payments would create false positives.
    """
    alerts = []
    addr   = address.lower()

    # Group inbound USDT by sender
    inbound_by_sender = defaultdict(list)
    for tx in usdt_txs:
        if tx.get("to", "").lower() == addr:
            sender = tx.get("from", "").lower()
            inbound_by_sender[sender].append({
                "hash":      tx["hash"],
                "from":      tx["from"],
                "value_usd": int(tx.get("value", 0)) / 1e6,
                "timestamp": int(tx.get("timeStamp", 0)),
            })

    for sender, txs in inbound_by_sender.items():
        if len(txs) < STRUCTURING_MIN_TXS:
            continue

        txs_sorted = sorted(txs, key=lambda x: x["timestamp"])

        for i in range(len(txs_sorted)):
            window = [txs_sorted[i]]
            for j in range(i + 1, len(txs_sorted)):
                if txs_sorted[j]["timestamp"] - txs_sorted[i]["timestamp"] <= STRUCTURING_WINDOW_HRS * 3600:
                    window.append(txs_sorted[j])

            if len(window) < STRUCTURING_MIN_TXS:
                continue

            values    = [t["value_usd"] for t in window]
            avg_val   = sum(values) / len(values)
            total_val = sum(values)

            if total_val < STRUCTURING_MIN_TOTAL:
                continue

            in_band = all(
                abs(v - avg_val) / avg_val <= STRUCTURING_BAND_PCT
                for v in values
            )
            if not in_band:
                continue

            window_start = datetime.fromtimestamp(
                window[0]["timestamp"], tz=timezone.utc
            ).strftime("%d %b %Y %H:%M UTC")
            window_end = datetime.fromtimestamp(
                window[-1]["timestamp"], tz=timezone.utc
            ).strftime("%d %b %Y %H:%M UTC")

            alerts.append({
                "wallet":       address,
                "wallet_label": label,
                "sender":       window[0]["from"],
                "tx_count":     len(window),
                "total_usd":    round(total_val, 2),
                "avg_usd":      round(avg_val, 2),
                "min_usd":      round(min(values), 2),
                "max_usd":      round(max(values), 2),
                "window_start": window_start,
                "window_end":   window_end,
                "window_hours": round(
                    (window[-1]["timestamp"] - window[0]["timestamp"]) / 3600, 1
                ),
                "transactions": window,
                "pattern":      "STRUCTURING",
            })

            log.warning(
                "STRUCTURING: %s — %d txs from %s total $%.0f in %.1fh",
                label, len(window), window[0]["from"],
                total_val,
                (window[-1]["timestamp"] - window[0]["timestamp"]) / 3600
            )
            break  # one alert per sender per wallet

    return alerts
