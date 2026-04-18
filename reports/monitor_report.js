/**
 * neural-trace/reports/monitor_report.js
 * ────────────────────────────────────────
 * Forensic DOCX report generator for the Monitor engine.
 * Builds a complete attorney-ready report from a monitor result JSON.
 *
 * Sections:
 *   1. Cover Page
 *   2. Executive Summary
 *   3. Spike Alerts
 *   4. Structuring Alerts
 *   5. Dormancy Analysis
 *   6. Gas Funding Map
 *   7. Wallet Profiles
 *   8. Conclusions
 *
 * Usage:
 *   const { generateMonitorReport } = require('./reports/monitor_report');
 *   await generateMonitorReport(monitorData, outputPath);
 */

'use strict';

const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageNumber, PageBreak, Header, Footer,
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
  amber:     'F39C12',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const border  = { style: BorderStyle.SINGLE, size: 1, color: C.midGrey };
const borders = { top: border, bottom: border, left: border, right: border };

const mono = (text, opts = {}) =>
  new TextRun({ text: String(text || ''), font: 'Courier New', size: 18, ...opts });

const bold = (text, opts = {}) =>
  new TextRun({ text: String(text || ''), bold: true, ...opts });

const para = (children, opts = {}) =>
  new Paragraph({ children, ...opts });

const space = (n = 1) =>
  Array.from({ length: n }, () => new Paragraph({ children: [new TextRun('')] }));

const mkCell = (text, w, opts = {}) =>
  new TableCell({
    borders,
    width: { size: w, type: WidthType.DXA },
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [para([new TextRun({
      text: String(text || '—'),
      size: opts.size || 18,
      bold: opts.bold || false,
      color: opts.color || C.black,
      font: opts.mono ? 'Courier New' : 'Arial',
    })])],
  });

const hdrCell = (text, w) =>
  new TableCell({
    borders,
    width: { size: w, type: WidthType.DXA },
    shading: { fill: C.navy, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [para([new TextRun({ text: String(text), bold: true, color: C.white, size: 18, font: 'Arial' })])],
  });

const alertBox = (text, severity = 'HIGH') => {
  const fill  = severity === 'HIGH' ? 'FDECEA' : severity === 'MED' ? 'FEF9E7' : 'EAF4FB';
  const bc    = severity === 'HIGH' ? C.red    : severity === 'MED' ? C.amber  : C.accent;
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [new TableRow({ children: [new TableCell({
      width: { size: 9360, type: WidthType.DXA },
      shading: { fill, type: ShadingType.CLEAR },
      margins: { top: 120, bottom: 120, left: 200, right: 200 },
      borders: {
        top:    { style: BorderStyle.SINGLE, size: 6,  color: bc },
        bottom: { style: BorderStyle.SINGLE, size: 6,  color: bc },
        left:   { style: BorderStyle.THICK,  size: 16, color: bc },
        right:  { style: BorderStyle.SINGLE, size: 6,  color: bc },
      },
      children: [para([new TextRun({ text, size: 20, font: 'Arial', color: C.black })])],
    })]})],
  });
};

function fmtUSD(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

function fmtETH(n) {
  return Number(n || 0).toFixed(4) + ' ETH';
}

function generated() {
  return new Date().toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true, timeZoneName: 'short',
  });
}

// ── Section Builders ──────────────────────────────────────────────────────────

