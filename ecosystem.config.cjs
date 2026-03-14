module.exports = {
  apps: [
    {
      name: 'movie-agent-backend',
      script: 'server.js',
      cwd: 'c:\\Users\\saksh\\OneDrive\\Desktop\\Movie search',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    },
    {
      name: 'movie-agent-frontend',
      script: 'npm',
      args: 'run dev',
      cwd: 'c:\\Users\\saksh\\OneDrive\\Desktop\\Movie search',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'development'
      }
    }
  ]
};
