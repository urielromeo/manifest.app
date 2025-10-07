import React from "react";
import { Billboard, Center, Text3D } from "@react-three/drei";
import helvetikerUrl from "three/examples/fonts/helvetiker_regular.typeface.json?url";

/**
 * FloatingTitle3D
 * Props:
 *  - title: string (if empty/whitespace -> renders null)
 *  - position: [x,y,z] (default [0,-8,0])
 *  - size: number (Text3D size prop, default 3)
 *  - thickness: number (extrusion depth -> Text3D "height" prop, default 0.3)
 *  - color: material color (optional, default #333333)
 */
// Raised default Y from -8 to -6.5 so text sits a bit higher relative to vase.
export default function FloatingTitle3D({ title, position = [0, -3.5, 0], size = 3, thickness = 0.3, color = "#333333" }) {
  if (!title || title.trim() === "") return null;

  return (
    <Billboard position={position} follow lockX lockZ>
      <Center>
        <Text3D
          font={helvetikerUrl}
          size={size}
          height={thickness}
          castShadow
          receiveShadow
        >
          {title}
          <meshStandardMaterial color={color} />
        </Text3D>
      </Center>
    </Billboard>
  );
}
