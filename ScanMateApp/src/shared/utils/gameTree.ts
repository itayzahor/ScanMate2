import { Chess } from 'chess.js';
import { normalizeFen } from './fen';

/**
 * Utilities for building, navigating, and mutating a chess game tree.
 *
 * A `GameTree` is a rose tree where each node holds one move (SAN + resulting FEN)
 * and may have multiple children representing alternative continuations (variations).
 * The tree is treated as immutable: all mutation helpers return a new `GameTree`.
 *
 * Typical usage:
 * 1. Build a tree with `buildFromMoves` or start with an empty `{ startFen, root: [] }`.
 * 2. Navigate with `getNodeAtPath`, `getFenAtPath`, etc.
 * 3. Mutate with `addMove`, `truncateAfter`, `deleteVariation`, or `promoteVariation`.
 */

/* ── Types ── */

/**
 * A single node in the game tree, representing one half-move.
 *
 * @property san      - Standard Algebraic Notation of the move (e.g. `"Nf3"`).
 * @property fen      - Full 6-field FEN of the position *after* this move.
 * @property children - Alternative and main-line continuations from this position.
 */
export type MoveNode = {
  san: string;
  fen: string;
  children: MoveNode[];
};

/**
 * The root container for an entire game (or position analysis) tree.
 *
 * @property startFen - Full 6-field FEN of the position before any move in `root`.
 * @property root     - Top-level move nodes (children of the start position).
 */
export type GameTree = {
  startFen: string;
  root: MoveNode[];   // children of the start position
};

/**
 * Resolve a legal SAN move from `fromFen` that results in the same piece placement as `targetFenOrPlacement`.
 * This is useful when a UI emits placement-only FEN (without castling/en-passant fields).
 */
export const findMatchingSanForPlacement = (
  fromFen: string,
  targetFenOrPlacement: string,
): string | null => {
  try {
    const chess = new Chess(normalizeFen(fromFen));
    const targetPlacement = targetFenOrPlacement.trim().split(/\s+/)[0];
    const legalMoves = chess.moves({ verbose: true });

    for (const move of legalMoves) {
      const test = new Chess(chess.fen());
      const result = test.move({ from: move.from, to: move.to, promotion: move.promotion });
      if (!result) { continue; }
      const placement = test.fen().split(' ')[0];
      if (placement === targetPlacement) {
        return result.san;
      }
    }
  } catch {
    return null;
  }

  return null;
};

/* ── Build ── */

/**
 * Build a `GameTree` by replaying a sequence of SAN moves from `startFen`.
 * The loop stops at the first move that chess.js cannot apply (illegal or unknown).
 * The resulting tree has a single linear main line with no variations.
 *
 * @param startFen - The starting position (will be normalized).
 * @param sans     - Array of SAN strings to replay in order.
 */
export const buildFromMoves = (startFen: string, sans: string[]): GameTree => {
  const fullFen = normalizeFen(startFen);
  const chess = new Chess(fullFen);
  const root: MoveNode[] = [];
  let parent = root;

  for (const san of sans) {
    const result = chess.move(san);
    if (!result) { break; }
    const node: MoveNode = { san: result.san, fen: chess.fen(), children: [] };
    parent.push(node);
    parent = node.children;
  }

  return { startFen: fullFen, root };
};

/* ── Path Navigation ── */

/** Return the node at a path, or null if invalid. */
export const getNodeAtPath = (tree: GameTree, path: number[]): MoveNode | null => {
  let children = tree.root;
  let node: MoveNode | null = null;
  for (const idx of path) {
    if (idx < 0 || idx >= children.length) { return null; }
    node = children[idx];
    children = node.children;
  }
  return node;
};

/** Return the FEN at a given path (empty path = start position). */
export const getFenAtPath = (tree: GameTree, path: number[]): string => {
  if (path.length === 0) { return tree.startFen; }
  const node = getNodeAtPath(tree, path);
  return node?.fen ?? tree.startFen;
};

/** Return the SAN of the move at a given path. */
export const getSanAtPath = (tree: GameTree, path: number[]): string | null => {
  if (path.length === 0) { return null; }
  return getNodeAtPath(tree, path)?.san ?? null;
};

/** Return the children array that the path's last node belongs to + its index. */
const getParentChildren = (tree: GameTree, path: number[]): { siblings: MoveNode[]; index: number } | null => {
  if (path.length === 0) { return null; }
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  if (parentPath.length === 0) {
    if (index < 0 || index >= tree.root.length) { return null; }
    return { siblings: tree.root, index };
  }
  const parentNode = getNodeAtPath(tree, parentPath);
  if (!parentNode || index < 0 || index >= parentNode.children.length) { return null; }
  return { siblings: parentNode.children, index };
};

