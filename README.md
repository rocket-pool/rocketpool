*NOTE: The current Alpha of Rocket Pool requires the latest [testrpc@v4.1.1](https://github.com/ethereumjs/testrpc) and [truffle@v3.4.11](https://github.com/trufflesuite/truffle) to run locally (Truffle 4.0 beta currently has a few issues).

[logo]: https://raw.githubusercontent.com/darcius/rocketpool/master/images/rocket-pool-logo.png "Rocket Pool - Next Generation Decentralised Ethereum Proof of Stake (POS) Pool"

# Welcome to Rocket Pool - Your new Casper friendly Ethereum POS pool

`Rocket Pool` is a next generation decentralised Ethereum proof of stake (POS) pool currently in Alpha and built to be compatible with Casper. Features include Casper compatibility, smart nodes, decentralised infrastructure with automatic smart contract load balancing.

Unlike traditional centralsed POW pools, Rocket Pool utilises the power of smart contracts to create a self regulating decentralised network of smart nodes that allows users with any amount of Ether to earn interest on their deposit and help secure the Ethereum network at the same time.

The contracts are written in `solidity` and built with the Ethereum framework `truffle`. This project is currently in Alpha and undergoing heavy work.

# Test Rocket Pool

Easiest way to see Rocket Pool Alpha in action is to clone the repo, have testrpc running and the latest version of truffle installed. Make sure you have the [Truffle Default Builder](https://github.com/trufflesuite/truffle-default-builder) first installed as the default builder as a dependency of your Rocket Pool - please see the end of this readme file for step by step instructions :
```
$ npm install truffle-default-builder --save
```
Start testrpc in a new terminal window using the current block gas limit:
```
$ testrpc -l 6725527
```
Then run:
```
$ truffle test ./test/rocketPool.js
```
to put Rocket Pool through its paces.

# Rocket Pool White Paper

You can read the current Rocket Pool white paper here: [http://www.rocketpool.net/files/RocketPoolWhitePaper.pdf](http://www.rocketpool.net/files/RocketPoolWhitePaper.pdf).

# More Information and Contact

For more information on Rocket Pool, check out our [website here](http://www.rocketpool.net). You can also contact us there for more information.

---

# A Step by Step Beginners guide

The following worked example uses Mac OSX 10.12.6 and VMware Fusion 8.5.8 - all versions correct as of 15/09/2017

download and install Ubuntu onto a new VM -> https://www.ubuntu.com/download/desktop - tested with v16.04

open a Terminal window and install some pre-requisites:

install git:
```
$ sudo apt -y install git
```
install curl:  
```
$ sudo apt -y install curl
```
install npm:
```
$ sudo apt -y install npm
```
install node.js:
```
$ curl -sL https://deb.nodesource.com/setup_6.x | sudo -E bash -
$ sudo apt-get -y install nodejs
```
install testrpc:
```
$ sudo npm install -g ethereumjs-testrpc@v4.1.1
```
get rocketpool:
```
$ git clone https://github.com/darcius/rocketpool
```
install truffle:
```
$ sudo npm install -g truffle@v3.4.9
```
open the rocketpool directory:
```
$ cd rocketpool
```
initialise truffle:
```
$ sudo npm install truffle-default-builder --save
```
open new Terminal window:
```
testrpc -l 6725527
```
in original Terminal window:
```
$ truffle test ./test/rocketPool.js
```
