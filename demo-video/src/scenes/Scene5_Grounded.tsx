import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { ScreenshotBG } from '../ScreenshotBG';
import { Cursor } from '../Cursor';
import { LowerCaption } from '../Caption';
import { HighlightRing } from '../Highlight';
import { theme } from '../theme';

const CROSSFADE_START = 210;
const CROSSFADE_DUR = 20;

export const Scene5_Grounded: React.FC = () => {
  const frame = useCurrentFrame();

  const aOpacity = interpolate(
    frame,
    [CROSSFADE_START, CROSSFADE_START + CROSSFADE_DUR],
    [1, 0],
    { easing: Easing.inOut(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const bOpacity = interpolate(
    frame,
    [CROSSFADE_START, CROSSFADE_START + CROSSFADE_DUR],
    [0, 1],
    { easing: Easing.inOut(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: aOpacity }}>
        <ScreenshotBG src="screenshots/live/professor_q_2x.jpg" />
        <HighlightRing x={525} y={731} w={270} h={40} start={70} end={190} color={theme.professor} />
        <Cursor
          waypoints={[
            { frame: 15, x: 900, y: 250 },
            { frame: 65, x: 525, y: 731 },
            { frame: 130, x: 525, y: 731 },
          ]}
          holdAfter={10}
        />
        <LowerCaption
          kicker="The Professor · grounded in your code"
          text="A weak answer gets a sharper follow-up — tied to the exact file and function."
          start={25}
          end={195}
        />
      </AbsoluteFill>

      <AbsoluteFill style={{ opacity: bOpacity }}>
        <ScreenshotBG src="screenshots/live/engineer_challenge_2x.jpg" />
        <HighlightRing
          x={640}
          y={522}
          w={230}
          h={34}
          start={CROSSFADE_START + 20}
          end={430}
          color={theme.engineer}
        />
        <Cursor
          waypoints={[
            { frame: CROSSFADE_START + 25, x: 640, y: 522 },
            { frame: CROSSFADE_START + 90, x: 640, y: 522 },
          ]}
          holdAfter={10}
        />
        <LowerCaption
          kicker="Cross-examination"
          text="One shared transcript — the Engineer builds on the Professor's point instead of starting over."
          start={CROSSFADE_START + 30}
          end={440}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
