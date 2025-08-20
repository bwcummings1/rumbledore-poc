import { promisify } from 'util';
import zlib from 'zlib';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const deflate = promisify(zlib.deflate);
const inflate = promisify(zlib.inflate);

export async function compress(data: string): Promise<string> {
  try {
    const buffer = Buffer.from(data, 'utf-8');
    const compressed = await gzip(buffer);
    return compressed.toString('base64');
  } catch (error) {
    console.error('Compression error:', error);
    throw new Error('Failed to compress data');
  }
}

export async function decompress(compressedData: string): Promise<string> {
  try {
    const buffer = Buffer.from(compressedData, 'base64');
    const decompressed = await gunzip(buffer);
    return decompressed.toString('utf-8');
  } catch (error) {
    console.error('Decompression error:', error);
    throw new Error('Failed to decompress data');
  }
}

export async function compressDeflate(data: string): Promise<string> {
  try {
    const buffer = Buffer.from(data, 'utf-8');
    const compressed = await deflate(buffer);
    return compressed.toString('base64');
  } catch (error) {
    console.error('Deflate compression error:', error);
    throw new Error('Failed to compress data with deflate');
  }
}

export async function decompressInflate(compressedData: string): Promise<string> {
  try {
    const buffer = Buffer.from(compressedData, 'base64');
    const decompressed = await inflate(buffer);
    return decompressed.toString('utf-8');
  } catch (error) {
    console.error('Inflate decompression error:', error);
    throw new Error('Failed to decompress data with inflate');
  }
}

export function getCompressionRatio(original: string, compressed: string): number {
  const originalSize = Buffer.byteLength(original, 'utf-8');
  const compressedSize = Buffer.byteLength(compressed, 'base64');
  return Math.round((1 - compressedSize / originalSize) * 100);
}

export async function shouldCompress(data: string, threshold = 1024): Promise<boolean> {
  // Only compress if data is larger than threshold (default 1KB)
  return Buffer.byteLength(data, 'utf-8') > threshold;
}