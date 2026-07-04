module.exports = {
  apps: [{
    name: "overtalk-backend",
    script: "./server.js",
    max_memory_restart: "2G", // Previne memory leaks reiniciando se atingir 2GB
    exp_backoff_restart_delay: 100,
    watch: false, // watch=false em prod para não reiniciar a cada arquivo salvo (ex: speakers.json)
    env: {
      NODE_ENV: "development",
    },
    env_production: {
      NODE_ENV: "production",
    }
  }]
}
