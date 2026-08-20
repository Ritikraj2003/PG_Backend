import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, SALT_ROUNDS);
};

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  if (!hash.startsWith('$2a$') && !hash.startsWith('$2b$')) {
    return password === hash;
  }
  return await bcrypt.compare(password, hash);
};

