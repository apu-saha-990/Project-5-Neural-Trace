"""
neural-trace/tests/conftest.py
Mocks all Etherscan fetcher calls so tests run without an API key.
"""
import pytest
from unittest.mock import patch


@pytest.fixture(autouse=True)
def mock_fetcher():
    """Patch all fetcher functions globally — no API calls in tests."""
    with patch("core.fetcher.get_first_tx",          return_value=None), \
         patch("core.fetcher.get_last_tx_before",    return_value=None), \
         patch("core.fetcher.get_first_inbound_eth", return_value=None), \
         patch("core.fetcher.get_normal_txs",        return_value=[]),   \
         patch("core.fetcher.get_usdt_txs",          return_value=[]),   \
         patch("core.fetcher.get_tx_count",          return_value=0),    \
         patch("core.fetcher.get_eth_balance",       return_value=0.0):
        yield
