import { randomBytes } from 'crypto';

/**
 * RDS用のセキュアなパスワードを生成する
 * - 最小16文字
 * - 英大文字、英小文字、数字、特殊文字を含む
 * - RDSで使用できない文字は除外
 */
export function generateRdsPassword(): string {
  const length = 20; // 16文字以上

  // RDSで使用可能な文字セット（使用できない文字を除外）
  // 除外: " @ \ /
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const specialChars = '!#$%&*+<=>?^_{|}~-';

  const allChars = uppercase + lowercase + numbers + specialChars;

  // 各カテゴリから最低1文字ずつ選択
  let password = '';
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += specialChars[Math.floor(Math.random() * specialChars.length)];

  // 残りの文字をランダムに生成
  for (let i = password.length; i < length; i++) {
    const randomIndex = randomBytes(1)[0] % allChars.length;
    password += allChars[randomIndex];
  }

  // パスワード文字をシャッフル
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

export async function generateRdsPasswordCommand(): Promise<void> {
  const password = generateRdsPassword();

  console.log('Generated RDS password:');
  console.log(password);
  console.log('');
  console.log('To use this password with Aurora deployment:');
  console.log(`export RDS_MASTER_PASSWORD="${password}"`);
  console.log('npm run deploy-cloudformation ../infra/rds-aurora-sample.yml');
}