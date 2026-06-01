module.exports = {
  apps: [
    {
      name: 'asfinance-api',
      cwd: './apps/api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      env_file: '../../.env.production',
      env: {
        NODE_ENV: 'production',
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
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
