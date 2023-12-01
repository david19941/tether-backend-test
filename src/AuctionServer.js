const RPC = require('@hyperswarm/rpc')
const DHT = require('hyperdht')
const Hypercore = require('hypercore')
const Hyperbee = require('hyperbee')
const crypto = require('crypto')

class AuctionServer {
  constructor() {
    this.hbee = null;
    this.hcore = null;
    this.rpc = null;
    this.pubKey = null;
    this.auction = { id: 0, picPrice: 0 };
    this.lastBid = { client: "", picPrice: 0 };
  }

  async initialize() {
    await this.openHbee();

    let dhtSeed = (await this.hbee.get("dht-seed"))?.value;
    if (!dhtSeed) {
      dhtSeed = crypto.randomBytes(32);
      await this.hbee.put("dht-seed", dhtSeed);
    }

    const dht = new DHT({
      port: 40001,
      keyPair: DHT.keyPair(dhtSeed),
      bootstrap: [{ host: "127.0.0.1", port: 30001 }],
    });
    await dht.ready();

    const rpcSeed = crypto.randomBytes(32);
    this.rpc = new RPC({ seed: rpcSeed, dht });
    
  }

  async start() {
    const rpcServer = this.rpc.createServer();

    rpcServer.respond("logging", this.logging.bind(this));
    rpcServer.respond("openPicAuction", this.openPicAuction.bind(this));
    rpcServer.respond("bidding", this.bidding.bind(this));
    rpcServer.respond("bid", this.bid.bind(this));
    rpcServer.respond("closePicAuction", this.closePicAuction.bind(this));

    await rpcServer.listen();
    this.pubKey = rpcServer.publicKey.toString("hex");
    console.log("rpc server started listening on public key:", this.pubKey);

    await this.setPeers(this.pubKey);
    console.log('Clients: ', await this.getPeers());
    await this.closeHbee();
  }

  // Logging status function
  async logging(reqRaw) {
    console.log(this.parseRequest(reqRaw));
  }

  // Open new Auction function
  async openPicAuction(reqRaw) {
    const req = this.parseRequest(reqRaw);
    if (this.isAuctionOpen()) {
      return this.bufferResponse({
        status: false,
        msg: "Opened auction exists on this client, please close it first!",
      });
    }
    this.setAuction(req.id, req.picPrice);
    const peers = await this.getPeers();
    const msg = this.openPicAuctionMessage(req.id, req.picPrice);
    await this.closeHbee();
    await this.broadcastMessage(peers, "logging", msg);

    return this.bufferResponse({ status: true, msg: "Success" });
  }

  // Bid for auction
  async bidding(reqRaw) {
    const req = JSON.parse(reqRaw.toString("utf-8"));
    if (!(req.id > 0 && req.picPrice > 0)) return this.bufferResponse({ status: false, msg: "Invalid Picture ID or Price." });

    const peers = await this.getPeers();
    await this.closeHbee();

    for (let i = 0; i < peers.length; i++) {
      await this.sendRequest(peers[i], "bid", {
        client: this.pubKey,
        id: req.id,
        picPrice: req.picPrice,
      });
    }

    return this.bufferResponse({ status: true, msg: "Success" });
  }

  async bid(reqRaw) {
    const req = this.parseRequest(reqRaw);
    if (this.auction.id != req.id || this.auction.picPrice > req.picPrice) {
      return this.bufferResponse({
        status: false,
        msg: "Invalid Picture ID or Price",
      });
    }
    if (this.lastBid.picPrice > 0 && this.lastBid.picPrice >= req.picPrice) {
      return this.bufferResponse({
        status: false,
        msg: "Should be bigger than last bid Price",
      });
    }
    this.lastBid.client = req.client;
    this.lastBid.picPrice = req.picPrice;
    const shortOwnerKey = this.getShortAddress(this.pubKey);
    const shortCustomerKey = this.getShortAddress(req.client);
    const msg = `Client[${shortCustomerKey}] makes bid for Client[${shortOwnerKey}]: Pic#${req.id} with ${req.picPrice} USDt`;
    const peers = await this.getPeers();
    await this.closeHbee();
    
    for (let i = 0; i < peers.length; i++) {
      await this.sendRequest(peers[i], "logging", msg);
    }

    return this.bufferResponse({ status: true, msg: "Success" });
  }