function buildCover(data, gen) {
  const meta = data.meta || {};
  return [
    ...space(4),
    para([new TextRun({
      text: 'NEURAL-TRACE', font: 'Arial', size: 64, bold: true, color: C.accent,
    })], { alignment: AlignmentType.CENTER }),
    para([new TextRun({
      text: 'MONITOR — SURVEILLANCE REPORT', font: 'Arial', size: 32, color: C.darkGrey,
    })], { alignment: AlignmentType.CENTER }),
    ...space(1),
    para([new TextRun({
      text: `${meta.window === '7d' ? '7-Day' : '48-Hour'} Monitoring Window`,
      size: 24, color: C.darkGrey, italics: true,
    })], { alignment: AlignmentType.CENTER }),
    ...space(2),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.accent } },
      children: [],
    }),
    ...space(1),
    ...(meta.project_name ? [
      para([
        new TextRun({ text: 'PROJECT: ', bold: true, size: 22, color: 'FF6B35' }),
        new TextRun({ text: meta.project_name, bold: true, size: 22, color: 'FF6B35' }),
      ], { alignment: AlignmentType.CENTER }),
    ] : []),
    para([
      new TextRun({ text: 'Seed Address:  ', bold: true, size: 20 }),
      mono(meta.seed_address || '—', { size: 18 }),
    ], { alignment: AlignmentType.CENTER }),
    para([new TextRun({ text: `Window: ${meta.window_from} → ${meta.generated_at}`, size: 20, color: C.darkGrey })],
      { alignment: AlignmentType.CENTER }),
    para([new TextRun({ text: `ETH Price: ${fmtUSD(meta.eth_price_usd)}`, size: 20, color: C.darkGrey })],
      { alignment: AlignmentType.CENTER }),
    para([new TextRun({ text: `Wallets Scanned: ${meta.wallets_scanned}`, size: 20, color: C.darkGrey })],
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

function buildExecutiveSummary(data, gen) {
  const meta = data.meta || {};
  const bt   = data.batch_totals || {};
  const spikes       = data.spikes || [];
  const structuring  = data.structuring || [];
  const sudden       = data.sudden_activations || [];
  const operators    = data.likely_operators || [];
  const net          = (bt.total_in_usd || 0) - (bt.total_out_usd || 0);
  const direction    = net >= 0 ? 'accumulating' : 'distributing';

  const items = [
    para([bold('1. EXECUTIVE SUMMARY')], { heading: HeadingLevel.HEADING_1 }),
    para([new TextRun({
      text:
        `This report documents a ${meta.window === '7d' ? '7-day' : '48-hour'} surveillance run ` +
        `on ${meta.wallets_scanned} Ethereum wallets associated with project "${meta.project_name || 'Unknown'}". ` +
        `The monitoring window covers ${meta.window_from} to ${meta.generated_at}. ` +
        `All data is sourced directly from the Ethereum blockchain via Etherscan API v2.`,
      size: 20,
    })]),
    ...space(1),
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [3500, 5860],
      rows: [
        ['Window',              `${meta.window === '7d' ? '7 Days' : '48 Hours'} (${meta.window_from} → ${meta.generated_at})`],
        ['ETH Price',           fmtUSD(meta.eth_price_usd)],
        ['Wallets Scanned',     String(meta.wallets_scanned)],
        ['Wallets Active',      String(meta.wallets_active)],
        ['Total Inbound',       fmtUSD(bt.total_in_usd)],
        ['Total Outbound',      fmtUSD(bt.total_out_usd)],
        ['Net Flow',            `${net >= 0 ? '+' : ''}${fmtUSD(net)} (${direction})`],
        ['ETH Received',        fmtETH(bt.total_eth_in)],
        ['USDT Received',       fmtUSD(bt.total_usdt_in)],
        ['Spike Alerts',        `${spikes.length} transactions above ${fmtUSD(50000)}`],
        ['Structuring Alerts',  String(structuring.length)],
        ['Sudden Activations',  String(sudden.length)],
        ['Gas Operators',       String(operators.length)],
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
          children: [para([new TextRun({ text: String(val), size: 18 })])],
        }),
      ]})),
    }),
    ...space(1),
  ];

  if (spikes.length > 0) {
    items.push(alertBox(
      `⚠ ${spikes.length} SPIKE ALERT(S) — ${spikes.length} transaction(s) exceeded the $50,000 threshold during this monitoring window.`,
      'HIGH'
    ));
    items.push(...space(1));
  }
  if (structuring.length > 0) {
    items.push(alertBox(
      `⚠ ${structuring.length} STRUCTURING PATTERN(S) — Possible smurfing detected. Multiple transactions from same sender within tight time windows.`,
      'MED'
    ));
    items.push(...space(1));
  }
  if (sudden.length > 0) {
    items.push(alertBox(
      `⚠ ${sudden.length} SUDDEN ACTIVATION(S) — Wallet(s) dormant for 90+ days have become active during this window.`,
      'MED'
    ));
    items.push(...space(1));
  }
  if (operators.length > 0) {
    items.push(alertBox(
      `⚠ ${operators.length} LIKELY OPERATOR(S) — Address(es) identified as funding gas for multiple tracked wallets. Possible common controller.`,
      'MED'
    ));
    items.push(...space(1));
  }

  items.push(new Paragraph({ children: [new PageBreak()] }));
  return items;
}

