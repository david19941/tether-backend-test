# The Tether challenge
Simple P2P for auctions based on Hyperswarm RPC and Hypercores.

## Start
### 1. Run local DHT Network
- Terminal #1 > `hyperdht --bootstrap --host 127.0.0.1 --port 30001`

### 2. Run 3 Nodes
- Terminal #2 > `npm start`
- Terminal #3 > `npm start`
- Terminal #4 > `npm start`
- You need to run a server for each client.

### 3. Run Test
- Terminal #5 > `npm test` 

## Modules
- hyperswarm RPC
- hyperdht
- hypercore
- hyperbee
- crypto