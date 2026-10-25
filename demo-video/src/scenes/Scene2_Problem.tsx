import { AbsoluteFill } from 'remotion';
import { ScreenshotBG } from '../ScreenshotBG';
import { QuickLine } from '../Caption';

export const Scene2_Problem: React.FC = () => {
  return (
    <AbsoluteFill>
      <ScreenshotBG
        src="screenshots/live/hero_2x.jpg"
        focal={{ x: 0.5, y: 0.5 }}
        zoomFrom={1.04}
        zoomTo={1.09}
        zoomStart={0}
        zoomEnd={240}
        dim={0.88}
      />
      <QuickLine text="Students can hand in code they can't explain." start={0} end={76} />
      <QuickLine text="Friends and chatbots haven't read your repo." start={80} end={156} />
      <QuickLine text="A real viva happens once — with marks on the line." start={160} end={240} />
    </AbsoluteFill>
  );
};
