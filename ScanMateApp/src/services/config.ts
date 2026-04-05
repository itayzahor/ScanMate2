import {Platform} from 'react-native';

// Set this to your laptop/desktop LAN IP when testing on a physical device.
// Leave it as an empty string when using an Android emulator (which can hit 10.0.2.2).
const LAN_HOST = '10.0.0.1';

const makeLanUrl = (port: number) =>
  LAN_HOST ? `http://${LAN_HOST}:${port}` : null;

const makeDefaultUrl = (port: number) =>
  Platform.select({
    android: `http://10.0.2.2:${port}`,
    ios: `http://localhost:${port}`,
    default: `http://localhost:${port}`,
  });

/** Python ML server (board recognition, engine analysis). */
export const ML_BASE_URL =
  makeLanUrl(8000) ?? makeDefaultUrl(8000) ?? 'http://localhost:8000';

/** Node.js REST + Socket.io server (auth, games, friends, live games). */
export const API_BASE_URL =
  makeLanUrl(4000) ?? makeDefaultUrl(4000) ?? 'http://localhost:4000';
