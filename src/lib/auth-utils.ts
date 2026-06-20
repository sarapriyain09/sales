import { queryOne, runStatement } from '@/lib/db-client';
import bcrypt from 'bcryptjs';
import { isDemoMode } from './app-mode';

export async function seedUsers() {
  const existing = await queryOne('SELECT id FROM users WHERE email = ?', ['admin@splendidtechnology.co.uk']);
  if (existing) return;

  const hash = await bcrypt.hash('Splendid2024!', 12);
  await runStatement(`
    INSERT INTO users (name, email, password, role)
    VALUES (?, ?, ?, ?)
  `, ['Admin', 'admin@splendidtechnology.co.uk', hash, 'admin']);

  console.log('✓ Default admin user created: admin@splendidtechnology.co.uk / Splendid2024!');
}

export async function verifyUser(email: string, password: string) {
  const user = await queryOne('SELECT * FROM users WHERE email = ?', [email]) as { id: number; name: string; email: string; password: string; role: string; demo_verified?: number } | undefined;
  if (!user) return null;
  if (isDemoMode() && user.role !== 'admin' && user.demo_verified !== 1) return null;
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
