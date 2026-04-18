"""
neural-trace/core/fetcher.py
─────────────────────────────
Single interface for all Etherscan API calls.
If the API changes, this is the only file to touch.

All functions return clean data or empty/None on failure.
No business logic here — just fetch and return.
"""

import os
import time
import logging
import requests
from dotenv import load_dotenv
from config.settings import (
    ETHERSCAN_BASE, USDT_CONTRACT,
    REQUEST_DELAY, MAX_RETRIES, TX_PAGE_LIMIT
)

load_dotenv()
log = logging.getLogger("neuraltrace.fetcher")

API_KEY = os.getenv("ETHERSCAN_API_KEY", "")


def _get(params: dict, retries: int = MAX_RETRIES) -> dict | None:
    """Core GET with retry + exponential backoff."""
    params["apikey"] = API_KEY
    for attempt in range(retries):
        try:
            r = requests.get(ETHERSCAN_BASE, params=params, timeout=15)
            r.raise_for_status()
            data = r.json()
            if data.get("status") == "0" and data.get("message") not in ("No transactions found",):
                log.warning("Etherscan: %s", data.get("result", "unknown error"))
                return None
            return data
        except requests.RequestException as e:
            wait = 2 ** attempt
            log.warning("Request failed (attempt %d/%d): %s — retry in %ds",
                        attempt + 1, retries, e, wait)
            time.sleep(wait)
    return None


# ── Transaction Fetchers ──────────────────────────────────────────────────────

def get_normal_txs(address: str, from_ts: int) -> list:
    """Fetch normal ETH transactions within a time window. Used by Monitor."""
    time.sleep(REQUEST_DELAY)
    data = _get({
        "chainid": 1, "module": "account", "action": "txlist",
        "address": address, "startblock": 0, "endblock": 99999999,
        "sort": "desc", "offset": TX_PAGE_LIMIT, "page": 1,
    })
    if not data or not isinstance(data.get("result"), list):
        return []
    return [tx for tx in data["result"] if int(tx.get("timeStamp", 0)) >= from_ts]


def get_usdt_txs(address: str, from_ts: int) -> list:
    """Fetch USDT token transactions within a time window. Used by Monitor."""
    time.sleep(REQUEST_DELAY)
    data = _get({
        "chainid": 1, "module": "account", "action": "tokentx",
        "address": address, "contractaddress": USDT_CONTRACT,
        "startblock": 0, "endblock": 99999999,
        "sort": "desc", "offset": TX_PAGE_LIMIT, "page": 1,
    })
    if not data or not isinstance(data.get("result"), list):
        return []
    return [tx for tx in data["result"] if int(tx.get("timeStamp", 0)) >= from_ts]


def get_all_inbound_eth(address: str) -> list:
    """Fetch all inbound ETH transactions. Used by Origin Tracer."""
    time.sleep(REQUEST_DELAY)
    data = _get({
        "chainid": 1, "module": "account", "action": "txlist",
        "address": address, "startblock": 0, "endblock": 99999999,
        "sort": "desc", "offset": TX_PAGE_LIMIT, "page": 1,
    })
    if not data or not isinstance(data.get("result"), list):
        return []
    addr = address.lower()
    return [
        tx for tx in data["result"]
        if tx.get("to", "").lower() == addr
        and tx.get("isError", "0") == "0"
        and int(tx.get("value", "0")) > 0
    ]


def get_all_inbound_usdt(address: str) -> list:
    """Fetch all inbound USDT transactions. Used by Origin Tracer."""
    time.sleep(REQUEST_DELAY)
    data = _get({
        "chainid": 1, "module": "account", "action": "tokentx",
        "address": address, "contractaddress": USDT_CONTRACT,
        "startblock": 0, "endblock": 99999999,
        "sort": "desc", "offset": TX_PAGE_LIMIT, "page": 1,
    })
    if not data or not isinstance(data.get("result"), list):
        return []
    addr = address.lower()
    return [tx for tx in data["result"] if tx.get("to", "").lower() == addr]


# ── Wallet Info Fetchers ──────────────────────────────────────────────────────

def get_tx_count(address: str) -> int:
    """Get total transaction count for an address."""
    time.sleep(REQUEST_DELAY)
    data = _get({
        "chainid": 1, "module": "proxy", "action": "eth_getTransactionCount",
        "address": address, "tag": "latest",
    })
    if data and data.get("result"):
        try:
            return int(data["result"], 16)
        except Exception:
            pass
    return 0


def get_eth_balance(address: str) -> float:
    """Get current ETH balance for an address."""
    time.sleep(REQUEST_DELAY)
    data = _get({
        "chainid": 1, "module": "account", "action": "balance",
        "address": address, "tag": "latest",
    })
    if data and data.get("result"):
        try:
            return int(data["result"]) / 1e18
        except Exception:
            pass
    return 0.0


def get_contract_name(address: str) -> str | None:
    """Check if address is a verified contract and return its name."""
    time.sleep(REQUEST_DELAY)
    data = _get({
        "chainid": 1, "module": "contract", "action": "getsourcecode",
        "address": address,
    })
    if data and isinstance(data.get("result"), list) and data["result"]:
        name = data["result"][0].get("ContractName", "")
        if name and name not in ("", "0"):
            return f"Contract: {name}"
    return None


# ── Dormancy + Gas Map Fetchers ───────────────────────────────────────────────

def get_first_tx(address: str) -> dict | None:
    """Fetch the very first transaction ever for an address. Used by dormancy analysis."""
    time.sleep(REQUEST_DELAY)
    data = _get({
        "chainid": 1, "module": "account", "action": "txlist",
        "address": address, "startblock": 0, "endblock": 99999999,
        "sort": "asc", "offset": 1, "page": 1,
    })
    if not data or not isinstance(data.get("result"), list) or not data["result"]:
        return None
    return data["result"][0]


def get_first_inbound_eth(address: str) -> dict | None:
    """Fetch the first inbound ETH tx. Used by gas map — who funded this wallet?"""
    time.sleep(REQUEST_DELAY)
    data = _get({
        "chainid": 1, "module": "account", "action": "txlist",
        "address": address, "startblock": 0, "endblock": 99999999,
        "sort": "asc", "offset": 10, "page": 1,
    })
    if not data or not isinstance(data.get("result"), list):
        return None
    addr = address.lower()
    for tx in data["result"]:
        if (tx.get("to", "").lower() == addr
                and tx.get("isError", "0") == "0"
                and int(tx.get("value", "0")) > 0):
            return tx
    return None


def get_last_tx_before(address: str, before_ts: int) -> dict | None:
    """Fetch most recent tx before a timestamp. Used by dormancy analysis."""
    time.sleep(REQUEST_DELAY)
    data = _get({
        "chainid": 1, "module": "account", "action": "txlist",
        "address": address, "startblock": 0, "endblock": 99999999,
        "sort": "desc", "offset": 100, "page": 1,
    })
    if not data or not isinstance(data.get("result"), list):
        return None
    for tx in data["result"]:
        if int(tx.get("timeStamp", 0)) < before_ts:
            return tx
    return None
