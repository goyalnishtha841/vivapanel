import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { ScreenshotBG } from '../ScreenshotBG';
import { Cursor } from '../Cursor';
import { HighlightRing } from '../Highlight';
import { headlineFont, monoFont } from '../fonts';
import { theme } from '../theme';

const CTA_FOCAL = { x: 1237 / 1920, y: 777 / 1080 };

const EndCopy: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [24, 44], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const rise = interpolate(frame, [24, 48], [24, 0], {
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
        bottom: 150,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        opacity,
        transform: `translateY(${rise}px)`,
      }}
    >
      <div
        style={{
          fontFamily: headlineFont,
          fontWeight: 800,
          fontSize: 58,
          background: theme.gradient,
          WebkitBackgroundClip: 'text',
          color: 'transparent',
          textShadow: '0 10px 50px rgba(0,0,0,0.5)',
        }}
      >
        viva-panel.onrender.com
      </div>
      <div
        style={{
          fontFamily: monoFont,
          fontSize: 20,
          color: theme.dim,
          marginTop: 16,
          letterSpacing: 0.3,
        }}
      >
        Built for the Ziro Agentic AI Hackathon 2026 — Team Triple Threat AI
      </div>
    </div>
  );
};

export const Scene10_Endcard: React.FC = () => {
  return (
    <AbsoluteFill>
      <ScreenshotBG
        src="screenshots/live/hero_2x.jpg"
        focal={CTA_FOCAL}
        zoomFrom={1}
        zoomTo={1.12}
        zoomStart={0}
        zoomEnd={320}
        dim={0.52}
      />
      <HighlightRing x={1237} y={777} w={190} h={64} start={12} end={320} />
      <Cursor
        waypoints={[
          { frame: 10, x: 1600, y: 920 },
          { frame: 45, x: 1237, y: 777 },
          { frame: 230, x: 1237, y: 777 },
        ]}
        clicks={[232]}
        holdAfter={60}
      />
      <EndCopy />
    </AbsoluteFill>
  );
};