/** How many moves deep is the main line from a given node? */
const mainLineDepth = (children: MoveNode[]): number => {
  let depth = 0;
  let c = children;
  while (c.length > 0) {
    depth++;
    c = c[0].children;
  }
  return depth;
};

/** Total main-line moves (from root following child 0). */
export const getMainLineLength = (tree: GameTree): number => mainLineDepth(tree.root);

/** Extract the main-line SANs (following child index 0 at every level). */
export const getMainLine = (tree: GameTree): string[] => {
  const sans: string[] = [];
  let children = tree.root;
  while (children.length > 0) {
    sans.push(children[0].san);
    children = children[0].children;
  }
  return sans;
};

/** Children of the node at the given path (or tree.root for empty path). */
export const getChildrenAtPath = (tree: GameTree, path: number[]): MoveNode[] => {
  if (path.length === 0) { return tree.root; }
  const node = getNodeAtPath(tree, path);
  return node?.children ?? [];
};

/** Total depth following the current path's main continuation (child 0 at each level). */
export const getLineLength = (tree: GameTree, path: number[]): number => {
  const node = path.length > 0 ? getNodeAtPath(tree, path) : null;
  const children = node ? node.children : tree.root;
  return path.length + mainLineDepth(children);
};

/* ── Mutations (all return new tree — immutable) ── */

/** Deep-clone the entire tree via JSON serialization. Used before destructive mutations. */
const cloneTree = (tree: GameTree): GameTree => JSON.parse(JSON.stringify(tree));

/**
 * Shallow-clone the path from the root down to (but not including) the target node,
 * returning the children array of the node at `path` so it can be mutated safely.
 * Returns `null` when the path is invalid.
 */
const clonePathChildren = (tree: GameTree, path: number[]): MoveNode[] | null => {
  const clonedRoot = [...tree.root];
  let children = clonedRoot;

  for (const idx of path) {
    if (idx < 0 || idx >= children.length) {
      return null;
    }

    const current = children[idx];
    const clonedNode: MoveNode = { ...current, children: [...current.children] };
    children[idx] = clonedNode;
    children = clonedNode.children;
  }

  tree.root = clonedRoot;
  return children;
};

/**
 * Add a move (by SAN) at the given path position.
 * - If the SAN already exists as a child there, return the path to it (no duplication).
 * - Otherwise append a new child node and return the path to it.
 */
export const addMove = (
  tree: GameTree,
  path: number[],
  san: string,
): { tree: GameTree; path: number[] } => {
  const fen = getFenAtPath(tree, path);
  const chess = new Chess(fen);
  const result = chess.move(san);
  if (!result) { return { tree, path }; }

  const newTree: GameTree = { startFen: tree.startFen, root: tree.root };
  const children = clonePathChildren(newTree, path);
  if (!children) {
    return { tree, path };
  }

  // Check if this move already exists as a child.
  const existingIdx = children.findIndex(c => c.san === result.san);
  if (existingIdx >= 0) {
    return { tree: newTree, path: [...path, existingIdx] };
  }

  // New child.
  children.push({ san: result.san, fen: chess.fen(), children: [] });
  return { tree: newTree, path: [...path, children.length - 1] };
};

/** Remove all children at the given path position (truncate the line). */
export const truncateAfter = (tree: GameTree, path: number[]): GameTree => {
  if (path.length === 0) {
    return { startFen: tree.startFen, root: [] };
  }

  const newTree: GameTree = { startFen: tree.startFen, root: tree.root };
  const children = clonePathChildren(newTree, path);
  if (!children) {
    return tree;
  }
  children.length = 0;

  return newTree;
};

/** Delete the branch at path (the node itself, not its children).
 *  Returns the new tree and a safe path (parent, or sibling at 0). */
export const deleteVariation = (
  tree: GameTree,
  path: number[],
): { tree: GameTree; path: number[] } => {
  const newTree = cloneTree(tree);
  const info = getParentChildren(newTree, path);
  if (!info) { return { tree: newTree, path: [] }; }
  info.siblings.splice(info.index, 1);
  // Navigate to sibling 0 if exists, otherwise to parent.
  const parentPath = path.slice(0, -1);
  if (info.siblings.length > 0) {
    return { tree: newTree, path: [...parentPath, 0] };
  }
  return { tree: newTree, path: parentPath };
};

/** Promote the variation at path to be child index 0 (main line). */
export const promoteVariation = (tree: GameTree, path: number[]): GameTree => {
  const newTree = cloneTree(tree);
  const info = getParentChildren(newTree, path);
  if (!info || info.index === 0) { return newTree; }
  const [node] = info.siblings.splice(info.index, 1);
  info.siblings.unshift(node);
  return newTree;
};
