import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { theme } from './theme';

/** A pulsing highlight ring used to draw the eye to one UI element. */
export const HighlightRing: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  start: number;
  end: number;
  color?: string;
}> = ({ x, y, w, h, start, end, color = theme.orange }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [start, start + 10, end - 10, end], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const pulse = 1 + 0.035 * Math.sin(((frame - start) / 18) * Math.PI * 2);
  const easedPad = interpolate(frame, [start, start + 14], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const pad = 14 * easedPad;

  return (
    <div
      style={{
        position: 'absolute',
        left: x - w / 2 - pad,
        top: y - h / 2 - pad,
        width: (w + pad * 2) * pulse,
        height: (h + pad * 2) * pulse,
        borderRadius: 16,
        border: `3px solid ${color}`,
        boxShadow: `0 0 28px ${color}99, inset 0 0 18px ${color}44`,
        opacity,
        zIndex: 40,
      }}
    />
  );
};
