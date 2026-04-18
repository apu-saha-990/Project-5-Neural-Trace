"""
neural-trace/core/monitor.py
──────────────────────────────
Monitor engine orchestrator.
Reads wallet list from a Neural Trace JSON export,
fetches transactions for the selected time window,
runs all analysis modules and returns structured results.

Called by server.js POST /monitor endpoint.
No CLI. No file I/O. Returns data, server handles saving.
"""

import logging
from datetime import datetime, timezone, timedelta
from core.fetcher      import get_normal_txs, get_usdt_txs, get_last_tx_before
from core.pricer       import get_eth_usd
from core.analyser     import analyse_wallet, build_batch_totals, collect_all_spikes, collect_all_structuring
from core.intelligence import analyse_dormancy, build_gas_map
from config.settings   import WINDOW_48H, WINDOW_7D

log = logging.getLogger("neuraltrace.monitor")


def run_monitor(trace_data: dict, window: str = "48h") -> dict:
    """
    Main monitor run.

    Args:
        trace_data: Neural Trace JSON export (v2 format)
        window:     "48h" or "7d"

    Returns:
        Complete monitor result dict ready for server to save + send to browser.
    """
    # ── Setup ─────────────────────────────────────────────────────────────────
    window_hours = WINDOW_7D if window == "7d" else WINDOW_48H
    run_at       = datetime.now(tz=timezone.utc)
    from_ts      = int((run_at - timedelta(hours=window_hours)).timestamp())
    eth_price    = get_eth_usd()

    project_name = trace_data.get("meta", {}).get("project_name", "Unknown")
    seed_address = trace_data.get("meta", {}).get("seed_address", "")

    log.info("=== Neural Trace Monitor ===")
    log.info("Project  : %s", project_name)
    log.info("Window   : %s (%dh)", window, window_hours)
    log.info("ETH      : $%.2f", eth_price)
    log.info("From     : %s", run_at - timedelta(hours=window_hours))

    # ── Extract wallets from Neural Trace JSON ─────────────────────────────────
    # Skip HOT_WALLET_KYC — exchanges are shared infrastructure, not useful to monitor
    all_nodes = trace_data.get("nodes", [])
    wallets   = [
        n for n in all_nodes
        if n.get("type") not in ("HOT_WALLET_KYC", "MIXER", "BRIDGE")
        and n.get("addr")
    ]

    log.info("Wallets  : %d (from %d total nodes, exchanges/mixers excluded)",
             len(wallets), len(all_nodes))

    if not wallets:
        log.warning("No wallets to monitor after filtering.")
        return _empty_result(run_at, window, window_hours, eth_price, project_name, seed_address)

    # Build known wallet map for cross-referencing
    known_wallets = {n["addr"].lower(): n["label"] for n in all_nodes}

    # ── Run analysis per wallet ────────────────────────────────────────────────
    results = []

    for i, w in enumerate(wallets, 1):
        addr  = w["addr"]
        label = w.get("label", addr[:10])
        log.info("[%d/%d] %s (%s...)", i, len(wallets), label, addr[:10])

        normal_txs = get_normal_txs(addr, from_ts)
        usdt_txs   = get_usdt_txs(addr, from_ts)
        result     = analyse_wallet(addr, label, normal_txs, usdt_txs, eth_price)

        # ── dormancy_days_before ───────────────────────────────────────────────
        last_tx = get_last_tx_before(addr, from_ts)
        if last_tx is None:
            # API returned nothing — could be new wallet or API failure
            # Check if wallet had any history at all by looking at node data
            node_first_tx = w.get("first_tx_timestamp_utc", "")
            dormancy_days_before = "new_wallet" if not node_first_tx else None
        else:
            last_ts = int(last_tx.get("timeStamp", 0))
            if last_ts == 0:
                dormancy_days_before = None
            else:
                dormancy_days_before = round((from_ts - last_ts) / 86400, 2)

        result["dormancy_days_before"] = dormancy_days_before
        results.append(result)

        if result["spike_count"]:
            log.warning("  SPIKE: %d tx(s) on %s", result["spike_count"], label)
        if result["structuring"]:
            log.warning("  STRUCTURING: %d pattern(s) on %s",
                        len(result["structuring"]), label)
        log.info("  IN: $%.0f  OUT: $%.0f  TXs: %d",
                 result["total_in_usd"], result["total_out_usd"],
                 result["tx_count_normal"] + result["tx_count_usdt"])

    # ── Intelligence modules ───────────────────────────────────────────────────
    log.info("Running intelligence modules...")
    dormancy = analyse_dormancy(wallets, from_ts)
    gas_map  = build_gas_map(wallets, known_wallets)

    # ── Aggregate ─────────────────────────────────────────────────────────────
    batch_totals  = build_batch_totals(results)
    all_spikes    = collect_all_spikes(results)
    all_structuring = collect_all_structuring(results)

    sudden_activations = [d for d in dormancy if d.get("flag") == "SUDDEN_ACTIVATION"]
    likely_operators   = [
        f for f in gas_map["funders"].values()
        if f.get("flag") == "LIKELY_OPERATOR"
    ]

    log.info("=== Monitor Complete ===")
    log.info("Spikes       : %d", len(all_spikes))
    log.info("Structuring  : %d", len(all_structuring))
    log.info("Dormancy hits: %d", len(sudden_activations))
    log.info("Gas operators: %d", len(likely_operators))

    return {
        "meta": {
            "generated_at":   run_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "window":         window,
            "window_hours":   window_hours,
            "window_from":    datetime.fromtimestamp(
                                  from_ts, tz=timezone.utc
                              ).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "eth_price_usd":  eth_price,
            "project_name":   project_name,
            "seed_address":   seed_address,
            "wallets_scanned": len(wallets),
            "wallets_active":  batch_totals["wallets_active"],
        },
        "batch_totals":   batch_totals,
        "spikes":         all_spikes,
        "structuring":    all_structuring,
        "dormancy":       dormancy,
        "gas_map":        gas_map,
        "sudden_activations": sudden_activations,
        "likely_operators":   likely_operators,
        "wallets":        results,
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _empty_result(run_at, window, window_hours, eth_price, project_name, seed_address) -> dict:
    """Return empty result structure when no wallets found."""
    return {
        "meta": {
            "generated_at":    run_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "window":          window,
            "window_hours":    window_hours,
            "window_from":     "",
            "eth_price_usd":   eth_price,
            "project_name":    project_name,
            "seed_address":    seed_address,
            "wallets_scanned": 0,
            "wallets_active":  0,
        },
        "batch_totals":       {},
        "spikes":             [],
        "structuring":        [],
        "dormancy":           [],
        "gas_map":            {},
        "sudden_activations": [],
        "likely_operators":   [],
        "wallets":            [],
    }
