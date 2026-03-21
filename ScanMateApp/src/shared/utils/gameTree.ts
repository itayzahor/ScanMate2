import { Chess } from 'chess.js';
import { normalizeFen } from './fen';

/* ── Types ── */

export type MoveNode = {
  san: string;
  fen: string;
  children: MoveNode[];
};

export type GameTree = {
  startFen: string;
  root: MoveNode[];   // children of the start position
};

/* ── Build ── */

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

const cloneTree = (tree: GameTree): GameTree => JSON.parse(JSON.stringify(tree));

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

  const newTree = cloneTree(tree);
  const children = path.length === 0
    ? newTree.root
    : getNodeAtPath(newTree, path)!.children;

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
  const newTree = cloneTree(tree);
  if (path.length === 0) {
    newTree.root = [];
    return newTree;
  }
  const node = getNodeAtPath(newTree, path);
  if (node) { node.children = []; }
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
