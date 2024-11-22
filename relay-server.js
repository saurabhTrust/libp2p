// First, relay-server.js - Let's keep this simple and correct
import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { circuitRelayServer } from '@libp2p/circuit-relay-v2'
import { identify } from '@libp2p/identify'
import * as filters from '@libp2p/websockets/filters'

async function startRelayServer() {
   const relay = await createLibp2p({
       addresses: {
           listen: ['/ip4/0.0.0.0/tcp/9090/ws']
       },
       transports: [
           webSockets({
               filter: filters.all
           })
       ],
       connectionEncrypters: [noise()],
       streamMuxers: [yamux()],
       services: {
           identify: identify(),
           relay: circuitRelayServer()
       }
   })

   await relay.start()
   console.log('Relay server started, listening on:')
   console.log('Addresses:', relay.getMultiaddrs().map(addr => addr.toString()))
}

startRelayServer().catch(console.error)