# Rocket Pool - A next generation Ethereum proof of stake (PoS) infrastructure service and pool [![Build Status](https://travis-ci.org/rocket-pool/rocketpool.svg?branch=master)](https://travis-ci.org/rocket-pool/rocketpool)

*NOTE: The current version of Rocket Pool requires the latest [ganache-cli@v6.12.1](https://github.com/trufflesuite/ganache-cli), [truffle@v5.1.51](https://github.com/trufflesuite/truffle), and [NodeJS@12.18.3 LTS](https://nodejs.org/en/download/package-manager/) or greater to run locally.

<p align="center">
  <img src="https://raw.githubusercontent.com/rocket-pool/rocketpool/master/images/logo.png?raw=true" alt="Rocket Pool - Next Generation Decentralised Ethereum Proof-of-Stake (PoS) Infrastructure Service and Pool" width="500" />
</p>

---

`Rocket Pool 2.5` is a first of its kind Ethereum Proof of Stake (PoS) infrastructure service, designed to be highly decentralised, distributed and compatible with staking in Ethereum  2.0 on the beacon chain. It was first conceived in late 2016 and has since had several successful public betas over the life span of ETH2 development. The staking network allows any individual, business, defi dapp, wallet provider, SaaS provider, exchange — just about any service — the ability to provide their users with the option to earn staking rewards on their ETH holdings without worrying about maintaining an extensive staking infrastructure, just plug and play.

Staking with the Rocket Pool network is very flexible and unlike any other staking infrastructure for Ethereum 2.0 to date. When depositing ETH into the Rocket Pool smart contracts, you will be instantly issued a token called rETH which represents a tokenised staking deposit in the network. Its value and the rewards it gains over time will be reflected by the work each individual decentralised node operator gives the Rocket Pool network. Rocket Pool’s unique decentralised staking infrastructure is economically bonded to both be secure and scalable.

Rocket Pool isn't just a whitepaper, it's actual code. Be sure to read the [Rocket Pool 101 - FAQ for more information](https://medium.com/rocket-pool/rocket-pool-101-faq-ee683af10da9).

# Test Rocket Pool

<p align="center">
  <img src="https://raw.githubusercontent.com/rocket-pool/rocketpool/master/images/rocket-pool-casper-pos-beacon-chain-test.png?raw=true" alt="Rocket Pool - Testing Ethereum Proof-of-Stake (PoS) Infrastructure Service and Pool for Ethereum 2.0 Beacon Chain"/>
</p>

To see Rocket Pool in action, clone the repo and run Ganache with the latest version of truffle installed. A quick and easy way to do this is to use the test script provided with the project:
```bash
$ npm install && npm test
```
This will start Ganache (if not already started) with the current block gas limit and put Rocket Pool through its paces. * These tests are extensive and can take up to 2-10 mins to run depending on your machines specs *.

# Rocket Pool White Paper

You can read the current Rocket Pool white paper here: [https://docs.rocketpool.net/whitepaper](https://docs.rocketpool.net/whitepaper).

# Contact and Additional Information

Check out [our website](https://www.rocketpool.net) for more information on Rocket Pool.

Contact form: https://www.rocketpool.net/#contact

Twitter: https://twitter.com/Rocket_Pool

Join our Discord chat channel! https://discord.gg/rocketpool

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
