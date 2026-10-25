import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { headlineFont, monoFont } from './fonts';
import { theme } from './theme';

/** A big animated number sliding from one value to another (e.g. "3 -> 100"). */
export const CounterTransition: React.FC<{
  from: number;
  to: number;
  start: number;
  end: number;
  suffix?: string;
}> = ({ from, to, start, end, suffix = '' }) => {
  const frame = useCurrentFrame();
  const value = Math.round(
    interpolate(frame, [start, end], [from, to], {
      easing: Easing.out(Easing.cubic),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );
  return (
    <span>
      {value}
      {suffix}
    </span>
  );
};

export const StatCard: React.FC<{
  value: React.ReactNode;
  label: string;
  x: number;
  y: number;
  start: number;
  accent?: string;
}> = ({ value, label, x, y, start, accent = theme.orange }) => {
  const frame = useCurrentFrame();
  const local = frame - start;
  const opacity = interpolate(local, [0, 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const rise = interpolate(local, [0, 16], [30, 0], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        opacity,
        transform: `translateY(${rise}px)`,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 20,
        padding: '28px 38px',
        minWidth: 360,
      }}
    >
      <div
        style={{
          fontFamily: headlineFont,
          fontWeight: 800,
          fontSize: 64,
          color: accent,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: monoFont,
          fontSize: 22,
          color: theme.dim,
          marginTop: 10,
        }}
      >
        {label}
      </div>
    </div>
  );
};