function buildSpikes(spikes, ethPrice) {
  const items = [
    para([bold('2. SPIKE ALERTS')], { heading: HeadingLevel.HEADING_1 }),
    para([new TextRun({
      text: `Spike alerts are triggered when a single inbound transaction exceeds $50,000 USD. ` +
            `${spikes.length} spike(s) detected during this monitoring window.`,
      size: 20,
    })]),
    ...space(1),
  ];

  if (spikes.length === 0) {
    items.push(para([new TextRun({ text: 'No spike alerts detected during this window.', size: 20, italics: true, color: C.darkGrey })]));
    items.push(new Paragraph({ children: [new PageBreak()] }));
    return items;
  }

  const colW = [1800, 2000, 1000, 4560];
  items.push(new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: colW,
    rows: [
      new TableRow({ children: [
        hdrCell('Wallet / Address', colW[0]),
        hdrCell('Amount',  colW[1]),
        hdrCell('Token',   colW[2]),
        hdrCell('From',    colW[3]),
      ]}),
      ...spikes.map((s, i) => {
        const fill = i % 2 === 0 ? C.white : C.lightGrey;
        const dt   = new Date((s.timestamp || 0) * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
        const amt  = s.token === 'ETH'
          ? `${fmtETH(s.amount_eth)} (${fmtUSD(s.amount_usd)})`
          : fmtUSD(s.amount_usd) + ' USDT';
        return new TableRow({ children: [
          new TableCell({ width: { size: colW[0], type: WidthType.DXA }, borders, shading: { fill, type: ShadingType.CLEAR }, margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [
              new Paragraph({ children: [new TextRun({ text: s.wallet_label || '—', size: 18, bold: true, font: 'Arial' })] }),
              new Paragraph({ children: [new TextRun({ text: s.wallet || '', size: 15, font: 'Courier New', color: C.darkGrey })] }),
              new Paragraph({ children: [new TextRun({ text: dt, size: 15, font: 'Arial', color: C.darkGrey })] }),
            ]
          }),
          mkCell(amt,    colW[1], { fill, bold: true, color: C.red }),
          mkCell(s.token, colW[2], { fill }),
          new TableCell({ width: { size: colW[3], type: WidthType.DXA }, borders, shading: { fill, type: ShadingType.CLEAR }, margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [new Paragraph({ children: [new TextRun({ text: s.from || '—', size: 15, font: 'Courier New', color: C.darkGrey })] })]
          }),
        ]});
      }),
    ],
  }));

  items.push(new Paragraph({ children: [new PageBreak()] }));
  return items;
}

function buildStructuring(structuring) {
  const items = [
    para([bold('3. STRUCTURING ALERTS')], { heading: HeadingLevel.HEADING_1 }),
    para([new TextRun({
      text: 'Structuring (smurfing) is detected when 3+ transactions from the same sender arrive ' +
            'within 6 hours, all within 20% of each other in value, with a combined total above $30,000. ' +
            'This pattern is used to avoid spike detection thresholds.',
      size: 20,
    })]),
    ...space(1),
  ];

  if (structuring.length === 0) {
    items.push(para([new TextRun({ text: 'No structuring patterns detected during this window.', size: 20, italics: true, color: C.darkGrey })]));
    items.push(new Paragraph({ children: [new PageBreak()] }));
    return items;
  }

  for (const [i, alert] of structuring.entries()) {
    items.push(
      para([bold(`3.${i + 1} ${alert.wallet_label}`)], { heading: HeadingLevel.HEADING_2 }),
      alertBox(
        `STRUCTURING DETECTED — ${alert.tx_count} transactions from ${alert.sender} ` +
        `totalling ${fmtUSD(alert.total_usd)} within ${alert.window_hours}h`,
        'HIGH'
      ),
      ...space(1),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3000, 6360],
        rows: [
          ['Wallet',        alert.wallet_label],
          ['Sender',        [mono(alert.sender, { size: 18 })]],
          ['Tx Count',      String(alert.tx_count)],
          ['Total Value',   fmtUSD(alert.total_usd)],
          ['Average Tx',    fmtUSD(alert.avg_usd)],
          ['Min / Max',     `${fmtUSD(alert.min_usd)} / ${fmtUSD(alert.max_usd)}`],
          ['Window Start',  alert.window_start],
          ['Window End',    alert.window_end],
          ['Duration',      `${alert.window_hours} hours`],
        ].map(([label, val], j) => new TableRow({ children: [
          new TableCell({
            borders, width: { size: 3000, type: WidthType.DXA },
            shading: { fill: C.navy, type: ShadingType.CLEAR },
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [para([new TextRun({ text: label, bold: true, color: C.white, size: 18 })])],
          }),
          new TableCell({
            borders, width: { size: 6360, type: WidthType.DXA },
            shading: { fill: j % 2 === 0 ? C.white : C.lightGrey, type: ShadingType.CLEAR },
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [para(Array.isArray(val) ? val : [new TextRun({ text: String(val), size: 18 })])],
          }),
        ]})),
      }),
      ...space(1),
    );
  }

  items.push(new Paragraph({ children: [new PageBreak()] }));
  return items;
}

