// Compute the playback duration of an MP3 buffer by walking its frame headers.
//
// The bot pushes each Cartesia TTS segment into the call via Recall's Output
// Audio endpoint, which returns the moment the clip is *accepted* — not when it
// finishes playing. To stop consecutive segments from overlapping (two voices on
// top of each other) the worker must hold the audio queue for each clip's real
// duration, so we need that duration. Cartesia returns CBR MPEG-1 Layer III at
// 44.1 kHz / 128 kbps, but we parse frames generically so VBR/other rates still
// work, with a CBR byte-rate estimate as a fallback.

// Bitrate tables in kbps, indexed by the 4-bit bitrate field.
const BITRATES_V1_L3 = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
];
const BITRATES_V2_L3 = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0,
];

const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000, 0], // MPEG 1
  2: [22050, 24000, 16000, 0], // MPEG 2
  0: [11025, 12000, 8000, 0], // MPEG 2.5
};

const FALLBACK_BITRATE_BPS = 128_000;

/** Skip an ID3v2 tag if the buffer starts with one. Returns the start offset. */
function skipId3(buf: Uint8Array): number {
  if (
    buf.length >= 10 &&
    buf[0] === 0x49 &&
    buf[1] === 0x44 &&
    buf[2] === 0x33 // "ID3"
  ) {
    // Synchsafe 28-bit size in bytes 6..9, plus the 10-byte header.
    const size =
      (buf[6]! << 21) | (buf[7]! << 14) | (buf[8]! << 7) | buf[9]!;
    return 10 + size;
  }
  return 0;
}

/**
 * Duration of an MP3 buffer in milliseconds. Returns a CBR estimate if no valid
 * frame headers are found.
 */
export function mp3DurationMs(bytes: Uint8Array): number {
  let pos = skipId3(bytes);
  let totalSeconds = 0;
  let framesParsed = 0;

  while (pos + 4 <= bytes.length) {
    const b0 = bytes[pos]!;
    const b1 = bytes[pos + 1]!;
    // Frame sync: 11 bits set (0xFFE).
    if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) {
      pos += 1;
      continue;
    }

    const versionBits = (b1 >> 3) & 0x3; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
    const layerBits = (b1 >> 1) & 0x3; // 1 = Layer III
    if (versionBits === 1 || layerBits !== 1) {
      pos += 1;
      continue;
    }

    const b2 = bytes[pos + 2]!;
    const bitrateIndex = (b2 >> 4) & 0xf;
    const sampleRateIndex = (b2 >> 2) & 0x3;
    const padding = (b2 >> 1) & 0x1;
    if (bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
      pos += 1;
      continue;
    }

    const isV1 = versionBits === 3;
    const bitrate =
      (isV1 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bitrateIndex]! * 1000;
    const sampleRate = SAMPLE_RATES[versionBits]![sampleRateIndex]!;
    if (!bitrate || !sampleRate) {
      pos += 1;
      continue;
    }

    const samplesPerFrame = isV1 ? 1152 : 576;
    const frameLen =
      Math.floor((samplesPerFrame / 8) * (bitrate / sampleRate)) + padding;
    if (frameLen <= 0) {
      pos += 1;
      continue;
    }

    totalSeconds += samplesPerFrame / sampleRate;
    framesParsed += 1;
    pos += frameLen;
  }

  if (framesParsed > 0) return Math.round(totalSeconds * 1000);
  // No parseable frames — fall back to a constant-bitrate estimate.
  return Math.round((bytes.length * 8 * 1000) / FALLBACK_BITRATE_BPS);
}
