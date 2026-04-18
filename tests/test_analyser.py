"""
neural-trace/tests/test_analyser.py
Tests for core/analyser.py — pure logic, no API calls.
"""
import pytest
from core.analyser import (
    analyse_wallet,
    build_batch_totals,
    collect_all_spikes,
    detect_structuring,
)

ADDR  = "0xTestAddress000000000000000000000000000001"
ADDR2 = "0xTestAddress000000000000000000000000000002"


# ── TX builders ───────────────────────────────────────────────────────────────

def _eth_tx(to, value_wei, from_addr="0xSENDER", is_error="0", ts=1700000000):
    return {
        "to":        to,
        "from":      from_addr,
        "value":     str(value_wei),
        "isError":   is_error,
        "timeStamp": str(ts),
        "hash":      "0xHASH",
    }


def _usdt_tx(to, value_micro, from_addr="0xSENDER", ts=1700000000):
    return {
        "to":        to,
        "from":      from_addr,
        "value":     str(value_micro),
        "timeStamp": str(ts),
        "hash":      "0xHASH",
    }


# ── analyse_wallet — ETH ──────────────────────────────────────────────────────

def test_eth_inbound_calculated_correctly():
    txs = [_eth_tx(ADDR, int(2 * 1e18))]  # 2 ETH
    r = analyse_wallet(ADDR, "Test", txs, [], eth_price=2000.0)
    assert r["eth_in"] == 2.0
    assert r["eth_in_usd"] == 4000.0


def test_eth_outbound_not_counted_as_inbound():
    txs = [_eth_tx("0xOTHER", int(1e18), from_addr=ADDR)]  # outbound from ADDR
    r = analyse_wallet(ADDR, "Test", txs, [], eth_price=2000.0)
    assert r["eth_in"] == 0.0
    assert r["eth_out"] == 1.0


def test_errored_transactions_excluded():
    txs = [_eth_tx(ADDR, int(5 * 1e18), is_error="1")]
    r = analyse_wallet(ADDR, "Test", txs, [], eth_price=2000.0)
    assert r["eth_in"] == 0.0


def test_multiple_eth_transactions_summed():
    txs = [
        _eth_tx(ADDR, int(1e18)),
        _eth_tx(ADDR, int(2e18)),
        _eth_tx(ADDR, int(0.5e18)),
    ]
    r = analyse_wallet(ADDR, "Test", txs, [], eth_price=1000.0)
    assert r["eth_in"] == 3.5
    assert r["eth_in_usd"] == 3500.0


# ── analyse_wallet — USDT ─────────────────────────────────────────────────────

def test_usdt_inbound_calculated_correctly():
    txs = [_usdt_tx(ADDR, int(500 * 1e6))]  # 500 USDT
    r = analyse_wallet(ADDR, "Test", [], txs, eth_price=2000.0)
    assert r["usdt_in"] == 500.0


def test_usdt_outbound_not_counted_as_inbound():
    txs = [_usdt_tx("0xOTHER", int(100 * 1e6), from_addr=ADDR)]
    r = analyse_wallet(ADDR, "Test", [], txs, eth_price=2000.0)
    assert r["usdt_in"]  == 0.0
    assert r["usdt_out"] == 100.0


# ── analyse_wallet — spikes ───────────────────────────────────────────────────

def test_eth_spike_detected_above_threshold():
    txs = [_eth_tx(ADDR, int(30 * 1e18))]  # 30 ETH @ $2000 = $60k
    r = analyse_wallet(ADDR, "Test", txs, [], eth_price=2000.0)
    assert r["spike_count"] == 1
    assert r["spikes"][0]["amount_usd"] == 60000.0
    assert r["spikes"][0]["token"] == "ETH"


def test_eth_spike_not_triggered_below_threshold():
    txs = [_eth_tx(ADDR, int(1e18))]  # 1 ETH @ $2000 = $2k — below $50k
    r = analyse_wallet(ADDR, "Test", txs, [], eth_price=2000.0)
    assert r["spike_count"] == 0


def test_usdt_spike_detected_above_threshold():
    txs = [_usdt_tx(ADDR, int(75000 * 1e6))]  # $75k USDT
    r = analyse_wallet(ADDR, "Test", [], txs, eth_price=2000.0)
    assert r["spike_count"] == 1
    assert r["spikes"][0]["token"] == "USDT"


def test_multiple_spikes_all_captured():
    txs = [
        _eth_tx(ADDR, int(30 * 1e18)),  # $60k
        _eth_tx(ADDR, int(40 * 1e18)),  # $80k
    ]
    r = analyse_wallet(ADDR, "Test", txs, [], eth_price=2000.0)
    assert r["spike_count"] == 2


# ── build_batch_totals ────────────────────────────────────────────────────────

