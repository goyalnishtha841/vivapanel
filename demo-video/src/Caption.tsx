import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { headlineFont, monoFont } from './fonts';
import { theme } from './theme';

const inOut = (frame: number, inStart: number, inDur: number, outStart: number, outDur: number) => {
  const appear = interpolate(frame, [inStart, inStart + inDur], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const vanish = interpolate(frame, [outStart, outStart + outDur], [1, 0], {
    easing: Easing.in(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return Math.min(appear, vanish);
};

/** Large hero-style statement, used for the hook and endcard. */
export const HookCaption: React.FC<{
  lines: string[];
  accentLine?: number;
  start: number;
  end: number;
  fontSize?: number;
  align?: 'left' | 'center';
}> = ({ lines, accentLine, start, end, fontSize = 92, align = 'center' }) => {
  const frame = useCurrentFrame();
  const opacity = inOut(frame, start, 14, end - 14, 14);
  const rise = interpolate(frame, [start, start + 16], [26, 0], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'center' ? 'center' : 'flex-start',
        justifyContent: 'center',
        textAlign: align,
        padding: '0 140px',
        opacity,
        transform: `translateY(${rise}px)`,
      }}
    >
      {lines.map((line, i) => (
        <div
          key={i}
          style={{
            fontFamily: headlineFont,
            fontWeight: 800,
            fontSize,
            lineHeight: 1.08,
            color: i === accentLine ? theme.orange : theme.white,
            fontStyle: i === accentLine ? 'italic' : 'normal',
            textShadow: '0 6px 40px rgba(0,0,0,0.5)',
          }}
        >
          {line}
        </div>
      ))}
    </div>
  );
};

/** Short punchy line used for rapid-fire problem beats. */
export const QuickLine: React.FC<{ text: string; start: number; end: number }> = ({
  text,
  start,
  end,
}) => {
  const frame = useCurrentFrame();
  const opacity = inOut(frame, start, 8, end - 8, 8);
  const scale = interpolate(frame, [start, start + 10], [0.94, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 160px',
        opacity,
      }}
    >
      <div
        style={{
          fontFamily: headlineFont,
          fontWeight: 700,
          fontSize: 64,
          color: theme.white,
          textAlign: 'center',
          transform: `scale(${scale})`,
          textShadow: '0 6px 30px rgba(0,0,0,0.6)',
        }}
      >
        {text}
      </div>
    </div>
  );
};

/** Burned-in lower-third caption used over UI demo beats, readable at 720p. */
export const LowerCaption: React.FC<{
  kicker?: string;
  text: string;
  start: number;
  end: number;
  align?: 'left' | 'center';
}> = ({ kicker, text, start, end, align = 'left' }) => {
  const frame = useCurrentFrame();
  const opacity = inOut(frame, start, 10, end - 10, 10);
  const rise = interpolate(frame, [start, start + 12], [18, 0], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 72,
        display: 'flex',
        justifyContent: align === 'center' ? 'center' : 'flex-start',
        paddingLeft: align === 'left' ? 110 : 0,
        paddingRight: align === 'left' ? 110 : 0,
        opacity,
        transform: `translateY(${rise}px)`,
      }}
    >
      <div
        style={{
          maxWidth: 1320,
          background: 'rgba(7,7,13,0.74)',
          backdropFilter: 'blur(6px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 18,
          padding: '22px 34px',
          boxShadow: '0 14px 40px rgba(0,0,0,0.45)',
        }}
      >
        {kicker && (
          <div
            style={{
              fontFamily: monoFont,
              fontSize: 19,
              fontWeight: 500,
              color: theme.orange,
              letterSpacing: 0.5,
              marginBottom: 6,
              textTransform: 'uppercase',
            }}
          >
            {kicker}
          </div>
        )}
        <div
          style={{
            fontFamily: headlineFont,
            fontWeight: 700,
            fontSize: 38,
            lineHeight: 1.25,
            color: theme.white,
          }}
        >
          {text}
        </div>
      </div>
    </div>
  );
};

export const Eyebrow: React.FC<{ text: string; start: number; end: number }> = ({
  text,
  start,
  end,
}) => {
  const frame = useCurrentFrame();
  const opacity = inOut(frame, start, 10, end - 10, 10);
  return (
    <div
      style={{
        position: 'absolute',
        top: 86,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        opacity,
      }}
    >
      <div
        style={{
          fontFamily: monoFont,
          fontSize: 24,
          fontWeight: 500,
          letterSpacing: 1,
          color: theme.dim,
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 999,
          padding: '10px 26px',
          background: 'rgba(7,7,13,0.55)',
        }}
      >
        {text}
      </div>
    </div>
  );
};
