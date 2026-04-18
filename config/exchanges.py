"""
neural-trace/config/exchanges.py
─────────────────────────────────
Merged registry of known exchange hot wallets, mixers and bridges.
Combines Neural-Trace and ChainSentinel address databases.
Total: 76 unique addresses.

Structure:
    KNOWN_ADDRESSES — full registry with type, label, exchange group
    KNOWN_EXCHANGES — flat dict addr -> label (for quick lookup)
    MIXER_ADDRESSES — mixer/tornado addresses only
    BRIDGE_ADDRESSES — cross-chain bridge addresses only

To add a new address:
    Add to KNOWN_ADDRESSES with correct type and exchange group.
    All other dicts are derived automatically at module load.
"""

# ── Master Registry ────────────────────────────────────────────────────────────
# type: HOT_WALLET_KYC | MIXER | BRIDGE
KNOWN_ADDRESSES: list[dict] = [

    # ── Binance ───────────────────────────────────────────────────────────────
    { "addr": "0x28c6c06298d514db089934071355e5743bf21d60", "label": "Binance Hot Wallet 1",   "type": "HOT_WALLET_KYC", "exchange": "Binance" },
    { "addr": "0x21a31ee1afc51d94c2efccaa2092ad1028285549", "label": "Binance Hot Wallet 2",   "type": "HOT_WALLET_KYC", "exchange": "Binance" },
    { "addr": "0xdfd5293d8e347dfe59e90efd55b2956a1343963d", "label": "Binance Hot Wallet 3",   "type": "HOT_WALLET_KYC", "exchange": "Binance" },
    { "addr": "0x56eddb7aa87536c09ccc2793473599fd21a8b17f", "label": "Binance Hot Wallet 4",   "type": "HOT_WALLET_KYC", "exchange": "Binance" },
    { "addr": "0x9696f59e4d72e237be84ffd425dcad154bf96976", "label": "Binance Hot Wallet 5",   "type": "HOT_WALLET_KYC", "exchange": "Binance" },
    { "addr": "0x4976a4a02f38326660d17bf34b431dc6e2eb2327", "label": "Binance Hot Wallet 6",   "type": "HOT_WALLET_KYC", "exchange": "Binance" },
    { "addr": "0xbe0eb53f46cd790cd13851d5eff43d12404d33e8", "label": "Binance Cold Wallet",    "type": "HOT_WALLET_KYC", "exchange": "Binance" },
    { "addr": "0xf977814e90da44bfa03b6295a0616a897441acec", "label": "Binance Hot Wallet 8",   "type": "HOT_WALLET_KYC", "exchange": "Binance" },
    { "addr": "0x001866ae5b3de6caa5a51543fd9fb64f524f5478", "label": "Binance Hot Wallet 9",   "type": "HOT_WALLET_KYC", "exchange": "Binance" },
    { "addr": "0x8b99f3660622e21f2910ecca7fbe51d654a1517d", "label": "Binance Hot Wallet 10",  "type": "HOT_WALLET_KYC", "exchange": "Binance" },

    # ── Coinbase ──────────────────────────────────────────────────────────────
    { "addr": "0x71660c4005ba85c37ccec55d0c4493e66fe775d3", "label": "Coinbase Hot Wallet 1",  "type": "HOT_WALLET_KYC", "exchange": "Coinbase" },
    { "addr": "0x503828976d22510aad0201ac7ec88293211d23da", "label": "Coinbase Hot Wallet 2",  "type": "HOT_WALLET_KYC", "exchange": "Coinbase" },
    { "addr": "0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740", "label": "Coinbase Hot Wallet 3",  "type": "HOT_WALLET_KYC", "exchange": "Coinbase" },
    { "addr": "0x3cd751e6b0078be393132286c442345e5dc49699", "label": "Coinbase Hot Wallet 4",  "type": "HOT_WALLET_KYC", "exchange": "Coinbase" },
    { "addr": "0xb5d85cbf7cb3ee0d56b3bb207d5fc4b82f43f511", "label": "Coinbase Hot Wallet 5",  "type": "HOT_WALLET_KYC", "exchange": "Coinbase" },
    { "addr": "0xa090e606e30bd747d4e6245a1517ebe430f0057e", "label": "Coinbase Hot Wallet 6",  "type": "HOT_WALLET_KYC", "exchange": "Coinbase" },
    { "addr": "0xf6874c88757721a02f9a558f1c1f6af0ef292843", "label": "Coinbase Prime",          "type": "HOT_WALLET_KYC", "exchange": "Coinbase" },
    { "addr": "0x5041ed759dd4afc3a72b8192c143f72f4724081f", "label": "Coinbase Hot Wallet 8",  "type": "HOT_WALLET_KYC", "exchange": "Coinbase" },

    # ── Kraken ────────────────────────────────────────────────────────────────
    { "addr": "0x2910543af39aba0cd09dbb2d50200b3e800a63d2", "label": "Kraken Hot Wallet 1",   "type": "HOT_WALLET_KYC", "exchange": "Kraken" },
    { "addr": "0x0a869d79a7052c7f1b55a8ebabbea3420f0d1e13", "label": "Kraken Hot Wallet 2",   "type": "HOT_WALLET_KYC", "exchange": "Kraken" },
    { "addr": "0xe853c56864a2ebe4576a807d26fdc4a0ada51919", "label": "Kraken Hot Wallet 3",   "type": "HOT_WALLET_KYC", "exchange": "Kraken" },
    { "addr": "0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0", "label": "Kraken Hot Wallet 4",   "type": "HOT_WALLET_KYC", "exchange": "Kraken" },

    # ── OKX ───────────────────────────────────────────────────────────────────
    { "addr": "0x6cc5f688a315f3dc28a7781717a9a798a59fda7b", "label": "OKX Hot Wallet 1",      "type": "HOT_WALLET_KYC", "exchange": "OKX" },
    { "addr": "0x236f9f97e0e62388479bf9e5ba4889e46b0273c3", "label": "OKX Hot Wallet 2",      "type": "HOT_WALLET_KYC", "exchange": "OKX" },
    { "addr": "0x236685f3c6abe5f361e9d252e81d44b60c6ae3f0", "label": "OKX Hot Wallet 3",      "type": "HOT_WALLET_KYC", "exchange": "OKX" },
    { "addr": "0xa7efae728d2936e78bda97dc267687568dd593f3", "label": "OKX Hot Wallet 4",      "type": "HOT_WALLET_KYC", "exchange": "OKX" },
    { "addr": "0xa9ac43f5b5e38155a288d1a01d2cbc4478e14573", "label": "OKX Hot Wallet 5",      "type": "HOT_WALLET_KYC", "exchange": "OKX" },

    # ── Bybit ─────────────────────────────────────────────────────────────────
    { "addr": "0xf89d7b9c864f589bbf53a82105107622b35eaa40", "label": "Bybit Hot Wallet 1",   "type": "HOT_WALLET_KYC", "exchange": "Bybit" },
    { "addr": "0xfd1d36995d76c0f75bbe4637c84c06e4a68bbb3a", "label": "Bybit Hot Wallet 2",   "type": "HOT_WALLET_KYC", "exchange": "Bybit" },
    { "addr": "0x77134cbc06cb00b66f4c7e623d5fdbf6777635ec", "label": "Bybit Hot Wallet 3",   "type": "HOT_WALLET_KYC", "exchange": "Bybit" },
    { "addr": "0x4e9ce36e442e55ecd9025b9a6e0d88485d628a67", "label": "Bybit Deposit",         "type": "HOT_WALLET_KYC", "exchange": "Bybit" },

    # ── HTX (Huobi) ───────────────────────────────────────────────────────────
    { "addr": "0xab5c66752a9e8167967685f1450532fb96d5d24f", "label": "HTX Hot Wallet 1",     "type": "HOT_WALLET_KYC", "exchange": "HTX" },
    { "addr": "0x6748f50f686bfbca6fe8ad62b22228b87f31ff2b", "label": "HTX Hot Wallet 2",     "type": "HOT_WALLET_KYC", "exchange": "HTX" },
    { "addr": "0xfdb16996831753d5331ff813c29a93c76834a0ad", "label": "HTX Hot Wallet 3",     "type": "HOT_WALLET_KYC", "exchange": "HTX" },
    { "addr": "0xe93381fb4c4f14bda253907b18fad305d799241a", "label": "HTX Hot Wallet 4",     "type": "HOT_WALLET_KYC", "exchange": "HTX" },
    { "addr": "0x18916e1a2933cb349145a280473a5de8eb6630cb", "label": "HTX Hot Wallet 5",     "type": "HOT_WALLET_KYC", "exchange": "HTX" },
    { "addr": "0x926fc576b7faceead2b00ddbfe3f5d0e7ee64bef", "label": "HTX Hot Wallet 6",     "type": "HOT_WALLET_KYC", "exchange": "HTX" },
    { "addr": "0x0d0707963952f2fba59dd06f2b425ace40b492fe", "label": "HTX Hot Wallet 7",     "type": "HOT_WALLET_KYC", "exchange": "HTX" },
    { "addr": "0x7c1da96a9f3bbd105888b68a73a8c2b6c5cce96e", "label": "HTX Hot Wallet 8",     "type": "HOT_WALLET_KYC", "exchange": "HTX" },
    { "addr": "0xa8660c8ffd6d578f657b72c0c811284aef0b735e", "label": "HTX Hot Wallet 9",     "type": "HOT_WALLET_KYC", "exchange": "HTX" },
    { "addr": "0x67b9f46d70ef97a72317de76f70c90e570d3a9bd", "label": "HTX Cold Wallet",      "type": "HOT_WALLET_KYC", "exchange": "HTX" },
    { "addr": "0x4fb312915b779b1339388e14b6d079741ca83128", "label": "HTX Hot Wallet 60",    "type": "HOT_WALLET_KYC", "exchange": "HTX" },
    { "addr": "0x1062a747393198f70f71ec65a582423dba7e5ab3", "label": "HTX Hot Wallet 80",    "type": "HOT_WALLET_KYC", "exchange": "HTX" },

    # ── KuCoin ────────────────────────────────────────────────────────────────
    { "addr": "0xd6216fc19db775df9774a6e33526131da7d19a2c", "label": "KuCoin Hot Wallet 1",  "type": "HOT_WALLET_KYC", "exchange": "KuCoin" },
    { "addr": "0x2b5634c42055806a59e9107ed44d43c426e58258", "label": "KuCoin Hot Wallet 2",  "type": "HOT_WALLET_KYC", "exchange": "KuCoin" },
    { "addr": "0x88bd4d3e2997371bceefe8d9cf8fe17ba880d4f4", "label": "KuCoin Hot Wallet 3",  "type": "HOT_WALLET_KYC", "exchange": "KuCoin" },
    { "addr": "0x1692e170361cefd1eb7240ec13d048fd9af6d667", "label": "KuCoin Hot Wallet 4",  "type": "HOT_WALLET_KYC", "exchange": "KuCoin" },
    { "addr": "0xa1d8d972560c2f8144af871db508f0b0b10a3fbf", "label": "KuCoin Hot Wallet 5",  "type": "HOT_WALLET_KYC", "exchange": "KuCoin" },

    # ── Gate.io ───────────────────────────────────────────────────────────────
    { "addr": "0x7793cd85c11a924478d358d49b05b37e91b5810f", "label": "Gate.io Hot Wallet 1", "type": "HOT_WALLET_KYC", "exchange": "Gate.io" },
    { "addr": "0xe93381fb4c4f14bda253907b18fad90d68cd5bc4", "label": "Gate.io Hot Wallet 2", "type": "HOT_WALLET_KYC", "exchange": "Gate.io" },

    # ── Bitfinex ──────────────────────────────────────────────────────────────
    { "addr": "0x1151314c646ce4e0efd76d1af4760ae66a9fe30f", "label": "Bitfinex Hot Wallet 1","type": "HOT_WALLET_KYC", "exchange": "Bitfinex" },
    { "addr": "0x742d35cc6634c0532925a3b844bc454e4438f44e", "label": "Bitfinex Hot Wallet 2","type": "HOT_WALLET_KYC", "exchange": "Bitfinex" },

    # ── MEXC ──────────────────────────────────────────────────────────────────
    { "addr": "0x75e89d5979e4f6fba9f97c104f2a18c6f5e7e1b9", "label": "MEXC Hot Wallet",      "type": "HOT_WALLET_KYC", "exchange": "MEXC" },

    # ── LBank ─────────────────────────────────────────────────────────────────
    { "addr": "0x4b1a99467a284cc690e3237bc69105956816f762", "label": "LBank Hot Wallet",      "type": "HOT_WALLET_KYC", "exchange": "LBank" },

    # ── Crypto.com ────────────────────────────────────────────────────────────
    { "addr": "0x6262998ced04146fa42253a5c0af90ca02dfd2a3", "label": "Crypto.com Hot Wallet 1","type": "HOT_WALLET_KYC", "exchange": "Crypto.com" },
    { "addr": "0x46340b20830761efd32832a74d7169b29feb9758", "label": "Crypto.com Hot Wallet 2","type": "HOT_WALLET_KYC", "exchange": "Crypto.com" },

    # ── Gemini ────────────────────────────────────────────────────────────────
    { "addr": "0xd24400ae8bfebb18ca49be86258a3c749cf46853", "label": "Gemini Hot Wallet 1",   "type": "HOT_WALLET_KYC", "exchange": "Gemini" },
    { "addr": "0x07ee55aa48bb72dcc6e9d78256648910de513eca", "label": "Gemini Hot Wallet 2",   "type": "HOT_WALLET_KYC", "exchange": "Gemini" },

    # ── Bitstamp ──────────────────────────────────────────────────────────────
    { "addr": "0x00bdb5699745f5b860228c8f939abf1b9ae374ed", "label": "Bitstamp Hot Wallet",   "type": "HOT_WALLET_KYC", "exchange": "Bitstamp" },

    # ── ChangeNOW ─────────────────────────────────────────────────────────────
    { "addr": "0x077d360f11d220e4d5d9ba048ab820311601bd5c", "label": "ChangeNOW",              "type": "HOT_WALLET_KYC", "exchange": "ChangeNOW" },

    # ── Polygon Bridge ────────────────────────────────────────────────────────
    { "addr": "0x40ec5b33f54e0e8a33a975908c5ba1c14e5bbbdf", "label": "Polygon Bridge",        "type": "BRIDGE",         "exchange": "Polygon" },

    # ── Wormhole Bridge ───────────────────────────────────────────────────────
    { "addr": "0x3ee18b2214aff97000d974cf647e7c347e8fa585", "label": "Wormhole Bridge",       "type": "BRIDGE",         "exchange": "Wormhole" },

    # ── Across Bridge ─────────────────────────────────────────────────────────
    { "addr": "0x5427fefa711eff984124bfbb1ab6fbf5e3da1820", "label": "Across Bridge",         "type": "BRIDGE",         "exchange": "Across" },

    # ── Disperse.app ──────────────────────────────────────────────────────────
    { "addr": "0xd152f549545093347a162dce210e7293f1452150", "label": "Disperse.app",          "type": "BRIDGE",         "exchange": "Disperse" },

    # ── Optimism Bridge ───────────────────────────────────────────────────────
    { "addr": "0x99c9fc46f92e8a1c0dec1b1747d010903e884be1", "label": "Optimism Bridge",       "type": "BRIDGE",         "exchange": "Optimism" },

    # ── Arbitrum Bridge ───────────────────────────────────────────────────────
    { "addr": "0x8484ef722627bf18ca5ae6bcf031c23e6e922b30", "label": "Arbitrum Bridge",       "type": "BRIDGE",         "exchange": "Arbitrum" },

    # ── Avalanche Bridge ──────────────────────────────────────────────────────
    { "addr": "0xa0c68c638235ee32657e8f720a23cec1bfc77c77", "label": "Avalanche Bridge",      "type": "BRIDGE",         "exchange": "Avalanche" },

    # ── Tornado Cash (Mixers) ─────────────────────────────────────────────────
    { "addr": "0xd90e2f925da726b50c4ed8d0fb90ad053324f31b", "label": "Tornado Cash Router",   "type": "MIXER",          "exchange": "Tornado Cash" },
    { "addr": "0x722122df12d4e14e13ac3b6895a86e84145b6967", "label": "Tornado Cash 0.1 ETH",  "type": "MIXER",          "exchange": "Tornado Cash" },
    { "addr": "0x910cbd523d972eb0a6f4cae4618ad62622b39dbf", "label": "Tornado Cash 1 ETH",    "type": "MIXER",          "exchange": "Tornado Cash" },
    { "addr": "0xa160cdab225685da1d56aa342ad8841c3b53f291", "label": "Tornado Cash 10 ETH",   "type": "MIXER",          "exchange": "Tornado Cash" },
    { "addr": "0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936", "label": "Tornado Cash 100 ETH",  "type": "MIXER",          "exchange": "Tornado Cash" },
]

