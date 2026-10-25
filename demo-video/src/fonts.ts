import { loadFont as loadJakarta } from '@remotion/google-fonts/PlusJakartaSans';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';

const jakarta = loadJakarta('normal', {
  weights: ['500', '700', '800'],
  subsets: ['latin'],
});
const mono = loadMono('normal', {
  weights: ['400', '500', '700'],
  subsets: ['latin'],
});

export const headlineFont = jakarta.fontFamily;
export const monoFont = mono.fontFamily;

export const waitForFonts = () => Promise.all([jakarta.waitUntilDone(), mono.waitUntilDone()]);
