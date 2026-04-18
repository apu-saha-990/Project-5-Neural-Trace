"""
neural-trace/core/pricer.py
─────────────────────────────
ETH spot price feed.
Isolated so the source can be swapped without touching any analysis logic.
"""

import logging
import requests
from config.settings import COINGECKO_URL

log = logging.getLogger("neuraltrace.pricer")

_cached_price: float = 0.0


def get_eth_usd() -> float:
    """
    Fetch current ETH/USD spot price from CoinGecko.
    Returns cached price on failure, 0.0 if never fetched.
    """
    global _cached_price
    try:
        r = requests.get(COINGECKO_URL, timeout=10)
        r.raise_for_status()
        price = float(r.json()["ethereum"]["usd"])
        _cached_price = price
        log.info("ETH spot: $%.2f", price)
        return price
    except Exception as e:
        log.error("ETH price fetch failed: %s — using cached $%.2f", e, _cached_price)
        return _cached_price