  async closePicAuction() {
    if (this.lastBid.picPrice == 0) {
      return this.bufferResponse({ status: false, msg: "No opened auction" });
    }
    const peers = await this.getPeers();
    await this.closeHbee();
    const shortOwnerKey = this.getShortAddress(this.pubKey);
    const shortLastCustomerKey = this.getShortAddress(this.lastBid.client);
    const msg = `Client[${shortOwnerKey}] close auction: sell Pic#${this.auction.id} for ${this.lastBid.picPrice} USDt to Client[${shortLastCustomerKey}]`;
    
    for (let i = 0; i < peers.length; i++) {
      await this.sendRequest(peers[i], "logging", msg);
    }

    this.auction.picPrice = 0;
    this.auction.id = 0;
    this.lastBid.client = "";
    this.lastBid.picPrice = 0;

    return this.bufferResponse({ status: true, msg: "Success" });
  }

  async sendRequest(pubKey, method, msg) {
    const payload = Buffer.from(JSON.stringify(msg), "utf-8");
    const binaryKey = Buffer.from(pubKey, "hex");
    await this.rpc.request(binaryKey, method, payload);
  }

  async getPeers() {
    await this.closeHbee();
    await this.openHbee();
    let peers = [];
    const res = await this.hbee.get("dht-peers");
    if (res) {
      peers = JSON.parse(res.value);
    }
    return peers;
  }

  async setPeers(pubKey) {
    let peers = await this.getPeers();
    peers.push(pubKey);
    await this.hbee.put("dht-peers", JSON.stringify(peers));
    await this.hbee.close();
  }

  async closeHbee() {
    await this.hbee.close();
    await this.hcore.close();
  }

  async openHbee() {
    this.hcore = new Hypercore("./db/rpc-server");
    this.hbee = new Hyperbee(this.hcore, { keyEncoding: "utf-8", valueEncoding: "binary" });
    await this.hbee.ready();
  }

  getShortAddress(address) {
    const frontStr = address.substr(0, 2);
    const backStr = address.substr(address.length - 5, 5);
    return frontStr + "..." + backStr;
  }

  isAuctionOpen() {
    return this.auction.picPrice > 0;
  }

  setAuction(id, picPrice) {
    this.auction.id = id;
    this.auction.picPrice = picPrice;
  }

  openPicAuctionMessage(id, picPrice) {
    const shortOwnerKey = this.getShortAddress(this.pubKey);
    return `Client[${shortOwnerKey}] opens auction: sell Pic#${id} for ${picPrice} USDt`;
  }

  broadcastMessage(peers, method, msg) {
    for (let i = 0; i < peers.length; i++) {
      this.sendRequest(peers[i], method, msg);
    }
  }

  parseRequest(reqRaw) {
    return JSON.parse(reqRaw.toString("utf-8"));
  }

  bufferResponse(response) {
    return Buffer.from(JSON.stringify(response), "utf-8");
  }

  async cleanup() {
    console.log("Clean up the database");

    await this.closeHbee();

    await this.openHbee();

    let nodeListArray = [];
    const nodeList = (await this.hbee.get("dht-peers"))?.value;
    if (nodeList != null) {
      nodeListArray = JSON.parse(nodeList);
    }
    const index = nodeListArray.findIndex((node) => node == this.pubKey.toString("hex"));
    if (index > -1) {
      nodeListArray.splice(index, 1);
    }
    await this.hbee.put("dht-peers", JSON.stringify(nodeListArray));
    await this.closeHbee();
  }
}

module.exports = AuctionServer;