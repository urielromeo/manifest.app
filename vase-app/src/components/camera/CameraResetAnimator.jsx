// Animates camera reset using easing function for smooth transition

import { useThree, useFrame } from '@react-three/fiber';

const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

/**
 * CameraResetAnimator component to smoothly reset camera position and target.
 * @param {Object} props
 * @param {React.MutableRefObject<import('three/examples/jsm/controls/OrbitControls').OrbitControls>} props.controlsRef - Ref to OrbitControls instance.
 * @param {React.MutableRefObject<{
 *  fromPos: import('three').Vector3,
 *   toPos: import('three').Vector3,
 *  fromTarget: import('three').Vector3,
 *  toTarget: import('three').Vector3,
 * elapsed: number,
 * duration: number,
 * minProgressForEarlyEnd: number,
 * posEpsSq: number,
 * targetEpsSq: number
 * } | null>} props.resetRef - Ref to reset data or null if no reset is in progress.
 * @param {() => void} props.onDone - Callback invoked when reset animation completes.
 */

export default function CameraResetAnimator({ controlsRef, resetRef, onDone }) {
  const { camera } = useThree();
  useFrame((_, delta) => {
    const data = resetRef.current;
    if (!data) return;
    data.elapsed += delta;
    const t = Math.min(data.elapsed / data.duration, 1);
    const k = easeOutCubic(t);
    camera.position.lerpVectors(data.fromPos, data.toPos, k);
    controlsRef.current.target.lerpVectors(data.fromTarget, data.toTarget, k);
    controlsRef.current.update();
    if (
      t >= 1 ||
      (t >= data.minProgressForEarlyEnd &&
        camera.position.distanceToSquared(data.toPos) <= data.posEpsSq &&
        controlsRef.current.target.distanceToSquared(data.toTarget) <= data.targetEpsSq)
    ) {
      camera.position.copy(data.toPos);
      controlsRef.current.target.copy(data.toTarget);
      controlsRef.current.update();
      resetRef.current = null;
      onDone();
    }
  });
  return null;
}