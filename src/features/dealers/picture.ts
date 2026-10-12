import type { ImageSource } from 'expo-image';

/**
 * The face of a shop that declared no favicon, or whose icon failed to load.
 * Bundled, so a miss does not go out to the network for a substitute.
 */
export const dealerPicture: ImageSource = require('../../../assets/dealer.png');
