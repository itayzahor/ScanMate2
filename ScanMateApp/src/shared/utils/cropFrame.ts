import ImageEditor from '@react-native-community/image-editor';

/**
 * Parameters describing the current camera frame and the on-screen board overlay.
 * All pixel values are in device-independent screen pixels unless noted otherwise.
 */
type CropParams = {
  photoPath: string;
  /** Width of the raw camera photo in pixels. */
  photoWidth: number;
  /** Height of the raw camera photo in pixels. */
  photoHeight: number;
  /** Width of the device screen / render window in points. */
  windowWidth: number;
  /** Height of the device screen / render window in points. */
  windowHeight: number;
  /** Side length of the square board overlay in points. */
  boardSize: number;
  /** Horizontal offset of the board overlay from the left edge of the screen, in points. */
  boardOffsetX: number;
  /** Vertical offset of the board overlay from the top edge of the screen, in points. */
  overlayTopPx: number;
};

/**
 * Crop a camera snapshot to the viewfinder square and resize to 640×640.
 * Returns the file path (without file:// prefix) of the cropped image.
 */
export async function cropFrameToBoard({
  photoPath,
  photoWidth,
  photoHeight,
  windowWidth,
  windowHeight,
  boardSize,
  boardOffsetX,
  overlayTopPx,
}: CropParams): Promise<string> {
  const photoUri = photoPath.startsWith('file://') ? photoPath : `file://${photoPath}`;

  // How much the photo is scaled to fill the screen (cover strategy — max of the two axes).
  const displayScale = Math.max(windowWidth / photoWidth, windowHeight / photoHeight);
  // Board width translated from screen points back into raw photo pixels.
  const boardPixelWidth = Math.floor(boardSize / displayScale);
  // Use the smallest valid dimension so the crop square always fits inside the photo.
  const squareSize = Math.min(boardPixelWidth, photoWidth, photoHeight);
  // When the photo is larger than the screen it overflows symmetrically on each axis.
  const horizontalOverflow = Math.max(photoWidth * displayScale - windowWidth, 0) / 2;
  const verticalOverflow = Math.max(photoHeight * displayScale - windowHeight, 0) / 2;

  // Convert overlay screen-position to photo-pixel offset, then clamp to valid bounds.
  let offsetX = Math.floor((boardOffsetX + horizontalOverflow) / displayScale);
  offsetX = Math.max(0, Math.min(offsetX, photoWidth - squareSize));
  let offsetY = Math.floor((overlayTopPx + verticalOverflow) / displayScale);
  offsetY = Math.max(0, Math.min(offsetY, photoHeight - squareSize));

  const result = await ImageEditor.cropImage(photoUri, {
    offset: { x: offsetX, y: offsetY },
    size: { width: squareSize, height: squareSize },
    displaySize: { width: 640, height: 640 },
    resizeMode: 'contain' as const,
  });

  return result.uri.replace('file://', '');
}
