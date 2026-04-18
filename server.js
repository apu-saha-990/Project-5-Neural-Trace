#!/usr/bin/env node
/**
 * neural-trace/server.js
 * ────────────────────────
 * Neural Trace v2 — Main HTTP Server
 *
 * Serves the single-page app and handles all backend operations.
 * All API keys stay server-side — never exposed to the browser.
 *
 * ── Endpoints ────────────────────────────────────────────────────────────────
 *
 * EXISTING (Neural Trace forward tracer — unchanged):
 *   GET  /                        Serve app.html with API key injected
 *   POST /save-trace              Save forward trace JSON + generate DOCX
 *   GET  /download/:file          Download any generated file
 *   GET  /list-traces             List saved forward traces
 *   GET  /load-trace/:file        Load a saved forward trace JSON
 *
 * NEW (Monitor engine):
 *   POST /monitor                 Run monitor on a Neural Trace JSON (SSE stream)
 *   GET  /list-monitor            List saved monitor runs
 *   GET  /load-monitor/:file      Load a saved monitor JSON
 *
 * NEW (Origin Tracer — backward hop):
 *   POST /origin-trace            Run backward hop trace (SSE stream)
 *   GET  /list-origin             List saved origin traces
 *   GET  /load-origin/:file       Load a saved origin trace JSON
 *
 * ── Data Folders ─────────────────────────────────────────────────────────────
 *   data/forward_trace/           Forward trace JSON files
 *   data/origin_trace/            Origin trace JSON files
 *   data/monitor/                 Monitor JSON files
 *   data/reports/                 All generated DOCX files
 */

'use strict';

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const { execFile } = require('child_process');

// ── Load .env ─────────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.error('[ERROR] .env not found. Copy .env.example → .env and fill in keys.');
  process.exit(1);
}
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const [key, ...rest] = trimmed.split('=');
  if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
});

// ── Config ────────────────────────────────────────────────────────────────────
const PORT          = parseInt(process.env.NEURAL_TRACE_PORT || '8080', 10);
const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY || '';
const HTML_PATH     = path.join(__dirname, 'app.html');
const AUTH_USER     = process.env.NEURAL_TRACE_USER || '';
const AUTH_PASS     = process.env.NEURAL_TRACE_PASS || '';

const DIRS = {
  forward:  path.join(__dirname, 'data', 'forward_trace'),
  origin:   path.join(__dirname, 'data', 'origin_trace'),
  monitor:  path.join(__dirname, 'data', 'monitor'),
  reports:  path.join(__dirname, 'data', 'reports'),
};

if (!ETHERSCAN_KEY) {
  console.error('[ERROR] ETHERSCAN_API_KEY not set in .env');
  process.exit(1);
}

// Ensure all data directories exist
Object.values(DIRS).forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ── Report generators ─────────────────────────────────────────────────────────
const { generateForwardReport } = require('./reports/forward_report');
const { generateMonitorReport } = require('./reports/monitor_report');
const { generateOriginReport  } = require('./reports/origin_report');

// ── Timestamp helpers ─────────────────────────────────────────────────────────
function tsSlug() {
  return new Date().toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
  .replace(/[/,:\s]+/g, (m) => m.trim() === '' ? '_' : '-')
  .replace(/--+/g, '-');
}

function cleanAddr(addr) {
  return (addr || 'UNKNOWN').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 20);
}

// ── Body parser ───────────────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

// ── SSE helper ────────────────────────────────────────────────────────────────
function sseSetup(res) {
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
}

function sseSend(res, type, data) {
  res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
}

// ── JSON file helpers ─────────────────────────────────────────────────────────
function loadJSON(fp) {
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); }
  catch (e) { return null; }
}

function listDir(dir, pattern) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => pattern.test(f))
    .sort()
    .reverse();
}

// ── Python runner ─────────────────────────────────────────────────────────────
function runPython(scriptArgs, onLog, onDone, onError) {
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const proc   = execFile(python, scriptArgs, { cwd: __dirname });

  proc.stdout.on('data', data => {
    data.toString().split('\n').filter(Boolean).forEach(line => onLog(line));
  });
  proc.stderr.on('data', data => {
    data.toString().split('\n').filter(Boolean).forEach(line => onLog(`[ERR] ${line}`));
  });
  proc.on('close', code => {
    if (code === 0) onDone();
    else onError(new Error(`Python exited with code ${code}`));
  });
  proc.on('error', onError);

  return proc;
}

