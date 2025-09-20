import { randomBytes } from 'crypto';

/**
 * ランダムなハッシュ文字列を生成する
 * デフォルトで16文字の16進数（小文字と数字）
 */
export function generateHex(length: number = 16): string {
  const chars = 'abcdef0123456789';
  let result = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = randomBytes(1)[0] % chars.length;
    result += chars[randomIndex];
  }

  return result;
}

export async function generateHexCommand(args: string[]): Promise<void> {
  const lengthArg = args[0];
  const length = lengthArg ? parseInt(lengthArg, 10) : 16;

  if (lengthArg && (isNaN(length) || length <= 0)) {
    console.error('Error: length must be a positive number');
    process.exit(1);
  }

  const hex = generateHex(length);

  console.log(hex);
}