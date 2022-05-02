import { compare, genSalt, hash } from 'bcrypt';

export const encodePassword = async (rawPassword: string): Promise<string> =>
  await hash(rawPassword, await genSalt(10));

export const validatePassword = async (
  rawPassword: string,
  storedPassword: string
): Promise<boolean> =>
  await compare(
    rawPassword,
    storedPassword
  )
