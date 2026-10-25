import { Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';

type ScreenshotBGProps = {
  src: string;
  /** Focal point as a fraction (0-1) of the displayed (cover-fit) image; zoom converges here. */
  focal?: { x: number; y: number };
  zoomFrom?: number;
  zoomTo?: number;
  zoomStart?: number;
  zoomEnd?: number;
  dim?: number;
};

/** A full-bleed, cover-fit product screenshot with an optional Ken Burns push toward a focal point. */
export const ScreenshotBG: React.FC<ScreenshotBGProps> = ({
  src,
  focal = { x: 0.5, y: 0.5 },
  zoomFrom = 1,
  zoomTo = 1,
  zoomStart = 0,
  zoomEnd = 1,
  dim = 0,
}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [zoomStart, zoomEnd], [zoomFrom, zoomTo], {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', backgroundColor: '#07070d' }}>
      <Img
        src={staticFile(src)}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transformOrigin: `${focal.x * 100}% ${focal.y * 100}%`,
          transform: `scale(${scale})`,
        }}
      />
      {dim > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: `rgba(4,4,8,${dim})`,
          }}
        />
      )}
    </div>
  );
};
