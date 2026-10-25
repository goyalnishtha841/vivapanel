import { AbsoluteFill } from 'remotion';
import { ScreenshotBG } from '../ScreenshotBG';
import { Cursor } from '../Cursor';
import { LowerCaption } from '../Caption';
import { HighlightRing } from '../Highlight';

const TIP_FOCAL = { x: 590 / 1920, y: 935 / 1080 };

export const Scene4_Voice: React.FC = () => {
  return (
    <AbsoluteFill>
      <ScreenshotBG
        src="screenshots/live/tips_2x.jpg"
        focal={TIP_FOCAL}
        zoomFrom={1}
        zoomTo={1.55}
        zoomStart={190}
        zoomEnd={320}
      />
      <HighlightRing x={408} y={1012} w={70} h={34} start={40} end={160} />
      <Cursor
        waypoints={[
          { frame: 10, x: 900, y: 500 },
          { frame: 55, x: 408, y: 1012 },
          { frame: 70, x: 408, y: 1012 },
        ]}
        clicks={[72]}
        holdAfter={70}
      />
      <LowerCaption
        kicker="Voice & hands-free"
        text="Type or speak your answer — and the examiners talk back in their own voice."
        start={20}
        end={180}
      />
      <LowerCaption
        kicker="Real UI, first viva tip"
        text="Turn on the speaker to hear each examiner in their own voice, or try Hands-free."
        start={210}
        end={320}
      />
    </AbsoluteFill>
  );
};