function buildDormancy(dormancy) {
  const sudden = dormancy.filter(d => d.flag === 'SUDDEN_ACTIVATION');

  const items = [
    para([bold('4. DORMANCY ANALYSIS')], { heading: HeadingLevel.HEADING_1 }),
    para([new TextRun({
      text: 'Dormancy analysis identifies wallets that were inactive for 90+ days before becoming ' +
            'active during this monitoring window. Sudden reactivation of dormant wallets is a ' +
            'recognised indicator of deliberate obfuscation or coordinated activation.',
      size: 20,
    })]),
    ...space(1),
  ];

  if (sudden.length === 0) {
    items.push(para([new TextRun({ text: 'No sudden activations detected during this window.', size: 20, italics: true, color: C.darkGrey })]));
    items.push(new Paragraph({ children: [new PageBreak()] }));
    return items;
  }

  items.push(alertBox(
    `⚠ ${sudden.length} SUDDEN ACTIVATION(S) DETECTED — Wallet(s) dormant for 90+ days reactivated during this window.`,
    'HIGH'
  ));
  items.push(...space(1));

  const colW = [2800, 2000, 2000, 2560];
  items.push(new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: colW,
    rows: [
      new TableRow({ children: [
        hdrCell('Wallet',       colW[0]),
        hdrCell('Dormant Days', colW[1]),
        hdrCell('Last Active',  colW[2]),
        hdrCell('First Tx',     colW[3]),
      ]}),
      ...sudden.map((d, i) => {
        const fill = i % 2 === 0 ? C.white : C.lightGrey;
        return new TableRow({ children: [
          mkCell(d.label,                 colW[0], { fill, bold: true }),
          mkCell(d.dormancy_days + ' days', colW[1], { fill, color: C.red, bold: true }),
          mkCell(d.last_pre_window_date || '—', colW[2], { fill }),
          mkCell(d.first_tx_date || '—',  colW[3], { fill }),
        ]});
      }),
    ],
  }));

  items.push(new Paragraph({ children: [new PageBreak()] }));
  return items;
}

