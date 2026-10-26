# Techniques: 3D motion, compositing, motion tracking, match moving and rotoscoping

## 3D motion (`@remotion/three`)

```tsx
<ThreeCanvas width={width} height={height} camera={{fov: 40, position: [0, 0, 6]}}>
  <ambientLight intensity={0.6} /><directionalLight position={[3, 4, 5]} />
  <mesh rotation={[0, frame * 0.02, 0]}><torusKnotGeometry args={[1, 0.3, 160, 24]} /><meshStandardMaterial color="#FFB547" /></mesh>
</ThreeCanvas>
```
- Everything driven by the frame; `useFrame()` is forbidden. Animate the camera with `tween`/`keys` on position and `lookAt`.
- Cel look in 3D: `meshToonMaterial` with a 3-tone `gradientMap` and an inverted-hull outline (mesh scaled 1.03 with black `side: BackSide`).
- Rendering without a GPU: if WebGL fails, use `--gl=swangle` (or `angle` on a machine with a GPU). 3D on CPU is slow: test with `--frames=0-30` first.
- Assets: GLTF/GLB in `public/`, loaded with `delayRender`/`continueRender`.

## Compositing

- Layers: background, midground, subject, text, effects. Each layer is an `AbsoluteFill`.
- Blend modes: `mixBlendMode: 'screen'` for light and glow, `multiply` for shadow and paper texture, `overlay` for grain.
- Masks: `clipPath`, `mask-image` with a gradient, or SVG `<mask>`; text behind the subject uses the mask from `roto.py`.
- Chroma key: preprocess with ffmpeg (`chromakey=0x00FF00:0.12:0.08,despill=green`) into WebM with alpha (`-c:v libvpx-vp9 -pix_fmt yuva420p`) and use `<OffthreadVideo transparent>`.
- Integration: grain (`<Grain>`) on top of everything, light vignette, light wrap (blur of the background light bleeding 4 to 8 px onto the subject's edge with `screen`), contact shadow.
- Video as a layer: `<OffthreadVideo src={staticFile('footage.mp4')} />`. Output with alpha: `--codec=prores --prores-profile=4444` or WebM VP9.

## Motion tracking

```bash
uv run <skill>/scripts/track.py footage.mp4 --point 812,430 -o public/track/logo.json --smooth 5
```
```tsx
import track from '../public/track/logo.json';
<Tracked track={track} offset={{x: 0, y: -80}}><Label /></Tracked>
```
- KLT (Lucas-Kanade) on corners detected around the point; re-detects points when they disappear. Good for logos, faces, textured objects.
- Pick a point with texture and contrast; smooth surfaces don't track.
- Smooth (`--smooth`) for overlays; don't smooth when the element must stick to the pixel.

### Face and hand (graphics attached to the body)

```bash
uv run <skill>/scripts/track.py footage.mp4 --face -o public/track/rosto.json --smooth 5
uv run --with mediapipe <skill>/scripts/track.py footage.mp4 --hand -o public/track/mao.json --smooth 3
```
- `--face` (YuNet, OpenCV only) returns per frame the face's center, width, height and `roll`. Good for a crown, hat, badge above the head, label next to the face. An `x,y` after the flag picks the face closest to the point.
- `--hand` (MediaPipe) returns the palm center, size, angle, index fingertip, thumb tip and `pinch`. Good for an object in the palm and for "grabbing" an element between the fingers (position midway between the two tips).
- Frames without detection come with `"found": false` and an interpolated value: hide the element on those frames or accept the jump, don't fake tracking.
- A face in profile or looking down isn't detected (measured: a person seen from the side, using a phone, had no detection on any frame). For that case use `--point` on the hair, starting on a frame where the person is already in frame.
- Handheld phone footage: draw everything in the footage's coordinate system (a container its size, scaled to the composition) so tracking, camera and graphics use the same numbers.
- 3D attached to the hand: `ThreeCanvas` with an orthographic camera (`orthographic camera={{zoom: 1, position: [0, 0, 1000]}}`), one unit equal to one px. The object's position is the tracked point converted to the screen. The canvas `camera` prop doesn't react per frame: move the group, not the camera.

## Match moving

- Plane (phone screen, sign, wall): `track.py --quad x0,y0,x1,y1,x2,y2,x3,y3` (TL, TR, BR, BL) and `<CornerPin track width height>` to stick the UI onto the plane with correct perspective.
- 3D camera from the plane: `matchmove.py public/track/screen.json --plane 0.07x0.15 --fov 60 --size 1920x1080` generates position and quaternion per frame for the Three.js camera; 3D objects stay attached to the plane (z = 0).
- Scene without a dominant plane: solve the camera in Blender (Movie Clip Editor, libmv) or COLMAP and export to JSON; it's the same per-frame camera structure.
- Validate with `matchmove.py --selftest` and with the contact sheet: the corners must land on the real corners at start, middle and end.

## Rotoscoping

```bash
uv run <skill>/scripts/roto.py footage.mp4 --backend rembg -o public/roto --svg
```
- `rembg`: prominent person or object, downloads the model from GitHub, about 1 to 3 fps on CPU.
- `mog2`: fixed camera, separates what moves from the background. `chroma`: solid-color background.
- `--model u2net_human_seg` cuts out people better than the general model. `--start` and `--end` (seconds) limit the range; files keep the original frame number.
- Text behind the subject: footage, then the text, then the cutout PNG on top (`<Img src={staticFile(`roto/frame_${n}.png`)} />`). Measured at 464x832 on CPU: about 1 frame per second.
- Outputs: PNG with alpha per frame (`<Img src={staticFile(\`roto/frame_${i}.png\`)} />`) and `contours.json` with SVG paths per frame for stylized roto (drawn stroke, flat fill, on twos).
- Cinema quality (hair, fast motion): SAM 2 or MatAnyone on GPU; the output format is the same.
