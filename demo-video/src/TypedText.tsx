import { interpolate, useCurrentFrame } from 'remotion';
import { monoFont } from './fonts';

/** Simulates typing real UI copy into a field, positioned to overlay the real screenshot's input. */
export const TypedText: React.FC<{
  text: string;
  x: number;
  y: number;
  start: number;
  charsPerFrame?: number;
  fontSize?: number;
  color?: string;
  align?: 'left' | 'center';
  /** Frame at which this overlay starts fading out — must finish before the background zooms, since this text is positioned in static (unzoomed) canvas coordinates. */
  fadeOutStart?: number;
  fadeOutDur?: number;
}> = ({
  text,
  x,
  y,
  start,
  charsPerFrame = 0.9,
  fontSize = 24,
  color = '#F5F5F7',
  align = 'left',
  fadeOutStart,
  fadeOutDur = 16,
}) => {
  const frame = useCurrentFrame();
  const local = Math.max(0, frame - start);
  const chars = Math.min(text.length, Math.floor(local * charsPerFrame));
  const shown = text.slice(0, chars);
  const caretOn = Math.floor(frame / 8) % 2 === 0;
  const fadeIn = interpolate(frame, [start - 2, start + 2], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fadeOut =
    fadeOutStart === undefined
      ? 1
      : interpolate(frame, [fadeOutStart, fadeOutStart + fadeOutDur], [1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: align === 'center' ? 'translate(-50%, -50%)' : 'translate(0, -50%)',
        fontFamily: monoFont,
        fontSize,
        color,
        opacity,
        whiteSpace: 'nowrap',
      }}
    >
      {shown}
      {chars < text.length && caretOn && <span style={{ opacity: 0.8 }}>|</span>}
    </div>
  );
};
