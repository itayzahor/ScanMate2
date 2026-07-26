import {Platform} from 'react-native';

// ── Production URLs ───────────────────────────────────────────────────────────
const PROD_API_URL = 'https://scanmate2.onrender.com';

// ── Local development URLs ────────────────────────────────────────────────────
// Set LAN_HOST to your laptop's IP when testing on a physical device.
// Leave empty when using an Android emulator (uses 10.0.2.2 automatically).
const LAN_HOST = '192.168.68.50';

const makeDevApiUrl = () => {
  if (LAN_HOST) return `http://${LAN_HOST}:4000`;
  return Platform.select({
    android: 'http://10.0.2.2:4000',
    ios: 'http://localhost:4000',
    default: 'http://localhost:4000',
  });
};

const makeDevMlUrl = () => {
  if (LAN_HOST) return `http://${LAN_HOST}:8000`;
  return Platform.select({
    android: 'http://10.0.2.2:8000',
    ios: 'http://localhost:8000',
    default: 'http://localhost:8000',
  });
};

/** Node.js REST + Socket.io server (auth, games, friends, live games). */
export const API_BASE_URL = __DEV__ ? makeDevApiUrl()! : PROD_API_URL;

/** Python ML server (board recognition, engine analysis).
 *  ML is not yet hosted in the cloud — always points to the local server. */
export const ML_BASE_URL = makeDevMlUrl()!;
