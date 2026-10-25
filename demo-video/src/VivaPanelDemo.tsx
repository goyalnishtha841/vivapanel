import { useEffect, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { waitForFonts } from './fonts';
import { theme } from './theme';

import { Scene1_Hook } from './scenes/Scene1_Hook';
import { Scene2_Problem } from './scenes/Scene2_Problem';
import { Scene3_Start } from './scenes/Scene3_Start';
import { Scene4_Voice } from './scenes/Scene4_Voice';
import { Scene5_Grounded } from './scenes/Scene5_Grounded';
import { Scene6_Verify } from './scenes/Scene6_Verify';
import { Scene7_Report } from './scenes/Scene7_Report';
import { Scene8_Hiring } from './scenes/Scene8_Hiring';
import { Scene9_Stats } from './scenes/Scene9_Stats';
import { Scene10_Endcard } from './scenes/Scene10_Endcard';

const TRANSITION = 18;

const DURATIONS = [210, 240, 420, 330, 450, 780, 600, 390, 330, 300];

const useFontsReady = () => {
  const [handle] = useState(() => delayRender('Loading fonts'));
  useEffect(() => {
    waitForFonts().then(() => continueRender(handle));
  }, [handle]);
};

/** Renders the 1920x1080-authored composition at 2x density inside a 3840x2160 (4K) canvas. */
export const VivaPanelDemo: React.FC = () => {
  useFontsReady();

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <div style={{ width: 1920, height: 1080, transform: 'scale(2)', transformOrigin: 'top left' }}>
        <TransitionSeries>
          <TransitionSeries.Sequence durationInFrames={DURATIONS[0]}>
            <Scene1_Hook />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: TRANSITION })} />

          <TransitionSeries.Sequence durationInFrames={DURATIONS[1]}>
            <Scene2_Problem />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: TRANSITION })} />

          <TransitionSeries.Sequence durationInFrames={DURATIONS[2]}>
            <Scene3_Start />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: TRANSITION })} />

          <TransitionSeries.Sequence durationInFrames={DURATIONS[3]}>
            <Scene4_Voice />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: TRANSITION })} />

          <TransitionSeries.Sequence durationInFrames={DURATIONS[4]}>
            <Scene5_Grounded />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: TRANSITION })} />

          <TransitionSeries.Sequence durationInFrames={DURATIONS[5]}>
            <Scene6_Verify />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: TRANSITION })} />

          <TransitionSeries.Sequence durationInFrames={DURATIONS[6]}>
            <Scene7_Report />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: TRANSITION })} />

          <TransitionSeries.Sequence durationInFrames={DURATIONS[7]}>
            <Scene8_Hiring />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: TRANSITION })} />

          <TransitionSeries.Sequence durationInFrames={DURATIONS[8]}>
            <Scene9_Stats />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: TRANSITION })} />

          <TransitionSeries.Sequence durationInFrames={DURATIONS[9]}>
            <Scene10_Endcard />
          </TransitionSeries.Sequence>
        </TransitionSeries>
      </div>
    </AbsoluteFill>
  );
};

export const TOTAL_DURATION =
  DURATIONS.reduce((a, b) => a + b, 0) - TRANSITION * (DURATIONS.length - 1);
