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
 *  - glass: boolean (if true, uses a glassy MeshPhysicalMaterial with transmission)
 *  - glassProps: optional overrides for the glass material (ior, transmission, roughness, thickness, attenuationColor, attenuationDistance)
 */
// Raised default Y from -8 to -6.5 so text sits a bit higher relative to vase.
export default function FloatingTitle3D({
  title,
  position = [0, -3.5, 0],
  size = 3,
  thickness = 0.3,
  color = "#333333",
  glass = false,
  glassProps = {}
}) {
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
          {glass ? (
            // Glassy, refractive material. For best results, ensure there's an Environment in the scene.
            <meshPhysicalMaterial
              color={color}
              transmission={glassProps.transmission ?? 1}
              // Small material thickness gives refraction depth; separate from Text3D extrude height
              thickness={glassProps.thickness ?? 0.4}
              roughness={glassProps.roughness ?? 0.05}
              metalness={glassProps.metalness ?? 0}
              ior={glassProps.ior ?? 1.5}
              clearcoat={glassProps.clearcoat ?? 0.3}
              clearcoatRoughness={glassProps.clearcoatRoughness ?? 0.15}
              attenuationColor={glassProps.attenuationColor ?? color}
              attenuationDistance={glassProps.attenuationDistance ?? 2.5}
              // envMapIntensity controls reflections strength from the Environment
              envMapIntensity={glassProps.envMapIntensity ?? 1}
            />
          ) : (
            <meshStandardMaterial color={color} />
          )}
        </Text3D>
      </Center>
    </Billboard>
  );
}
