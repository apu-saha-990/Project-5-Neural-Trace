"""
neural-trace/tests/test_intelligence.py
Tests for core/intelligence.py — fetcher calls are mocked via conftest.py.
"""
import pytest
from unittest.mock import patch
from core.intelligence import build_gas_map


# ── Helpers ───────────────────────────────────────────────────────────────────

def _wallet(addr, label="Test Wallet"):
    return {"addr": addr, "label": label}


def _eth_tx(from_addr, value_wei=int(0.01 * 1e18), ts=1700000000):
    return {
        "from":      from_addr,
        "to":        "0xTARGET",
        "value":     str(value_wei),
        "timeStamp": str(ts),
        "hash":      "0xHASH",
        "isError":   "0",
    }


# ── build_gas_map — operator detection ───────────────────────────────────────

def test_likely_operator_flagged_when_funds_three_or_more_wallets():
    wallets = [
        _wallet("0xWallet1", "Wallet 1"),
        _wallet("0xWallet2", "Wallet 2"),
        _wallet("0xWallet3", "Wallet 3"),
    ]
    funder_tx = _eth_tx("0xOPERATOR")

    with patch("core.intelligence.get_first_inbound_eth", return_value=funder_tx):
        result = build_gas_map(wallets, {})

    funder = result["funders"].get("0xoperator")
    assert funder is not None
    assert funder["flag"] == "LIKELY_OPERATOR"
    assert len(funder["funded_wallets"]) == 3


def test_funder_not_flagged_when_funds_fewer_than_three_wallets():
    wallets = [
        _wallet("0xWallet1", "Wallet 1"),
        _wallet("0xWallet2", "Wallet 2"),
    ]
    funder_tx = _eth_tx("0xSMALLFUNDER")

    with patch("core.intelligence.get_first_inbound_eth", return_value=funder_tx):
        result = build_gas_map(wallets, {})

    funder = result["funders"].get("0xsmallfunder")
    assert funder is not None
    assert funder["flag"] is None


def test_known_wallet_funder_flagged_as_internal():
    wallets = [
        _wallet("0xWallet1", "Wallet 1"),
        _wallet("0xWallet2", "Wallet 2"),
        _wallet("0xWallet3", "Wallet 3"),
    ]
    funder_tx = _eth_tx("0xKNOWNWALLET")
    known_wallets = {"0xknownwallet": "Known Internal Wallet"}

    with patch("core.intelligence.get_first_inbound_eth", return_value=funder_tx):
        result = build_gas_map(wallets, known_wallets)

    funder = result["funders"].get("0xknownwallet")
    assert funder is not None
    assert funder["flag"] == "INTERNAL"
    assert funder["is_known"] is True
    assert funder["known_label"] == "Known Internal Wallet"


def test_wallet_with_no_inbound_eth_recorded_in_sources():
    wallets = [_wallet("0xWallet1", "Wallet 1")]

    with patch("core.intelligence.get_first_inbound_eth", return_value=None):
        result = build_gas_map(wallets, {})

    assert "0xwallet1" in result["wallet_sources"]
    assert result["wallet_sources"]["0xwallet1"]["funder"] is None


def test_wallet_sources_populated_with_funder_info():
    wallets = [_wallet("0xWallet1", "Wallet 1")]
    funder_tx = _eth_tx("0xFUNDER", value_wei=int(0.05 * 1e18))

    with patch("core.intelligence.get_first_inbound_eth", return_value=funder_tx):
        result = build_gas_map(wallets, {})

    src = result["wallet_sources"].get("0xwallet1")
    assert src is not None
    assert src["funder"] == "0xFUNDER"
    assert src["eth_value"] == 0.05


def test_different_funders_tracked_separately():
    wallets = [
        _wallet("0xWallet1", "Wallet 1"),
        _wallet("0xWallet2", "Wallet 2"),
    ]
    tx_a = _eth_tx("0xFUNDERA")
    tx_b = _eth_tx("0xFUNDERB")

    with patch("core.intelligence.get_first_inbound_eth", side_effect=[tx_a, tx_b]):
        result = build_gas_map(wallets, {})

    assert "0xfundera" in result["funders"]
    assert "0xfunderb" in result["funders"]
    assert len(result["funders"]) == 2
