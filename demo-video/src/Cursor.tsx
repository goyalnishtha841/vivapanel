import { Easing, interpolate, useCurrentFrame } from 'remotion';

export type CursorWaypoint = { frame: number; x: number; y: number };

type CursorProps = {
  waypoints: CursorWaypoint[];
  clicks?: number[];
  holdAfter?: number;
  fadeIn?: number;
  fadeOut?: number;
  scale?: number;
};

/** A stylized animated mouse pointer that eases between waypoints and ripples on click. */
export const Cursor: React.FC<CursorProps> = ({
  waypoints,
  clicks = [],
  holdAfter = 16,
  fadeIn = 8,
  fadeOut = 10,
  scale = 1,
}) => {
  const frame = useCurrentFrame();
  const frames = waypoints.map((w) => w.frame);
  const xs = waypoints.map((w) => w.x);
  const ys = waypoints.map((w) => w.y);

  const easing = Easing.bezier(0.45, 0, 0.2, 1);
  const x = interpolate(frame, frames, xs, {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const y = interpolate(frame, frames, ys, {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const firstFrame = frames[0];
  const lastFrame = frames[frames.length - 1];

  const opacity = interpolate(
    frame,
    [firstFrame, firstFrame + fadeIn, lastFrame + holdAfter, lastFrame + holdAfter + fadeOut],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // Click bounce: brief squash near each click frame.
  let bounce = 1;
  for (const c of clicks) {
    const local = frame - c;
    if (local >= -4 && local <= 10) {
      const squash = interpolate(local, [-4, 0, 10], [1, 0.72, 1], {
        easing: Easing.out(Easing.cubic),
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      bounce = Math.min(bounce, squash);
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: 1,
        height: 1,
        transform: `translate(${x}px, ${y}px)`,
        opacity,
        pointerEvents: 'none',
        zIndex: 50,
      }}
    >
      {clicks.map((c) => {
        const local = frame - c;
        if (local < 0 || local > 26) return null;
        const r = interpolate(local, [0, 26], [6, 46], { extrapolateRight: 'clamp' });
        const rippleOpacity = interpolate(local, [0, 26], [0.55, 0], { extrapolateRight: 'clamp' });
        return (
          <div
            key={c}
            style={{
              position: 'absolute',
              left: -r,
              top: -r,
              width: r * 2,
              height: r * 2,
              borderRadius: '50%',
              border: '2.5px solid #FF6B4A',
              boxShadow: '0 0 18px rgba(255,107,74,0.55)',
              opacity: rippleOpacity,
            }}
          />
        );
      })}
      <div
        style={{
          transform: `scale(${scale * bounce}) translate(-4px, -2px)`,
          filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.55))',
        }}
      >
        <svg width="34" height="40" viewBox="0 0 34 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M3 2 L3 32 L10.8 25.4 L15.6 36.4 L20.4 34.3 L15.7 23.4 L26 23.1 Z"
            fill="white"
            stroke="#15151d"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
};
