const AuctionServer = require('./AuctionServer');

const main = async () => {
  const server = new AuctionServer();
  await server.initialize();
  await server.start();
  console.log("Waiting for Requests...");
  
  process.on("SIGINT", async () => {
    await server.cleanup();
    process.exit(0);
  });
};

main().catch(console.error);