module.exports = {
  apps: [
    {
      name: "cdcentral-rastreamento",
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOST: "127.0.0.1",
        TRUST_PROXY_HEADERS: "1",
        REQUIRE_REQUEST_ORIGIN: "1",
        ALLOW_MEMORY_RATE_LIMIT_IN_PRODUCTION: "0",
      },
      max_memory_restart: "300M",
      out_file: "./logs/out.log",
      error_file: "./logs/error.log",
      merge_logs: true,
      time: true,
    },
  ],
};
