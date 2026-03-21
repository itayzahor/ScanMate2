import ImageEditor from '@react-native-community/image-editor';

type CropParams = {
  photoPath: string;
  photoWidth: number;
  photoHeight: number;
  windowWidth: number;
  windowHeight: number;
  boardSize: number;
  boardOffsetX: number;
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

  const displayScale = Math.max(windowWidth / photoWidth, windowHeight / photoHeight);
  const boardPixelWidth = Math.floor(boardSize / displayScale);
  const squareSize = Math.min(boardPixelWidth, photoWidth, photoHeight);
  const horizontalOverflow = Math.max(photoWidth * displayScale - windowWidth, 0) / 2;
  const verticalOverflow = Math.max(photoHeight * displayScale - windowHeight, 0) / 2;

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
