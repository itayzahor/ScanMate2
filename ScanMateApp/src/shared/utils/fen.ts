/** The canonical starting position as a full 6-field FEN string. */
export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
/** The piece-placement segment of the starting FEN (no side-to-move or clock fields). */
export const STARTING_BOARD_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

/** Default trailing field values used when a FEN string is missing fields. */
const FEN_DEFAULT_FIELDS = ['w', '-', '-', '0', '1'] as const;

/**
 * Normalize an arbitrary FEN string to a valid 6-field FEN.
 *
 * - Returns `STARTING_FEN` when `rawFen` is null, undefined, or empty.
 * - Trims extra whitespace and collapses internal runs of spaces.
 * - If fewer than 6 fields are present, appends sensible defaults
 *   (active color `w`, no castling, no en-passant, clocks `0 1`).
 * - If 6 or more fields are present, returns exactly the first 6.
 *
 * @param rawFen - Raw FEN string from any source (camera scan, API, user input).
 * @returns A well-formed 6-field FEN string, guaranteed non-empty.
 */
export const normalizeFen = (rawFen?: string | null): string => {
  const fallback = STARTING_FEN;
  if (!rawFen) {
    return fallback;
  }

  const trimmed = rawFen.trim();
  if (!trimmed) {
    return fallback;
  }

  const segments = trimmed.split(/\s+/);
  if (segments.length >= 6) {
    return segments.slice(0, 6).join(' ');
  }

  const missing = 6 - segments.length;
  const filler = FEN_DEFAULT_FIELDS.slice(0, missing);
  return [...segments, ...filler].join(' ');
};
