# Rocket Pool - Your new Casper-friendly Ethereum PoS pool

*NOTE: The current alpha of Rocket Pool requires the latest [ganache-cli@v6.1](https://github.com/trufflesuite/ganache-cli), [truffle@4.1.8](https://github.com/trufflesuite/truffle), and [NodeJS@8.0](https://nodejs.org/en/download/package-manager/) or greater to run locally.

<p align="center">
  <img src="https://raw.githubusercontent.com/rocket-pool/rocketpool/rocket-two/images/logo.png?raw=true" alt="Rocket Pool - Next Generation Decentralised Ethereum Proof-of-Stake (PoS) Pool"/>
</p>

---

`Rocket Pool` is a next-generation decentralised Ethereum proof-of-stake (PoS) pool currently in alpha. Features include Casper compatibility, smart nodes, and decentralised infrastructure with automatic smart contract load balancing.

Unlike traditional centralised proof-of-work (PoW) pools, Rocket Pool utilises the power of smart contracts to create a self-regulating decentralised network of smart nodes that allows users with any amount of ether to earn interest on their deposits and help secure the Ethereum network at the same time.

Contracts are written in `solidity` and built with the Ethereum framework `truffle`. This project is currently in alpha and undergoing heavy work.

# Test Rocket Pool

<p align="center">
  <img src="https://raw.githubusercontent.com/rocket-pool/rocketpool/master/images/rocket-pool-casper-pos-test.png?raw=true" alt="Rocket Pool - Testing Ethereum Proof-of-Stake (PoS) Pool"/>
</p>

To see Rocket Pool alpha in action, clone the repo and run Ganache with the latest version of truffle installed. A quick and easy way to do this is to use the test script provided with the project:
```bash
$ npm install && npm test
```
This will start Ganache (if not already started) with the current block gas limit and put Rocket Pool through its paces. * These tests are extensive and can take up to 2-10 mins to run depending on your machines specs *.

# Rocket Pool White Paper

You can read the current Rocket Pool white paper here: [http://www.rocketpool.net/files/RocketPoolWhitePaper.pdf](http://www.rocketpool.net/files/RocketPoolWhitePaper.pdf).

# Contact and Additional Information

Check out [our website](http://www.rocketpool.net) for more information on Rocket Pool.

Contact form: https://www.rocketpool.net/#contact

Twitter: https://twitter.com/Rocket_Pool

Join our Discord chat channel! https://discordapp.com/invite/tCRG54c

---

# A Step-by-Step Beginners Guide

The following worked example uses macOS Sierra 10.12.6 and VMware Fusion 8.5.8 - all versions correct as of 15/09/2017.

Download and install Ubuntu onto a new VM -> https://www.ubuntu.com/download/desktop - tested with v16.04

Open a terminal window and install some pre-requisites:

install git:
```bash
$ sudo apt -y install git
```
install curl:  
```bash
$ sudo apt -y install curl
```
install npm:
```bash
$ sudo apt -y install npm
```
install node.js:
```bash
$ curl -sL https://deb.nodesource.com/setup_6.x | sudo -E bash -
$ sudo apt-get -y install nodejs
```
get rocketpool:
```bash
$ git clone https://github.com/rocket-pool/rocketpool
```
open the rocketpool directory:
```bash
$ cd rocketpool
```
install npm packages and run tests:
```bash
$ npm install && npm test
```