function buildGasMap(gasMap) {
  const funders  = Object.values(gasMap.funders || {});
  const operators = funders.filter(f => f.flag === 'LIKELY_OPERATOR');

  const items = [
    para([bold('5. GAS FUNDING MAP')], { heading: HeadingLevel.HEADING_1 }),
    para([new TextRun({
      text: 'Gas funding analysis identifies which external addresses funded the gas (ETH) for ' +
            'tracked wallets. An address that funded gas for 3+ tracked wallets is flagged as a ' +
            'LIKELY_OPERATOR — a common controller operating multiple wallets.',
      size: 20,
    })]),
    ...space(1),
  ];

  if (operators.length === 0) {
    items.push(para([new TextRun({ text: 'No likely operators identified during this window.', size: 20, italics: true, color: C.darkGrey })]));
    items.push(new Paragraph({ children: [new PageBreak()] }));
    return items;
  }

  items.push(alertBox(
    `⚠ ${operators.length} LIKELY OPERATOR(S) — Address(es) funding gas for multiple tracked wallets. Possible common controller.`,
    'HIGH'
  ));
  items.push(...space(1));

  for (const [i, op] of operators.entries()) {
    items.push(
      para([bold(`5.${i + 1} Operator: ${op.address}`)], { heading: HeadingLevel.HEADING_2 }),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3000, 6360],
        rows: [
          ['Operator Address', [mono(op.address, { size: 18 })]],
          ['Wallets Funded',   String(op.funded_wallets.length)],
          ['Flag',             op.flag],
        ].map(([label, val], j) => new TableRow({ children: [
          new TableCell({
            borders, width: { size: 3000, type: WidthType.DXA },
            shading: { fill: C.navy, type: ShadingType.CLEAR },
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [para([new TextRun({ text: label, bold: true, color: C.white, size: 18 })])],
          }),
          new TableCell({
            borders, width: { size: 6360, type: WidthType.DXA },
            shading: { fill: j % 2 === 0 ? C.white : C.lightGrey, type: ShadingType.CLEAR },
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [para(Array.isArray(val) ? val : [new TextRun({ text: String(val), size: 18 })])],
          }),
        ]})),
      }),
      ...space(1),
    );

    // Funded wallets list
    const colW = [4680, 4680];
    items.push(
      para([new TextRun({ text: 'Funded Wallets:', bold: true, size: 20 })]),
      ...space(1),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: colW,
        rows: [
          new TableRow({ children: [hdrCell('Label', colW[0]), hdrCell('Address', colW[1])] }),
          ...op.funded_wallets.map((w, wi) => {
            const fill = wi % 2 === 0 ? C.white : C.lightGrey;
            return new TableRow({ children: [
              mkCell(w.label,   colW[0], { fill }),
              mkCell(w.address, colW[1], { fill, mono: true }),
            ]});
          }),
        ],
      }),
      ...space(1),
    );
  }

  items.push(new Paragraph({ children: [new PageBreak()] }));
  return items;
}

function buildWalletProfiles(wallets, ethPrice) {
  const active = wallets.filter(w => w.total_in_usd > 0 || w.total_out_usd > 0);

  const items = [
    para([bold('6. ACTIVE WALLET PROFILES')], { heading: HeadingLevel.HEADING_1 }),
    para([new TextRun({
      text: `${active.length} of ${wallets.length} wallets recorded activity during this monitoring window. ` +
            'Profiles are sorted by total inbound volume, highest first.',
      size: 20,
    })]),
    ...space(1),
  ];

  if (active.length === 0) {
    items.push(para([new TextRun({ text: 'No wallet activity recorded during this window.', size: 20, italics: true, color: C.darkGrey })]));
    items.push(new Paragraph({ children: [new PageBreak()] }));
    return items;
  }

  const sorted = [...active].sort((a, b) => b.total_in_usd - a.total_in_usd);

  for (const [i, w] of sorted.entries()) {
    items.push(
      para([bold(`6.${i + 1} ${w.label}`)], { heading: HeadingLevel.HEADING_2 }),
    );

    if (w.spike_count > 0) {
      items.push(alertBox(
        `⚠ ${w.spike_count} SPIKE(S) — This wallet triggered ${w.spike_count} large inbound transaction alert(s).`,
        'HIGH'
      ));
      items.push(...space(1));
    }

    items.push(
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3000, 6360],
        rows: [
          ['Address',        [mono(w.address, { size: 18 })]],
          ['Total IN',       fmtUSD(w.total_in_usd)],
          ['Total OUT',      fmtUSD(w.total_out_usd)],
          ['ETH Received',   fmtETH(w.eth_in)],
          ['ETH Sent',       fmtETH(w.eth_out)],
          ['USDT Received',  fmtUSD(w.usdt_in)],
          ['Normal Txs',     String(w.tx_count_normal)],
          ['USDT Txs',       String(w.tx_count_usdt)],
          ['Spike Alerts',   String(w.spike_count)],
          ['Structuring',    String((w.structuring || []).length)],
        ].map(([label, val], j) => new TableRow({ children: [
          new TableCell({
            borders, width: { size: 3000, type: WidthType.DXA },
            shading: { fill: C.navy, type: ShadingType.CLEAR },
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [para([new TextRun({ text: label, bold: true, color: C.white, size: 18 })])],
          }),
          new TableCell({
            borders, width: { size: 6360, type: WidthType.DXA },
            shading: { fill: j % 2 === 0 ? C.white : C.lightGrey, type: ShadingType.CLEAR },
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [para(Array.isArray(val) ? val : [new TextRun({ text: String(val), size: 18 })])],
          }),
        ]})),
      }),
      ...space(1),
    );
  }

  items.push(new Paragraph({ children: [new PageBreak()] }));
  return items;
}

