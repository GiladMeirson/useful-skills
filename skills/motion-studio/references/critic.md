# Independent reviewer

Whoever wrote the scene knows the intent and sees what they meant to do, not what is in the frame. The final review belongs to a clean-context subagent that receives only the contact sheet and the brief.

## When

After the dailies with no FIX of your own and before the full render. One round. A second round only if the first returned FIX on more than a third of the frames.

## Image budget

- One contact sheet (`out/sheet.png`), which is a single image.
- At most 4 full-size frames, only of frames the sheet left in doubt (`stills.cjs --times ... --scale 1`).
- No full render for the reviewer. Motion is judged in `qa.py --timeline` and in the half-scale draft, once.

## Request text (copy and fill in)

```
You are a reviewer of a motion design video. You have not seen the code or the script. Read the image
<path to out/sheet.png>: it is a contact sheet with the start, middle and end of each scene, in order, with the time.

Format: <16:9 | 9:16 | 1:1>. Audience: <one line>.

1. Without reading anything else, write in 3 lines what this video says, to whom, and what it asks the person to do.
2. For each frame answer PASS or FIX with the reason in one line. Look for:
   text that is cut off, overlapping, too small for a phone, or low contrast;
   empty frame or nothing legible at the start of the scene;
   two things competing for attention; nothing indicating where to look;
   scenes with the same composition (same text position, same card, same entrance);
   color outside the palette, purple gradient, generic glow, everything centered;
   last frame that doesn't close the idea.
3. Say which scene is the weakest and why.
Don't praise. Don't suggest rewriting the video: point out the defect and the frame.
```

## What to do with the response

- Compare answer 1 with the brief. If the reviewer could not retell the message from the frames alone, the video doesn't work muted: it's a FIX of the on-screen script, not the animation.
- Fix every FIX or answer in writing why it isn't a defect. Don't run another reviewer until you agree.
- The delivery states whether there was an independent review and how many FIXes it returned.
