"""
neural-trace/config/settings.py
─────────────────────────────────
All configuration constants for Neural Trace.
Change values here only — never in core logic.
"""

from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT_DIR          = Path(__file__).parent.parent
CONFIG_DIR        = ROOT_DIR / "config"
DATA_DIR          = ROOT_DIR / "data"
FORWARD_TRACE_DIR = DATA_DIR / "forward_trace"
ORIGIN_TRACE_DIR  = DATA_DIR / "origin_trace"
MONITOR_DIR       = DATA_DIR / "monitor"
REPORTS_DIR       = DATA_DIR / "reports"

# ── APIs ──────────────────────────────────────────────────────────────────────
ETHERSCAN_BASE = "https://api.etherscan.io/v2/api"
COINGECKO_URL  = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
USDT_CONTRACT  = "0xdac17f958d2ee523a2206206994597c13d831ec7"

# ── Request throttling ────────────────────────────────────────────────────────
REQUEST_DELAY  = 0.26        # Seconds between Etherscan calls (~4 req/s free tier)
MAX_RETRIES    = 3           # Retry attempts on failed requests
TX_PAGE_LIMIT  = 500        # Max txs per Etherscan call (API hard limit)

# ── Monitor ───────────────────────────────────────────────────────────────────
WINDOW_48H     = 48          # Hours — short monitoring window
WINDOW_7D      = 168         # Hours — weekly monitoring window
SPIKE_USD      = 50_000      # Single inbound tx threshold for spike alert ($50k)
MAX_REPORTS    = 20          # Max report files to keep per folder

# ── Structuring Detection ─────────────────────────────────────────────────────
STRUCTURING_MIN_TXS    = 3      # Min transactions to flag structuring
STRUCTURING_BAND_PCT   = 0.20   # Amounts within 20% of each other
STRUCTURING_WINDOW_HRS = 6      # All within 6 hours
STRUCTURING_MIN_TOTAL  = 30_000 # Combined total above $30k

# ── Dormancy Detection ────────────────────────────────────────────────────────
DORMANCY_THRESHOLD_DAYS = 90    # Dormant if no activity for 90+ days

# ── Origin Tracer (Backward Hop) ──────────────────────────────────────────────
MAX_HOPS               = 7      # Maximum backward hops before stopping
EXCHANGE_TX_THRESHOLD  = 5_000  # Tx count above this = likely exchange hot wallet
EXCHANGE_VOL_THRESHOLD = 1_000_000  # Volume above this = likely exchange

# ── Gas Map ───────────────────────────────────────────────────────────────────
GAS_OPERATOR_MIN_WALLETS = 3    # Fund 3+ wallets = likely operator
