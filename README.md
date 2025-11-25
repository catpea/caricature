# caricature 📺

**Audio-driven talking head animator with Max Headroom glitchy aesthetic**

Based on npm's sardonic but evolved with audio-synchronized mouth animation

> "M-M-M-caricature reporting for d-d-duty!"

## The Philosophy

[![Caricature preview](caricature.avif)](https://raw.githubusercontent.com/catpea/caricature/main/caricature.mp4)

Max Headroom was **groundbreaking**. In 1985, that stuttering, glitching, rotating talking head was like nothing else on television. The genius wasn't just the character—it was the **chaos**:

- Random rotation angles
- Unpredictable movements
- Visual noise and distortion
- That VHS aesthetic
- The feeling that reality was breaking down

**Nobody has ever beaten Max Headroom.** All we can do is pay homage.

caricature brings that aesthetic to your audio content with **real synchronization**. A talking head that opens its mouth to your audio, with random variation in the open frames—combining the precision of lip-sync with Max Headroom's beautiful chaos.

## What It Does

Takes character frames (closed and open mouth expressions) and creates an audio-synchronized talking head animation by:

1. **Audio Analysis**: Analyzes loudness using FFmpeg's spectral filters
2. **Smart Mouth Control**: Opens mouth when audio exceeds threshold
3. **Random Open Frames**: When mouth opens, picks randomly from multiple frames
4. **Random Rotation**: Rotates ±15° (configurable) for that Max Headroom feel
5. **Glitch Effects**: Scanlines, noise, chromatic aberration
6. **Corner Overlay**: Places in video corner with alpha transparency

The result: **A character that actually talks to your audio**, with natural variation from random frame selection.

## Quick Start

```bash
# Create audio-synchronized talking head
caricature --audio narration.mp3

# Use different character with custom threshold
caricature --audio speech.mp4 --character character2 --threshold -40

# Full glitch chaos
caricature --audio podcast.wav --glitch 3 --rotation 30 --threshold -45

# Overlay on existing video
caricature -a audio.mp3 -o talking.mp4
caricature -O background.mp4 -o final.mp4
```

## Installation

Requires:
- Node.js
- ffmpeg (with lavfi support)
- ffprobe
- ImageMagick (for rotation)

```bash
npm install -g caricature
# or
npx caricature --audio your-audio.mp3
```

## Usage

### Basic Audio-Driven Animation

```bash
caricature \
  --audio narration.mp3 \
  --character character1 \
  --size 320 \
  --glitch 2
```

### Custom Threshold for Sensitivity

```bash
# More sensitive (mouth opens more often)
caricature --audio quiet-speech.mp3 --threshold -40

# Less sensitive (only loud sounds trigger)
caricature --audio loud-music.mp3 --threshold -30
```

### Overlay on Video

```bash
# Two-step process
caricature --audio speech.mp3 -o talking.mp4
caricature --overlay background.mp4 -o final.mp4
```

## Command Line Options

### Required
- `-a, --audio <file>` - Audio or video file to synchronize with

### Basic Options
- `-c, --character <name>` - Character name (default: `character1`)
- `-D, --dir <path>` - Directory with frames (default: `samples/`)
- `-t, --threshold <dB>` - Loudness threshold for mouth open (default: -35)
- `-s, --size <pixels>` - Output size, square (default: 320)
- `-r, --rotation <deg>` - Max rotation angle (default: 15)
- `-g, --glitch <0-3>` - Glitch level (default: 1)
- `-o, --output <file>` - Output filename (default: caricature.mp4)

### Overlay Options
- `-O, --overlay <video>` - Input video to overlay on
- `-p, --position <pos>` - Position: `bottom-right`, `bottom-left`, `top-right`, `top-left`
- `-m, --margin <pixels>` - Margin from edges (default: 20)

## Glitch Levels

**Level 0: Clean**
- No effects
- Just rotation and timing
- Good for professional contexts

**Level 1: Classic (Default)**
- Scanlines (the Max Headroom signature)
- Subtle but recognizable
- Perfect balance

**Level 2: Medium Chaos**
- Scanlines
- Temporal noise
- VHS feel

**Level 3: MAXIMUM CHAOS**
- Scanlines
- Heavy noise
- Chromatic aberration
- Full 1980s video breakdown

## Character Setup

caricature requires characters with **closed** and **open** mouth frames. This is the naming convention:

```
character1-closed1.jpg    # Closed mouth (required)
character1-closed2.jpg    # Additional closed (optional)
character1-open1.jpg      # Open mouth (required)
character1-open2.jpg      # More open variations (optional)
character1-open3.jpg      # Even more! (optional)
```

**The Magic**: When audio is loud, caricature randomly picks from your open frames. This creates **natural variation** - the same speaking pattern never looks identical twice!

## The Midjourney Workflow

This is where it gets powerful. Here's the strategy:

### 1. Generate Base Character

```
sunglasses cat portrait, 80s aesthetic, neon colors,
pixelated background, VHS quality, Max Headroom style,
mouth closed, front facing
--ar 1:1 --stylize 750
```

### 2. Generate Mouth Variations (using Character Reference)

```
[paste image URL] --cref [character URL] --cw 100

Required:
- mouth closed (neutral expression)
- mouth open (speaking)

Optional variations for randomness:
- mouth wide open
- mouth slightly open
- mouth open with teeth
- mouth open at angle
```

### 3. Generate Additional Glitch Frames (optional)

```
[paste image URL] VHS distortion, signal interference,
scan lines, color bleeding, tracking errors --cref [character URL]
```

### 4. Name Your Files

```bash
# Critical: Follow the naming convention!
character1-closed1.jpg     # Main closed mouth
character1-open1.jpg       # Main open mouth
character1-open2.jpg       # Variation 1
character1-open3.jpg       # Variation 2
```

### 5. Run caricature

```bash
caricature --audio narration.mp3 \
  --character character1 \
  --threshold -35 \
  --glitch 2 \
  --rotation 20
```

The magic: **Audio analysis + random open frames + random rotation = natural talking**

## How Audio Synchronization Works

### The Technical Magic

1. **FFmpeg extracts loudness** using the `astats` filter:
   ```bash
   ffprobe -f lavfi -i "amovie=file.mp3,astats=metadata=1:reset=1"
   ```

2. **Each frame gets a loudness value** in dB (typically -60 dB to 0 dB)

3. **Threshold determines mouth state**:
   - Loudness > threshold → Pick random **open** frame
   - Loudness ≤ threshold → Use **closed** frame

4. **Random selection preserves chaos**: Even at same loudness level, different open frames are chosen

### Threshold Tuning Guide

```bash
-45 dB  # Very sensitive - mouth opens for whispers
-40 dB  # Sensitive - good for quiet speech
-35 dB  # Default - balanced for normal speech
-30 dB  # Less sensitive - only moderate sounds trigger
-25 dB  # Very insensitive - only loud sounds trigger
```

**Pro tip**: Analyze your audio first:
```bash
ffprobe -f lavfi -i "amovie=your-file.mp3,astats=1" \
  -show_entries frame_tags=lavfi.astats.Overall.RMS_level
```

Look at the dB values and set threshold slightly below average speech level.

## Why This Works

The human brain is **incredible** at pattern recognition. When we see:

1. A mouth opening when audio plays
2. Random variation in how the mouth opens
3. Slight rotation adding natural head movement
4. Glitch effects adding retro chaos

We perceive: **"This character is actually talking!"**

The key insight: **Perfect sync would look robotic**. By randomly selecting from multiple open mouth frames, we get:
- Natural variation (like real speech)
- Unpredictability (like Max Headroom)
- Character (no two moments look identical)

Add scanlines and glitch? **"This character is from 1985!"**

It's the same principle that made Max Headroom work. The **chaos approximates life**, but now with **actual audio synchronization**.

## Technical Details

### How Rotation Works

Uses ImageMagick to rotate each frame around its center:

```bash
convert input.jpg \
  -resize 320x320^ \
  -gravity center \
  -extent 320x320 \
  -background none \
  -rotate 12.5 \
  -extent 320x320 \
  output.png
```

The double extent ensures the rotated image stays centered and doesn't get cropped.

### How Glitches Work

**Scanlines (Level 1+):**
```
geq='r=r(X,Y):g=g(X,Y):b=b(X,Y):a=if(not(mod(Y\,3)),255,a(X,Y))'
```
Makes every 3rd line more opaque.

**Noise (Level 2+):**
```
noise=alls=10:allf=t+u
```
Temporal noise that varies per frame.

**Chromatic Aberration (Level 3):**
```
split, offset red/green channels, overlay
```
Simulates lens distortion.

### How Overlay Works

ffmpeg's overlay filter with alpha channel:

```
[1:v]format=yuva420p[overlay];
[0:v][overlay]overlay=x:y:shortest=1
```

Positions calculated dynamically based on video size.

## Creative Tips

### Syncing to Narration

For best results:
1. Generate caricature to match narration length
2. Edit your narration with clear phrases
3. The random cuts will naturally sync to speech patterns
4. Works surprisingly well without explicit timing!

### Multiple Characters

```bash
# Generate separate headrooms for different speakers
caricature --frames "host*.jpg" -o host.mp4
caricature --frames "guest*.jpg" -o guest.mp4

# Overlay both (requires manual ffmpeg)
ffmpeg -i video.mp4 -i host.mp4 -i guest.mp4 \
  -filter_complex "[0:v][1:v]overlay=W-w-20:H-h-20[tmp];[tmp][2:v]overlay=20:H-h-20" \
  output.mp4
```

### Match Your Aesthetic

**Corporate/Professional:**
- `--glitch 0` - No effects
- `--rotation 5` - Subtle movement
- Clean frames, neutral expressions

**Retro/Fun:**
- `--glitch 2` - Medium chaos
- `--rotation 15` - Default energy
- Neon colors, sunglasses

**Experimental/Art:**
- `--glitch 3` - Maximum chaos
- `--rotation 45` - Wild rotation
- Include glitch frames, distorted expressions

### Frame Count Sweet Spot

- **2-3 frames**: Minimal, clean cuts
- **4-6 frames**: Good variety (recommended)
- **8-12 frames**: Lots of expression
- **15+ frames**: May become too chaotic

More frames = more unique moments = more apparent "talking"

## Examples

### Example 1: Educational Video

```bash
# Create frames:
# professor-closed1.jpg (mouth closed, explaining pose)
# professor-open1.jpg (mouth open, animated)
# professor-open2.jpg (mouth wider, emphasis)
# professor-open3.jpg (mouth open, different angle)

caricature \
  --audio lecture.mp3 \
  --character professor \
  --threshold -35 \
  --glitch 1 \
  --rotation 10 \
  --size 320 \
  -o talking-prof.mp4

# Overlay on slides
caricature -O lecture-slides.mp4 -p top-right -o final-lecture.mp4
```

### Example 2: Podcast

```bash
# Create frames with expressive mouth positions
# host-closed1.jpg, host-closed2.jpg
# host-open1.jpg, host-open2.jpg, host-open3.jpg

caricature \
  --audio podcast-episode.mp3 \
  --character host \
  --threshold -38 \
  --glitch 2 \
  --rotation 15 \
  --size 400 \
  -o podcast-visual.mp4
```

### Example 3: YouTube Voiceover

```bash
# Sensitive threshold for dynamic narration
caricature \
  --audio narration.mp3 \
  --character narrator \
  --threshold -40 \
  --glitch 1 \
  --size 256 \
  -o narrator.mp4

# Overlay on main video
caricature -O main-video.mp4 -p bottom-right -m 30 -o final-video.mp4
```

### Example 4: Multiple Characters

```bash
# Create character1 (host)
caricature -a host-audio.mp3 -c character1 -t -35 -o host.mp4

# Create character2 (guest)
caricature -a guest-audio.mp3 -c character2 -t -37 -o guest.mp4

# Combine with ffmpeg (both corners)
ffmpeg -i video.mp4 -i host.mp4 -i guest.mp4 \
  -filter_complex "[0:v][1:v]overlay=W-w-20:H-h-20[tmp];[tmp][2:v]overlay=20:H-h-20" \
  -c:a copy final.mp4
```

## From Sardonic to Caricature

caricature evolved from **sardonic**, which used pure random frame selection. The key improvements:

### What Changed
- **Audio synchronization** via FFmpeg's loudness analysis
- **Smart mouth control** based on audio threshold
- **Character naming convention** for open/closed mouth frames
- **Preserved randomness** through multi-frame selection

### What Stayed the Same
- Max Headroom aesthetic and philosophy
- Random rotation for natural head movement
- Glitch effects (scanlines, noise, chromatic aberration)
- No 3rd party npm dependencies

### Why Audio Matters

The original sardonic was beautiful chaos—random frames that your brain interpreted as talking. But with **actual audio synchronization**:
- Mouth opens **when** sound happens
- Closed during silence
- Random open frames preserve the chaotic variety
- Result: More convincing, still unpredictable

It's the best of both worlds: **precision meets chaos**.

## Advanced: Custom Effects

The code is designed to be hackable. Want more effects?

### Adjust Threshold Dynamically

```javascript
// In generateAudioSequence(), vary threshold over time
const dynamicThreshold = this.loudnessThreshold + Math.sin(time) * 5;
const isMouthOpen = closestSample.loudness > dynamicThreshold;
```

### Add Frame Stuttering

```javascript
// In generateAudioSequence(), occasionally repeat frames
if (Math.random() > 0.9) {
  sequence.push({
    ...sequence[sequence.length - 1],
    duration: 0.05
  });
}
```

### Add Random Zoom

In `createRotatedFrame()`:

```javascript
const zoom = 100 + (Math.random() * 20 - 10); // 90-110%
args.push('-resize', `${zoom}%`);
```

## The Max Headroom Legacy

Max Headroom (1985-1987) wasn't just a character. It was a statement about media, reality, and the future.

**What made Max special:**
- Artificial but relatable
- Glitchy but coherent
- Chaotic but intentional
- Funny but unsettling

caricature captures that spirit in miniature. A small chaos agent in your video corner, reminding viewers that **media is constructed**, **reality is malleable**, and **cats in sunglasses are timeless**.

## Troubleshooting

**"No frames found"**
- Check your `--frames` pattern
- Make sure files exist in current directory
- Try absolute path: `--dir /full/path/to/frames`

**"ImageMagick failed"**
- Install ImageMagick: `apt install imagemagick` or `brew install imagemagick`
- Check image files aren't corrupted

**"Overlay looks wrong"**
- Ensure input video and headroom have compatible durations
- Try different positions: `--position bottom-left`
- Adjust margin: `--margin 50`

**"Not glitchy enough"**
- Increase glitch level: `--glitch 3`
- Increase rotation: `--rotation 30`
- Add more distorted frames to your image set

**"Too glitchy"**
- Decrease glitch level: `--glitch 0` or `--glitch 1`
- Decrease rotation: `--rotation 5`
- Use cleaner source images
