# ExpressNFT

ExpressNFT is an NFT marketplace based on [ExpressCart](https://github.com/mrvautin/expressCart) and intended to be extensible and customizable for a wide range of applications.

NOTE: This ReadMe is a stub, and does not yet contain most of the information that you need to know.

## Installation and Setup

### Dependencies:

ExpressNFT needs to be connected to an instance of [PeerID](https://gitlab.com/PBSA/peerid), which handles user registration and logins, serves as an interface to the Peerplays blockchain, and manages blockchain permissions of the registered users.  To connect an instance of ExpressNFT to the PeerID instance, an administrative user logged in to the PeerID instance will "Add an App," which involves providing details of the ExpressNFT instance.  PeerID will generate a "client secret" which must then be added to the ExpressNFT configuration.

#### Required blockchain operations:

ExpressNFT needs permissions to use NFT-related and other blockchain operations on behalf of registered users.  These permissions are managed by the PeerID instance.  When adding the ExpressNFT app to PeerID, be sure to select the following operations:

- `transfer`
- `offer`
- `bid`
- `cancel_offer`
- `nft_metadata_create`
- `nft_metadata_update`
- `nft_mint`
