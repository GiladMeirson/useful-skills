# Techniques: frame by frame, cel animation, stop motion, rigging and lip sync

## Frame by frame

- Drawing sequence: one SVG or PNG per pose in `public/frames/`; swap per frame with `stepped(frame, 2)` (animation on twos) and `staticFile(\`frames/${String(i).padStart(3, '0')}.png\`)`.
- Sprite sheet: one PNG with N frames; show it with `overflow: hidden` and `translateX(-i * width)`.
- Exposure sheet: keep an `xsheet.json` table `[{frame, pose, visema}]` when there's dialogue; it's the source for the frame-by-frame and the lip sync.
- Inbetweens: between two SVG key poses with the same points, interpolate the attributes; with different points, use `morphPath`.

## Cel animation (traditional animation look)

- Animate on twos (`stepped(frame, 2)`) or threes for characters; keep camera and backgrounds continuous.
- Line boil: `<BoilFilter id="boil" hold={2} scale={3.5} />` in `<defs>` and `filter="url(#boil)"` on the stroke group.
- Flat colors with shadow as a darker-tone layer and a 4 to 8 px outline; no gradient.
- Smear frame: in very fast moves, one frame stretched in the direction of motion replaces motion blur.
- Holds of 6 to 12 frames on key poses so the eye can read the pose.

## Stop motion

- Stepped timing: `stepped(frame, 2)` or `stepped(frame, 3)` on everything, camera included.
- Controlled imperfection: `jitter(seed, frame, 2, 1.5)` on position and `jitter(seed, frame, 2, 0.6)` on rotation; never more than 2 px.
- Physical texture: real photos of paper or clay as background, contact shadow under each object, slight light flicker (vignette opacity varying per step).
- With real photos of objects: photograph each pose, name them in order and treat them as frame by frame on twos.

## 2D rigging

- Hierarchy: each bone is a `<g transform="translate(pivot) rotate(angle)">` inside its parent; the pivot sits at the joint.
- FK: `forwardKinematics(root, lengths, angles)` for poses and cycles (walk, wave).
- Two-bone IK: `twoBoneIK(shoulder, target, l1, l2, bend)` for arm and leg; animate only the target.
- Chains (tail, tentacle, rope): `fabrik(restPose, target)`; pass the rest pose every frame to keep the render deterministic.
- Secondary motion: loose parts follow the parent with a 2 to 4 frame delay (`spring` on the parent's angle with `frame - delay`).
- Ready-made character: Lottie (`@remotion/lottie`) or Rive; with Rive, advance the state per frame (time = frame / fps), never by the clock.

## Lip sync

- Kokoro returns timed phonemes: `narration.words.json` includes `ph` (each word's phonemes). For per-phoneme timings, call `create_timed` directly.
- `visemeFor(phoneme)` maps to 9 mouths: rest, A, E, I, O, U, MBP, FV, L. Draw the 9 mouths and swap per frame, on twos.
- Close the mouth (MBP) 1 frame before labial consonants and hold long vowels.

## 3D rigging

- GLTF with SkinnedMesh in `@remotion/three`: load with `useGLTF` inside `delayRender`, create an `AnimationMixer` and call `mixer.setTime(frame / fps)` every frame. Never use `mixer.update(delta)`.
- 3D IK: `CCDIKSolver` from three/examples, recomputed every frame from the rest pose.
