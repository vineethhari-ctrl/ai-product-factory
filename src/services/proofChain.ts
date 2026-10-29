import { sha256Hex } from './sha256';

/**
 * A hash-chained record ledger: every block carries the SHA-256 of the previous block's hash and its own content, so
 * editing any past block changes its hash and, because each hash feeds the next, every block after it. Pure and
 * domain-neutral: a block is just named values. Used by the prototype's ledger panel (browser) and the checks (node).
 */

export const GENESIS = '0'.repeat(64);

export interface ChainBlock {
  /** Named values of the record, in column order. */
  content: Record<string, string>;
  /** The hash stored when the block was sealed. */
  hash: string;
}

export interface Verification {
  ok: boolean;
  /** One entry per block: does the stored hash equal the hash recomputed from the genesis forward? */
  statuses: Array<'valid' | 'broken'>;
  firstBroken: number | null;
  /** Does the block that was the head when the anchor was published still have that hash? (Records appended later extend the chain and are fine.) */
  anchorMatches: boolean;
  recomputedHead: string;
}

export const canonical = (content: Record<string, string>) => JSON.stringify(Object.entries(content));
export const blockHash = (prev: string, content: Record<string, string>) => sha256Hex(`${prev}|${canonical(content)}`);

/** Seal records in order, oldest first. */
export function sealChain(rows: Array<Record<string, string>>): ChainBlock[] {
  const blocks: ChainBlock[] = [];
  let prev = GENESIS;
  for (const content of rows) {
    const hash = blockHash(prev, content);
    blocks.push({ content: { ...content }, hash });
    prev = hash;
  }
  return blocks;
}

export const previousHash = (blocks: ChainBlock[], i: number) => (i === 0 ? GENESIS : blocks[i - 1].hash);

/** Recompute every hash from the genesis forward and compare with what was stored. A block after an edited one breaks too. */
export interface Anchor { hash: string; length: number }

export function verifyChain(blocks: ChainBlock[], anchor?: Anchor): Verification {
  let prev = GENESIS;
  const statuses: Verification['statuses'] = [];
  for (const b of blocks) {
    const h = blockHash(prev, b.content);
    statuses.push(h === b.hash ? 'valid' : 'broken');
    prev = h;
  }
  const first = statuses.indexOf('broken');
  const anchorMatches = !anchor || blocks[anchor.length - 1]?.hash === anchor.hash;
  return { ok: first === -1 && anchorMatches, statuses, firstBroken: first === -1 ? null : first, anchorMatches, recomputedHead: prev };
}

/** Change one value of a block's content; the stored hashes are not touched (this is what a tamperer does first). */
export function tamper(blocks: ChainBlock[], index: number, column: string, value: string): ChainBlock[] {
  return blocks.map((b, i) => (i === index ? { ...b, content: { ...b.content, [column]: value } } : b));
}

/** The tamperer then recomputes every hash so the chain looks consistent again. Only the anchored head hash exposes it. */
export function rewriteHistory(blocks: ChainBlock[]): ChainBlock[] {
  return sealChain(blocks.map((b) => b.content));
}

/** Append one record, chained to the current head. */
export function appendBlock(blocks: ChainBlock[], content: Record<string, string>): ChainBlock[] {
  const prev = blocks.at(-1)?.hash ?? GENESIS;
  return [...blocks, { content: { ...content }, hash: blockHash(prev, content) }];
}

export const shortHash = (h: string) => (h.length > 18 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h);

/** A different value for the tamper demo: a number moves, a word is flagged. */
export function alteredValue(value: string): string {
  const m = value.match(/-?\d[\d,.]*/);
  if (m) {
    const n = Number(m[0].replace(/,/g, ''));
    if (Number.isFinite(n)) return value.replace(m[0], String(n === 0 ? 1 : Math.round(n * 1.25 * 100) / 100));
  }
  return `${value} (edited)`;
}
