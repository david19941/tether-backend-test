const RPC = require('@hyperswarm/rpc');
const DHT = require('hyperdht');
const Hypercore = require('hypercore');
const Hyperbee = require('hyperbee');
const crypto = require('crypto');

class AuctionClient {
  constructor() {
    this.hbee = null;
    this.hcore = null;
    this.rpc = null;
  }

  async initialize() {
    this.hcore = new Hypercore("./db/rpc-server");
    this.hbee = new Hyperbee(this.hcore, {
      keyEncoding: "utf-8",
      valueEncoding: "binary",
    });
    await this.hbee.ready();
  }

  async getPeers() {
    let peers = [];
    const res = await this.hbee.get("dht-peers");
    if (res) {
      peers = JSON.parse(res.value);
    }
    return peers;
  }

  async getRpcClient() {
    const dhtSeed = crypto.randomBytes(32);
    const dht = new DHT({
      port: 50001,
      keyPair: DHT.keyPair(dhtSeed),
      bootstrap: [{ host: "127.0.0.1", port: 30001 }],
    });
    await dht.ready();
    const rpc = new RPC({ dht });
    return rpc;
  }

  shortKeyAddress(address) {
    const frontStr = address.substr(0, 2);
    const backStr = address.substr(address.length - 5, 5);
    const str = frontStr + "..." + backStr;
    return str;
  }

  async openPicAuction(key, id, picPrice) {
    const shortKey = this.shortKeyAddress(key.toString("hex"));
    const msg = `Client[${shortKey}] opens auction: sell Pic#${id} for ${picPrice} USDt`;
    console.log(msg);
    const payload = { id: id, picPrice: picPrice };
    const payloadRaw = Buffer.from(JSON.stringify(payload), "utf-8");
    let resp = await this.rpc.request(key, "openPicAuction", payloadRaw);
    console.log(resp + "\n");
  }

  async bidding(key, id, picPrice) {
    const shortKey = this.shortKeyAddress(key.toString("hex"));
    const msg = `Client[${shortKey}] makes bid : -> Pic#${id} with ${picPrice} USDt`;
    const payload = { id: id, picPrice: picPrice };
    const payloadRaw = Buffer.from(JSON.stringify(payload), "utf-8");
    let resp = await this.rpc.request(key, "bidding", payloadRaw);
    console.log(msg);
    console.log(resp + "\n");
  }

  async closePicAuction(key) {
    const shortKey = this.shortKeyAddress(key.toString("hex"));
    const msg = `Client[${shortKey}] close auction`;
    console.log(msg);
    const payload = { id: 0 };
    const payloadRaw = Buffer.from(JSON.stringify(payload), "utf-8");
    let resp = await this.rpc.request(key, "closePicAuction", payloadRaw);
    console.log(resp + "\n");
  }

  async test() {
    await this.initialize();

    let peers = await this.getPeers();
    console.log("Running Nodes:", peers);
    if (peers.length < 3) {
      console.log(">>> Please run at least 3 nodes before the test.");
      await this.hbee.close();
      return;
    }
    const nodeKey1 = Buffer.from(peers[0].toString('hex'), 'hex');
    const nodeKey2 = Buffer.from(peers[1].toString('hex'), 'hex');
    const nodeKey3 = Buffer.from(peers[2].toString('hex'), 'hex');

    console.log(">>> Test case");

    this.rpc = await this.getRpcClient();
    // close hbee
    await this.hbee.close();
    await this.hcore.close();

    // Client#1 opens auction: sell Pic#1 for 75 USDt
    await this.openPicAuction(nodeKey1, 1, 75);

    // Client#2 opens auction: sell Pic#2 for 60 USDt
    await this.openPicAuction(nodeKey2, 2, 60);

    // Client#2 makes bid for Client#1->Pic#1 with 75 USDt
    await this.bidding(nodeKey2, 1, 75);

    // Client#3 makes bid for Client#1->Pic#1 with 75.5 USDt
    await this.bidding(nodeKey3, 1, 75.5);

    // Client#3 makes bid for Client#2->Pic#2 with 75.5 USDt
    await this.bidding(nodeKey3, 2, 75.5);

    //Client#2 makes bid for Client#1->Pic#1 with 80 USDt
    await this.bidding(nodeKey2, 1, 80);

    // Client#1 closes auction
    await this.closePicAuction(nodeKey1);
    console.log('>>> Test completed!');

    await this.rpc.dht.destroy();
  }
}

module.exports = AuctionClient;