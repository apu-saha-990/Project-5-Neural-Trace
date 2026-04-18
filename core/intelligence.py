"""
neural-trace/core/intelligence.py
──────────────────────────────────
Advanced intelligence modules for the Monitor engine:
  - Dormancy / sudden activation analysis
  - Gas funding map / operator detection

No API calls here — uses fetcher.py for all data retrieval.
Pure analysis logic only.
"""

import logging
from collections import defaultdict
from datetime import datetime, timezone
from core.fetcher import get_first_tx, get_first_inbound_eth, get_last_tx_before
from config.settings import DORMANCY_THRESHOLD_DAYS, GAS_OPERATOR_MIN_WALLETS

log = logging.getLogger("neuraltrace.intelligence")


# ── Dormancy Analysis ─────────────────────────────────────────────────────────

def analyse_dormancy(wallets: list, from_ts: int) -> list:
    """
    For each wallet check:
    - When was its first ever transaction?
    - When was its last transaction before this monitoring window?
    - If dormant 90+ days and now active — flag SUDDEN_ACTIVATION.

    Returns list of dormancy records, one per wallet.
    """
    log.info("Running dormancy analysis on %d wallets...", len(wallets))
    results = []

    for w in wallets:
        address = w["addr"]
        label   = w["label"]

        first_tx = get_first_tx(address)
        if not first_tx:
            results.append({
                "address":              address,
                "label":                label,
                "status":               "NO_HISTORY",
                "first_tx_date":        None,
                "last_pre_window_date": None,
                "dormancy_days":        None,
                "flag":                 None,
            })
            continue

        first_ts   = int(first_tx.get("timeStamp", 0))
        first_date = datetime.fromtimestamp(
            first_ts, tz=timezone.utc
        ).strftime("%d %b %Y %H:%M UTC")

        last_pre = get_last_tx_before(address, from_ts)
        if not last_pre:
            results.append({
                "address":              address,
                "label":                label,
                "status":               "ACTIVE_SINCE_BIRTH",
                "first_tx_date":        first_date,
                "last_pre_window_date": None,
                "dormancy_days":        None,
                "flag":                 None,
            })
            continue

        last_pre_ts   = int(last_pre.get("timeStamp", 0))
        last_pre_date = datetime.fromtimestamp(
            last_pre_ts, tz=timezone.utc
        ).strftime("%d %b %Y %H:%M UTC")
        dormancy_days = (from_ts - last_pre_ts) // 86400

        flag = None
        if dormancy_days >= DORMANCY_THRESHOLD_DAYS:
            flag = "SUDDEN_ACTIVATION"
            log.warning("SUDDEN_ACTIVATION: %s — dormant %d days", label, dormancy_days)

        results.append({
            "address":              address,
            "label":                label,
            "status":               "ANALYSED",
            "first_tx_date":        first_date,
            "last_pre_window_date": last_pre_date,
            "last_pre_window_ts":   last_pre_ts,
            "dormancy_days":        dormancy_days,
            "flag":                 flag,
        })

    flagged = [r for r in results if r.get("flag") == "SUDDEN_ACTIVATION"]
    log.info("Dormancy complete. %d wallet(s) flagged.", len(flagged))
    return results


# ── Gas Funding Map ───────────────────────────────────────────────────────────

def build_gas_map(wallets: list, known_wallets: dict) -> dict:
    """
    For each wallet find who funded its gas (first inbound ETH tx).
    Group wallets by gas funder to identify common operators.

    A funder that topped up gas for 3+ wallets = LIKELY_OPERATOR.
    A funder that is itself a tracked wallet = INTERNAL.

    Returns:
    {
        "funders": {
            "0xABC...": {
                "address":        str,
                "is_known":       bool,
                "known_label":    str | None,
                "funded_wallets": [...],
                "flag":           "LIKELY_OPERATOR" | "INTERNAL" | None
            }
        },
        "wallet_sources": {
            "0xWALLET...": {
                "label":      str,
                "funder":     str,
                "tx_hash":    str,
                "date":       str,
                "eth_value":  float,
                "is_known":   bool,
                "known_label": str | None
            }
        }
    }
    """
    log.info("Building gas funding map for %d wallets...", len(wallets))

    funders        = defaultdict(lambda: {
        "address":        None,
        "is_known":       False,
        "known_label":    None,
        "funded_wallets": [],
        "flag":           None,
    })
    wallet_sources = {}

    for w in wallets:
        address = w["addr"]
        label   = w["label"]

        first_eth = get_first_inbound_eth(address)
        if not first_eth:
            wallet_sources[address.lower()] = {
                "label":  label,
                "funder": None,
                "note":   "No inbound ETH found",
            }
            continue

        funder_addr = first_eth["from"]
        funder_low  = funder_addr.lower()
        tx_ts       = int(first_eth.get("timeStamp", 0))
        tx_date     = datetime.fromtimestamp(
            tx_ts, tz=timezone.utc
        ).strftime("%d %b %Y %H:%M UTC")
        tx_hash     = first_eth["hash"]
        eth_value   = int(first_eth.get("value", 0)) / 1e18

        is_known    = funder_low in known_wallets
        known_label = known_wallets.get(funder_low)

        funders[funder_low]["address"]     = funder_addr
        funders[funder_low]["is_known"]    = is_known
        funders[funder_low]["known_label"] = known_label
        funders[funder_low]["funded_wallets"].append({
            "address":   address,
            "label":     label,
            "tx_hash":   tx_hash,
            "date":      tx_date,
            "eth_value": round(eth_value, 6),
        })

        wallet_sources[address.lower()] = {
            "label":       label,
            "funder":      funder_addr,
            "tx_hash":     tx_hash,
            "date":        tx_date,
            "eth_value":   round(eth_value, 6),
            "is_known":    is_known,
            "known_label": known_label,
        }

    # Classify funders
    for funder_low, data in funders.items():
        count = len(data["funded_wallets"])
        if data["is_known"]:
            data["flag"] = "INTERNAL"
        elif count >= GAS_OPERATOR_MIN_WALLETS:
            data["flag"] = "LIKELY_OPERATOR"
            log.warning(
                "LIKELY_OPERATOR: %s funded %d wallets",
                data["address"], count
            )

    likely_ops = [d for d in funders.values() if d["flag"] == "LIKELY_OPERATOR"]
    log.info("Gas map complete. %d likely operator(s) identified.", len(likely_ops))

    return {
        "funders":        dict(funders),
        "wallet_sources": wallet_sources,
    }
