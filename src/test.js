const AuctionClient = require('./AuctionClient');

const main = async () => {
  const client = new AuctionClient();
  await client.test();
};

main().catch(console.error);