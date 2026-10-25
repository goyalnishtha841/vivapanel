import { AbsoluteFill } from 'remotion';
import { ScreenshotBG } from '../ScreenshotBG';
import { HookCaption } from '../Caption';

export const Scene1_Hook: React.FC = () => {
  return (
    <AbsoluteFill>
      <ScreenshotBG
        src="screenshots/live/hero_2x.jpg"
        focal={{ x: 0.5, y: 0.45 }}
        zoomFrom={1.0}
        zoomTo={1.06}
        zoomStart={0}
        zoomEnd={210}
        dim={0.8}
      />
      <HookCaption
        lines={['Can you defend', 'your own code?']}
        accentLine={1}
        start={4}
        end={200}
        fontSize={100}
      />
    </AbsoluteFill>
  );
};