function buildConclusions(data) {
  const bt        = data.batch_totals || {};
  const spikes    = data.spikes || [];
  const struct    = data.structuring || [];
  const sudden    = data.sudden_activations || [];
  const operators = data.likely_operators || [];
  const meta      = data.meta || {};
  const net       = (bt.total_in_usd || 0) - (bt.total_out_usd || 0);

  return [
    para([bold('7. CONCLUSIONS')], { heading: HeadingLevel.HEADING_1 }),
    para([new TextRun({
      text:
        `Based on ${meta.window === '7d' ? '7-day' : '48-hour'} surveillance of ${meta.wallets_scanned} wallets ` +
        `associated with project "${meta.project_name || 'Unknown'}", the following conclusions are drawn:`,
      size: 20,
    })]),
    ...space(1),
    para([bold('Volume & Flow')], { heading: HeadingLevel.HEADING_2 }),
    para([new TextRun({
      text:
        `The tracked wallet network received ${fmtUSD(bt.total_in_usd)} and disbursed ${fmtUSD(bt.total_out_usd)} ` +
        `during the monitoring window. Net flow of ${fmtUSD(Math.abs(net))} indicates the network is ` +
        `${net >= 0 ? 'accumulating' : 'distributing'} funds. ` +
        `${spikes.length} transaction(s) exceeded the $50,000 alert threshold.`,
      size: 20,
    })]),
    ...space(1),
    ...(struct.length > 0 ? [
      para([bold('Structuring Activity')], { heading: HeadingLevel.HEADING_2 }),
      para([new TextRun({
        text:
          `${struct.length} structuring pattern(s) were identified. ` +
          'Multiple transactions from the same sender arriving within tight time windows and similar values ' +
          'is consistent with deliberate threshold evasion (smurfing).',
        size: 20,
      })]),
      ...space(1),
    ] : []),
    ...(sudden.length > 0 ? [
      para([bold('Dormancy & Activation')], { heading: HeadingLevel.HEADING_2 }),
      para([new TextRun({
        text:
          `${sudden.length} wallet(s) that had been dormant for 90+ days became active during this window. ` +
          'Coordinated reactivation of dormant wallets is a recognised indicator of deliberate obfuscation.',
        size: 20,
      })]),
      ...space(1),
    ] : []),
    ...(operators.length > 0 ? [
      para([bold('Operator Detection')], { heading: HeadingLevel.HEADING_2 }),
      para([new TextRun({
        text:
          `${operators.length} address(es) were identified as likely operators — ` +
          'funding gas for multiple tracked wallets from a single source. ' +
          'This is consistent with a single controller managing multiple wallets.',
        size: 20,
      })]),
      ...space(1),
    ] : []),
    para([bold('Recommended Actions')], { heading: HeadingLevel.HEADING_2 }),
    ...[
      'Run Origin Trace on all wallets that triggered spike alerts to identify fund sources.',
      'Submit legal process to exchanges identified in hop traces for KYC records.',
      'Continue monitoring — schedule next run for the same window period.',
      'Feed this report and all trace JSONs to the AI analysis layer for final consolidated report.',
    ].map(text => para([new TextRun({ text: `• ${text}`, size: 20 })], { spacing: { after: 80 } })),
  ];
}

// ── Main Export ───────────────────────────────────────────────────────────────

async function generateMonitorReport(monitorData, docxPath) {
  const gen      = generated();
  const ethPrice = monitorData.meta?.eth_price_usd || 0;

  const children = [
    ...buildCover(monitorData, gen),
    ...buildExecutiveSummary(monitorData, gen),
    ...buildSpikes(monitorData.spikes || [], ethPrice),
    ...buildStructuring(monitorData.structuring || []),
    ...buildDormancy(monitorData.dormancy || []),
    ...buildGasMap(monitorData.gas_map || {}),
    ...buildWalletProfiles(monitorData.wallets || [], ethPrice),
    ...buildConclusions(monitorData),
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
            text: 'Neural-Trace v2  |  MONITOR REPORT  |  CONFIDENTIAL',
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
            new TextRun({ text: `Neural-Trace v2  |  ${gen}  |  Page `, size: 16, color: C.darkGrey }),
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

module.exports = { generateMonitorReport };
