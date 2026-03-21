"""Frame quality validation helpers (blur + hand occlusion)."""
from __future__ import annotations

from dataclasses import dataclass
from threading import Lock
from typing import List

import cv2
import numpy as np
from mediapipe.python.solutions import hands as mp_hands

HAND_DETECTED = "hand_detected"
FRAME_BLURRY = "frame_blurry"
MOTION_DETECTED = "motion_detected"

DEFAULT_BLUR_THRESHOLD = 120.0
DEFAULT_HAND_CONFIDENCE = 0.5
DEFAULT_MOTION_THRESHOLD = 15.0
_BUDGET_BOOST = 2


@dataclass(frozen=True)
class GatekeeperResult:
    is_valid: bool
    issues: List[str]
    blur_variance: float
    hand_count: int
    motion_score: float


_hands = mp_hands.Hands(
    static_image_mode=True,
    max_num_hands=4,
    model_complexity=1,
    min_detection_confidence=0.35,
)
_hands_lock = Lock()


class MotionDetector:
    """Stateful per-session detector: rejects frames with high inter-frame motion."""

    def __init__(self, threshold: float = DEFAULT_MOTION_THRESHOLD):
        self._threshold = threshold
        self._prev_gray: np.ndarray | None = None

    def check(self, image_bgr: np.ndarray) -> tuple[bool, float]:
        """Compare current frame to previous. Returns (is_moving, motion_score)."""
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        if self._prev_gray is None:
            self._prev_gray = gray
            return False, 0.0
        motion_score = float(cv2.absdiff(gray, self._prev_gray).mean())
        self._prev_gray = gray
        return motion_score > self._threshold, motion_score


def _count_hands(image_bgr: np.ndarray, min_confidence: float) -> int:
    image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    with _hands_lock:
        results = _hands.process(image_rgb)
    handedness = getattr(results, "multi_handedness", None)
    if not handedness:
        return 0
    count = 0
    for hand in handedness:
        classification = getattr(hand, "classification", None)
        if not classification:
            continue
        if classification[0].score >= min_confidence:
            count += 1
    return count


def _laplacian_variance(image_bgr: np.ndarray) -> float:
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def validate_frame(
    image_bgr: np.ndarray,
    *,
    blur_threshold: float = DEFAULT_BLUR_THRESHOLD,
    hand_confidence: float = DEFAULT_HAND_CONFIDENCE,
    motion_detector: MotionDetector | None = None,
) -> GatekeeperResult:
    """Return per-frame validation result for blur + occlusion + motion."""
    issues: List[str] = []
    blur_variance = _laplacian_variance(image_bgr)
    if blur_variance < blur_threshold:
        issues.append(FRAME_BLURRY)

    hand_count = _count_hands(image_bgr, hand_confidence)
    if hand_count > 0:
        issues.append(HAND_DETECTED)

    motion_score = 0.0
    if motion_detector is not None:
        is_moving, motion_score = motion_detector.check(image_bgr)
        if is_moving:
            issues.append(MOTION_DETECTED)

    return GatekeeperResult(is_valid=len(issues) == 0, issues=issues, blur_variance=blur_variance, hand_count=hand_count, motion_score=motion_score)


def compute_budget(result: GatekeeperResult) -> int:
    """Return how much budget to grant for this frame.

    Returns ``_BUDGET_BOOST`` (2) when a hand or motion is present, 0 otherwise.
    """
    if result.hand_count > 0 or MOTION_DETECTED in result.issues:
        return _BUDGET_BOOST
    return 0
