import { describe, it, expect } from 'vitest';
import {
  jargonImageDims,
  extractJargonImageBase64,
  jargonCacheKey,
  JARGON_IMAGE_MAX_DIM,
  JARGON_IMAGE_MAX_B64_LEN,
} from './jargon';

describe('jargonImageDims', () => {
  it('downscales landscape keeping aspect ratio', () => {
    const result = jargonImageDims(1920, 1080, 640);
    expect(result).toEqual({ width: 640, height: 360 });
  });

  it('downscales portrait keeping aspect ratio', () => {
    const result = jargonImageDims(1080, 1920, 640);
    expect(result).toEqual({ width: 360, height: 640 });
  });

  it('does not upscale when both dims are under maxDim', () => {
    const result = jargonImageDims(100, 200, 640);
    expect(result).toEqual({ width: 100, height: 200 });
  });

  it('returns same dims when max dim exactly equals maxDim', () => {
    const result = jargonImageDims(1280, 720, 1280);
    expect(result).toEqual({ width: 1280, height: 720 });
  });

  it('uses JARGON_IMAGE_MAX_DIM when maxDim is omitted', () => {
    const result = jargonImageDims(2560, 1440);
    expect(result).toEqual({ width: 1280, height: 720 });
  });

  it('returns {1,1} for zero width', () => {
    expect(jargonImageDims(0, 100, 640)).toEqual({ width: 1, height: 1 });
  });

  it('returns {1,1} for zero height', () => {
    expect(jargonImageDims(100, 0, 640)).toEqual({ width: 1, height: 1 });
  });

  it('returns {1,1} for negative width', () => {
    expect(jargonImageDims(-100, 100, 640)).toEqual({ width: 1, height: 1 });
  });

  it('returns {1,1} for NaN width', () => {
    expect(jargonImageDims(NaN, 100, 640)).toEqual({ width: 1, height: 1 });
  });

  it('returns {1,1} for Infinity', () => {
    expect(jargonImageDims(Infinity, 100, 640)).toEqual({ width: 1, height: 1 });
  });
});

describe('extractJargonImageBase64', () => {
  it('accepts a valid raw base64 string', () => {
    expect(extractJargonImageBase64('QUJDRA==')).toBe('QUJDRA==');
  });

  it('strips exact data:image/jpeg;base64, prefix', () => {
    expect(extractJargonImageBase64('data:image/jpeg;base64,QUJDRA==')).toBe('QUJDRA==');
  });

  it('returns null for data:image/png;base64, prefix', () => {
    expect(extractJargonImageBase64('data:image/png;base64,QUJDRA==')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractJargonImageBase64('')).toBeNull();
  });

  it('returns null for the string "null"', () => {
    expect(extractJargonImageBase64('null')).toBeNull();
  });

  it('returns null for the string "undefined"', () => {
    expect(extractJargonImageBase64('undefined')).toBeNull();
  });

  it('returns null for a number', () => {
    expect(extractJargonImageBase64(123)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(extractJargonImageBase64(undefined)).toBeNull();
  });

  it('returns null for null', () => {
    expect(extractJargonImageBase64(null)).toBeNull();
  });

  it('returns null for invalid characters in base64', () => {
    expect(extractJargonImageBase64('AB!D')).toBeNull();
  });

  it('returns null when length is not a multiple of 4', () => {
    expect(extractJargonImageBase64('ABCDE')).toBeNull();
  });

  it('returns null when "=" appears in the middle', () => {
    expect(extractJargonImageBase64('AB=D')).toBeNull();
  });

  it('returns null when there are three trailing "="', () => {
    expect(extractJargonImageBase64('A===')).toBeNull();
  });

  it('returns null when base64 exceeds JARGON_IMAGE_MAX_B64_LEN', () => {
    const oversized = 'A'.repeat(JARGON_IMAGE_MAX_B64_LEN + 4);
    expect(extractJargonImageBase64(oversized)).toBeNull();
  });

  it('accepts base64 at exactly JARGON_IMAGE_MAX_B64_LEN', () => {
    const boundary = 'A'.repeat(JARGON_IMAGE_MAX_B64_LEN);
    expect(extractJargonImageBase64(boundary)).not.toBeNull();
  });
});

describe('jargonCacheKey', () => {
  it('produces the correct key format', () => {
    const key = jargonCacheKey('https://example.com/doc.pdf', 3, 'zh-TW', 'image');
    expect(key).toBe('https://example.com/doc.pdf#3#zh-TW#image');
  });

  it('produces different keys for text vs image path', () => {
    const textKey = jargonCacheKey('https://example.com/doc.pdf', 1, 'en', 'text');
    const imageKey = jargonCacheKey('https://example.com/doc.pdf', 1, 'en', 'image');
    expect(textKey).not.toBe(imageKey);
  });
});
