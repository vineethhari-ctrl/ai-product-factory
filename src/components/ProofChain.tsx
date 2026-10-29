import React, { useMemo, useState } from 'react';
import { CheckCircle2, Copy, Link2, Plus, RotateCcw, ShieldAlert, ShieldCheck, Wand2 } from 'lucide-react';
import {
  GENESIS, alteredValue, appendBlock, blockHash, previousHash, rewriteHistory, sealChain, shortHash, tamper, verifyChain,
  type Anchor, type ChainBlock,
} from '../services/proofChain';

/**
 * The hash-chained record ledger of a prototype. Every block's hash is a real SHA-256 of the previous hash and the block's
 * values, computed here in the browser, so the demonstration is real: edit a past record and every block after it breaks;
 * recompute the hashes to hide it and the published head hash no longer matches.
 */

export interface ProofChainProps {
  title: string;
  note?: string;
  columns: string[];
  rows: string[][];
  readOnly?: boolean;
}

const rowsToContent = (columns: string[], rows: string[][]) =>
  rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, String(r[i] ?? '')])));

export const ProofChain: React.FC<ProofChainProps> = ({ title, note, columns, rows, readOnly }) => {
  const initial = useMemo(() => sealChain(rowsToContent(columns, rows)), [columns, rows]);
  const [blocks, setBlocks] = useState<ChainBlock[]>(initial);
  const anchorOf = (b: ChainBlock[]): Anchor => ({ hash: b.at(-1)?.hash ?? GENESIS, length: b.length });
  const [anchor, setAnchor] = useState<Anchor>(anchorOf(initial));
  const [selected, setSelected] = useState(0);
  const [editCol, setEditCol] = useState(columns[Math.min(2, columns.length - 1)] ?? '');
  const [editVal, setEditVal] = useState('');
  const [checked, setChecked] = useState(false);
  const [log, setLog] = useState<string[]>([`Sealed ${initial.length} records. Head hash ${shortHash(anchorOf(initial).hash)} published as the anchor.`]);
  const [copied, setCopied] = useState(false);

  const result = useMemo(() => verifyChain(blocks, anchor), [blocks, anchor]);
  const show = checked ? result : null;
  const say = (line: string) => setLog((l) => [line, ...l].slice(0, 8));
  const sel = blocks[Math.min(selected, blocks.length - 1)];
  const selIdx = Math.min(selected, blocks.length - 1);

  const verify = () => {
    setChecked(true);
    if (result.ok) say(`Verified ${blocks.length} blocks: every hash recomputes from the genesis and the head matches the anchor.`);
    else if (result.firstBroken !== null) say(`Chain broken at block ${result.firstBroken + 1}: its content no longer gives its stored hash, so ${blocks.length - result.firstBroken - 1} later block(s) fail too.`);
    else say('Every block is internally consistent, but the head hash does not match the anchor published earlier: the history was rewritten.');
  };

  const applyEdit = () => {
    if (!sel || !editCol) return;
    const v = editVal.trim() || alteredValue(sel.content[editCol] ?? '');
    setBlocks((b) => tamper(b, selIdx, editCol, v));
    setEditVal('');
    setChecked(false);
    say(`Edited "${editCol}" of block ${selIdx + 1} to "${v}". Stored hashes were not touched. Click Verify chain.`);
  };

  const rewrite = () => {
    setBlocks((b) => rewriteHistory(b));
    setChecked(false);
    say('All hashes were recomputed to hide the edit. The chain looks consistent again, but its head hash is new. Click Verify chain.');
  };

  const addRecord = () => {
    const last = blocks.at(-1)?.content ?? {};
    const next = Object.fromEntries(columns.map((c, i) => [c, i === 0 ? String(Number(String(last[c] ?? '').replace(/\D/g, '')) + 1 || blocks.length + 1) : last[c] ?? '']));
    setBlocks((b) => appendBlock(b, next));
    setChecked(false);
    say(`Appended block ${blocks.length + 1}, chained to the previous head.`);
  };

  const reset = () => {
    setBlocks(initial);
    setAnchor(anchorOf(initial));
    setChecked(false);
    setLog([`Reset to the sealed ledger of ${initial.length} records.`]);
  };

  const copy = async () => {
    try { await navigator.clipboard?.writeText(sel?.hash ?? ''); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard may be blocked */ }
  };

  // After a legitimate append the head differs from the anchor; only a broken block or a rewrite is an alarm.
  const appended = blocks.length > anchor.length;
  const banner = show
    ? show.ok ? { cls: 'border-emerald-200 bg-emerald-50 text-emerald-800', text: `Verified: all ${blocks.length} blocks recompute from the genesis.` }
      : show.firstBroken !== null ? { cls: 'border-rose-200 bg-rose-50 text-rose-800', text: `Tampering detected at block ${show.firstBroken + 1}. Every block from there on fails.` }
      : { cls: 'border-amber-200 bg-amber-50 text-amber-900', text: 'The chain is consistent, but its head hash differs from the published anchor: the history was rewritten.' }
    : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs" data-testid="proof-chain">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Link2 className="w-4 h-4 text-[var(--brand)]" />{title}</h3>
          <p className="text-[11px] text-slate-500">
            Each block's hash = SHA-256(previous hash ‖ record). Edit a past record and every block after it breaks. Hashes are computed live in your browser.
          </p>
          {note && <p className="text-[11px] text-slate-500">{note}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={verify} className="px-3 py-1.5 rounded-lg bg-[var(--brand)] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
            <ShieldCheck className="w-3.5 h-3.5" /> Verify chain
          </button>
          <button onClick={addRecord} disabled={readOnly} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> Add record
          </button>
          <button onClick={reset} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
        </div>
      </div>

      {banner && <div className={`mx-5 mt-4 rounded-lg border px-3 py-2 text-xs font-semibold ${banner.cls}`} role="status">{banner.text}</div>}

      <div className="grid gap-4 p-5 lg:grid-cols-[1.4fr_1fr]">
        <ol className="space-y-2" aria-label="Blocks">
          {blocks.map((b, i) => {
            const st = show?.statuses[i];
            return (
              <li key={i}>
                <button
                  onClick={() => setSelected(i)}
                  className={`w-full text-left rounded-xl border px-3 py-2 text-xs transition-colors cursor-pointer ${
                    i === selIdx ? 'border-[var(--brand)] bg-slate-50' : 'border-slate-200 hover:bg-slate-50'
                  } ${st === 'broken' ? 'border-rose-300 bg-rose-50/60' : ''}`}
                  data-block={i + 1}
                  data-status={st ?? 'unchecked'}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-800">Block {i + 1} · {Object.values(b.content)[0]}</span>
                    {st === 'valid' && <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold"><CheckCircle2 className="w-3.5 h-3.5" />Valid</span>}
                    {st === 'broken' && <span className="inline-flex items-center gap-1 text-rose-700 font-semibold"><ShieldAlert className="w-3.5 h-3.5" />Broken</span>}
                  </div>
                  <div className="mt-0.5 text-slate-600 truncate">{Object.values(b.content).slice(1, 4).join(' · ')}</div>
                  <div className="mt-1 font-mono text-[10px] text-slate-500">
                    prev {shortHash(previousHash(blocks, i))} → hash <span className={st === 'broken' ? 'text-rose-700' : 'text-slate-700'}>{shortHash(b.hash)}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>

        {sel && (
          <div className="space-y-3 text-xs">
            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">Block {selIdx + 1}</span>
                <button onClick={copy} className="inline-flex items-center gap-1 text-[var(--brand)] font-semibold cursor-pointer"><Copy className="w-3 h-3" />{copied ? 'Copied' : 'Copy hash'}</button>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {Object.entries(sel.content).map(([k, v]) => (<React.Fragment key={k}><dt className="text-slate-500">{k}</dt><dd className="font-semibold text-slate-800 break-words">{v}</dd></React.Fragment>))}
              </dl>
              <div className="font-mono text-[10px] break-all space-y-1 text-slate-600">
                <div>previous: {previousHash(blocks, selIdx)}</div>
                <div>stored hash: {sel.hash}</div>
                <div>recomputed: {show ? blockHash(blockHashChain(blocks, selIdx), sel.content) : 'click Verify chain'}</div>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2">
              <div className="font-bold text-amber-900 flex items-center gap-1.5"><Wand2 className="w-3.5 h-3.5" />Try to tamper with block {selIdx + 1}</div>
              <div className="flex flex-wrap gap-2">
                <select value={editCol} onChange={(e) => setEditCol(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1 bg-white">
                  {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input value={editVal} onChange={(e) => setEditVal(e.target.value)} placeholder="new value (blank = change it for me)" className="flex-1 min-w-[10rem] rounded-lg border border-slate-200 px-2 py-1" />
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={applyEdit} disabled={readOnly} className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-semibold disabled:opacity-50 cursor-pointer">Edit this record</button>
                <button onClick={rewrite} disabled={readOnly} className="px-3 py-1.5 rounded-lg border border-amber-300 text-amber-900 font-semibold disabled:opacity-50 cursor-pointer">Recompute all hashes (hide it)</button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <div className="font-bold text-slate-800 mb-1">Published anchor</div>
              <div className="font-mono text-[10px] break-all text-slate-600">{anchor.hash}</div>
              <div className="mt-1 text-[11px] text-slate-500">
                The head hash of the first {anchor.length} records was published outside the ledger when it was sealed.
                {appended ? '  Records appended since then extend the chain.' : ''}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 px-5 py-3">
        <div className="text-[11px] font-bold text-slate-500 mb-1">Verification log</div>
        <ul className="space-y-0.5 text-[11px] text-slate-600">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </div>
    </div>
  );
};

/** The hash a block should have, recomputed forward from the genesis (what Verify chain uses). */
function blockHashChain(blocks: ChainBlock[], upTo: number): string {
  let prev = GENESIS;
  for (let i = 0; i < upTo; i++) prev = blockHash(prev, blocks[i].content);
  return prev;
}
