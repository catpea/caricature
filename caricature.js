#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CARICATURE
 * Audio-driven talking head animation with loudness-based mouth movement
 * Features: Audio synchronization, random open frames, rotation, glitch effects
 */

class Caricature {
  constructor(options = {}) {
    this.framePattern = options.framePattern || 'character*.jpg';
    this.frameDir = options.frameDir || './samples';
    this.audioInput = options.audio || null;
    this.outputFile = options.output || 'caricature.mp4';
    this.size = options.size || 320;
    this.totalDuration = options.duration || 15;
    this.frameDuration = options.frameDuration || 0.04; // 25fps = 0.04s per frame
    this.maxRotation = options.maxRotation !== undefined ? options.maxRotation : 0; // degrees (0 = no rotation)
    this.glitchLevel = options.glitchLevel || 0; // 0-3
    this.loudnessThreshold = options.loudnessThreshold || -35; // dB threshold
    this.characterName = options.character || 'character1'; // which character to use
    this.frames = [];
    this.closedFrames = [];
    this.openFrames = [];
  }

  /**
   * Find and categorize frame files (closed vs open mouth)
   */
  findFrames() {
    try {
      // Find all frames for the specified character
      const pattern = path.join(this.frameDir, `${this.characterName}-*.jpg`);
      const output = execSync(`ls -1 ${pattern} 2>/dev/null || true`, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024
      });

      const files = output
        .trim()
        .split('\n')
        .filter(f => f.length > 0)
        .sort();

      if (files.length === 0) {
        throw new Error(`No frames found for character: ${this.characterName}`);
      }

      // Categorize frames into closed and open
      for (const file of files) {
        const basename = path.basename(file);
        if (basename.includes('-closed')) {
          this.closedFrames.push(file);
        } else if (basename.includes('-open')) {
          this.openFrames.push(file);
        }
      }

      if (this.closedFrames.length === 0) {
        throw new Error(`No closed mouth frames found for: ${this.characterName}`);
      }

      if (this.openFrames.length === 0) {
        throw new Error(`No open mouth frames found for: ${this.characterName}`);
      }

      this.frames = files;
      return { closed: this.closedFrames, open: this.openFrames };
    } catch (error) {
      throw new Error(`Error finding frames: ${error.message}`);
    }
  }

  /**
   * Extract loudness data from audio using ffmpeg (more reliable than lavfi)
   */
  async extractLoudnessData() {
    if (!this.audioInput) {
      throw new Error('No audio input specified');
    }

    console.log('🎵 Analyzing audio loudness...\n');

    // First, check if the audio file exists
    if (!fs.existsSync(this.audioInput)) {
      throw new Error(`Audio file not found: ${this.audioInput}`);
    }

    // First, get actual audio duration and store it for later use
    try {
      const probeOutput = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${this.audioInput}"`,
        { encoding: 'utf-8' }
      );
      this.audioDuration = parseFloat(probeOutput.trim());
      console.log(`  Duration: ${this.audioDuration.toFixed(2)}s`);
    } catch (e) {
      throw new Error('Could not detect audio duration');
    }

    // Use ebur128 filter - output to file to avoid buffer issues
    console.log(`  Extracting loudness data using ebur128 filter...`);

    const tempFile = '/tmp/caricature-ebur128.log';

    try {
      // Run ffmpeg and capture output to file
      execSync(
        `ffmpeg -i "${this.audioInput}" -af ebur128 -f null - 2> "${tempFile}"`,
        { maxBuffer: 50 * 1024 * 1024 }
      );
    } catch (e) {
      // ffmpeg returns non-zero for null output, which is expected
    }

    // Read and parse the log file
    const logContent = fs.readFileSync(tempFile, 'utf-8');
    const lines = logContent.split('\n');
    const loudnessData = [];

    for (const line of lines) {
      // Format: [Parsed_ebur128_0 @ ...] t: 0.199977   TARGET:-23 LUFS    M:-120.7 S:-120.7 ...
      const timeMatch = line.match(/t:\s+([\d.]+)/);
      const loudMatch = line.match(/M:\s*([-\d.]+)/);

      if (timeMatch && loudMatch) {
        const time = parseFloat(timeMatch[1]);
        const loudness = parseFloat(loudMatch[1]);
        if (!isNaN(time) && !isNaN(loudness)) {
          loudnessData.push({ time, loudness });
        }
      }
    }

    // Cleanup
    try {
      fs.unlinkSync(tempFile);
    } catch (e) {}

    if (loudnessData.length === 0) {
      throw new Error('No loudness data extracted from ebur128 filter');
    }

    console.log(` ✓`);
    console.log(`✓ Analyzed ${loudnessData.length} audio samples`);
    console.log(`  Coverage: ${loudnessData[loudnessData.length - 1].time.toFixed(2)}s`);
    console.log(`  Threshold: ${this.loudnessThreshold} dB\n`);

    return loudnessData;
  }

  /**
   * Pick a random frame from an array
   */
  pickRandomFrame(frameArray) {
    return frameArray[Math.floor(Math.random() * frameArray.length)];
  }

  /**
   * Random rotation angle
   */
  randomRotation() {
    return (Math.random() * 2 - 1) * this.maxRotation;
  }

  /**
   * Generate audio-synchronized sequence with loudness-based mouth animation
   */
  async generateAudioSequence() {
    if (!this.audioInput) {
      throw new Error('Audio input required for synchronized animation');
    }

    // Extract loudness data from audio
    const loudnessData = await this.extractLoudnessData();

    const sequence = [];
    // Use actual audio duration instead of last sample time to ensure full coverage
    const totalDuration = this.audioDuration;
    const frameRate = 25; // fps
    const frameDuration = 1 / frameRate;

    console.log('🎬 Generating audio-synchronized sequence...\n');

    // Generate sequence at constant frame rate
    for (let time = 0; time < totalDuration; time += frameDuration) {
      // Find closest loudness sample
      const closestSample = loudnessData.reduce((prev, curr) => {
        return Math.abs(curr.time - time) < Math.abs(prev.time - time) ? curr : prev;
      });

      // Determine if mouth should be open based on threshold
      const isMouthOpen = closestSample.loudness > this.loudnessThreshold;

      // Select frame: if mouth open, pick random from open frames; otherwise use closed
      let frame;
      if (isMouthOpen) {
        frame = this.pickRandomFrame(this.openFrames);
      } else {
        // Use first closed frame, or pick randomly if multiple exist
        frame = this.closedFrames.length === 1
          ? this.closedFrames[0]
          : this.pickRandomFrame(this.closedFrames);
      }

      const rotation = this.randomRotation();

      sequence.push({
        frame: frame,
        duration: frameDuration,
        rotation: rotation,
        frameName: path.basename(frame),
        time: time,
        loudness: closestSample.loudness,
        mouthOpen: isMouthOpen
      });
    }

    console.log(`✓ Generated ${sequence.length} frames`);
    const openCount = sequence.filter(s => s.mouthOpen).length;
    const closedCount = sequence.length - openCount;
    console.log(`  Open frames: ${openCount} (${(openCount/sequence.length*100).toFixed(1)}%)`);
    console.log(`  Closed frames: ${closedCount} (${(closedCount/sequence.length*100).toFixed(1)}%)\n`);

    return sequence;
  }

  /**
   * Create resized frame without rotation (for performance when rotation disabled)
   */
  async createResizedFrame(inputFrame, index) {
    const outputFrame = `/tmp/caricature-${index}.png`;

    // Just resize without rotation
    const args = [
      inputFrame,
      '-resize', `${this.size}x${this.size}^`,
      '-gravity', 'center',
      '-extent', `${this.size}x${this.size}`,
      outputFrame
    ];

    return new Promise((resolve, reject) => {
      const convert = spawn('convert', args);

      let stderr = '';

      convert.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      convert.on('close', (code) => {
        if (code === 0) {
          // Verify the file was actually created
          if (!fs.existsSync(outputFrame)) {
            reject(new Error(`Frame ${index} was not created at ${outputFrame}`));
          } else {
            resolve(outputFrame);
          }
        } else {
          reject(new Error(`ImageMagick failed for frame ${index}: ${stderr}`));
        }
      });

      convert.on('error', (err) => {
        reject(new Error(`ImageMagick spawn error for frame ${index}: ${err.message}`));
      });
    });
  }

  /**
   * Create rotated frame with effects
   */
  async createRotatedFrame(inputFrame, rotation, index) {
    const outputFrame = `/tmp/caricature-${index}.png`;

    // Build ImageMagick command with rotation and resize
    const args = [
      inputFrame,
      '-resize', `${this.size}x${this.size}^`,
      '-gravity', 'center',
      '-extent', `${this.size}x${this.size}`,
      '-background', 'none',
      '-rotate', rotation.toFixed(2),
      '-gravity', 'center',
      '-extent', `${this.size}x${this.size}`,
    ];

    // Add glitch effects based on level
    if (this.glitchLevel >= 1) {
      // Slight color shift
      args.push('-modulate', '100,110,100');
    }

    if (this.glitchLevel >= 2) {
      // Add some noise
      args.push('-attenuate', '0.3', '+noise', 'Impulse');
    }

    if (this.glitchLevel >= 3) {
      // Chromatic aberration effect
      args.push('-channel', 'R', '-evaluate', 'add', '5');
    }

    args.push(outputFrame);

    return new Promise((resolve, reject) => {
      const convert = spawn('convert', args);

      let stderr = '';

      convert.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      convert.on('close', (code) => {
        if (code === 0) {
          // Verify the file was actually created
          if (!fs.existsSync(outputFrame)) {
            reject(new Error(`Frame ${index} was not created at ${outputFrame}`));
          } else {
            resolve(outputFrame);
          }
        } else {
          reject(new Error(`ImageMagick failed for frame ${index}: ${stderr}`));
        }
      });

      convert.on('error', (err) => {
        reject(new Error(`ImageMagick spawn error for frame ${index}: ${err.message}`));
      });
    });
  }

  /**
   * Create all rotated frames (or just resize if rotation disabled)
   */
  async prepareFrames(sequence) {
    if (this.maxRotation === 0) {
      console.log('🎨 Preparing frames (rotation disabled for performance)...\n');
      console.log('  Optimizing: caching resized frames to avoid duplicates\n');

      // When rotation is disabled, we can cache resized frames since they're identical
      const frameCache = new Map();
      const preparedFrames = [];

      // First pass: identify unique frames and create them
      const uniqueFrames = new Set();
      for (const item of sequence) {
        uniqueFrames.add(item.frame);
      }

      console.log(`  Creating ${uniqueFrames.size} unique frames from ${sequence.length} total frames...\n`);

      let cacheIndex = 0;
      for (const uniqueFrame of uniqueFrames) {
        const frameName = path.basename(uniqueFrame);
        process.stdout.write(`  [${cacheIndex + 1}/${uniqueFrames.size}] Creating ${frameName}...`);

        const outputFrame = await this.createResizedFrame(uniqueFrame, cacheIndex);
        frameCache.set(uniqueFrame, outputFrame);

        console.log(' ✓');
        cacheIndex++;
      }

      console.log('\n  Building sequence with cached frames...\n');

      // Second pass: build sequence using cached frames
      for (let i = 0; i < sequence.length; i++) {
        const item = sequence[i];
        const cachedFrame = frameCache.get(item.frame);

        preparedFrames.push({
          ...item,
          rotatedFrame: cachedFrame
        });

        if ((i + 1) % 1000 === 0) {
          process.stdout.write(`  Processed ${i + 1}/${sequence.length} frames...\r`);
        }
      }

      console.log(`  ✓ Completed ${sequence.length} frames using ${uniqueFrames.size} cached images\n`);
      return preparedFrames;
    } else {
      console.log('🎨 Preparing rotated frames...\n');

      const preparedFrames = [];

      for (let i = 0; i < sequence.length; i++) {
        const item = sequence[i];
        process.stdout.write(`  [${i + 1}/${sequence.length}] Rotating ${item.frameName} by ${item.rotation.toFixed(1)}°...`);

        const rotatedFrame = await this.createRotatedFrame(item.frame, item.rotation, i);
        preparedFrames.push({
          ...item,
          rotatedFrame: rotatedFrame
        });

        console.log(' ✓');
      }

      console.log('');
      return preparedFrames;
    }
  }

  /**
   * Create ffmpeg concat file
   */
  createConcatFile(preparedFrames) {
    const concatPath = '/tmp/caricature-concat.txt';
    let content = '';

    for (const item of preparedFrames) {
      content += `file '${item.rotatedFrame}'\n`;
      content += `duration ${item.duration.toFixed(3)}\n`;
    }

    // Add last frame again (ffmpeg concat quirk)
    const lastFrame = preparedFrames[preparedFrames.length - 1];
    content += `file '${lastFrame.rotatedFrame}'\n`;

    fs.writeFileSync(concatPath, content);
    return concatPath;
  }

  /**
   * Build glitch filter
   */
  buildGlitchFilter() {
    if (this.glitchLevel === 0) {
      return 'format=yuva420p';
    }

    const filters = ['format=yuva420p'];

    // Add scanlines
    if (this.glitchLevel >= 1) {
      filters.push('split[a][b]');
      filters.push('[a]geq=\'r=r(X,Y):g=g(X,Y):b=b(X,Y):a=if(not(mod(Y\\,3))\\,255\\,a(X,Y))\'[scanlines]');
      filters.push('[b][scanlines]overlay');
    }

    // Add random temporal noise
    if (this.glitchLevel >= 2) {
      filters.push('noise=alls=10:allf=t+u');
    }

    // Add chromatic aberration simulation
    if (this.glitchLevel >= 3) {
      filters.push('split[main][dup]');
      filters.push('[dup]lutrgb=r=0:b=0,crop=iw-4:ih:2:0[green]');
      filters.push('[main][green]overlay=0:0');
    }

    return filters.join(',');
  }

  /**
   * Create the audio-synchronized Caricature animation
   */
  async create() {
    console.log('📺 CARICATURE GENERATOR');
    console.log('='.repeat(60));
    console.log('Audio-synchronized talking head animation');
    console.log('='.repeat(60) + '\n');

    // Find and categorize frames
    const frames = this.findFrames();
    console.log(`✓ Found frames for character: ${this.characterName}`);
    console.log(`  Closed mouth: ${this.closedFrames.length} frames`);
    this.closedFrames.forEach((f) => {
      console.log(`    - ${path.basename(f)}`);
    });
    console.log(`  Open mouth: ${this.openFrames.length} frames`);
    this.openFrames.forEach((f) => {
      console.log(`    - ${path.basename(f)}`);
    });
    console.log('');

    // Generate audio-synchronized sequence
    const sequence = await this.generateAudioSequence();

    // Prepare all rotated frames
    const preparedFrames = await this.prepareFrames(sequence);

    // Create concat file
    const concatFile = this.createConcatFile(preparedFrames);

    // Build ffmpeg command with audio
    const glitchFilter = this.buildGlitchFilter();

    const args = [
      '-f', 'concat',
      '-safe', '0',
      '-r', '25',  // Specify frame rate for concat demuxer
      '-i', concatFile,
      '-i', this.audioInput,
      '-vf', glitchFilter,
      '-c:v', 'h264',
      '-c:a', 'aac',
      '-pix_fmt', 'yuv420p',
      '-preset', 'medium',
      '-crf', '23',
      '-y',
      this.outputFile
    ];

    console.log('🎬 Encoding Caricature with audio...\n');

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', args);

      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
        if (data.toString().includes('frame=')) {
          process.stdout.write('.');
        }
      });

      ffmpeg.on('close', (code) => {
        console.log('\n');
        if (code === 0) {
          // Cleanup temp frames
          preparedFrames.forEach(item => {
            try {
              fs.unlinkSync(item.rotatedFrame);
            } catch (e) {}
          });
          try {
            fs.unlinkSync(concatFile);
          } catch (e) {}

          const stats = fs.statSync(this.outputFile);
          const sizeKB = (stats.size / 1024).toFixed(2);
          console.log('✅ Caricature created!');
          console.log(`📦 Output: ${this.outputFile} (${sizeKB} KB)`);
          console.log(`🎭 Animation frames: ${sequence.length}`);
          console.log(`🔊 Audio synchronized!`);
          resolve();
        } else {
          console.error('❌ ffmpeg failed:');
          console.error(stderr);
          reject(new Error('ffmpeg encoding failed'));
        }
      });

      ffmpeg.on('error', reject);
    });
  }

  /**
   * Create synchronized talking head and overlay on video in one step
   */
  async createWithOverlay(inputVideo, options = {}) {
    const position = options.position || 'bottom-right';
    const margin = options.margin || 20;
    const outputVideo = options.output || 'output-with-caricature.mp4';

    console.log('\n📹 CREATING SYNCHRONIZED OVERLAY');
    console.log('='.repeat(60));
    console.log(`   Video: ${inputVideo}`);
    console.log(`   Position: ${position}`);
    console.log(`   Margin: ${margin}px`);
    console.log('='.repeat(60) + '\n');

    // Step 1: Use video's audio for synchronization
    this.audioInput = inputVideo;

    // Step 2: Find and categorize frames
    const frames = this.findFrames();
    console.log(`✓ Found frames for character: ${this.characterName}`);
    console.log(`  Closed mouth: ${this.closedFrames.length} frames`);
    this.closedFrames.forEach((f) => {
      console.log(`    - ${path.basename(f)}`);
    });
    console.log(`  Open mouth: ${this.openFrames.length} frames`);
    this.openFrames.forEach((f) => {
      console.log(`    - ${path.basename(f)}`);
    });
    console.log('');

    // Step 3: Generate audio-synchronized sequence
    const sequence = await this.generateAudioSequence();

    // Step 4: Prepare all rotated frames
    const preparedFrames = await this.prepareFrames(sequence);

    // Step 5: Comprehensive verification
    console.log('🔍 Verifying prepared frames...\n');

    if (preparedFrames.length === 0) {
      throw new Error('No frames were prepared');
    }

    console.log(`  Total frames prepared: ${preparedFrames.length}`);

    // Check first, middle, and last frames
    const samplesToCheck = [
      0,
      Math.floor(preparedFrames.length / 2),
      preparedFrames.length - 1
    ];

    for (const idx of samplesToCheck) {
      const frame = preparedFrames[idx];
      if (!fs.existsSync(frame.rotatedFrame)) {
        throw new Error(`Frame ${idx} missing: ${frame.rotatedFrame}`);
      }
      const stats = fs.statSync(frame.rotatedFrame);
      console.log(`  Frame ${idx}: ${path.basename(frame.rotatedFrame)} (${(stats.size / 1024).toFixed(1)} KB)`);
    }

    console.log('  ✓ All sampled frames exist\n');

    // Step 6: Create concat file
    const concatFile = this.createConcatFile(preparedFrames);

    // Verify concat file was created
    if (!fs.existsSync(concatFile)) {
      throw new Error(`Concat file not created: ${concatFile}`);
    }

    const concatContent = fs.readFileSync(concatFile, 'utf-8');
    const concatLines = concatContent.split('\n').filter(l => l.trim().length > 0);
    console.log(`  Concat file: ${concatFile} (${concatLines.length} lines)\n`);

    // Step 7: Calculate position
    let x, y;
    switch (position) {
      case 'bottom-right':
        x = `main_w-overlay_w-${margin}`;
        y = `main_h-overlay_h-${margin}`;
        break;
      case 'bottom-left':
        x = margin;
        y = `main_h-overlay_h-${margin}`;
        break;
      case 'top-right':
        x = `main_w-overlay_w-${margin}`;
        y = margin;
        break;
      case 'top-left':
        x = margin;
        y = margin;
        break;
      default:
        x = `main_w-overlay_w-${margin}`;
        y = `main_h-overlay_h-${margin}`;
    }

    // Step 8: Build glitch filter and composite everything in one ffmpeg call
    const glitchFilter = this.buildGlitchFilter();

    const args = [
      '-i', inputVideo,
      '-f', 'concat',
      '-safe', '0',
      '-r', '25',  // Specify frame rate for concat demuxer (caricature input)
      '-i', concatFile,
      '-filter_complex', `[1:v]fps=25,${glitchFilter},format=yuva420p[talking];[0:v]fps=25[base];[base][talking]overlay=${x}:${y}:shortest=1`,
      '-r', '25',  // Force output framerate to match caricature (25 fps)
      '-c:v', 'h264',
      '-c:a', 'copy',
      '-pix_fmt', 'yuv420p',
      '-preset', 'medium',
      '-crf', '23',
      '-y',
      outputVideo
    ];

    console.log('🎬 Compositing video with synchronized talking head...\n');

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', args);

      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
        if (data.toString().includes('frame=')) {
          process.stdout.write('.');
        }
      });

      ffmpeg.on('close', (code) => {
        console.log('\n');

        // Cleanup temp frames
        preparedFrames.forEach(item => {
          try {
            fs.unlinkSync(item.rotatedFrame);
          } catch (e) {}
        });
        try {
          fs.unlinkSync(concatFile);
        } catch (e) {}

        if (code === 0) {
          const stats = fs.statSync(outputVideo);
          const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
          console.log('✅ Video with talking head created!');
          console.log(`📦 Output: ${outputVideo} (${sizeMB} MB)`);
          console.log(`🎭 Animation frames: ${sequence.length}`);
          console.log(`🔊 Audio synchronized!`);
          resolve(outputVideo);
        } else {
          console.error('❌ Overlay failed:');
          console.error(stderr.substring(stderr.length - 1000)); // Last 1000 chars
          reject(new Error('Video overlay failed'));
        }
      });

      ffmpeg.on('error', reject);
    });
  }
}


