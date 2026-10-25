import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { ScreenshotBG } from '../ScreenshotBG';
import { Cursor } from '../Cursor';
import { TypedText } from '../TypedText';
import { LowerCaption } from '../Caption';
import { HighlightRing } from '../Highlight';

const CROSSFADE_START = 190;
const CROSSFADE_DUR = 20;

export const Scene3_Start: React.FC = () => {
  const frame = useCurrentFrame();

  const heroOpacity = interpolate(
    frame,
    [CROSSFADE_START, CROSSFADE_START + CROSSFADE_DUR],
    [1, 0],
    { easing: Easing.inOut(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const readingOpacity = interpolate(
    frame,
    [CROSSFADE_START, CROSSFADE_START + CROSSFADE_DUR],
    [0, 1],
    { easing: Easing.inOut(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: heroOpacity }}>
        <ScreenshotBG src="screenshots/live/hero_2x.jpg" />
        <TypedText
          text="github.com/goyalnishtha841/tradepilot"
          x={650}
          y={777}
          start={55}
          fontSize={22}
          fadeOutStart={170}
        />
        <HighlightRing x={1237} y={777} w={190} h={64} start={100} end={185} />
        <Cursor
          waypoints={[
            { frame: 10, x: 1500, y: 300 },
            { frame: 45, x: 800, y: 777 },
            { frame: 55, x: 800, y: 777 },
            { frame: 130, x: 1237, y: 777 },
            { frame: 150, x: 1237, y: 777 },
          ]}
          clicks={[152]}
          holdAfter={14}
        />
        <LowerCaption
          kicker="Start a viva"
          text="Paste any public GitHub repo — this one's a live trading-tools project."
          start={25}
          end={185}
        />
      </AbsoluteFill>

      <AbsoluteFill style={{ opacity: readingOpacity }}>
        <ScreenshotBG src="screenshots/live/reading_2x.jpg" />
        <LowerCaption
          kicker="Live, narrated"
          text="The moderator reads the repo and plans the panel — every step streams to the screen."
          start={CROSSFADE_START + 15}
          end={400}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