// ── CORS ──────────────────────────────────────────────────────────────────────
function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP SERVER
// ─────────────────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── Basic Auth ───────────────────────────────────────────────────────────────
  if (AUTH_USER && AUTH_PASS) {
    const authHeader = req.headers['authorization'] || '';
    const expected   = 'Basic ' + Buffer.from(`${AUTH_USER}:${AUTH_PASS}`).toString('base64');
    if (authHeader !== expected) {
      res.writeHead(401, {
        'WWW-Authenticate': 'Basic realm="Neural-Trace"',
        'Content-Type':     'text/plain',
      });
      res.end('Unauthorised');
      return;
    }
  }

  const url = req.url.split('?')[0];

  // ── Serve app.html ──────────────────────────────────────────────────────────
  if (req.method === 'GET' && (url === '/' || url === '/app.html')) {
    if (!fs.existsSync(HTML_PATH)) {
      res.writeHead(404); res.end('app.html not found.'); return;
    }
    let html = fs.readFileSync(HTML_PATH, 'utf8');
    html = html.replace('__ETHERSCAN_API_KEY__', ETHERSCAN_KEY);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // ── POST /export-monitor ──────────────────────────────────────────────────
  if (req.method === 'POST' && url === '/export-monitor') {
    let monitorResult;
    try { monitorResult = await readBody(req); }
    catch (e) { json(res, 400, { ok: false, error: 'Invalid JSON' }); return; }

    const project  = (monitorResult.meta?.project_name || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '-');
    const win      = monitorResult.meta?.window || '48h';
    const stem     = `monitor_${project}_${win}_${tsSlug()}`;
    const jsonFile = `${stem}.json`;
    const docxFile = `${stem}.docx`;
    const jsonPath = path.join(DIRS.monitor, jsonFile);
    const docxPath = path.join(DIRS.reports, docxFile);

    fs.writeFileSync(jsonPath, JSON.stringify(monitorResult, null, 2));
    console.log(`[MONITOR] Saved JSON: data/monitor/${jsonFile}`);

    try {
      await generateMonitorReport(monitorResult, docxPath);
      console.log(`[MONITOR] Saved DOCX: data/reports/${docxFile}`);
      json(res, 200, { ok: true, json: `data/monitor/${jsonFile}`, docx: `data/reports/${docxFile}` });
    } catch (err) {
      console.error('[MONITOR] DOCX error:', err.message);
      json(res, 500, { ok: false, error: err.message });
    }
    return;
  }

  // ── POST /export-origin ───────────────────────────────────────────────────
  if (req.method === 'POST' && url === '/export-origin') {
    let originResult;
    try { originResult = await readBody(req); }
    catch (e) { json(res, 400, { ok: false, error: 'Invalid JSON' }); return; }

    const proj     = (originResult.meta?.project_name || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '-');
    const stem     = `origin_${proj}_${tsSlug()}`;
    const jsonFile = `${stem}.json`;
    const docxFile = `${stem}.docx`;
    const jsonPath = path.join(DIRS.origin, jsonFile);
    const docxPath = path.join(DIRS.reports, docxFile);

    fs.writeFileSync(jsonPath, JSON.stringify(originResult, null, 2));
    console.log(`[ORIGIN] Saved JSON: data/origin_trace/${jsonFile}`);

    try {
      await generateOriginReport(originResult, docxPath);
      console.log(`[ORIGIN] Saved DOCX: data/reports/${docxFile}`);
      json(res, 200, { ok: true, json: `data/origin_trace/${jsonFile}`, docx: `data/reports/${docxFile}` });
    } catch (err) {
      console.error('[ORIGIN] DOCX error:', err.message);
      json(res, 500, { ok: false, error: err.message });
    }
    return;
  }

  // ── GET /exchanges — serve exchange registry from Python config ───────────────
  if (req.method === 'GET' && url === '/exchanges') {
    const { execFile: ef } = require('child_process');
    const python = process.platform === 'win32' ? 'python' : 'python3';
    ef(python, ['-c', `
import json, sys
sys.path.insert(0, '.')
from config.exchanges import KNOWN_ADDRESSES
out = {}
for e in KNOWN_ADDRESSES:
    out[e['addr'].lower()] = {
        'label':    e['label'],
        'type':     e['type'],
        'exchange': e['exchange'],
        'stop':     True
    }
sys.stdout.write(json.dumps(out))
`], { cwd: __dirname }, (err, stdout) => {
      if (err) {
        console.error('[EXCHANGES] Failed to load:', err.message);
        json(res, 500, {});
        return;
      }
      try {
        const data = JSON.parse(stdout);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } catch(e) {
        json(res, 500, {});
      }
    });
    return;
  }

  // ── Download any file from data/reports ────────────────────────────────────
  if (req.method === 'GET' && url.startsWith('/download/')) {
    const filename = path.basename(decodeURIComponent(url.replace('/download/', '')));
    const filepath = path.join(DIRS.reports, filename);
    if (!fs.existsSync(filepath)) { res.writeHead(404); res.end('File not found.'); return; }
    const stat = fs.statSync(filepath);
    res.writeHead(200, {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      stat.size,
    });
    fs.createReadStream(filepath).pipe(res);
    return;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FORWARD TRACE ENDPOINTS (existing — unchanged)
  // ════════════════════════════════════════════════════════════════════════════

  // ── POST /save-trace ────────────────────────────────────────────────────────
  if (req.method === 'POST' && url === '/save-trace') {
    let traceData;
    try { traceData = await readBody(req); }
    catch (e) { json(res, 400, { ok: false, error: 'Invalid JSON' }); return; }

    // Build v2 JSON
    const originAddr  = traceData.seed_address || traceData.meta?.seed_address || 'unknown';
    const projectName = (traceData.project_name || traceData.meta?.project_name || '')
      .replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const ethPrice    = traceData.eth_price_usd || traceData.meta?.eth_price_usd || 0;
    const rawNodes    = traceData.nodes || [];
    const rawEdges    = traceData.edges || [];

    // Clean nodes to v2 schema
    const cleanNodes = rawNodes.map(n => ({
      addr:                    n.addr,
      label:                   n.label || '',
      type:                    n.type  || 'UNKNOWN',
      note:                    n.note  || '',
      hop_depth:               n.hop_depth ?? n.depth ?? 0,
      eth_in:                  parseFloat(n.eth_in  ?? n.totalIn  ?? 0),
      eth_out:                 parseFloat(n.eth_out ?? n.totalOut ?? 0),
      eth_balance:             parseFloat(n.eth_balance ?? n.balance ?? 0),
      usdt_in:                 parseFloat(n.usdt_in  ?? n.usdtIn  ?? 0),
      usdt_out:                parseFloat(n.usdt_out ?? n.usdtOut ?? 0),
      combined_usd:            parseFloat(((parseFloat(n.eth_in ?? 0) * ethPrice) + parseFloat(n.usdt_in ?? 0)).toFixed(2)),
      tx_count:                n.tx_count ?? n.txCount ?? 0,
      api_limit_hit:           n.api_limit_hit ?? false,
      first_tx_timestamp_utc:  n.first_tx_timestamp_utc  || '',
      first_tx_timestamp_aedt: n.first_tx_timestamp_aedt || '',
      last_tx_timestamp_utc:   n.last_tx_timestamp_utc   || '',
      last_tx_timestamp_aedt:  n.last_tx_timestamp_aedt  || '',
      wallet_age_days:         n.wallet_age_days ?? 0,
      etherscan:               `https://etherscan.io/address/${n.addr}`,
      known_bad_wallet:        n.known_bad_wallet ?? false,
      scambuster_flags:        n.scambuster_flags ?? [],
    }));

    const cleanEdges = rawEdges.map(e => ({
      from:      (e.from || (typeof e.source === 'string' ? e.source : e.source?.addr || '')).toLowerCase(),
      to:        (e.to   || (typeof e.target === 'string' ? e.target : e.target?.addr || '')).toLowerCase(),
      eth_value: parseFloat((e.eth_value ?? e.value ?? 0).toFixed(6)),
      block:     e.block || 0,
      hop:       e.hop   ?? 0,
    }));

    const kycNodes  = cleanNodes.filter(n => n.type === 'HOT_WALLET_KYC');
    const totalEth  = cleanNodes.reduce((s, n) => s + n.eth_in, 0);
    const totalUsdt = cleanNodes.reduce((s, n) => s + n.usdt_in, 0);
    const nowUtc    = new Date().toISOString();
    const nowAedt   = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney', hour12: true, timeZoneName: 'short' });

    const v2 = {
      meta: {
        version:        '2.0',
        tool:           'Neural-Trace',
        generated_utc:  nowUtc,
        generated_aedt: nowAedt,
        eth_price_usd:  ethPrice,
        trace_depth:    traceData.trace_depth || traceData.meta?.trace_depth || 7,
        seed_address:   originAddr,
        seed_label:     '',
        project_name:   traceData.project_name || traceData.meta?.project_name || '',
        case_ref:       '',
      },
      summary: {
        total_wallets:       cleanNodes.length,
        total_edges:         cleanEdges.length,
        total_eth_in:        parseFloat(totalEth.toFixed(6)),
        total_usdt_in:       parseFloat(totalUsdt.toFixed(2)),
        total_combined_usd:  parseFloat(((totalEth * ethPrice) + totalUsdt).toFixed(2)),
        kyc_targets_count:   kycNodes.length,
        operator_count:      cleanNodes.filter(n => n.type === 'OPERATOR').length,
        ingestion_count:     cleanNodes.filter(n => n.type === 'INGESTION').length,
        aggregator_count:    cleanNodes.filter(n => n.type === 'AGGREGATOR').length,
        bridge_count:        cleanNodes.filter(n => n.type === 'BRIDGE').length,
        relay_count:         cleanNodes.filter(n => n.type === 'RELAY').length,
        contract_count:      cleanNodes.filter(n => n.type === 'CONTRACT').length,
        unknown_count:       cleanNodes.filter(n => n.type === 'UNKNOWN').length,
        api_limit_hit_count: cleanNodes.filter(n => n.api_limit_hit).length,
        kyc_targets: kycNodes.map(n => ({
          addr:              n.addr,
          label:             n.label,
          exchange:          n.label,
          eth_in:            n.eth_in,
          usdt_in:           n.usdt_in,
          combined_usd:      n.combined_usd,
          hop_depth:         n.hop_depth,
          direct_senders:    cleanEdges.filter(e => e.to === n.addr.toLowerCase()).map(e => e.from),
          subpoena_priority: n.eth_in > 1000 || n.usdt_in > 500000 ? 'EMERGENCY' : n.eth_in > 100 ? 'HIGH' : 'VERIFY',
        })),
        bridges:   cleanNodes.filter(n => n.type === 'BRIDGE').map(n => ({ addr: n.addr, label: n.label, eth_in: n.eth_in })),
        operators: cleanNodes.filter(n => n.type === 'OPERATOR').map(n => ({ addr: n.addr, eth_in: n.eth_in, tx_count: n.tx_count })),
      },
      funder_chain: [],
      nodes: cleanNodes,
      edges: cleanEdges,
    };

    const stem     = projectName ? `${projectName}_${cleanAddr(originAddr)}_${tsSlug()}` : `${cleanAddr(originAddr)}_${tsSlug()}`;
    const jsonFile = `${stem}.json`;
    const docxFile = `forward_${stem}.docx`;
    const jsonPath = path.join(DIRS.forward, jsonFile);
    const docxPath = path.join(DIRS.reports, docxFile);

    fs.writeFileSync(jsonPath, JSON.stringify(v2, null, 2), 'utf8');
    console.log(`[FORWARD] Saved JSON: data/forward_trace/${jsonFile}`);

    try {
      const bytes = await generateForwardReport(v2, docxPath);
      console.log(`[FORWARD] Saved DOCX: data/reports/${docxFile} (${(bytes / 1024).toFixed(1)} KB)`);
      json(res, 200, {
        ok:       true,
        json:     `data/forward_trace/${jsonFile}`,
        docx:     `data/reports/${docxFile}`,
        download: `/download/${docxFile}`,
      });
    } catch (err) {
      console.error('[FORWARD] Report error:', err.message);
      json(res, 500, { ok: false, error: 'Report generation failed: ' + err.message });
    }
    return;
  }

  // ── GET /list-traces ────────────────────────────────────────────────────────
  if (req.method === 'GET' && url === '/list-traces') {
    const files = listDir(DIRS.forward, /^.*\.json$/).map(f => {
      const data  = loadJSON(path.join(DIRS.forward, f)) || {};
      const nodes = data.nodes || [];
      return {
        file:    f,
        origin:  data.meta?.seed_address || f,
        project: data.meta?.project_name || '—',
        wallets: nodes.length,
        kyc:     nodes.filter(n => n.type === 'HOT_WALLET_KYC').length,
        hops:    data.meta?.trace_depth || 7,
        date:    data.meta?.generated_aedt || '',
      };
    });
    json(res, 200, { ok: true, files });
    return;
  }

  // ── GET /load-trace/:file ────────────────────────────────────────────────────
  if (req.method === 'GET' && url.startsWith('/load-trace/')) {
    const filename = path.basename(decodeURIComponent(url.replace('/load-trace/', '')));
    const filepath = path.join(DIRS.forward, filename);
    if (!fs.existsSync(filepath) || !filename.endsWith('.json')) {
      json(res, 404, { ok: false, error: 'File not found' }); return;
    }
    const trace = loadJSON(filepath);
    json(res, trace ? 200 : 500, trace ? { ok: true, trace } : { ok: false, error: 'Parse error' });
    return;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // MONITOR ENDPOINTS (new)
  // ════════════════════════════════════════════════════════════════════════════

  // ── POST /monitor ────────────────────────────────────────────────────────────
  // Accepts: { trace_data: <NT JSON>, window: "48h" | "7d" }
  // Streams SSE log lines then sends final result
  if (req.method === 'POST' && url === '/monitor') {
    let body;
    try { body = await readBody(req); }
    catch (e) { json(res, 400, { ok: false, error: 'Invalid JSON' }); return; }

    const traceData = body.trace_data;
    const window    = body.window === '7d' ? '7d' : '48h';

    if (!traceData || !traceData.nodes) {
      json(res, 400, { ok: false, error: 'trace_data with nodes required' }); return;
    }

    // Setup SSE stream
    sseSetup(res);
    sseSend(res, 'log', { level: 'info', msg: `Starting monitor — window: ${window}` });
    sseSend(res, 'log', { level: 'info', msg: `Project: ${traceData.meta?.project_name || 'Unknown'}` });

    // Write trace data to temp file for Python to read
    const tmpFile = path.join(__dirname, '.monitor_input.json');
    fs.writeFileSync(tmpFile, JSON.stringify({ trace_data: traceData, window }));

    // Run Python monitor engine with proper result capture
    const python = process.platform === 'win32' ? 'python' : 'python3';
    const { execFile: ef } = require('child_process');
    const proc2 = ef(python, ['-c', `
import json, sys, logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s', datefmt='%Y-%m-%dT%H:%M:%SZ')
sys.path.insert(0, '.')
with open('.monitor_input.json') as f:
    payload = json.load(f)
from core.monitor import run_monitor
result = run_monitor(payload['trace_data'], payload['window'])
sys.stdout.write('__RESULT__' + json.dumps(result))
`], { cwd: __dirname, maxBuffer: 50 * 1024 * 1024 });

    let stdout = '';
    let stderr = '';

    proc2.stdout.on('data', d => { stdout += d.toString(); });
    proc2.stderr.on('data', d => {
      stderr += d.toString();
      d.toString().split('\n').filter(Boolean).forEach(line => {
        const level = line.includes('[WARNING]') ? 'warn' : line.includes('[ERROR]') ? 'error' : 'info';
        const msg   = line.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z \[\w+\] /, '');
        sseSend(res, 'log', { level, msg: msg || line });
      });
    });

    proc2.on('close', async (code) => {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);

      if (code !== 0) {
        sseSend(res, 'error', { msg: `Monitor failed (exit ${code}): ${stderr.slice(-200)}` });
        res.end();
        return;
      }

      // Extract result JSON
      const resultStart = stdout.indexOf('__RESULT__');
      if (resultStart === -1) {
        sseSend(res, 'error', { msg: 'No result from monitor engine' });
        res.end();
        return;
      }

      let monitorResult;
      try {
        monitorResult = JSON.parse(stdout.slice(resultStart + 10));
      } catch (e) {
        sseSend(res, 'error', { msg: 'Failed to parse monitor result' });
        res.end();
        return;
      }

      // Send result to browser — user clicks EXPORT REPORT to save
      sseSend(res, 'done', { result: monitorResult });
      res.end();
    });

    return;
  }

  // ── GET /list-monitor ────────────────────────────────────────────────────────
  if (req.method === 'GET' && url === '/list-monitor') {
    const files = listDir(DIRS.monitor, /^monitor_.*\.json$/).map(f => {
      const data = loadJSON(path.join(DIRS.monitor, f)) || {};
      const meta = data.meta || {};
      return {
        file:    f,
        project: meta.project_name || '—',
        window:  meta.window || '—',
        wallets: meta.wallets_scanned || 0,
        spikes:  (data.spikes || []).length,
        date:    meta.generated_at || '',
      };
    });
    json(res, 200, { ok: true, files });
    return;
  }

  // ── GET /load-monitor/:file ───────────────────────────────────────────────────
  if (req.method === 'GET' && url.startsWith('/load-monitor/')) {
    const filename = path.basename(decodeURIComponent(url.replace('/load-monitor/', '')));
    const filepath = path.join(DIRS.monitor, filename);
    if (!fs.existsSync(filepath) || !filename.endsWith('.json')) {
      json(res, 404, { ok: false, error: 'File not found' }); return;
    }
    const data = loadJSON(filepath);
    json(res, data ? 200 : 500, data ? { ok: true, data } : { ok: false, error: 'Parse error' });
    return;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ORIGIN TRACE ENDPOINTS (new)
  // ════════════════════════════════════════════════════════════════════════════

  // ── POST /origin-trace ───────────────────────────────────────────────────────
  // Accepts: { addresses: [{addr, label}], project_name: str, eth_price: float }
  //          OR { trace_data: <NT JSON> } for batch mode (all non-KYC wallets)
  if (req.method === 'POST' && url === '/origin-trace') {
    let body;
    try { body = await readBody(req); }
    catch (e) { json(res, 400, { ok: false, error: 'Invalid JSON' }); return; }

    // Build wallet list
    let wallets     = [];
    let projectName = body.project_name || 'unknown';
    let ethPrice    = body.eth_price || 0;

    if (body.trace_data) {
      // Batch mode — from Neural Trace JSON
      const td = body.trace_data;
      projectName = td.meta?.project_name || projectName;
      ethPrice    = td.meta?.eth_price_usd || ethPrice;
      wallets     = (td.nodes || [])
        .filter(n => !['HOT_WALLET_KYC', 'MIXER', 'BRIDGE'].includes(n.type) && n.addr)
        .map(n => ({ addr: n.addr, label: n.label || n.addr.slice(0, 10) }));
    } else if (body.addresses) {
      // Single or selected wallets
      wallets = body.addresses;
    } else {
      json(res, 400, { ok: false, error: 'trace_data or addresses required' }); return;
    }

    if (!wallets.length) {
      json(res, 400, { ok: false, error: 'No wallets to trace' }); return;
    }

    // Setup SSE
    sseSetup(res);
    sseSend(res, 'log', { level: 'info', msg: `Origin Trace starting — ${wallets.length} wallet(s)` });
    sseSend(res, 'log', { level: 'info', msg: `Project: ${projectName}` });

    // Write input
    const tmpFile = path.join(__dirname, '.origin_input.json');
    fs.writeFileSync(tmpFile, JSON.stringify({ wallets, project_name: projectName, eth_price: ethPrice }));

    const python = process.platform === 'win32' ? 'python' : 'python3';
    const { execFile: ef } = require('child_process');

    const proc = ef(python, ['-c', `
import json, sys, logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s', datefmt='%Y-%m-%dT%H:%M:%SZ')
sys.path.insert(0, '.')

with open('.origin_input.json') as f:
    payload = json.load(f)

from core.fetcher      import get_all_inbound_eth, get_all_inbound_usdt, get_tx_count, get_eth_balance, get_contract_name
from core.pricer       import get_eth_usd
from config.exchanges  import lookup
from config.settings   import MAX_HOPS

wallets     = payload['wallets']
project     = payload['project_name']
eth_price   = payload['eth_price'] or get_eth_usd()
all_traces  = []
all_new     = []

exchanges_found = set()
mixers_found    = set()

for i, w in enumerate(wallets, 1):
    addr  = w['addr']
    label = w['label']
    logging.info('WALLET_PROGRESS:%d:%d:%s', i, len(wallets), label)

    visited = set()
    hops    = []
    queue   = [(addr, 0, None)]
    new_wallets = []

    while queue:
        cur_addr, depth, parent_tx = queue.pop(0)
        cur_low = cur_addr.lower()

        if depth > MAX_HOPS or cur_low in visited:
            continue
        visited.add(cur_low)

        inbound_eth  = get_all_inbound_eth(cur_addr)
        inbound_usdt = get_all_inbound_usdt(cur_addr)
        tx_count     = get_tx_count(cur_addr)
        eth_balance  = get_eth_balance(cur_addr)

        known = lookup(cur_addr)
        classification = known['type'] if known else 'REGULAR'
        exchange_label = known['label'] if known else None
        is_origin      = not inbound_eth and not inbound_usdt

        if known:
            if known['type'] == 'MIXER':
                mixers_found.add(known['label'])
            elif known['type'] in ('HOT_WALLET_KYC',):
                exchanges_found.add(known['label'])

        largest_eth  = 0.0
        largest_usdt = 0.0
        top_sender   = None

        if inbound_eth:
            top_tx = max(inbound_eth, key=lambda x: int(x.get('value', 0)))
            largest_eth = int(top_tx['value']) / 1e18
            top_sender  = top_tx['from']
        if inbound_usdt:
            top_usdt    = max(inbound_usdt, key=lambda x: int(x.get('value', 0)))
            largest_usdt = int(top_usdt['value']) / 1e6

        hop_record = {
            'hop':                  depth,
            'address':              cur_addr,
            'classification':       classification,
            'exchange_label':       exchange_label,
            'tx_count':             tx_count,
            'eth_balance':          round(eth_balance, 4),
            'largest_eth_inbound':  round(largest_eth, 6),
            'largest_usdt_inbound': round(largest_usdt, 2),
            'is_origin':            is_origin,
            'top_sender':           top_sender,
            'parent_tx':            parent_tx,
        }
        hops.append(hop_record)
        logging.info('  Hop %d: %s — %s (txs: %d)', depth, cur_addr[:14], classification, tx_count)

        if not known and not is_origin and depth > 0:
            new_wallets.append({
                'address':         cur_addr,
                'suggested_label': f'Origin-Hop{depth}-from-{label[:20]}'
            })

        stop = known and known.get('stop_trace') or is_origin or depth == MAX_HOPS
        if not stop and top_sender and top_sender.lower() not in visited:
            queue.append((top_sender, depth + 1, inbound_eth[0]['hash'] if inbound_eth else None))

    all_new.extend(new_wallets)
    all_traces.append({
        'target_address':      addr,
        'target_label':        label,
        'traced_at':           __import__('datetime').datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
        'hops':                hops,
        'new_wallets_discovered': new_wallets,
        'narrative': {
            'hops_traced':            len(hops) - 1,
            'exchange_detected':      any(h['classification'] in ('HOT_WALLET_KYC', 'KNOWN_EXCHANGE') for h in hops),
            'exchange_names':         list(set(h['exchange_label'] for h in hops if h.get('exchange_label'))),
            'mixer_detected':         any(h['classification'] == 'MIXER' for h in hops),
            'origin_reached':         any(h.get('is_origin') for h in hops),
            'new_wallets_found':      len(new_wallets),
            'text':                   '',
        }
    })

result = {
    'meta': {
        'tool':          'OriginTrace',
        'version':       '1.0',
        'generated_at':  __import__('datetime').datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
        'project_name':  project,
        'eth_price_usd': eth_price,
        'wallets_traced': len(all_traces),
        'max_hops':      MAX_HOPS,
    },
    'summary': {
        'exchanges_found':       list(exchanges_found),
        'mixers_found':          list(mixers_found),
        'total_wallets_discovered': len(all_new),
    },
    'traces': all_traces,
}

sys.stdout.write('__RESULT__' + json.dumps(result))
`], { cwd: __dirname, maxBuffer: 50 * 1024 * 1024 });

    let stdout = '';

    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => {
      d.toString().split('\n').filter(Boolean).forEach(line => {
        const level = line.includes('[WARNING]') ? 'warn' : line.includes('[ERROR]') ? 'error' : 'info';
        const msg   = line.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z \[\w+\] /, '');
        sseSend(res, 'log', { level, msg: msg || line });
      });
    });

    proc.on('close', async (code) => {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);

      if (code !== 0) {
        sseSend(res, 'error', { msg: `Origin trace failed (exit ${code})` });
        res.end();
        return;
      }

      const resultStart = stdout.indexOf('__RESULT__');
      if (resultStart === -1) {
        sseSend(res, 'error', { msg: 'No result from origin tracer' });
        res.end();
        return;
      }

      let originResult;
      try {
        originResult = JSON.parse(stdout.slice(resultStart + 10));
      } catch (e) {
        sseSend(res, 'error', { msg: 'Failed to parse origin trace result' });
        res.end();
        return;
      }

      // Send result to browser — user clicks EXPORT REPORT to save
      sseSend(res, 'done', { result: originResult });
      res.end();
    });

    return;
  }

  // ── GET /list-origin ─────────────────────────────────────────────────────────
  if (req.method === 'GET' && url === '/list-origin') {
    const files = listDir(DIRS.origin, /^origin_.*\.json$/).map(f => {
      const data = loadJSON(path.join(DIRS.origin, f)) || {};
      const meta = data.meta || {};
      return {
        file:    f,
        project: meta.project_name || '—',
        wallets: meta.wallets_traced || 0,
        exchanges: (data.summary?.exchanges_found || []).join(', ') || '—',
        date:    meta.generated_at || '',
      };
    });
    json(res, 200, { ok: true, files });
    return;
  }

  // ── GET /load-origin/:file ────────────────────────────────────────────────────
  if (req.method === 'GET' && url.startsWith('/load-origin/')) {
    const filename = path.basename(decodeURIComponent(url.replace('/load-origin/', '')));
    const filepath = path.join(DIRS.origin, filename);
    if (!fs.existsSync(filepath) || !filename.endsWith('.json')) {
      json(res, 404, { ok: false, error: 'File not found' }); return;
    }
    const data = loadJSON(filepath);
    json(res, data ? 200 : 500, data ? { ok: true, data } : { ok: false, error: 'Parse error' });
    return;
  }

  // ── 404 ──────────────────────────────────────────────────────────────────────
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  ███╗   ██╗███████╗██╗   ██╗██████╗  █████╗ ██╗');
  console.log('  ████╗  ██║██╔════╝██║   ██║██╔══██╗██╔══██╗██║');
  console.log('  ██╔██╗ ██║█████╗  ██║   ██║██████╔╝███████║██║');
  console.log('  ██║╚██╗██║██╔══╝  ██║   ██║██╔══██╗██╔══██║██║');
  console.log('  ██║ ╚████║███████╗╚██████╔╝██║  ██║██║  ██║███████╗');
  console.log('  ╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝');
  console.log('  ── v2 ─────────────────────────────────────────────');
  console.log('');
  console.log(`  URL      →  http://localhost:${PORT}`);
  console.log(`  FORWARD  →  POST /save-trace`);
  console.log(`  MONITOR  →  POST /monitor`);
  console.log(`  ORIGIN   →  POST /origin-trace`);
  console.log('');
  console.log('  Press CTRL+C to stop');
  console.log('');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[ERROR] Port ${PORT} in use. Change NEURAL_TRACE_PORT in .env`);
  } else {
    console.error('[ERROR]', err.message);
  }
  process.exit(1);
});
