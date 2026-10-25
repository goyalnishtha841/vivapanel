import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { ScreenshotBG } from '../ScreenshotBG';
import { Cursor } from '../Cursor';
import { LowerCaption } from '../Caption';
import { HighlightRing } from '../Highlight';
import { headlineFont } from '../fonts';
import { theme } from '../theme';

const FOCAL = { x: 550 / 1920, y: 786 / 1080 };

const Payoff: React.FC<{ start: number; end: number }> = ({ start, end }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [start, start + 18, end - 16, end], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const rise = interpolate(frame, [start, start + 20], [36, 0], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        position: 'absolute',
        right: 110,
        bottom: 110,
        maxWidth: 980,
        textAlign: 'right',
        opacity,
        transform: `translateY(${rise}px)`,
      }}
    >
      <div
        style={{
          fontFamily: headlineFont,
          fontWeight: 800,
          fontStyle: 'italic',
          fontSize: 72,
          color: theme.orange,
          lineHeight: 1.08,
          textShadow: '0 8px 40px rgba(0,0,0,0.6)',
        }}
      >
        Zero matches.
      </div>
      <div
        style={{
          fontFamily: headlineFont,
          fontWeight: 700,
          fontSize: 42,
          color: theme.white,
          lineHeight: 1.2,
          marginTop: 16,
          textShadow: '0 8px 30px rgba(0,0,0,0.6)',
        }}
      >
        It doesn&rsquo;t take your word for it — it searches the code.
      </div>
    </div>
  );
};

export const Scene6_Verify: React.FC = () => {
  return (
    <AbsoluteFill>
      <ScreenshotBG
        src="screenshots/live/engineer_falseclaim_2x.jpg"
        focal={FOCAL}
        zoomFrom={1}
        zoomTo={1.6}
        zoomStart={430}
        zoomEnd={700}
      />
      <HighlightRing x={411} y={360} w={90} h={34} start={45} end={195} color={theme.weak} />
      <HighlightRing x={550} y={786} w={340} h={70} start={235} end={410} color={theme.green} />

      <Cursor
        waypoints={[
          { frame: 15, x: 900, y: 150 },
          { frame: 60, x: 411, y: 360 },
          { frame: 90, x: 411, y: 360 },
          { frame: 250, x: 550, y: 786 },
          { frame: 280, x: 550, y: 786 },
        ]}
        holdAfter={14}
      />

      <LowerCaption
        kicker="The claim"
        text={'"I have a test that checks a revoked token is rejected."'}
        start={25}
        end={195}
      />
      <LowerCaption
        kicker="What the Engineer actually did"
        text={'Let me search the code for "revoke". — Search "revoke": 0 match(es).'}
        start={220}
        end={410}
      />

      <Payoff start={440} end={690} />
    </AbsoluteFill>
  );
};
