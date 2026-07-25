# Location: ML/server.py
"""FastAPI server for chess board recognition and position analysis.

Endpoints
---------
POST   /recognize_position/                Stateless: single image → FEN
POST   /recognize_game/                    Start a game session
POST   /recognize_game/{game_id}/frame     Send one frame during a game
POST   /recognize_game/{game_id}/end       End game → full SAN move list
DELETE /recognize_game/{game_id}/          Discard a game session
POST   /analyze_position/                  Stockfish evaluation of a FEN
"""

from __future__ import annotations

import asyncio
import argparse
import logging
import os
import queue
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from threading import Event, Lock, Thread
from typing import Optional, Union
from uuid import uuid4

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

import cv2
import numpy as np
import uvicorn
import chess
import chess.engine
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from scripts.detectors import get_board_corners, get_piece_predictions, PIECE_CLASS_NAMES, IMAGE_SIZE
from scripts.board_orientation import get_perspective_transform, orient_board_state_for_white
from scripts.piece_mapping import map_pieces_to_board
from scripts.fen_converter import convert_board_to_fen
from scripts.gatekeeper import validate_frame, MotionDetector, corners_stable
from scripts.board_mapper import warp_board_to_grid
from scripts.change_tracker import resolve_move_from_changes
from scripts.session_state import DEFAULT_STARTING_FEN, SessionState


# ---------------------------------------------------------------------------
# Stockfish engine
# ---------------------------------------------------------------------------

def _resolve_stockfish_path() -> str:
    """Return engine path from env or fallback to engines/stockfish bundle."""
    env_path = os.getenv("STOCKFISH_PATH")
    if env_path:
        return env_path

    engines_root = Path(__file__).resolve().parent / "engines" / "stockfish"
    if engines_root.exists():
        preferred_names = [
            "stockfish-windows-x86-64-avx2.exe",
            "stockfish-windows-x86-64-modern.exe",
            "stockfish.exe",
            "stockfish",
        ]
        for name in preferred_names:
            candidate = engines_root / name
            if candidate.exists():
                return str(candidate)

        for candidate in engines_root.iterdir():
            if candidate.is_file() and "stockfish" in candidate.name.lower():
                return str(candidate)

    return "stockfish"


_STOCKFISH_PATH = _resolve_stockfish_path()
_engine: Optional[chess.engine.SimpleEngine] = None


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    global _engine
    # Startup
    try:
        _engine = chess.engine.SimpleEngine.popen_uci(_STOCKFISH_PATH)
        info = _engine.id.get("name", "stockfish")
        print(f"[engine] Loaded {info} from '{_STOCKFISH_PATH}'")
    except FileNotFoundError as exc:
        print(f"[engine] Stockfish binary not found: {exc}")
        _engine = None
    except Exception as exc:
        print(f"[engine] Failed to start Stockfish: {exc}")
        _engine = None

    yield

    # Shutdown
    if _engine is not None:
        _engine.quit()
        _engine = None


app = FastAPI(title="Chess Recognition Server", lifespan=_lifespan)


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------

@app.get("/health")
async def health() -> dict:
    """Liveness probe used by Docker and cloud platforms."""
    return {
        "status": "ok",
        "engine": _engine is not None,
    }


# ---------------------------------------------------------------------------
# POST /recognize_position/ — stateless single-image recognition
# ---------------------------------------------------------------------------

