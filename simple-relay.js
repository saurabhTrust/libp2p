import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { circuitRelayServer } from '@libp2p/circuit-relay-v2'
import { identify } from '@libp2p/identify'
import { yamux } from '@chainsafe/libp2p-yamux'

async function main() {
    const relay = await createLibp2p({
        addresses: {
            listen: ['/ip4/0.0.0.0/tcp/9090/ws']
        },
        transports: [webSockets()],
        connectionEncrypters: [noise()],  // Changed from connectionEncryption
        streamMuxers: [yamux()],         // Add stream muxer
        services: {
            relay: circuitRelayServer(),
            identify: identify()
        }
    })

    await relay.start()  // Make sure to start the node
    console.log('Relay server started')
    console.log('Addresses:', relay.getMultiaddrs().map(addr => addr.toString()))
}

main().catch(console.error)