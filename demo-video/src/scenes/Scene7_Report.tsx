import { AbsoluteFill } from 'remotion';
import { ScreenshotBG } from '../ScreenshotBG';
import { Cursor } from '../Cursor';
import { LowerCaption } from '../Caption';
import { HighlightRing } from '../Highlight';

const TOPICS_FOCAL = { x: 763 / 1920, y: 680 / 1080 };

export const Scene7_Report: React.FC = () => {
  return (
    <AbsoluteFill>
      <ScreenshotBG
        src="screenshots/live/report_top_2x.jpg"
        focal={TOPICS_FOCAL}
        zoomFrom={1}
        zoomTo={1.45}
        zoomStart={420}
        zoomEnd={580}
      />
      <HighlightRing x={575} y={290} w={200} h={200} start={50} end={230} />
      <HighlightRing x={800} y={413} w={340} h={54} start={260} end={400} />

      <Cursor
        waypoints={[
          { frame: 15, x: 1100, y: 120 },
          { frame: 60, x: 575, y: 290 },
          { frame: 85, x: 575, y: 290 },
          { frame: 265, x: 800, y: 413 },
          { frame: 290, x: 800, y: 413 },
        ]}
        holdAfter={16}
      />

      <LowerCaption
        kicker="Viva report for tradepilot"
        text="58 / 100 — Needs work, from a real run, in front of you just now."
        start={25}
        end={225}
      />
      <LowerCaption
        kicker="Retake your weak topics"
        text="After the study plan: new questions on the topics you found hardest."
        start={245}
        end={400}
      />
      <LowerCaption
        kicker="Confidence by topic"
        text="Every weak answer is quoted back with the exact file it was about."
        start={430}
        end={580}
      />
    </AbsoluteFill>
  );
};
