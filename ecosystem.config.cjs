module.exports = {
  apps: [
    {
      name: 'pimo-industrial-api',
      cwd: __dirname,
      script: 'index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 5180,
      },
    },
  ],
};
