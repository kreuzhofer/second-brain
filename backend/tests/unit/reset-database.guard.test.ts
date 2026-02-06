import { resetDatabase } from '../setup';

describe('resetDatabase guard', () => {
  it('throws when NODE_ENV is not test', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    await expect(resetDatabase()).rejects.toThrow('resetDatabase can only run when NODE_ENV is "test"');

    process.env.NODE_ENV = originalNodeEnv;
  });
});