def test_batch_totals_aggregated_correctly():
    results = [
        {
            "total_in_usd": 1000.0, "total_out_usd": 500.0,
            "eth_in": 0.5, "eth_out": 0.2,
            "usdt_in": 0.0, "usdt_out": 0.0,
            "spike_count": 1, "structuring": [],
            "tx_count_normal": 3, "tx_count_usdt": 0,
        },
        {
            "total_in_usd": 2000.0, "total_out_usd": 1000.0,
            "eth_in": 1.0, "eth_out": 0.5,
            "usdt_in": 0.0, "usdt_out": 0.0,
            "spike_count": 2, "structuring": [],
            "tx_count_normal": 5, "tx_count_usdt": 0,
        },
    ]
    bt = build_batch_totals(results)
    assert bt["total_in_usd"]  == 3000.0
    assert bt["total_out_usd"] == 1500.0
    assert bt["spike_count"]   == 3
    assert bt["wallets_active"] == 2


def test_batch_totals_inactive_wallet_not_counted():
    results = [
        {
            "total_in_usd": 0.0, "total_out_usd": 0.0,
            "eth_in": 0.0, "eth_out": 0.0,
            "usdt_in": 0.0, "usdt_out": 0.0,
            "spike_count": 0, "structuring": [],
            "tx_count_normal": 0, "tx_count_usdt": 0,
        },
    ]
    bt = build_batch_totals(results)
    assert bt["wallets_active"] == 0


# ── collect_all_spikes ────────────────────────────────────────────────────────

def test_spikes_sorted_by_usd_descending():
    results = [
        {
            "address": ADDR, "label": "Wallet A",
            "spikes": [
                {"amount_usd": 60000.0, "token": "ETH", "hash": "0x1",
                 "from": "0xA", "amount_eth": 30.0, "timestamp": 1700000000},
            ],
            "spike_count": 1,
        },
        {
            "address": ADDR2, "label": "Wallet B",
            "spikes": [
                {"amount_usd": 90000.0, "token": "ETH", "hash": "0x2",
                 "from": "0xB", "amount_eth": 45.0, "timestamp": 1700000001},
            ],
            "spike_count": 1,
        },
    ]
    spikes = collect_all_spikes(results)
    assert spikes[0]["amount_usd"] == 90000.0
    assert spikes[1]["amount_usd"] == 60000.0


# ── detect_structuring ────────────────────────────────────────────────────────

def test_structuring_detected_when_pattern_matches():
    base_ts = 1700000000
    txs = [
        _usdt_tx(ADDR, int(10000 * 1e6), from_addr="0xSMURF", ts=base_ts),
        _usdt_tx(ADDR, int(10500 * 1e6), from_addr="0xSMURF", ts=base_ts + 3600),
        _usdt_tx(ADDR, int(9800  * 1e6), from_addr="0xSMURF", ts=base_ts + 7200),
    ]
    alerts = detect_structuring(ADDR, "Test", txs)
    assert len(alerts) == 1
    assert alerts[0]["pattern"] == "STRUCTURING"
    assert alerts[0]["tx_count"] == 3


def test_structuring_not_triggered_below_total_threshold():
    base_ts = 1700000000
    # 3 txs but total only $900 — below $30k threshold
    txs = [
        _usdt_tx(ADDR, int(300 * 1e6), from_addr="0xSMURF", ts=base_ts),
        _usdt_tx(ADDR, int(300 * 1e6), from_addr="0xSMURF", ts=base_ts + 1800),
        _usdt_tx(ADDR, int(300 * 1e6), from_addr="0xSMURF", ts=base_ts + 3600),
    ]
    alerts = detect_structuring(ADDR, "Test", txs)
    assert len(alerts) == 0


def test_structuring_not_triggered_outside_time_window():
    base_ts = 1700000000
    # Txs spread over 48h — outside 6h window
    txs = [
        _usdt_tx(ADDR, int(15000 * 1e6), from_addr="0xSMURF", ts=base_ts),
        _usdt_tx(ADDR, int(15000 * 1e6), from_addr="0xSMURF", ts=base_ts + 86400),
        _usdt_tx(ADDR, int(15000 * 1e6), from_addr="0xSMURF", ts=base_ts + 172800),
    ]
    alerts = detect_structuring(ADDR, "Test", txs)
    assert len(alerts) == 0


def test_structuring_not_triggered_with_varying_amounts():
    base_ts = 1700000000
    # Amounts vary wildly — not within 20% band
    txs = [
        _usdt_tx(ADDR, int(5000  * 1e6), from_addr="0xSMURF", ts=base_ts),
        _usdt_tx(ADDR, int(25000 * 1e6), from_addr="0xSMURF", ts=base_ts + 1800),
        _usdt_tx(ADDR, int(15000 * 1e6), from_addr="0xSMURF", ts=base_ts + 3600),
    ]
    alerts = detect_structuring(ADDR, "Test", txs)
    assert len(alerts) == 0
