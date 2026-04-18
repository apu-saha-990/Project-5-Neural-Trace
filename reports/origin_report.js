/**
 * neural-trace/reports/origin_report.js
 * ────────────────────────────────────────
 * Forensic DOCX report generator for Origin Trace (backward hop tracer).
 * Builds a complete attorney-ready report from a unified origin trace JSON.
 *
 * Handles both:
 *   - Single wallet trace  (traces array with 1 entry)
 *   - Batch wallet trace   (traces array with multiple entries)
 *
 * Sections:
 *   1. Cover Page
 *   2. Executive Summary
 *   3. Trace Results (one subsection per wallet traced)
 *   4. Exchange Targets Found
 *   5. New Wallets Discovered
 *   6. Conclusions
 *
 * Usage:
 *   const { generateOriginReport } = require('./reports/origin_report');
 *   await generateOriginReport(originData, outputPath);
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
      text:  String(text || '—'),
      size:  opts.size  || 18,
      bold:  opts.bold  || false,
      color: opts.color || C.black,
      font:  opts.mono  ? 'Courier New' : 'Arial',
    })])],
  });

const hdrCell = (text, w) =>
  new TableCell({
    borders,
    width: { size: w, type: WidthType.DXA },
    shading: { fill: C.navy, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [para([new TextRun({
      text: String(text), bold: true, color: C.white, size: 18, font: 'Arial',
    })])],
  });

const alertBox = (text, severity = 'HIGH') => {
  const fill = severity === 'HIGH' ? 'FDECEA' : severity === 'MED' ? 'FEF9E7' : 'EAF4FB';
  const bc   = severity === 'HIGH' ? C.red    : severity === 'MED' ? C.amber  : C.accent;
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

// Classification colour
const classColour = t => ({
  KNOWN_EXCHANGE:  C.orange,
  LIKELY_EXCHANGE: C.orange,
  MIXER:           C.red,
  REGULAR:         C.darkGrey,
  ORIGIN:          C.green,
}[t] || C.black);

// ── Section Builders ──────────────────────────────────────────────────────────

function buildCover(data, gen) {
  const meta    = data.meta || {};
  const traces  = data.traces || [];
  const summary = data.summary || {};

  return [
    ...space(4),
    para([new TextRun({
      text: 'NEURAL-TRACE', font: 'Arial', size: 64, bold: true, color: C.accent,
    })], { alignment: AlignmentType.CENTER }),
    para([new TextRun({
      text: 'ORIGIN TRACE — BACKWARD HOP ANALYSIS', font: 'Arial', size: 32, color: C.darkGrey,
    })], { alignment: AlignmentType.CENTER }),
    ...space(1),
    para([new TextRun({
      text: 'Source of Funds Investigation',
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
    para([new TextRun({
      text: `Wallets Traced: ${traces.length}`,
      size: 22, bold: true, color: C.darkGrey,
    })], { alignment: AlignmentType.CENTER }),
    para([new TextRun({
      text: `Exchanges Found: ${(summary.exchanges_found || []).length}`,
      size: 22, bold: true, color: C.red,
    })], { alignment: AlignmentType.CENTER }),
    para([new TextRun({
      text: `Mixers Found: ${(summary.mixers_found || []).length}`,
      size: 22, bold: true, color: summary.mixers_found?.length > 0 ? C.red : C.darkGrey,
    })], { alignment: AlignmentType.CENTER }),
    para([new TextRun({ text: `Report Generated: ${gen}`, size: 20, color: C.darkGrey })],
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
  const meta    = data.meta || {};
  const traces  = data.traces || [];
  const summary = data.summary || {};

  const totalHops        = traces.reduce((s, t) => s + (t.hops?.length - 1 || 0), 0);
  const exchangeDetected = traces.filter(t => t.narrative?.exchange_detected).length;
  const mixerDetected    = traces.filter(t => t.narrative?.mixer_detected).length;
  const originReached    = traces.filter(t => t.narrative?.origin_reached).length;
  const newWallets       = traces.reduce((s, t) => s + (t.narrative?.new_wallets_found || 0), 0);

  const items = [
    para([bold('1. EXECUTIVE SUMMARY')], { heading: HeadingLevel.HEADING_1 }),
    para([new TextRun({
      text:
        'This report presents an Origin Trace (backward hop analysis) investigation conducted by ' +
        'Neural-Trace v2. The investigation traces the source of funds for flagged wallet addresses ' +
        'by walking backwards through inbound transactions, hop by hop, until a known exchange, ' +
        'mixer, or origin point is reached. All data is sourced directly from the Ethereum blockchain.',
      size: 20,
    })]),
    ...space(1),
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [3500, 5860],
      rows: [
        ['Project',              meta.project_name || '—'],
        ['Wallets Traced',       String(traces.length)],
        ['Total Hops Analysed',  String(totalHops)],
        ['Max Hops Per Trace',   String(meta.max_hops || 7)],
        ['Exchanges Found',      `${exchangeDetected} trace(s) reached known exchange(s)`],
        ['Mixers Detected',      `${mixerDetected} trace(s) identified mixer involvement`],
        ['Origins Reached',      `${originReached} trace(s) reached origin point`],
        ['New Wallets Found',    String(newWallets)],
        ['Report Generated',     gen],
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

  if (mixerDetected > 0) {
    items.push(alertBox(
      `⚠ MIXER DETECTED — ${mixerDetected} trace(s) identified Tornado Cash or mixing service involvement. ` +
      'The deliberate use of mixing services to obscure the origin of funds is a strong indicator of intentional money laundering.',
      'HIGH'
    ));
    items.push(...space(1));
  }

  if (exchangeDetected > 0) {
    items.push(alertBox(
      `⚠ EXCHANGE IDENTIFIED — ${exchangeDetected} trace(s) terminated at known exchange hot wallets. ` +
      'Legal process should be directed to these exchanges for KYC records.',
      'MED'
    ));
    items.push(...space(1));
  }

  items.push(new Paragraph({ children: [new PageBreak()] }));
  return items;
}

function buildTraceResults(traces, ethPrice) {
  const items = [
    para([bold('2. TRACE RESULTS')], { heading: HeadingLevel.HEADING_1 }),
    para([new TextRun({
      text: 'This section documents the complete hop chain for each traced wallet. ' +
            'Each hop represents one step backwards in the fund flow — from the target wallet ' +
            'back towards the original source.',
      size: 20,
    })]),
    ...space(1),
  ];

  for (const [ti, trace] of traces.entries()) {
    const narr = trace.narrative || {};
    const hops = trace.hops || [];

    items.push(
      para([bold(`2.${ti + 1} ${trace.target_label || 'Unknown Wallet'}`)],
        { heading: HeadingLevel.HEADING_2 }),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3000, 6360],
        rows: [
          ['Target Address', [mono(trace.target_address, { size: 18 })]],
          ['Target Label',   trace.target_label || '—'],
          ['Traced At',      trace.traced_at || '—'],
          ['Hops Traced',    String(narr.hops_traced || hops.length - 1)],
          ['Exchange Found', narr.exchange_detected ? (narr.exchange_names || []).join(', ') : 'No'],
          ['Mixer Found',    narr.mixer_detected ? 'YES — TORNADO CASH' : 'No'],
          ['Origin Reached', narr.origin_reached ? 'Yes' : 'No — max hops reached'],
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
            children: [para(Array.isArray(val) ? val : [new TextRun({
              text: String(val),
              size: 18,
              bold: label === 'Mixer Found' && narr.mixer_detected,
              color: label === 'Mixer Found' && narr.mixer_detected ? C.red : C.black,
            })])],
          }),
        ]})),
      }),
      ...space(1),
    );

    // Alert boxes
    if (narr.mixer_detected) {
      items.push(alertBox(
        `⚠ MIXER DETECTED in hop chain for ${trace.target_label}. ` +
        'Funds were deliberately obfuscated before reaching this wallet. Strong laundering indicator.',
        'HIGH'
      ));
      items.push(...space(1));
    }

    if (narr.exchange_detected) {
      items.push(alertBox(
        `EXCHANGE IDENTIFIED — ${(narr.exchange_names || []).join(', ')}. ` +
        'Funds originated from or passed through a centralised exchange. KYC records obtainable via legal process.',
        'MED'
      ));
      items.push(...space(1));
    }

    // Hop chain table
    if (hops.length > 0) {
      items.push(para([new TextRun({ text: 'Hop Chain:', bold: true, size: 20 })]));
      items.push(...space(1));

      const colW = [800, 3600, 2200, 1360, 1400];
      items.push(new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: colW,
        rows: [
          new TableRow({ children: [
            hdrCell('Hop',            colW[0]),
            hdrCell('Address',        colW[1]),
            hdrCell('Classification', colW[2]),
            hdrCell('Tx Count',       colW[3]),
            hdrCell('ETH Balance',    colW[4]),
          ]}),
          ...hops.map((hop, hi) => {
            const fill      = hi % 2 === 0 ? C.white : C.lightGrey;
            const hopLabel  = hop.hop === 0 ? 'TARGET' : `HOP ${hop.hop}`;
            const classLabel = hop.exchange_label || hop.known_label || hop.classification;
            return new TableRow({ children: [
              mkCell(hopLabel,                          colW[0], { fill, bold: hop.hop === 0 }),
              mkCell(hop.address,                       colW[1], { fill, mono: true, size: 15 }),
              mkCell(classLabel,                        colW[2], { fill, bold: true, color: classColour(hop.classification) }),
              mkCell(String(hop.tx_count || '—'),       colW[3], { fill }),
              mkCell(fmtETH(hop.eth_balance),           colW[4], { fill }),
            ]});
          }),
        ],
      }));
      items.push(...space(1));
    }

    // Narrative text
    if (narr.text) {
      items.push(
        para([new TextRun({ text: 'Narrative:', bold: true, size: 20 })]),
        ...space(1),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [9360],
          rows: [new TableRow({ children: [new TableCell({
            borders: {
              top:    { style: BorderStyle.SINGLE, size: 4, color: C.accent },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: C.accent },
              left:   { style: BorderStyle.THICK,  size: 12, color: C.accent },
              right:  { style: BorderStyle.SINGLE, size: 4, color: C.accent },
            },
            shading: { fill: 'EAF6F6', type: ShadingType.CLEAR },
            margins: { top: 140, bottom: 140, left: 200, right: 200 },
            children: narr.text.split('\n')
              .filter(line => line.trim())
              .map(line => para([new TextRun({
                text: line,
                size: 18,
                font: 'Courier New',
                color: line.startsWith('***') ? C.red : C.darkGrey,
              })])),
          })]})],
        }),
        ...space(1),
      );
    }

    items.push(
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: C.midGrey } },
        children: [],
        spacing: { after: 200 },
      }),
      ...space(1),
    );
  }

  items.push(new Paragraph({ children: [new PageBreak()] }));
  return items;
}

function buildExchangeTargets(data) {
  const traces    = data.traces || [];
  const summary   = data.summary || {};
  const exchanges = summary.exchanges_found || [];

  const items = [
    para([bold('3. EXCHANGE TARGETS IDENTIFIED')], { heading: HeadingLevel.HEADING_1 }),
    para([new TextRun({
      text: 'The following exchanges were identified at the end of backward hop chains. ' +
            'These exchanges hold KYC records for accounts that directly sent funds ' +
            'into the traced wallet network. Legal process should be directed to each.',
      size: 20,
    })]),
    ...space(1),
  ];

  if (exchanges.length === 0) {
    items.push(para([new TextRun({
      text: 'No known exchanges identified in this trace. Consider extending max hops.',
      size: 20, italics: true, color: C.darkGrey,
    })]));
    items.push(new Paragraph({ children: [new PageBreak()] }));
    return items;
  }

  // Collect all exchange hops across all traces
  const exchangeHops = [];
  for (const trace of traces) {
    for (const hop of (trace.hops || [])) {
      if (['KNOWN_EXCHANGE', 'LIKELY_EXCHANGE'].includes(hop.classification)) {
        exchangeHops.push({
          exchange:      hop.exchange_label || hop.classification,
          address:       hop.address,
          hop_number:    hop.hop,
          from_wallet:   trace.target_label,
          from_address:  trace.target_address,
          tx_count:      hop.tx_count,
          eth_balance:   hop.eth_balance,
        });
      }
    }
  }

  const colW = [2400, 3600, 1200, 2160];
  items.push(new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: colW,
    rows: [
      new TableRow({ children: [
        hdrCell('Exchange',    colW[0]),
        hdrCell('Address',     colW[1]),
        hdrCell('Hop',         colW[2]),
        hdrCell('From Wallet', colW[3]),
      ]}),
      ...exchangeHops.map((e, i) => {
        const fill = i % 2 === 0 ? C.white : C.lightGrey;
        return new TableRow({ children: [
          mkCell(e.exchange,     colW[0], { fill, bold: true, color: C.orange }),
          mkCell(e.address,      colW[1], { fill, mono: true, size: 15 }),
          mkCell(String(e.hop_number), colW[2], { fill }),
          mkCell(e.from_wallet,  colW[3], { fill }),
        ]});
      }),
    ],
  }));

  items.push(...space(1));
  items.push(alertBox(
    'Legal Recommendation: Subpoena or formal legal request should be directed to each identified ' +
    'exchange to obtain: full KYC records, account ownership details, IP login logs, ' +
    'and complete transaction history for the identified wallet addresses.',
    'MED'
  ));

  items.push(new Paragraph({ children: [new PageBreak()] }));
  return items;
}

function buildNewWallets(traces) {
  const allNew = [];
  for (const trace of traces) {
    for (const w of (trace.new_wallets_discovered || [])) {
      allNew.push({ ...w, discovered_from: trace.target_label });
    }
  }

  const items = [
    para([bold('4. NEW WALLETS DISCOVERED')], { heading: HeadingLevel.HEADING_1 }),
    para([new TextRun({
      text: `${allNew.length} new wallet address(es) were discovered during the Origin Trace that ` +
            'were not in the original Neural Trace export. These wallets appeared as intermediate ' +
            'hops and may warrant further investigation.',
      size: 20,
    })]),
    ...space(1),
  ];

  if (allNew.length === 0) {
    items.push(para([new TextRun({
      text: 'No new wallets discovered beyond those in the original trace.',
      size: 20, italics: true, color: C.darkGrey,
    })]));
    items.push(new Paragraph({ children: [new PageBreak()] }));
    return items;
  }

  const colW = [3600, 3360, 2400];
  items.push(new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: colW,
    rows: [
      new TableRow({ children: [
        hdrCell('Address',          colW[0]),
        hdrCell('Suggested Label',  colW[1]),
        hdrCell('Discovered From',  colW[2]),
      ]}),
      ...allNew.map((w, i) => {
        const fill = i % 2 === 0 ? C.white : C.lightGrey;
        return new TableRow({ children: [
          mkCell(w.address,          colW[0], { fill, mono: true, size: 15 }),
          mkCell(w.suggested_label,  colW[1], { fill }),
          mkCell(w.discovered_from,  colW[2], { fill }),
        ]});
      }),
    ],
  }));

  items.push(new Paragraph({ children: [new PageBreak()] }));
  return items;
}

function buildConclusions(data) {
  const traces    = data.traces || [];
  const summary   = data.summary || {};
  const exchanges = summary.exchanges_found || [];
  const mixers    = summary.mixers_found || [];

  return [
    para([bold('5. CONCLUSIONS')], { heading: HeadingLevel.HEADING_1 }),
    para([new TextRun({
      text:
        `Origin Trace analysis was conducted on ${traces.length} wallet(s) from the ` +
        `"${data.meta?.project_name || 'Unknown'}" investigation. ` +
        'Backward hop traversal traced the source of funds through the blockchain.',
      size: 20,
    })]),
    ...space(1),
    para([bold('Source of Funds')], { heading: HeadingLevel.HEADING_2 }),
    para([new TextRun({
      text: exchanges.length > 0
        ? `Funds were traced back to the following exchange(s): ${exchanges.join(', ')}. ` +
          'This indicates funds originated from accounts held at centralised exchanges where KYC records exist.'
        : 'No known exchange was reached within the maximum hop depth. Consider extending the trace depth or manual investigation of the final hop addresses.',
      size: 20,
    })]),
    ...space(1),
    ...(mixers.length > 0 ? [
      para([bold('Mixer / Obfuscation')], { heading: HeadingLevel.HEADING_2 }),
      para([new TextRun({
        text:
          `${mixers.length} trace(s) identified deliberate use of Tornado Cash or equivalent mixing services. ` +
          'The intentional use of mixers to break the on-chain link between source and destination is a ' +
          'recognised indicator of money laundering under FATF guidance.',
        size: 20,
      })]),
      ...space(1),
    ] : []),
    para([bold('Recommended Next Steps')], { heading: HeadingLevel.HEADING_2 }),
    ...[
      'Direct legal process to identified exchanges for KYC records and account ownership details.',
      'Run Neural Trace (forward) on any newly discovered wallets to map their full network.',
      'Feed this report JSON to the AI analysis layer alongside the Monitor and Forward Trace reports.',
      'Flag mixer-involved wallets as high priority for law enforcement escalation.',
    ].map(text => para([new TextRun({ text: `• ${text}`, size: 20 })], { spacing: { after: 80 } })),
  ];
}

// ── Main Export ───────────────────────────────────────────────────────────────

async function generateOriginReport(originData, docxPath) {
  const gen      = generated();
  const ethPrice = originData.meta?.eth_price_usd || 0;

  const children = [
    ...buildCover(originData, gen),
    ...buildExecutiveSummary(originData, gen),
    ...buildTraceResults(originData.traces || [], ethPrice),
    ...buildExchangeTargets(originData),
    ...buildNewWallets(originData.traces || []),
    ...buildConclusions(originData),
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
            text: 'Neural-Trace v2  |  ORIGIN TRACE REPORT  |  CONFIDENTIAL',
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

module.exports = { generateOriginReport };