# ── Derived lookups (auto-built from master registry) ─────────────────────────

# Flat addr -> label (for quick O(1) lookup)
KNOWN_EXCHANGES: dict[str, str] = {
    e["addr"].lower(): e["label"]
    for e in KNOWN_ADDRESSES
}

# Mixer addresses only
MIXER_ADDRESSES: dict[str, str] = {
    e["addr"].lower(): e["label"]
    for e in KNOWN_ADDRESSES if e["type"] == "MIXER"
}

# Bridge addresses only
BRIDGE_ADDRESSES: dict[str, str] = {
    e["addr"].lower(): e["label"]
    for e in KNOWN_ADDRESSES if e["type"] == "BRIDGE"
}

# Keywords for fuzzy mixer detection
MIXER_KEYWORDS = ["tornado", "mixer", "tumbler", "wasabi", "chipmixer"]


def lookup(address: str) -> dict | None:
    """
    Returns classification dict if address is known.
    Returns None if unknown.

    Return format:
        {
            "type":       "HOT_WALLET_KYC" | "MIXER" | "BRIDGE",
            "label":      str,
            "exchange":   str,
            "stop_trace": bool
        }
    """
    addr = address.lower()
    match = next((e for e in KNOWN_ADDRESSES if e["addr"].lower() == addr), None)
    if not match:
        return None
    return {
        "type":       match["type"],
        "label":      match["label"],
        "exchange":   match["exchange"],
        "stop_trace": True,
    }


def is_mixer(address: str) -> bool:
    """Quick check — is this address a known mixer?"""
    return address.lower() in MIXER_ADDRESSES


def is_bridge(address: str) -> bool:
    """Quick check — is this address a known bridge?"""
    return address.lower() in BRIDGE_ADDRESSES


def is_exchange(address: str) -> bool:
    """Quick check — is this address a known exchange?"""
    addr = address.lower()
    return addr in KNOWN_EXCHANGES and addr not in MIXER_ADDRESSES and addr not in BRIDGE_ADDRESSES
