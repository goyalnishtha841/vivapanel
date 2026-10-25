import { Composition } from 'remotion';
import { VivaPanelDemo, TOTAL_DURATION } from './VivaPanelDemo';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="VivaPanelDemo"
        component={VivaPanelDemo}
        durationInFrames={TOTAL_DURATION}
        fps={30}
        width={3840}
        height={2160}
      />
    </>
  );
};
