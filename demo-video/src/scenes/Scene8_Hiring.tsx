import { AbsoluteFill } from 'remotion';
import { ScreenshotBG } from '../ScreenshotBG';
import { Cursor } from '../Cursor';
import { LowerCaption } from '../Caption';
import { HighlightRing } from '../Highlight';

const DISCLAIMER_FOCAL = { x: 998 / 1920, y: 1025 / 1080 };

export const Scene8_Hiring: React.FC = () => {
  return (
    <AbsoluteFill>
      <ScreenshotBG
        src="screenshots/live/recruiters_2x.jpg"
        focal={DISCLAIMER_FOCAL}
        zoomFrom={1}
        zoomTo={1.4}
        zoomStart={230}
        zoomEnd={360}
      />
      <HighlightRing x={759} y={878} w={190} h={56} start={160} end={225} />

      <Cursor
        waypoints={[
          { frame: 12, x: 1200, y: 150 },
          { frame: 60, x: 998, y: 533 },
          { frame: 80, x: 998, y: 533 },
          { frame: 150, x: 759, y: 878 },
          { frame: 168, x: 759, y: 878 },
        ]}
        clicks={[170]}
        holdAfter={14}
      />

      <LowerCaption
        kicker="For recruiters and placement cells"
        text="The same panel, role-weighted — and it checks the candidate's claims the same way."
        start={25}
        end={225}
      />
      <LowerCaption
        kicker="One signal, not a decision"
        text="The result is one signal for a person to review, not a hiring decision."
        start={250}
        end={355}
      />
    </AbsoluteFill>
  );
};