// CLI interface - handle both direct execution and npm bin symlinks
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(__filename);

if (isMainModule) {
  const args = process.argv.slice(2);

  // Determine the installation directory for samples
  const __dirname = path.dirname(__filename);
  const samplesDir = path.join(__dirname, 'samples');

  const options = {
    audio: null,
    character: 'character1',
    frameDir: samplesDir,
    output: 'caricature.mp4',
    size: 320,
    maxRotation: 0,  // 0 = no rotation (faster)
    glitchLevel: 0,   // 0 = no glitch (faster)
    loudnessThreshold: -35,
    frameDuration: 0.04
  };

  let overlayMode = false;
  let inputVideo = null;
  let overlayOptions = {
    position: 'bottom-right',
    margin: 20
  };

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--audio' || args[i] === '-a') {
      options.audio = args[++i];
    } else if (args[i] === '--character' || args[i] === '-c') {
      options.character = args[++i];
    } else if (args[i] === '--dir' || args[i] === '-D') {
      options.frameDir = args[++i];
    } else if (args[i] === '--size' || args[i] === '-s') {
      options.size = parseInt(args[++i]);
    } else if (args[i] === '--rotation' || args[i] === '-r') {
      options.maxRotation = parseFloat(args[++i]);
    } else if (args[i] === '--glitch' || args[i] === '-g') {
      options.glitchLevel = parseInt(args[++i]);
    } else if (args[i] === '--threshold' || args[i] === '-t') {
      options.loudnessThreshold = parseFloat(args[++i]);
    } else if (args[i] === '--output' || args[i] === '-o') {
      options.output = args[++i];
    } else if (args[i] === '--overlay' || args[i] === '-O') {
      overlayMode = true;
      inputVideo = args[++i];
    } else if (args[i] === '--position' || args[i] === '-p') {
      overlayOptions.position = args[++i];
    } else if (args[i] === '--margin' || args[i] === '-m') {
      overlayOptions.margin = parseInt(args[++i]);
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
CARICATURE - Audio-driven talking head animator
================================================

Creates a talking head animation synchronized to audio volume.
The mouth opens when audio exceeds the loudness threshold, with
multiple open mouth frames picked randomly for natural variation.

Usage:
  caricature --audio <file.mp3> [options]     # Standalone with audio
  caricature --overlay <video.mp4> [options]  # Sync to video & overlay

REQUIRED (choose one):
  -a, --audio <file>         Audio file (.mp3, .wav) - creates talking head
  -O, --overlay <video>      Video file (.mp4) - extracts audio, creates
                             talking head, and overlays on video (all in one!)

BASIC OPTIONS:
  -c, --character <name>     Character name (default: character1)
                             Looks for files: characterN-closed*.jpg
                                             characterN-open*.jpg
  -D, --dir <path>           Directory containing frames (default: samples/)
  -t, --threshold <dB>       Loudness threshold for mouth open (default: -35)
                             Lower = more sensitive, Higher = less sensitive
  -s, --size <pixels>        Output size (square) (default: 320)
  -r, --rotation <degrees>   Max rotation angle (default: 0, disabled for speed)
                             Set to 15-30 for Max Headroom head bobbing effect
  -g, --glitch <0-3>         Glitch effect level (default: 1)
  -o, --output <file>        Output file (default: caricature.mp4)

OVERLAY-SPECIFIC OPTIONS:
  -p, --position <pos>       Position: bottom-right, bottom-left,
                             top-right, top-left (default: bottom-right)
  -m, --margin <pixels>      Margin from edges (default: 20)

  -h, --help                 Show this help

EXAMPLES:

  # Fast: Create talking head (no rotation, default)
  caricature --audio narration.mp3

  # One-step: sync to video and overlay (extracts audio automatically!)
  caricature --overlay video.mp4 --position bottom-right

  # Custom character and sensitivity
  caricature --overlay lecture.mp4 -c professor -t -40 -p top-right

  # Max Headroom style: enable rotation for head bobbing effect
  caricature --overlay podcast.mp4 -g 3 -r 15 -t -45

  # Standalone with custom character
  caricature -a voice.mp3 -c character2 -o talking-head.mp4

PERFORMANCE TIP:
  Rotation is disabled by default (0°) for fast processing.
  A 4-minute video processes in ~1 minute without rotation,
  vs ~20+ minutes with rotation enabled. Only use -r flag if
  you want the Max Headroom head bobbing effect!

GLITCH LEVELS:
  0 - Clean (no glitch)
  1 - Scanlines (Max Headroom classic)
  2 - Scanlines + noise
  3 - Full chaos (scanlines + noise + chromatic aberration)

CHARACTER SETUP:
  Characters need closed and open mouth frames:
    character1-closed1.jpg, character1-closed2.jpg (optional multiple)
    character1-open1.jpg, character1-open2.jpg, character1-open3.jpg

  When audio is loud, a random open frame is picked for natural variation!

THRESHOLD TUNING:
  -35 dB = Good default for speech
  -40 dB = More sensitive (mouth opens more often)
  -30 dB = Less sensitive (only loud sounds trigger)

  Use ffprobe to analyze your audio:
  ffprobe -f lavfi -i "amovie=file.mp3,astats=1" -show_entries \\
    frame_tags=lavfi.astats.Overall.RMS_level
      `);
      process.exit(0);
    }
  }

  // Validate that either --audio or --overlay is provided (but not both)
  if (!options.audio && !overlayMode) {
    console.error('❌ Error: Either --audio or --overlay is required');
    console.error('\nUsage:');
    console.error('  caricature --audio file.mp3     # Create talking head with audio');
    console.error('  caricature --overlay video.mp4  # Sync to video and overlay');
    console.error('\nUse --help for more information\n');
    process.exit(1);
  }

  if (options.audio && overlayMode) {
    console.error('❌ Error: Cannot use both --audio and --overlay');
    console.error('Use --audio for standalone talking head, or --overlay to sync with video\n');
    process.exit(1);
  }

  const caricature = new Caricature(options);

  if (overlayMode && inputVideo) {
    // One-step: extract audio from video, create talking head, and overlay
    caricature.createWithOverlay(inputVideo, overlayOptions)
      .then(() => {
        console.log('\n🎉 All done! Video with talking head ready!');
        console.log('   Your synchronized overlay awaits...\n');
      })
      .catch((err) => {
        console.error('\n💥 Error:', err.message);
        process.exit(1);
      });
  } else {
    // Standalone: create talking head with audio
    caricature.create()
      .then(() => {
        console.log('\n🎉 All done! Audio-synchronized caricature ready!');
        console.log('   Your talking head awaits...\n');
      })
      .catch((err) => {
        console.error('\n💥 Error:', err.message);
        process.exit(1);
      });
  }
}

export default Caricature;
