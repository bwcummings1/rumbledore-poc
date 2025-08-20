// PM2 Ecosystem Configuration
// Sprint 6: Statistics Engine - Production deployment configuration

module.exports = {
  apps: [
    {
      name: 'rumbledore-web',
      script: 'npm',
      args: 'start',
      cwd: './',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: './logs/web-error.log',
      out_file: './logs/web-out.log',
      log_file: './logs/web-combined.log',
      time: true,
      merge_logs: true,
    },
    {
      name: 'stats-worker',
      script: './lib/workers/statistics-worker.ts',
      interpreter: 'tsx',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        STATS_SOCKET_PORT: 3002,
        STATS_WORKER_CONCURRENCY: 3,
        STATS_MAX_RETRIES: 3,
      },
      error_file: './logs/stats-worker-error.log',
      out_file: './logs/stats-worker-out.log',
      log_file: './logs/stats-worker-combined.log',
      time: true,
      kill_timeout: 10000,
      wait_ready: true,
      listen_timeout: 10000,
    },
    {
      name: 'stats-scheduler',
      script: './lib/workers/statistics-scheduler.ts',
      interpreter: 'tsx',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/stats-scheduler-error.log',
      out_file: './logs/stats-scheduler-out.log',
      log_file: './logs/stats-scheduler-combined.log',
      time: true,
      cron_restart: '0 0 * * *', // Restart daily at midnight
    },
  ],

  deploy: {
    production: {
      user: 'deploy',
      host: process.env.PRODUCTION_HOST || 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:your-org/rumbledore.git',
      path: '/var/www/rumbledore',
      'pre-deploy-local': 'npm test',
      'post-deploy': 'npm install && npm run build && npm run db:migrate && npm run stats:init && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'apt-get install git nodejs npm',
      env: {
        NODE_ENV: 'production',
      },
    },
    staging: {
      user: 'deploy',
      host: process.env.STAGING_HOST || 'staging.your-server.com',
      ref: 'origin/develop',
      repo: 'git@github.com:your-org/rumbledore.git',
      path: '/var/www/rumbledore-staging',
      'post-deploy': 'npm install && npm run build && npm run db:migrate && pm2 reload ecosystem.config.js --env staging',
      env: {
        NODE_ENV: 'staging',
      },
    },
  },

  // Monitoring configuration
  monitoring: {
    http: true,
    https: false,
    port: 9615,
    host: '0.0.0.0',
  },
};