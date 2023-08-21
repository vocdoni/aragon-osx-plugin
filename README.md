# Vocdoni based voting plugin for Aragon OSx

This repository contains the smart contracts required for allowing any Aragon DAO to use the Vocdoni voting protocol as the DAO voting backend.

An Aragon DAO can install the Vocdoni voting plugin to enable its members to use the Vocdoni voting protocol.

The voting processes are held on the Vocdoni blockchain thus giving the DAO members the ability to:

- Vote without any cost
- Vote anonymously using zk-SNARKs technology
- Create custom censuses with complex strategies
- Have full transparency and verifiability of the voting process and the votes casted
- Execute on-chain defined actions based on the voting results
- Vote from any device (mobile, desktop, etc.)

For more information about the Vocdoni voting protocol, please refer to the [Vocdoni documentation](https://developer.vocdoni.io/protocol/overview).

## How it works


## Setup

### Prerequisites

You need to have `node.js` and `yarn` installed.

### Installation

```shell
$ git clone https://github.com/vocdoni/aragon-osx-plugin.git
$ cd aragon-osx-plugin
$ yarn install
```

### Scripts

#### Test

`yarn test`

#### Build

`yarn build`

For NPM based build

`yarn build:npm`

#### Code coverage

`yarn coverage`

#### Code flattening

`yarn flatten`

#### Smart contract analysis

`yarn analyze`

#### Deployment

`yarn deploy`

#### Development

`yarn dev`

#### Generate documentation

`yarn docgen`

#### Code formatting

Check

`yarn formatting:check`

Write

`yarn formatting:write`

#### Clean

`yarn clean`

## License

[GNU Affero General Public License v3.0](./LICENSE)
