import { AbsoluteFill } from 'remotion';
import { theme } from '../theme';
import { Eyebrow } from '../Caption';
import { StatCard, CounterTransition } from '../StatCard';

const COL_X = [160, 1140];
const ROW_Y = [300, 620];

export const Scene9_Stats: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <Eyebrow text="BUILT TO BE TRUSTED, NOT TAKEN ON FAITH" start={10} end={350} />

      <StatCard
        x={COL_X[0]}
        y={ROW_Y[0]}
        start={30}
        accent={theme.green}
        label="automated tests, CI on every push"
        value={<CounterTransition from={0} to={131} start={30} end={70} />}
      />
      <StatCard
        x={COL_X[1]}
        y={ROW_Y[0]}
        start={70}
        accent={theme.professor}
        label="real student repos — ran end to end on the live site"
        value={
          <>
            <CounterTransition from={0} to={4} start={70} end={95} /> of 4
          </>
        }
      />
      <StatCard
        x={COL_X[0]}
        y={ROW_Y[1]}
        start={110}
        accent={theme.engineer}
        label="questions cited a real file, every run"
        value={
          <>
            <CounterTransition from={0} to={12} start={110} end={140} /> / 12
          </>
        }
      />
      <StatCard
        x={COL_X[1]}
        y={ROW_Y[1]}
        start={150}
        accent={theme.junior}
        label="Groq hit its rate limit mid-session — Gemini took over, live"
        value="Zero downtime"
      />
    </AbsoluteFill>
  );
};
