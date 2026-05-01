module.exports = {
  apps: [
    {
      name: 'asfinance-api',
      cwd: './apps/api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        DATABASE_URL: 'postgresql://asfinance:asfinance_dev@localhost:5432/asfinance_lms',
        JWT_SECRET: 'as_finance_production_secret_key_2024_secure',
        JWT_EXPIRY: '8h',
        REFRESH_TOKEN_EXPIRY: '7d',
        S3_ENDPOINT: 'http://localhost:9000',
        S3_REGION: 'us-east-1',
        S3_ACCESS_KEY: 'minioadmin',
        S3_SECRET_KEY: 'minioadmin',
        S3_BUCKET: 'as-finance-docs',
      },
    },
    {
      name: 'asfinance-web',
      cwd: './apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 1,
      exec_mode: 'fork',
      interpreter: 'node',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
