/**
 * neural-trace/reports/forward_report.js
 * ────────────────────────────────────────
 * Forensic DOCX report generator for Neural Trace (forward trace).
 * Extracted from server.js for clean separation of concerns.
 *
 * Builds a complete attorney-ready forensic report from a v2 trace JSON.
 * Sections:
 *   1. Cover Page
 *   2. Executive Summary
 *   3. Wallet Classification System
 *   4. Hop-by-Hop Fund Flow Analysis
 *   5. KYC Exchange Targets
 *   6. Complete Wallet Appendix
 *   7. Legal Recommendations & Certification
 *
 * Usage:
 *   const { generateForwardReport } = require('./reports/forward_report');
 *   await generateForwardReport(traceData, outputPath);
 */

'use strict';

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageNumber, PageBreak, LevelFormat, Header, Footer,
} = require('docx');

// ── Colour Palette ────────────────────────────────────────────────────────────
const C = {
  navy:      '1B2A4A',
  accent:    '00A896',
  red:       'C0392B',
  orange:    'E67E22',
  green:     '27AE60',
  lightGrey: 'F2F4F8',
  midGrey:   'D5DAE8',
  darkGrey:  '4A5568',
  white:     'FFFFFF',
  black:     '000000',
  rowAlt:    'EAF6F6',
};

// ── Border helpers ────────────────────────────────────────────────────────────
const border    = { style: BorderStyle.SINGLE, size: 1, color: C.midGrey };
const borders   = { top: border, bottom: border, left: border, right: border };
const noBorder  = { style: BorderStyle.NONE, size: 0, color: C.white };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

// ── Typography helpers ────────────────────────────────────────────────────────
const mono = (text, opts = {}) =>
  new TextRun({ text: String(text), font: 'Courier New', size: 18, ...opts });

const bold = (text, opts = {}) =>
  new TextRun({ text: String(text), bold: true, ...opts });

const para = (children, opts = {}) =>
  new Paragraph({ children, ...opts });

const space = (n = 1) =>
  Array.from({ length: n }, () => new Paragraph({ children: [new TextRun('')] }));

const cell = (children, opts = {}) =>
  new TableCell({
    borders,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    ...opts,
    children: Array.isArray(children)
      ? children
      : [para([new TextRun({ text: String(children), size: 18 })])],
  });

const headerCell = (text, opts = {}) =>
  new TableCell({
    borders,
    shading: { fill: C.navy, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    ...opts,
    children: [para([new TextRun({ text: String(text), bold: true, color: C.white, size: 18 })])],
  });

const alertBox = (text, colour) =>
  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [new TableRow({ children: [
      new TableCell({
        borders: {
          top:    { style: BorderStyle.SINGLE, size: 6,  color: colour },
          bottom: { style: BorderStyle.SINGLE, size: 6,  color: colour },
          left:   { style: BorderStyle.SINGLE, size: 18, color: colour },
          right:  { style: BorderStyle.SINGLE, size: 1,  color: colour },
        },
        shading: { fill: C.lightGrey, type: ShadingType.CLEAR },
        margins: { top: 120, bottom: 120, left: 200, right: 120 },
        children: [para([new TextRun({ text, bold: true, size: 18, color: C.darkGrey })])],
      }),
    ]})],
  });

// ── Classification colour ─────────────────────────────────────────────────────
const typeColour = t => ({
  HOT_WALLET_KYC: C.red,
  OPERATOR:       C.orange,
  MIXER:          C.red,
  AGGREGATOR:     C.accent,
  INGESTION:      C.navy,
  RELAY:          C.darkGrey,
  BRIDGE:         C.orange,
  CONTRACT:       C.darkGrey,
  UNKNOWN:        C.darkGrey,
}[t] || C.black);

// ── Format helpers ────────────────────────────────────────────────────────────
function fmtUSD(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

function fmtETH(n) {
  return Number(n || 0).toFixed(4) + ' ETH';
}

function fmtDate(iso) {
  if (!iso) return 'Unknown';
  return new Date(iso).toUTCString().replace(' GMT', ' UTC');
}

function aedtReadable() {
  return new Date().toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true, timeZoneName: 'short',
  });
}

