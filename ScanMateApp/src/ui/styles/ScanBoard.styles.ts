import {StyleSheet, Dimensions} from 'react-native';
import {colors} from '../theme';

const WINDOW_WIDTH = Dimensions.get('window').width;
const BOARD_MARGIN = 16;
const BOARD_SIZE = WINDOW_WIDTH - BOARD_MARGIN * 2;

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundDark,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.backgroundDark,
  },
  errorText: {
    color: colors.textLight,
    fontSize: 18,
  },
  
  // ----------------------------------------------------
  // CONTROLS AND OVERLAY STYLES
  // ----------------------------------------------------
  
  // The UI Layer that sits on top of the mask
  overlayControls: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: BOARD_MARGIN,
    paddingBottom: 20,
  },
  
  instructionBox: {
    paddingTop: 20,
    paddingBottom: 20,
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.5)',
    marginBottom: 20,
  },
  screenHeader: {
    width: '100%',
  },
  tipsList: {
    width: '100%',
    gap: 6,
    marginTop: 16,
  },
  tipText: {
    color: '#b5b5b5',
    fontSize: 14,
    lineHeight: 20,
  },

  // ----------------------------------------------------
  // BUTTON STYLES (White and at the absolute bottom)
  // ----------------------------------------------------
  captureButtonContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 'auto',
  },
  captureButton: {
    backgroundColor: colors.background, // ⬅️ FIX: Changed from colors.primary (Red) to colors.background (White)
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 5,
    borderColor: colors.textLight,
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.text, // ⬅️ Changed color to contrast with the white background (should be black)
    fontWeight: 'bold',
  },

  // ----------------------------------------------------
  // FLEXBOX MASKING STYLES (The geometry that worked)
  // ----------------------------------------------------
  viewfinderContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  viewfinderTopMask: {
    backgroundColor: colors.backgroundDark,
    width: '100%',
  },
  viewfinderBottomMask: {
    backgroundColor: colors.backgroundDark,
    flex: 1,
    width: '100%',
  },
  viewfinderMiddleRow: {
    flexDirection: 'row',
    width: '100%',
    height: BOARD_SIZE,
  },
  viewfinderSideMask: {
    backgroundColor: colors.backgroundDark,
    flex: 1, 
  },
  viewfinderGuide: {
    width: BOARD_SIZE,
    height: BOARD_SIZE,
    backgroundColor: 'transparent', 
    borderWidth: 3,
    borderColor: colors.secondary, 
  },
  viewfinderSpacer: {
    height: BOARD_SIZE,
    width: '100%',
    backgroundColor: 'transparent',
  },
  boardDetectedBorder: {
    borderColor: '#4CAF50',
  },
  boardNotDetectedBorder: {
    borderColor: '#F44336',
  },
  boardStatusText: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
  },
  customFenTip: {
    color: '#4fc3f7',
    marginBottom: 4,
  },
  captureButtonGroup: {
    alignItems: 'center',
    gap: 10,
  },
});

export const localStyles = StyleSheet.create({
  recordingButton: {
    backgroundColor: '#c0392b',
    borderColor: '#fff',
  },
  statusBar: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    marginTop: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 15,
    textAlign: 'center',
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    zIndex: 10,
  },
  processingTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  processingDetail: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  progressBarTrack: {
    width: '60%',
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#4fc3f7',
  },
});