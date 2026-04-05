"""Interactive viewer for dumped game frames + server responses.

Usage
-----
1. Run a scan-game with  DUMP_GAME_FRAMES=1  to populate
   runs/incoming_frames/<session_id>/  with .jpg + .json sidecar files.
2. Launch the viewer:

       python tests/frame_viewer.py                       # auto-find latest session
       python tests/frame_viewer.py runs/incoming_frames/abc123  # explicit path

Controls
--------
  RIGHT / D        Next frame
  LEFT  / A        Previous frame
  HOME              First frame
  END               Last frame
  PAGE_UP           Jump +10 frames
  PAGE_DOWN         Jump -10 frames
  M                 Jump to next move-detected frame
  SHIFT+M (N)       Jump to previous move-detected frame
  Q / ESC           Quit
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Optional

import chess
import cv2
import numpy as np

FILES = "abcdefgh"
WINDOW = "ScanMate Frame Viewer"
FRAME_SIZE = 640  # display frames at model resolution
DEFAULT_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"


# ---------- SAN → UCI helper ----------

def san_to_uci(fen: str, san: str) -> Optional[str]:
    """Convert a SAN move to UCI given the position *before* the move.

    The stored FEN is piece-placement-only (no turn indicator), so
    python-chess defaults to white's turn.  We try white first, then
    black, so that moves from either side are resolved correctly.
    """
    placement = fen.split()[0]
    for turn_char in ("w", "b"):
        try:
            board = chess.Board(f"{placement} {turn_char} - - 0 1")
            move = board.parse_san(san)
            return move.uci()
        except Exception:
            continue
    return None


def _get_previous_fen(frames, idx: int) -> str:
    """Walk backwards to find the FEN from the frame *before* a move was made."""
    for i in range(idx - 1, -1, -1):
        m = frames[i][1]
        f = m.get("fen")
        if f:
            return f
    return DEFAULT_FEN


# ---------- geometry helpers ----------

def _get_oriented_corners(frames, idx: int) -> Optional[np.ndarray]:
    """Return the oriented corners [a8, h8, h1, a1] for frame *idx*,
    falling back to the nearest earlier frame that has them."""
    for i in range(idx, -1, -1):
        oc = frames[i][1].get("oriented_corners")
        if oc is not None:
            return np.array(oc, dtype=np.float32)
    return None


def _grid_to_camera_transform(oriented_corners: np.ndarray) -> np.ndarray:
    """Build a perspective matrix mapping an 8×8 grid to camera coordinates.

    Grid convention: file runs along x (a=0 .. h=8), rank runs along y
    (rank 8=0 .. rank 1=8).  So a8=(0,0), h8=(8,0), h1=(8,8), a1=(0,8).
    """
    grid_pts = np.array([[0, 0], [8, 0], [8, 8], [0, 8]], dtype=np.float32)
    return cv2.getPerspectiveTransform(grid_pts, oriented_corners)


def _square_camera_corners(square: str, H: np.ndarray) -> np.ndarray:
    """Return the 4 camera-pixel corners of a chess square as int32 array."""
    file_idx = ord(square[0]) - ord('a')
    rank = int(square[1])
    # grid coords: x = file_idx, y = 8 - rank
    gx, gy = float(file_idx), float(8 - rank)
    pts = np.array([
        [gx,     gy],
        [gx + 1, gy],
        [gx + 1, gy + 1],
        [gx,     gy + 1],
    ], dtype=np.float32)
    cam = cv2.perspectiveTransform(pts.reshape(-1, 1, 2), H)
    return cam.reshape(-1, 2).astype(np.int32)


def _draw_square_overlay(frame: np.ndarray, square: str,
                         H: np.ndarray, color: tuple[int, int, int],
                         alpha: float = 0.40) -> np.ndarray:
    """Draw a semi-transparent square overlay on the camera frame."""
    pts = _square_camera_corners(square, H)
    overlay = frame.copy()
    cv2.fillPoly(overlay, [pts], color)
    return cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0)


def _draw_grid_lines(frame: np.ndarray, H: np.ndarray) -> np.ndarray:
    """Draw 9×9 grid lines on the camera frame."""
    result = frame.copy()
    for i in range(9):
        v = float(i)
        for pts in [
            np.array([[[v, 0]], [[v, 8]]], dtype=np.float32),
            np.array([[[0, v]], [[8, v]]], dtype=np.float32),
        ]:
            mapped = cv2.perspectiveTransform(pts, H)
            pt1 = tuple(mapped[0][0].astype(int))
            pt2 = tuple(mapped[1][0].astype(int))
            cv2.line(result, pt1, pt2, (0, 255, 0), 1, cv2.LINE_AA)
    return result


def draw_chess_board(fen: str, size: int = 640,
                     highlight_from: Optional[str] = None,
                     highlight_to: Optional[str] = None) -> np.ndarray:
    """Draw a board diagram with optional from (red) / to (green) highlights."""
    board_img = np.zeros((size, size, 3), dtype=np.uint8)
    sq = size // 8

    for row in range(8):
        for col in range(8):
            color = (240, 217, 181) if (row + col) % 2 == 0 else (181, 136, 99)
            cv2.rectangle(board_img, (col * sq, row * sq),
                          ((col + 1) * sq, (row + 1) * sq), color, -1)

    # Highlight squares
    for square, hl_color in [(highlight_from, (0, 0, 200)), (highlight_to, (0, 180, 0))]:
        if square and len(square) >= 2:
            file_idx = ord(square[0]) - ord('a')
            rank = int(square[1])
            row = 8 - rank
            x1, y1 = file_idx * sq, row * sq
            overlay = board_img.copy()
            cv2.rectangle(overlay, (x1, y1), (x1 + sq, y1 + sq), hl_color, -1)
            cv2.addWeighted(overlay, 0.45, board_img, 0.55, 0, board_img)

    # Draw pieces
    try:
        ranks = fen.split()[0].split("/")
        for rank_idx, rank_str in enumerate(ranks):
            file_idx = 0
            for ch in rank_str:
                if ch.isdigit():
                    file_idx += int(ch)
                else:
                    x = file_idx * sq + sq // 2
                    y = rank_idx * sq + sq // 2
                    font = cv2.FONT_HERSHEY_SIMPLEX
                    sc, th = 1.2, 3
                    (tw, tht), _ = cv2.getTextSize(ch, font, sc, th + 2)
                    tx, ty = x - tw // 2, y + tht // 2
                    if ch.isupper():
                        cv2.putText(board_img, ch, (tx, ty), font, sc, (0, 0, 0), th + 2, cv2.LINE_AA)
                        cv2.putText(board_img, ch, (tx, ty), font, sc, (255, 255, 255), th, cv2.LINE_AA)
                    else:
                        cv2.putText(board_img, ch, (tx, ty), font, sc, (255, 255, 255), th + 2, cv2.LINE_AA)
                        cv2.putText(board_img, ch, (tx, ty), font, sc, (0, 0, 0), th, cv2.LINE_AA)
                    file_idx += 1
    except Exception:
        pass

    # Coordinates
    font, sc, th = cv2.FONT_HERSHEY_SIMPLEX, 0.4, 1
    for i, f in enumerate(FILES):
        cv2.putText(board_img, f, (i * sq + sq // 2 - 5, size - 5), font, sc, (100, 100, 100), th)
    for i in range(8):
        cv2.putText(board_img, str(8 - i), (5, i * sq + sq // 2 + 5), font, sc, (100, 100, 100), th)
    return board_img


def draw_status_banner(frame: np.ndarray, flag: str,
                       flag_color: tuple[int, int, int],
                       extra: str) -> np.ndarray:
    result = frame.copy()
    bh = 36
    w = result.shape[1]
    mid = w // 2
    overlay = result.copy()
    cv2.rectangle(overlay, (0, 0), (mid, bh), flag_color, -1)
    cv2.rectangle(overlay, (mid, 0), (w, bh), (40, 40, 40), -1)
    result = cv2.addWeighted(overlay, 0.7, result, 0.3, 0)
    font = cv2.FONT_HERSHEY_SIMPLEX
    cv2.putText(result, flag, (8, 26), font, 0.6,
                (255, 255, 255), 2, cv2.LINE_AA)
    cv2.putText(result, extra, (mid + 8, 26), font, 0.6,
                (255, 255, 255), 2, cv2.LINE_AA)
    return result


def draw_info_panel(meta: dict, total: int, idx: int,
                    width: int = 300, height: int = 640) -> np.ndarray:
    """Right-side panel with frame metadata and move list."""
    panel = np.zeros((height, width, 3), dtype=np.uint8)
    font, sc, th = cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1
    y = 25

    def put(text: str, color=(255, 255, 255)):
        nonlocal y
        cv2.putText(panel, text, (10, y), font, sc, color, th, cv2.LINE_AA)
        y += 22

    status = meta.get("status", "?")
    status_colors = {
        "move_detected": (0, 255, 0),
        "ok":            (200, 200, 200),
        "rejected":      (0, 0, 255),
        "skipped":       (0, 180, 255),
        "no_board":      (0, 120, 255),
        "no_pieces":     (0, 120, 255),
        "error":         (0, 0, 255),
    }
    color = status_colors.get(status, (200, 200, 200))

    put(f"Frame {idx + 1} / {total}", (180, 180, 255))
    put(f"Status: {status}", color)

    fen = meta.get("fen", "?")
    put(f"FEN: {fen[:40]}")
    if len(fen) > 40:
        put(f"     {fen[40:]}")

    detected_move = meta.get("move")
    if detected_move:
        put(f"MOVE: {detected_move}", (0, 255, 0))

    pending = meta.get("pending") or meta.get("pending_san")
    if pending:
        put(f"PENDING: {pending}", (0, 200, 255))

    move_number = meta.get("move_number", 0)
    put(f"Move count: {move_number}")

    # Move list
    y += 8
    put("Moves:", (200, 200, 200))
    moves = meta.get("moves_so_far", [])
    for i in range(0, len(moves), 2):
        num = i // 2 + 1
        white = moves[i]
        black = moves[i + 1] if i + 1 < len(moves) else ""
        put(f"  {num}. {white}  {black}")
        if y > height - 10:
            put("  ...", (150, 150, 150))
            break

    return panel


def draw_nav_bar(idx: int, total: int, width: int) -> np.ndarray:
    bar = np.zeros((28, width, 3), dtype=np.uint8)
    bar[:] = (40, 40, 40)
    font, sc, th = cv2.FONT_HERSHEY_SIMPLEX, 0.35, 1
    left = f"[{idx + 1}/{total}]"
    right = "A/D:nav  M/N:moves  PgUp/Dn:+10  Home/End  Q:quit"
    cv2.putText(bar, left, (8, 20), font, sc, (200, 200, 200), th, cv2.LINE_AA)
    (tw, _), _ = cv2.getTextSize(right, font, sc, th)
    cv2.putText(bar, right, (width - tw - 8, 20), font, sc, (140, 140, 140), th, cv2.LINE_AA)
    return bar


# ---------- main ----------

def find_session_dir(base: Path) -> Path:
    dirs = sorted([d for d in base.iterdir() if d.is_dir()])
    if not dirs:
        print(f"No game session found in {base}")
        sys.exit(1)
    if len(dirs) > 1:
        print(f"Multiple sessions found; using latest: {dirs[-1].name}")
    return dirs[-1]


def load_frames(session_dir: Path):
    jpgs = sorted(session_dir.glob("frame_*.jpg"))
    if not jpgs:
        print(f"No frame JPEGs found in {session_dir}")
        sys.exit(1)
    frames = []
    for jpg in jpgs:
        json_path = jpg.with_suffix(".json")
        meta = {}
        if json_path.exists():
            try:
                meta = json.loads(json_path.read_text(encoding="utf-8"))
            except Exception:
                pass
        frames.append((jpg, meta))
    print(f"Loaded {len(frames)} frames from {session_dir.name}")
    return frames


def _resolve_move_squares(frames, idx: int) -> tuple[Optional[str], Optional[str]]:
    """Return (from_square, to_square) for the most recent move or pending move.

    Checks the current frame first for a confirmed or pending SAN,
    then walks backwards.  Uses python-chess to convert SAN → UCI.
    """
    # 1. Current frame confirmed move
    meta = frames[idx][1]
    move_san = meta.get("move")
    if move_san:
        prev_fen = _get_previous_fen(frames, idx)
        uci = san_to_uci(prev_fen, move_san)
        if uci:
            return uci[:2], uci[2:4]

    # 2. Current frame pending move
    pending = meta.get("pending") or meta.get("pending_san")
    if pending:
        fen = meta.get("fen", DEFAULT_FEN)
        uci = san_to_uci(fen, pending)
        if uci:
            return uci[:2], uci[2:4]

    # 3. Walk backwards to last confirmed move
    for i in range(idx - 1, -1, -1):
        m = frames[i][1]
        ms = m.get("move")
        if ms:
            prev_fen = _get_previous_fen(frames, i)
            uci = san_to_uci(prev_fen, ms)
            if uci:
                return uci[:2], uci[2:4]
            break
    return None, None


def show_frame(frames, idx: int):
    jpg_path, meta = frames[idx]
    total = len(frames)
    status = meta.get("status", "?")

    # Load camera image
    img = cv2.imread(str(jpg_path))
    if img is None:
        img = np.zeros((FRAME_SIZE, FRAME_SIZE, 3), dtype=np.uint8)
    img = cv2.resize(img, (FRAME_SIZE, FRAME_SIZE))

    # Draw grid + move overlays on camera frame using oriented corners
    oc = _get_oriented_corners(frames, idx)
    sq_from, sq_to = _resolve_move_squares(frames, idx)
    if oc is not None:
        H = _grid_to_camera_transform(oc)
        img = _draw_grid_lines(img, H)
        if sq_from:
            img = _draw_square_overlay(img, sq_from, H, color=(0, 0, 200))   # red = from
        if sq_to:
            img = _draw_square_overlay(img, sq_to, H, color=(0, 180, 0))     # green = to

    # Status banner on camera frame
    flag_map = {
        "move_detected": ("MOVE DETECTED", (0, 180, 0)),
        "ok":            ("OK", (0, 180, 0)),
        "rejected":      ("REJECTED", (0, 0, 200)),
        "skipped":       ("SKIPPED", (0, 140, 200)),
        "no_board":      ("NO BOARD", (0, 165, 255)),
        "no_pieces":     ("NO PIECES", (0, 165, 255)),
        "error":         ("ERROR", (0, 0, 255)),
    }
    flag, flag_color = flag_map.get(status, (status.upper(), (100, 100, 100)))

    # Build banner text
    pending = meta.get("pending") or meta.get("pending_san")
    last_move = meta.get("move", "")
    banner_right = ""
    if last_move:
        banner_right = f"Move: {last_move}"
    elif pending:
        banner_right = f"Pending: {pending}"
    annotated = draw_status_banner(img, flag, flag_color, banner_right)

    # Chess board with highlighted squares
    fen = meta.get("fen", DEFAULT_FEN)
    board = draw_chess_board(fen, FRAME_SIZE, highlight_from=sq_from, highlight_to=sq_to)

    # Info panel
    info = draw_info_panel(meta, total, idx, 300, FRAME_SIZE)

    # Compose: camera | board | info
    top = np.hstack([annotated, board, info])
    bar = draw_nav_bar(idx, total, top.shape[1])
    canvas = np.vstack([top, bar])

    cv2.imshow(WINDOW, canvas)


def main():
    base = Path(__file__).resolve().parent.parent / "runs" / "incoming_frames"

    if len(sys.argv) > 1:
        session_dir = Path(sys.argv[1])
        if not session_dir.is_dir():
            print(f"Not a directory: {session_dir}")
            sys.exit(1)
    else:
        session_dir = find_session_dir(base)

    frames = load_frames(session_dir)
    move_indices = [i for i, (_, m) in enumerate(frames) if m.get("status") == "move_detected"]

    idx = 0
    show_frame(frames, idx)

    while True:
        key = cv2.waitKeyEx(0)

        if key in (ord("q"), ord("Q"), 27):
            break
        elif key in (0x270000, ord("d"), ord("D"), 2555904):
            idx = min(idx + 1, len(frames) - 1)
        elif key in (0x250000, ord("a"), ord("A"), 2424832):
            idx = max(idx - 1, 0)
        elif key in (0x240000, 2228224):
            idx = 0
        elif key in (0x230000, 2293760):
            idx = len(frames) - 1
        elif key in (0x210000, 2162688):
            idx = min(idx + 10, len(frames) - 1)
        elif key in (0x220000, 2097152):
            idx = max(idx - 10, 0)
        elif key in (ord("m"), ord("M")):
            after = [i for i in move_indices if i > idx]
            if after:
                idx = after[0]
        elif key in (ord("n"), ord("N")):
            before = [i for i in move_indices if i < idx]
            if before:
                idx = before[-1]

        show_frame(frames, idx)

    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