// ── Section builders ──────────────────────────────────────────────────────────

function buildCover(traceData, nodes, kycTargets, generated) {
  const originAddr = traceData.meta?.seed_address || 'UNKNOWN';
  const from       = traceData.meta?.generated_utc || '';

  return [
    ...space(4),
    para([new TextRun({
      text: 'NEURAL-TRACE', font: 'Arial', size: 64, bold: true, color: C.accent,
    })], { alignment: AlignmentType.CENTER }),
    para([new TextRun({
      text: 'BLOCKCHAIN FORENSIC INVESTIGATION REPORT', font: 'Arial', size: 28, color: C.darkGrey,
    })], { alignment: AlignmentType.CENTER }),
    ...space(1),
    para([new TextRun({
      text: 'Neural-Trace v2 — Automated Fund Flow Analysis',
      size: 22, color: C.darkGrey, italics: true,
    })], { alignment: AlignmentType.CENTER }),
    ...space(2),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.accent } },
      children: [],
    }),
    ...space(1),
    ...(traceData.meta?.project_name ? [
      para([
        new TextRun({ text: 'PROJECT: ', bold: true, size: 22, color: 'FF6B35' }),
        new TextRun({ text: traceData.meta.project_name, bold: true, size: 22, color: 'FF6B35' }),
      ], { alignment: AlignmentType.CENTER }),
    ] : []),
    para([
      new TextRun({ text: 'Origin Wallet:  ', bold: true, size: 22 }),
      mono(originAddr, { size: 20 }),
    ], { alignment: AlignmentType.CENTER }),
    ...space(1),
    para([new TextRun({ text: `Report Generated: ${generated}`, size: 20, color: C.darkGrey })],
      { alignment: AlignmentType.CENTER }),
    para([new TextRun({ text: `Total Wallets Mapped: ${nodes.length}`, size: 20, color: C.darkGrey })],
      { alignment: AlignmentType.CENTER }),
    para([new TextRun({ text: `KYC Exchange Targets: ${kycTargets.length}`, size: 20, bold: true, color: C.red })],
      { alignment: AlignmentType.CENTER }),
    ...space(2),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.accent } },
      children: [],
    }),
    ...space(2),
    para([new TextRun({
      text: 'CONFIDENTIAL — LAW ENFORCEMENT AND LEGAL COUNSEL USE ONLY',
      bold: true, size: 20, color: C.red,
    })], { alignment: AlignmentType.CENTER }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function buildExecutiveSummary(traceData, nodes, edges, kycTargets, mixers, bridges, generated) {
  const originAddr  = traceData.meta?.seed_address || 'UNKNOWN';
  const ethPrice    = traceData.meta?.eth_price_usd || 0;
  const totalETH    = nodes.reduce((s, n) => s + (parseFloat(n.eth_in || 0)), 0);
  const totalUSDT   = nodes.reduce((s, n) => s + (parseFloat(n.usdt_in || 0)), 0);
  const totalUSD    = totalETH * ethPrice + totalUSDT;

  return [
    para([bold('1. EXECUTIVE SUMMARY')], { heading: HeadingLevel.HEADING_1 }),
    para([new TextRun({
      text:
        'This report presents a blockchain forensic investigation conducted by Neural-Trace v2. ' +
        'The investigation commenced from the origin wallet address provided and recursively traced ' +
        'all outbound fund flows, mapping every wallet the money touched on its journey. ' +
        'Every address, classification, ETH amount, and connection in this report is sourced ' +
        'directly from the Ethereum public blockchain and is independently verifiable on etherscan.io.',
      size: 20,
    })]),
    ...space(1),
    alertBox(
      '⚠  API Limitation Disclosure: Neural-Trace uses the free Etherscan API which returns a maximum ' +
      'of 500 transactions per wallet per call. For high-volume wallets, ETH and USDT volumes are ' +
      'minimum figures, not totals. All figures remain independently verifiable on etherscan.io.',
      C.orange
    ),
    ...space(1),
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [3500, 5860],
      rows: [
        ['Origin Address',    [mono(originAddr, { size: 18 })]],
        ['Trace Depth',       `${traceData.meta?.trace_depth || 7} hops`],
        ['Total Wallets',     String(nodes.length)],
        ['Total ETH Traced',  fmtETH(totalETH) + (ethPrice ? ` = ${fmtUSD(totalETH * ethPrice)}` : '')],
        ['Total USDT Traced', fmtUSD(totalUSDT)],
        ['Combined Value',    totalUSD ? fmtUSD(totalUSD) : 'N/A'],
        ['KYC Targets',       `${kycTargets.length} exchange${kycTargets.length !== 1 ? 's' : ''}`],
        ['Mixers Detected',   String(mixers.length)],
        ['Bridges Detected',  String(bridges.length)],
        ['Report Generated',  generated],
      ].map(([label, val], i) => new TableRow({ children: [
        new TableCell({
          borders,
          shading: { fill: '0D2137', type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [para([new TextRun({ text: String(label), bold: true, color: C.accent, size: 18 })])],
        }),
        new TableCell({
          borders,
          shading: { fill: i % 2 === 0 ? C.white : C.rowAlt, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [para(Array.isArray(val) ? val : [new TextRun({ text: String(val), size: 18 })])],
        }),
      ]})),
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function buildClassificationSystem(byType, ethPrice) {
  return [
    para([bold('2. WALLET CLASSIFICATION SYSTEM')], { heading: HeadingLevel.HEADING_1 }),
    para([new TextRun({
      text: 'Neural-Trace classifies each wallet automatically based on its transaction behaviour:',
      size: 20,
    })]),
    ...space(1),
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [2200, 7160],
      rows: [
        new TableRow({ children: [
          headerCell('CLASSIFICATION', { width: { size: 2200, type: WidthType.DXA } }),
          headerCell('MEANING',        { width: { size: 7160, type: WidthType.DXA } }),
        ]}),
        ...[
          ['HOT_WALLET_KYC', 'KYC Exchange — regulated exchange with verified account holder identity on file'],
          ['AGGREGATOR',     'Treasury Hub — collects from multiple wallets and consolidates funds'],
          ['INGESTION',      'High-Inbound Collection Wallet — received high volumes from multiple senders'],
          ['OPERATOR',       'Operator / Funder — controlled multiple wallets, funded gas for operations'],
          ['RELAY',          'Passthrough — received and immediately forwarded funds, no accumulation'],
          ['UNKNOWN',        'Unclassified — requires further investigation'],
          ['CONTRACT',       'Smart Contract — deployed code holding or routing funds'],
          ['BRIDGE',         'Cross-Chain Bridge — moved funds from Ethereum to another blockchain'],
          ['MIXER',          'Mixer — deliberately obfuscated transaction trail'],
        ].map(([type, desc], i) => new TableRow({ children: [
          new TableCell({
            borders,
            width: { size: 2200, type: WidthType.DXA },
            shading: { fill: i % 2 === 0 ? C.lightGrey : C.white, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [para([new TextRun({ text: type, bold: true, size: 18, color: typeColour(type) })])],
          }),
          new TableCell({
            borders,
            width: { size: 7160, type: WidthType.DXA },
            shading: { fill: i % 2 === 0 ? C.lightGrey : C.white, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [para([new TextRun({ text: desc, size: 18 })])],
          }),
        ]})),
      ],
    }),
    ...space(1),
    para([bold('2.1 Volume Summary by Classification')], { heading: HeadingLevel.HEADING_2 }),
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [2800, 1400, 2560, 2600],
      rows: [
        new TableRow({ children: [
          headerCell('TYPE',        { width: { size: 2800, type: WidthType.DXA } }),
          headerCell('COUNT',       { width: { size: 1400, type: WidthType.DXA } }),
          headerCell('ETH VOLUME',  { width: { size: 2560, type: WidthType.DXA } }),
          headerCell('USDT VOLUME', { width: { size: 2600, type: WidthType.DXA } }),
        ]}),
        ...Object.entries(byType)
          .sort((a, b) => {
            const ethA = a[1].reduce((s, n) => s + parseFloat(n.eth_in || 0), 0);
            const ethB = b[1].reduce((s, n) => s + parseFloat(n.eth_in || 0), 0);
            return ethB - ethA;
          })
          .map(([type, list], i) => {
            const eth  = list.reduce((s, n) => s + parseFloat(n.eth_in  || 0), 0);
            const usdt = list.reduce((s, n) => s + parseFloat(n.usdt_in || 0), 0);
            const fill = i % 2 === 0 ? C.white : C.lightGrey;
            const mkC  = (text, w) => new TableCell({
              borders, width: { size: w, type: WidthType.DXA },
              shading: { fill, type: ShadingType.CLEAR },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [para([new TextRun({ text: String(text), size: 18 })])],
            });
            return new TableRow({ children: [
              new TableCell({
                borders, width: { size: 2800, type: WidthType.DXA },
                shading: { fill, type: ShadingType.CLEAR },
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [para([new TextRun({ text: type, bold: true, size: 18, color: typeColour(type) })])],
              }),
              mkC(list.length, 1400),
              mkC(fmtETH(eth), 2560),
              mkC(usdt > 0 ? fmtUSD(usdt) : '—', 2600),
            ]});
          }),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function buildHopAnalysis(byHop, nodes, edges, ethPrice) {
  const items = [
    para([bold('3. HOP-BY-HOP FUND FLOW ANALYSIS')], { heading: HeadingLevel.HEADING_1 }),
    para([new TextRun({
      text: 'This section documents every wallet found at each hop from the origin address. ' +
            'The trace follows outbound fund flows — money leaving each wallet to the next.',
      size: 20,
    })]),
    ...space(1),
  ];

  const hopKeys = Object.keys(byHop).map(Number).sort((a, b) => a - b);

  for (const hop of hopKeys) {
    const hopNodes = byHop[hop];
    const hopETH   = hopNodes.reduce((s, n) => s + parseFloat(n.eth_in || 0), 0);

    items.push(
      para([new TextRun({
        text: `HOP ${hop}${hop === 0 ? ' — ORIGIN WALLET' : ''}`,
        bold: true, size: 28, color: hop === 0 ? 'FF6B35' : '4FACFE', font: 'Arial',
      })], { heading: HeadingLevel.HEADING_2 }),
      para([new TextRun({
        text: `${hopNodes.length} wallet${hopNodes.length !== 1 ? 's' : ''} at hop ${hop}. ` +
              `Combined ETH: ${fmtETH(hopETH)}` +
              (ethPrice ? ` = ${fmtUSD(hopETH * ethPrice)}` : '') + '.',
        size: 20,
      })]),
      ...space(1),
    );

    for (const node of hopNodes) {
      const isKYC    = node.type === 'HOT_WALLET_KYC';
      const isMixer  = node.type === 'MIXER';
      const isOp     = node.type === 'OPERATOR';
      const isBridge = node.type === 'BRIDGE';

      if (isKYC || isMixer) {
        items.push(alertBox(
          `⚠ KYC TARGET — ${node.label || node.type} — SUBPOENA REQUIRED`,
          C.red
        ), ...space(1));
      } else if (isOp || isBridge) {
        items.push(alertBox(
          `★ ${isOp ? 'OPERATOR WALLET' : 'BRIDGE DETECTED'} — ${node.label || node.type}`,
          C.orange
        ), ...space(1));
      }

      const parentEdge = edges.find(e => e.to === (node.addr || '').toLowerCase());
      const parentId   = parentEdge?.from || null;
      const parentNode = parentId ? nodes.find(n => n.addr?.toLowerCase() === parentId) : null;
      const parent     = parentId
        ? `${parentId}${parentNode ? ' (' + parentNode.type + ')' : ''}`
        : '—';

      items.push(
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [2000, 7360],
          rows: [
            ['Address',             [mono(node.addr || '—', { size: 18 })]],
            ['Classification',      [
              new TextRun({ text: node.type, bold: true, size: 18, color: typeColour(node.type) }),
              new TextRun({ text: ` — ${node.label || ''}`, size: 18 }),
            ]],
            ['ETH In / Out',        `${fmtETH(node.eth_in)} IN / ${fmtETH(node.eth_out)} OUT`],
            ['USDT Volume',         node.usdt_in ? fmtUSD(node.usdt_in) : '—'],
            ['Tx Count',            String(node.tx_count || '—')],
            ['Wallet Age',          `${node.wallet_age_days ?? '—'} days`],
            ['Parent Wallet',       parent],
            ['Flags',               (node.scambuster_flags || []).join(', ') || '—'],
            ['Etherscan',           [new TextRun({
              text: `etherscan.io/address/${node.addr}`, size: 18, color: '0000EE',
            })]],
          ].map(([label, val], i) => new TableRow({ children: [
            new TableCell({
              borders, width: { size: 2000, type: WidthType.DXA },
              shading: { fill: C.navy, type: ShadingType.CLEAR },
              margins: { top: 60, bottom: 60, left: 120, right: 120 },
              children: [para([new TextRun({ text: String(label), bold: true, color: C.white, size: 18 })])],
            }),
            new TableCell({
              borders, width: { size: 7360, type: WidthType.DXA },
              shading: { fill: i % 2 === 0 ? C.white : C.lightGrey, type: ShadingType.CLEAR },
              margins: { top: 60, bottom: 60, left: 120, right: 120 },
              children: [para(Array.isArray(val) ? val : [new TextRun({ text: String(val), size: 18 })])],
            }),
          ]})),
        }),
        ...space(1),
      );
    }
  }

  items.push(new Paragraph({ children: [new PageBreak()] }));
  return items;
}

function buildKYCTargets(kycTargets, nodes) {
  const items = [
    para([new TextRun({
      text: '4. KYC EXCHANGE TARGETS',
      bold: true, size: 38, color: C.red, font: 'Arial', allCaps: true,
    })], { heading: HeadingLevel.HEADING_1 }),
    para([new TextRun({
      text: 'The following exchange accounts received funds directly traceable from the origin wallet.',
      size: 20,
    })]),
    ...space(1),
  ];

  if (kycTargets.length === 0) {
    items.push(alertBox(
      'No KYC exchange targets identified. Consider extending hop depth.',
      C.orange
    ));
  }

  kycTargets.forEach((kyc, i) => {
    const node = nodes.find(n => n.addr === kyc.addr) || {};
    items.push(
      para([bold(`4.${i + 1} ${kyc.exchange || 'Exchange'} — ${kyc.addr}`)],
        { heading: HeadingLevel.HEADING_2 }),
      alertBox(`⚠ KYC TARGET — ${kyc.exchange} — SUBPOENA REQUIRED`, C.red),
      ...space(1),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2800, 6560],
        rows: [
          ['Exchange',        kyc.exchange || '—'],
          ['Address',         [mono(kyc.addr, { size: 18 })]],
          ['ETH Received',    fmtETH(node.eth_in)],
          ['USDT Received',   node.usdt_in ? fmtUSD(node.usdt_in) : '—'],
          ['Combined Value',  fmtUSD(kyc.combined_usd)],
          ['Hop Depth',       String(kyc.hop_depth)],
          ['Direct Senders',  (kyc.direct_senders || []).join('\n') || '—'],
          ['Priority',        kyc.subpoena_priority || '—'],
          ['Legal Action',    'SUBPOENA — Request KYC records and immediate asset freeze'],
        ].map(([label, val], j) => new TableRow({ children: [
          new TableCell({
            borders, width: { size: 2800, type: WidthType.DXA },
            shading: { fill: C.navy, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [para([new TextRun({ text: String(label), bold: true, color: C.white, size: 18 })])],
          }),
          new TableCell({
            borders, width: { size: 6560, type: WidthType.DXA },
            shading: { fill: j % 2 === 0 ? C.white : C.lightGrey, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [para(Array.isArray(val) ? val : [new TextRun({ text: String(val), size: 18 })])],
          }),
        ]})),
      }),
      ...space(1),
    );
  });

  items.push(new Paragraph({ children: [new PageBreak()] }));
  return items;
}

function buildAppendix(nodes) {
  return [
    para([bold('5. COMPLETE WALLET APPENDIX')], { heading: HeadingLevel.HEADING_1 }),
    para([new TextRun({
      text: `All ${nodes.length} wallet addresses found in this investigation. ` +
            'All addresses are independently verifiable on etherscan.io.',
      size: 20,
    })]),
    ...space(1),
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [700, 3960, 1600, 3100],
      rows: [
        new TableRow({ children: [
          headerCell('HOP',    { width: { size: 700,  type: WidthType.DXA } }),
          headerCell('ADDRESS',{ width: { size: 3960, type: WidthType.DXA } }),
          headerCell('TYPE',   { width: { size: 1600, type: WidthType.DXA } }),
          headerCell('ETH IN', { width: { size: 3100, type: WidthType.DXA } }),
        ]}),
        ...nodes
          .sort((a, b) => (a.hop_depth || 0) - (b.hop_depth || 0))
          .map((n, i) => {
            const fill = i % 2 === 0 ? C.white : C.lightGrey;
            const mkC  = (text, w) => new TableCell({
              borders, width: { size: w, type: WidthType.DXA },
              shading: { fill, type: ShadingType.CLEAR },
              margins: { top: 60, bottom: 60, left: 80, right: 80 },
              children: [para([new TextRun({ text: String(text || '—'), size: 16 })])],
            });
            return new TableRow({ children: [
              mkC(n.hop_depth ?? '?', 700),
              new TableCell({
                borders, width: { size: 3960, type: WidthType.DXA },
                shading: { fill, type: ShadingType.CLEAR },
                margins: { top: 60, bottom: 60, left: 80, right: 80 },
                children: [para([mono(n.addr || '—', { size: 15 })])],
              }),
              new TableCell({
                borders, width: { size: 1600, type: WidthType.DXA },
                shading: { fill, type: ShadingType.CLEAR },
                margins: { top: 60, bottom: 60, left: 80, right: 80 },
                children: [para([new TextRun({ text: n.type || '—', bold: true, size: 16, color: typeColour(n.type) })])],
              }),
              mkC(fmtETH(n.eth_in), 3100),
            ]});
          }),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function buildLegal(traceData, generated) {
  const originAddr = traceData.meta?.seed_address || 'UNKNOWN';
  return [
    para([bold('6. LEGAL RECOMMENDATIONS & CERTIFICATION')], { heading: HeadingLevel.HEADING_1 }),
    para([bold('6.1 Evidence Integrity Statement')], { heading: HeadingLevel.HEADING_2 }),
    para([new TextRun({
      text: 'All data in this report is sourced directly from the Ethereum public blockchain via ' +
            'the Etherscan API v2. The Ethereum blockchain is an immutable, cryptographically secured ' +
            'public ledger. Every transaction hash, wallet address, and amount cited in this report ' +
            `can be independently verified on etherscan.io. Report generated by Neural-Trace v2 on ${generated}.`,
      size: 20,
    })]),
    ...space(1),
    para([bold('6.2 Investigative Recommendations')], { heading: HeadingLevel.HEADING_2 }),
    ...[
      'Subpoena or legal process should be directed to identified exchanges to obtain KYC/AML records.',
      'Origin wallets identified in hop traces should be subject to further blockchain analysis.',
      'Internal movements between tracked wallets should be presented as evidence of coordinated control.',
      'Continued monitoring is recommended for all flagged wallets.',
    ].map(text => para([new TextRun({ text: `• ${text}`, size: 20 })], { spacing: { after: 80 } })),
    ...space(2),
    para([bold('6.3 Certification')], { heading: HeadingLevel.HEADING_2 }),
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [4680, 4680],
      rows: [new TableRow({ children: [
        new TableCell({
          borders,
          margins: { top: 240, bottom: 240, left: 200, right: 200 },
          children: [
            para([new TextRun({ text: 'Analyst / Investigator', bold: true, size: 20 })]),
            ...space(1),
            para([new TextRun({ text: 'Full Name: ___________________________', size: 20 })]),
            ...space(1),
            para([new TextRun({ text: 'Date: ________________________________', size: 20 })]),
          ],
        }),
        new TableCell({
          borders,
          margins: { top: 240, bottom: 240, left: 200, right: 200 },
          children: [
            para([new TextRun({ text: 'Authorized Signature', bold: true, size: 20 })]),
            ...space(1),
            para([new TextRun({ text: 'Signature: ___________________________', size: 20 })]),
            ...space(1),
            para([new TextRun({ text: 'Origin: ', bold: true, size: 18 }),
                  mono(originAddr, { size: 16, color: C.accent })]),
            para([new TextRun({ text: `Generated: ${generated}`, size: 18 })]),
          ],
        }),
      ]})],
    }),
  ];
}

// ── Main Export ───────────────────────────────────────────────────────────────

async function generateForwardReport(traceData, docxPath) {
  const fs = require('fs');

  const nodes      = traceData.nodes || [];
  const edges      = traceData.edges || [];
  const summary    = traceData.summary || {};
  const kycTargets = summary.kyc_targets || [];
  const mixers     = nodes.filter(n => n.type === 'MIXER');
  const bridges    = nodes.filter(n => n.type === 'BRIDGE');
  const ethPrice   = traceData.meta?.eth_price_usd || 0;
  const generated  = new Date().toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true, timeZoneName: 'short',
  });

  // Group nodes by type and hop
  const byType = {};
  const byHop  = {};
  nodes.forEach(n => {
    (byType[n.type] = byType[n.type] || []).push(n);
    const h = n.hop_depth ?? 0;
    (byHop[h] = byHop[h] || []).push(n);
  });

  const children = [
    ...buildCover(traceData, nodes, kycTargets, generated),
    ...buildExecutiveSummary(traceData, nodes, edges, kycTargets, mixers, bridges, generated),
    ...buildClassificationSystem(byType, ethPrice),
    ...buildHopAnalysis(byHop, nodes, edges, ethPrice),
    ...buildKYCTargets(kycTargets, nodes),
    ...buildAppendix(nodes),
    ...buildLegal(traceData, generated),
  ];

  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 20 } } },
      paragraphStyles: [
        {
          id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 38, bold: true, font: 'Arial', color: C.accent, allCaps: true },
          paragraph: {
            spacing: { before: 400, after: 200 }, outlineLevel: 0,
            shading: { fill: '0D1F35', type: ShadingType.CLEAR },
            border: {
              left:   { style: BorderStyle.SINGLE, size: 20, color: C.accent, space: 8 },
              bottom: { style: BorderStyle.SINGLE, size: 3,  color: C.accent, space: 4 },
            },
            indent: { left: 200 },
          },
        },
        {
          id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 26, bold: true, font: 'Arial', color: '4FACFE' },
          paragraph: {
            spacing: { before: 280, after: 120 }, outlineLevel: 1,
            border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: '1B3A5A', space: 2 } },
          },
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          size:   { width: 12240, height: 15840 },
          margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
        },
      },
      headers: {
        default: new Header({ children: [
          para([new TextRun({
            text: 'Neural-Trace v2  |  CONFIDENTIAL  |  Forensic Blockchain Investigation',
            size: 16, color: C.darkGrey,
          })], { alignment: AlignmentType.RIGHT }),
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: C.accent } },
            children: [],
          }),
        ]}),
      },
      footers: {
        default: new Footer({ children: [
          new Paragraph({
            border: { top: { style: BorderStyle.SINGLE, size: 2, color: C.midGrey } },
            children: [],
          }),
          para([
            new TextRun({ text: `Neural-Trace v2  |  ${generated}  |  Page `, size: 16, color: C.darkGrey }),
            new TextRun({ children: [PageNumber.CURRENT], size: 16, color: C.darkGrey }),
            new TextRun({ text: ' of ', size: 16, color: C.darkGrey }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: C.darkGrey }),
          ], { alignment: AlignmentType.CENTER }),
        ]}),
      },
      children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(docxPath, buffer);
  return buffer.length;
}

module.exports = { generateForwardReport };
