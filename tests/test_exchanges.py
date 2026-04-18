"""
neural-trace/tests/test_exchanges.py
Tests for config/exchanges.py — pure registry lookups, no API calls.
"""
from config.exchanges import lookup, is_mixer, is_bridge, is_exchange


# ── lookup() ──────────────────────────────────────────────────────────────────

def test_known_exchange_binance_detected():
    result = lookup("0x28c6c06298d514db089934071355e5743bf21d60")
    assert result is not None
    assert result["type"] == "HOT_WALLET_KYC"
    assert result["exchange"] == "Binance"
    assert result["stop_trace"] is True


def test_known_exchange_coinbase_detected():
    result = lookup("0x71660c4005ba85c37ccec55d0c4493e66fe775d3")
    assert result is not None
    assert result["exchange"] == "Coinbase"


def test_tornado_cash_identified_as_mixer():
    result = lookup("0x910cbd523d972eb0a6f4cae4618ad62622b39dbf")
    assert result is not None
    assert result["type"] == "MIXER"
    assert result["exchange"] == "Tornado Cash"
    assert result["stop_trace"] is True


def test_polygon_bridge_identified_as_bridge():
    result = lookup("0x40ec5b33f54e0e8a33a975908c5ba1c14e5bbbdf")
    assert result is not None
    assert result["type"] == "BRIDGE"
    assert result["exchange"] == "Polygon"


def test_unknown_address_returns_none():
    result = lookup("0x0000000000000000000000000000000000000001")
    assert result is None


def test_lookup_is_case_insensitive():
    lower  = lookup("0x28c6c06298d514db089934071355e5743bf21d60")
    upper  = lookup("0x28C6C06298D514DB089934071355E5743BF21D60")
    mixed  = lookup("0x28c6C06298d514Db089934071355e5743bF21D60")
    assert lower is not None
    assert upper is not None
    assert mixed is not None
    assert lower["exchange"] == upper["exchange"] == mixed["exchange"]


# ── is_mixer() ────────────────────────────────────────────────────────────────

def test_is_mixer_returns_true_for_tornado():
    assert is_mixer("0x910cbd523d972eb0a6f4cae4618ad62622b39dbf") is True


def test_is_mixer_returns_false_for_exchange():
    assert is_mixer("0x28c6c06298d514db089934071355e5743bf21d60") is False


def test_is_mixer_returns_false_for_unknown():
    assert is_mixer("0x0000000000000000000000000000000000000001") is False


# ── is_bridge() ───────────────────────────────────────────────────────────────

def test_is_bridge_returns_true_for_polygon():
    assert is_bridge("0x40ec5b33f54e0e8a33a975908c5ba1c14e5bbbdf") is True


def test_is_bridge_returns_false_for_exchange():
    assert is_bridge("0x28c6c06298d514db089934071355e5743bf21d60") is False


# ── is_exchange() ─────────────────────────────────────────────────────────────

def test_is_exchange_returns_true_for_binance():
    assert is_exchange("0x28c6c06298d514db089934071355e5743bf21d60") is True


def test_is_exchange_returns_false_for_mixer():
    assert is_exchange("0x910cbd523d972eb0a6f4cae4618ad62622b39dbf") is False


def test_is_exchange_returns_false_for_bridge():
    assert is_exchange("0x40ec5b33f54e0e8a33a975908c5ba1c14e5bbbdf") is False


def test_is_exchange_returns_false_for_unknown():
    assert is_exchange("0x0000000000000000000000000000000000000001") is False