def _run_stateless_pipeline(image_bytes: bytes) -> Optional[str]:
    """Decode an image and return the detected board position as FEN.

    Returns None when no chessboard is found in the image.
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image.")

    img_resized = cv2.resize(img, (IMAGE_SIZE, IMAGE_SIZE))

    corners = get_board_corners(img_resized)
    if corners is None:
        return None

    homography, _ = get_perspective_transform(corners, img_resized)
    piece_boxes = get_piece_predictions(img_resized)

    board_state = map_pieces_to_board(piece_boxes, PIECE_CLASS_NAMES, homography)
    board_state = orient_board_state_for_white(board_state)

    return convert_board_to_fen(board_state)


@app.post("/recognize_position/")
async def recognize_position(file: UploadFile = File(...)):
    """Receive a single image and return the detected board position as FEN."""
    start_time = time.time()
    try:
        image_bytes = await file.read()
        fen = _run_stateless_pipeline(image_bytes)

        if fen is None:
            return JSONResponse(status_code=422, content={
                "status": "error",
                "message": "Failed to recognize a chess board in the image.",
            })

        elapsed = time.time() - start_time
        return JSONResponse(content={
            "status": "success",
            "fen": fen,
            "processing_time_seconds": round(elapsed, 2),
        })
    except Exception as exc:
        return JSONResponse(status_code=400, content={
            "status": "error",
            "message": str(exc),
        })


@app.post("/detect_corners/")
async def detect_corners(file: UploadFile = File(...)):
    """Lightweight check: can we find 4 board corners in the image?"""
    try:
        image_bytes = await file.read()
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Could not decode image.")

        img_resized = cv2.resize(img, (IMAGE_SIZE, IMAGE_SIZE))
        corners = get_board_corners(img_resized)

        if corners is None:
            return JSONResponse(status_code=422, content={
                "status": "error",
                "message": "No board detected",
            })

        return JSONResponse(content={
            "status": "success",
            "corners": corners.tolist(),
        })
    except Exception as exc:
        return JSONResponse(status_code=400, content={
            "status": "error",
            "message": str(exc),
        })


# ---------------------------------------------------------------------------
# /recognize_game/ — stateful game recognition (frame-by-frame)
# ---------------------------------------------------------------------------

# How many consecutive "no-move" detection frames before discarding a pending move.
_PENDING_IDLE_LIMIT = 3
# Initial budget — high enough for the diff detector to warm up.
_BUDGET_INIT = 5
# Budget boost granted on a rejected → accepted gatekeeper transition.
_BUDGET_BOOST = 4

_DUMP_GAME_FRAMES = False  # enabled via --debug flag
_DUMP_GAME_FRAMES_DIR = Path(
    os.getenv(
        "DUMP_GAME_FRAMES_DIR",
        str(Path(__file__).resolve().parent / "runs" / "incoming_frames"),
    )
)


@dataclass
class _GameSession:
    """All mutable state for one in-progress game."""

    game_id: str
    session: SessionState
    moves: list[str] = field(default_factory=list)          # confirmed SAN moves
    current_fen: str = DEFAULT_STARTING_FEN
    expected_turn: Optional[chess.Color] = None              # None = try both
    initial_turn: Optional[chess.Color] = None               # color that played the first move
    pending_san: Optional[str] = None
    pending_idle: int = 0
    frame_count: int = 0
    created_at: float = field(default_factory=time.time)
    lock: Lock = field(default_factory=Lock)
    # Pipeline budget.  When > 0 the full pipeline runs;
    # when 0 only the gatekeeper runs (cheap).  Hand/motion bumps it up.
    budget: int = _BUDGET_INIT
    motion_detector: MotionDetector = field(default_factory=MotionDetector)
    # Background processing queue — frames are enqueued by /frame and
    # consumed by a dedicated worker thread.
    frame_queue: queue.Queue = field(default_factory=queue.Queue)
    prev_rejected: bool = False  # was previous frame rejected by gatekeeper?
    ref_corners: Optional[np.ndarray] = None  # reference ordered corners for stability check
    enqueued_count: int = 0  # total frames enqueued (for numbering)
    last_enqueue_time: float = 0.0  # monotonic timestamp of last enqueued frame
    _worker: Optional[Thread] = field(default=None, repr=False)
    _stop: Event = field(default_factory=Event)
    _finished: Event = field(default_factory=Event)


# Thread-safe registry of active games.
_games: dict[str, _GameSession] = {}
_games_lock = Lock()


def _frame_worker(game: _GameSession) -> None:
    """Background thread that processes frames from the queue one by one."""
    while not game._stop.is_set():
        try:
            frame_data: tuple[int, bytes] = game.frame_queue.get(timeout=0.5)
        except queue.Empty:
            continue
        frame_number, image_bytes = frame_data
        try:
            with game.lock:
                result = _process_frame(game, image_bytes)
                _dump_frame_result(game, result)
        except Exception:
            logging.exception("Error processing frame %d for game %s", frame_number, game.game_id)

    # Drain any remaining frames after stop signal.
    while True:
        try:
            frame_data = game.frame_queue.get_nowait()
        except queue.Empty:
            break
        frame_number, image_bytes = frame_data
        try:
            with game.lock:
                result = _process_frame(game, image_bytes)
                _dump_frame_result(game, result)
        except Exception:
            logging.exception("Error processing frame %d for game %s", frame_number, game.game_id)

    game._finished.set()


def _validate_starting_fen(fen: Optional[str])  -> str:
    """Validate a client-supplied board-only FEN."""
    if fen is None or not fen.strip():
        raise HTTPException(status_code=400, detail="starting_fen is required")
    return fen.strip()


def _compute_san(previous_fen: str, move: chess.Move, turn: chess.Color) -> str:
    """Return the SAN string (e.g. Nf3) for a move, falling back to UCI."""
    try:
        turn_char = "w" if turn == chess.WHITE else "b"
        board = chess.Board(f"{previous_fen} {turn_char} - - 0 1")
        return board.san(move)
    except Exception:
        return move.uci()


def _dump_received_frame(game: _GameSession, image_bytes: bytes, frame_index: int) -> None:
    """Persist incoming frame bytes for visual debugging/comparison."""
    if not _DUMP_GAME_FRAMES:
        return

    game_dir = _DUMP_GAME_FRAMES_DIR / game.game_id
    game_dir.mkdir(parents=True, exist_ok=True)

    (game_dir / f"frame_{frame_index:05d}.jpg").write_bytes(image_bytes)


def _dump_frame_result(game: _GameSession, result: dict) -> None:
    """Save per-frame processing result as a JSON sidecar next to the frame JPEG."""
    if not _DUMP_GAME_FRAMES:
        return
    import json
    frame_index = game.frame_count  # frame_count already incremented by _process_frame
    game_dir = _DUMP_GAME_FRAMES_DIR / game.game_id
    sidecar = {**result, "frame_index": frame_index,
               "pending_san": game.pending_san,
               "moves_so_far": list(game.moves)}
    (game_dir / f"frame_{frame_index:05d}.json").write_text(
        json.dumps(sidecar, indent=2), encoding="utf-8"
    )


def _process_frame(game: _GameSession, image_bytes: bytes) -> dict:
    """Run the full detection pipeline on one frame.

    Returns a JSON-friendly dict describing what happened on this frame.
    """
    # Decode
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image.")
    img_resized = cv2.resize(img, (IMAGE_SIZE, IMAGE_SIZE))

    session = game.session
    game.frame_count += 1

    # Gatekeeper — always runs (cheap relative to YOLO).
    gk = validate_frame(img_resized, motion_detector=game.motion_detector)

    if not gk.is_valid:
        game.prev_rejected = True
        print(f"[Frame {game.frame_count}] rejected: {gk.issues} blur={gk.blur_variance:.1f} hands={gk.hand_count} motion={gk.motion_score:.1f}")
        return {"status": "rejected", "fen": game.current_fen, "move_number": len(game.moves)}

    # Transition: previous frame was rejected, this one is clean → boost budget.
    if game.prev_rejected:
        game.budget += _BUDGET_BOOST
        print(f"[Frame {game.frame_count}] budget boost +{_BUDGET_BOOST} (prev rejected) → budget={game.budget}")
        game.prev_rejected = False

    # If budget is exhausted, skip the expensive pipeline.
    if game.budget <= 0:
        print(f"[Frame {game.frame_count}] skipped (budget=0)")
        return {"status": "skipped", "fen": game.current_fen, "move_number": len(game.moves)}

    game.budget -= 1

    # Corner detection
    corners = get_board_corners(img_resized)
    if corners is None or len(corners) != 4:
        print(f"[Frame {game.frame_count}] no board corners detected")
        return {"status": "no_board", "fen": game.current_fen, "move_number": len(game.moves)}
    
    # Piece detection
    piece_boxes = get_piece_predictions(img_resized)
    if piece_boxes is None:
        print(f"[Frame {game.frame_count}] no pieces detected")
        return {"status": "no_pieces", "fen": game.current_fen, "move_number": len(game.moves)}

    # Perspective transform + warp
    h_matrix, oriented_corners = get_perspective_transform(corners, img_resized)
    warped = warp_board_to_grid(img_resized, h_matrix, IMAGE_SIZE)

    # Corner stability check — compare oriented corners to reference
    if game.ref_corners is not None:
        stable, max_disp, area_ratio = corners_stable(game.ref_corners, oriented_corners)
        if not stable:
            game.prev_rejected = True
            print(f"[Frame {game.frame_count}] corner_shift rejected: max_disp={max_disp:.1f}px area_ratio={area_ratio:.2f}")
            return {"status": "rejected", "fen": game.current_fen, "move_number": len(game.moves)}
    game.ref_corners = oriented_corners.copy()

    # Stash geometry for sidecar dump (frame_viewer uses these)
    _frame_h_matrix = h_matrix.tolist() if hasattr(h_matrix, 'tolist') else h_matrix
    _frame_oriented_corners = oriented_corners.tolist()

    # Map pieces to board
    board_state = map_pieces_to_board(piece_boxes, PIECE_CLASS_NAMES, h_matrix)
    board_oriented = orient_board_state_for_white(board_state)

    print(f"[Frame {game.frame_count}] corners=OK pieces={len(piece_boxes)} moves={game.moves}")

    # Current piece squares from raw YOLO (before smoothing)
    current_piece_squares: set[str] = set()
    if board_oriented:
        for rank_idx, rank in enumerate(board_oriented):
            for file_idx, piece in enumerate(rank):
                if piece:
                    square = chr(ord("a") + file_idx) + str(8 - rank_idx)
                    current_piece_squares.add(square)

    # Diff-based change detection
    change = session.detect_square_changes(warped)
    previous_fen = session.get_last_fen()

    if change and change.triggered_count > 0:
        top3 = change.triggered[:3]
        top3_str = ", ".join(f"{t.square}={t.magnitude:.1f}" for t in top3)
        print(f"[Frame {game.frame_count}] change.ready={change.ready} triggered={change.triggered_count} [{top3_str}] pending={game.pending_san}")
    else:
        print(f"[Frame {game.frame_count}] change.ready={change.ready if change else None} triggered={change.triggered_count if change else None} pending={game.pending_san}")

    move_san: Optional[str] = None

    if previous_fen and change:
        if not change.ready:
            pass  # diff detector still warming up

        elif change.triggered_count == 0 and game.pending_san is None:
            pass  # board is quiet, nothing pending

        elif change.triggered_count == 0 and game.pending_san is not None:
            # Quiet board + pending move → try to confirm via YOLO agreement
            res = resolve_move_from_changes(
                previous_fen=previous_fen,
                detection=change,
                current_piece_squares=current_piece_squares,
                expected_turn=game.expected_turn,
            )
            if res:
                confirm_san = _compute_san(previous_fen, res.move, res.turn)
                if confirm_san == game.pending_san:
                    # YOLO still agrees → CONFIRM
                    move_san = game.pending_san
                    game.current_fen = res.fen
                    game.expected_turn = chess.BLACK if res.turn == chess.WHITE else chess.WHITE
                    if game.initial_turn is None:
                        game.initial_turn = res.turn
                    game.moves.append(move_san)
                    session.set_piece_squares(current_piece_squares)
                    game.pending_san = None
                    game.pending_idle = 0
                else:
                    game.pending_idle += 1
                    if game.pending_idle >= _PENDING_IDLE_LIMIT:
                        game.pending_san = None
                        game.pending_idle = 0
            else:
                game.pending_idle += 1
                if game.pending_idle >= _PENDING_IDLE_LIMIT:
                    game.pending_san = None
                    game.pending_idle = 0

        else:
            # Squares changed → try to resolve a move
            res = resolve_move_from_changes(
                previous_fen=previous_fen,
                detection=change,
                current_piece_squares=current_piece_squares,
                expected_turn=game.expected_turn,
            )
            if res:
                candidate_san = _compute_san(previous_fen, res.move, res.turn)

                if game.pending_san and candidate_san == game.pending_san:
                    # Same move seen again → CONFIRM
                    move_san = candidate_san
                    game.current_fen = res.fen
                    game.expected_turn = chess.BLACK if res.turn == chess.WHITE else chess.WHITE
                    if game.initial_turn is None:
                        game.initial_turn = res.turn
                    game.moves.append(move_san)
                    session.set_piece_squares(current_piece_squares)
                    game.pending_san = None
                    game.pending_idle = 0
                else:
                    # New / different move → store as pending (not committed yet)
                    game.pending_san = candidate_san
                    game.pending_idle = 0
            else:
                if game.pending_san is not None:
                    game.pending_idle += 1
                    if game.pending_idle >= _PENDING_IDLE_LIMIT:
                        game.pending_san = None
                        game.pending_idle = 0

    if game.current_fen:
        session.update_last_fen(game.current_fen)

    # Build response for debug
    result: dict = {
        "status": "move_detected" if move_san else "ok",
        "fen": game.current_fen,
        "move_number": len(game.moves),
        "oriented_corners": _frame_oriented_corners,
        "h_matrix": _frame_h_matrix,
    }
    if move_san:
        result["move"] = move_san
    if game.pending_san:
        result["pending"] = game.pending_san
    return result


# --- Pydantic models for game endpoints ---

class GameStartRequest(BaseModel):
    starting_fen: Optional[str] = Field(
        None, description="Custom starting position (board-only or full FEN). Defaults to standard."
    )

class GameStartResponse(BaseModel):
    status: str
    game_id: str


class GameEndResponse(BaseModel):
    status: str
    game_id: str
    moves: list[str]
    move_count: int
    starting_fen: str  # Full FEN (board + side-to-move) the client should use to replay moves


# --- Endpoints ---

@app.post("/recognize_game/", response_model=GameStartResponse)
async def start_game(payload: GameStartRequest):
    """Create a new game session and return its id."""
    starting_fen = _validate_starting_fen(payload.starting_fen)
    game_id = uuid4().hex[:12]

    session = SessionState(starting_fen=starting_fen)
    game = _GameSession(game_id=game_id, session=session, current_fen=starting_fen)

    with _games_lock:
        _games[game_id] = game


    # Debug
    if _DUMP_GAME_FRAMES:
        # Clear previous game dumps so only the latest game remains.
        import shutil
        for child in _DUMP_GAME_FRAMES_DIR.iterdir():
            if child.is_dir():
                shutil.rmtree(child, ignore_errors=True)

        game_dir = _DUMP_GAME_FRAMES_DIR / game_id
        game_dir.mkdir(parents=True, exist_ok=True)
        (game_dir / "session_meta.txt").write_text(
            f"game_id={game_id}\nstarting_fen={starting_fen}\n",
            encoding="utf-8",
        )
        logger.info("Created game frame dump dir: %s", game_dir)

    # Start background worker thread for frame processing.
    worker = Thread(target=_frame_worker, args=(game,), daemon=True)
    game._worker = worker
    worker.start()

    return GameStartResponse(status="created", game_id=game_id)


@app.post("/recognize_game/{game_id}/frame")
async def submit_frame(game_id: str, file: UploadFile = File(...)):
    """Enqueue a frame for background processing."""
    with _games_lock:
        game = _games.get(game_id)
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")

    image_bytes = await file.read()

    with game.lock:
        game.enqueued_count += 1
        frame_number = game.enqueued_count
        now = time.monotonic()
        delta_ms = (now - game.last_enqueue_time) * 1000 if game.last_enqueue_time else 0
        game.last_enqueue_time = now
        _dump_received_frame(game, image_bytes, frame_number)

    game.frame_queue.put((frame_number, image_bytes))
    print(f"[recv #{frame_number}] delta={delta_ms:.0f}ms  qsize={game.frame_queue.qsize()}")

    return JSONResponse(content={"status": "stored", "frame_number": frame_number})


@app.post("/recognize_game/{game_id}/end", response_model=GameEndResponse)
async def end_game(game_id: str):
    """Signal end-of-game, wait for remaining frames to be processed, return moves."""
    with _games_lock:
        game = _games.get(game_id)
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")

    print(f"[endGame] Stopping worker for game {game_id}, ~{game.frame_queue.qsize()} frames queued")

    def _wait():
        # Signal the worker to stop after draining the queue.
        game._stop.set()
        game._finished.wait(timeout=600)  # generous timeout

        # Auto-confirm any pending move so the last detected move isn't lost.
        if game.pending_san:
            game.moves.append(game.pending_san)
            print(f"[endGame] Auto-confirmed pending move: {game.pending_san}")

    await asyncio.to_thread(_wait)

    # Remove session from registry.
    with _games_lock:
        _games.pop(game_id, None)

    print(f"[endGame] Completed game {game_id}: {len(game.moves)} moves detected")

    board_fen = game.session.starting_fen or DEFAULT_STARTING_FEN
    # Use the color that played the first detected move; fall back to white.
    turn_char = 'b' if game.initial_turn == chess.BLACK else 'w'
    full_starting_fen = f"{board_fen} {turn_char} - - 0 1"

    return GameEndResponse(
        status="completed",
        game_id=game_id,
        moves=list(game.moves),
        move_count=len(game.moves),
        starting_fen=full_starting_fen,
    )


@app.delete("/recognize_game/{game_id}/")
async def discard_game(game_id: str):
    """Discard a game session without returning results."""
    with _games_lock:
        game = _games.pop(game_id, None)
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")
    # Stop the background worker.
    game._stop.set()
    return JSONResponse(content={"status": "discarded", "game_id": game_id})


# ---------------------------------------------------------------------------
# POST /analyze_position/ — Stockfish evaluation
# ---------------------------------------------------------------------------

class AnalysisRequest(BaseModel):
    fen: str = Field(..., description="Position in Forsyth-Edwards Notation")
    depth: Optional[int] = Field(14, ge=1, le=40, description="Search depth")
    multipv: Optional[int] = Field(1, ge=1, le=5, description="Number of candidate lines")


class AnalysisLine(BaseModel):
    best_move: str
    best_move_san: str
    evaluation: dict
    pv: list[str]


class AnalysisResponse(BaseModel):
    status: str
    lines: list[AnalysisLine]
    depth: int
    engine: str


@app.post("/analyze_position/", response_model=AnalysisResponse)
async def analyze_position(request: AnalysisRequest):
    if _engine is None:
        raise HTTPException(status_code=503, detail="Stockfish engine is not available on the server.")

    try:
        board = chess.Board(request.fen)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid FEN: {exc}")

    original_fen = request.fen

    # If board metadata (castling/en-passant/clock fields) is stale after manual
    # editing, keep placement + side-to-move and clear the rest as a safe fallback.
    if not board.is_valid():
        placement = board.board_fen()
        turn = "w" if board.turn == chess.WHITE else "b"
        sanitized_fen = f"{placement} {turn} - - 0 1"
        try:
            sanitized_board = chess.Board(sanitized_fen)
        except ValueError:
            sanitized_board = None

        if sanitized_board is not None and sanitized_board.is_valid():
            board = sanitized_board

    missing_kings = []
    if board.king(chess.WHITE) is None:
        missing_kings.append("white king")
    if board.king(chess.BLACK) is None:
        missing_kings.append("black king")

    if missing_kings:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid FEN: missing {' and '.join(missing_kings)}",
        )

    if not board.is_valid():
        raise HTTPException(status_code=400, detail="Invalid FEN: board state is not valid chess.")

    limit = chess.engine.Limit(depth=request.depth or 14)
    multipv = request.multipv or 1

    try:
        raw_info = await asyncio.to_thread(_engine.analyse, board, limit, multipv=multipv)
    except chess.engine.EngineTerminatedError:
        raise HTTPException(status_code=500, detail="Stockfish engine terminated unexpectedly.")
    except chess.engine.EngineError as exc:
        raise HTTPException(status_code=500, detail=f"Engine error: {exc}")

    infos = raw_info if isinstance(raw_info, list) else [raw_info]
    response_lines: list[AnalysisLine] = []

    for info in infos:
        pv_moves = info.get("pv", [])
        if not pv_moves:
            continue

        pv_san: list[str] = []
        pv_board = board.copy()
        for move in pv_moves:
            pv_san.append(pv_board.san(move))
            pv_board.push(move)

        score = info.get("score")
        evaluation: dict[str, Union[int, str, None]]
        if score is None:
            evaluation = {"type": "unknown", "value": None}
        else:
            score = score.white()
            if score.is_mate():
                evaluation = {"type": "mate", "value": score.mate()}
            else:
                evaluation = {"type": "cp", "value": score.score()}

        response_lines.append(AnalysisLine(
            best_move=pv_moves[0].uci(),
            best_move_san=pv_san[0],
            evaluation=evaluation,
            pv=pv_san,
        ))

    if not response_lines:
        raise HTTPException(status_code=500, detail="Engine returned no analysis.")

    return AnalysisResponse(
        status="success",
        lines=response_lines,
        depth=limit.depth or request.depth or 0,
        engine=_engine.id.get("name", "stockfish") if _engine else "unknown",
    )


# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Chess Recognition Server")
    parser.add_argument("--debug", action="store_true", help="Enable game frame dumping to runs/incoming_frames/")
    args = parser.parse_args()

    if args.debug:
        _DUMP_GAME_FRAMES = True
        _DUMP_GAME_FRAMES_DIR.mkdir(parents=True, exist_ok=True)
        logger.info("Game frame dumping enabled: %s", _DUMP_GAME_FRAMES_DIR)

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("ML_PORT", "8000")), log_level="info")