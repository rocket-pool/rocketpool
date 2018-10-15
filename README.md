# Rocket Pool - A next generation Ethereum proof of stake (PoS) infrastructure service [![Build Status](https://travis-ci.org/rocket-pool/rocketpool.svg?branch=rocket-two)](https://travis-ci.org/rocket-pool/rocketpool)

*NOTE: The current alpha of Rocket Pool requires the latest [ganache-cli@v6.1.8](https://github.com/trufflesuite/ganache-cli), [truffle@5.0](https://github.com/trufflesuite/truffle), and [NodeJS@8.0](https://nodejs.org/en/download/package-manager/) or greater to run locally.

<p align="center">
  <img src="https://raw.githubusercontent.com/rocket-pool/rocketpool/rocket-two/images/logo.png?raw=true" alt="Rocket Pool - Next Generation Decentralised Ethereum Proof-of-Stake (PoS) Pool" width="500" />
</p>

---

`Rocket Pool 2.0` is a next generation Ethereum proof of stake (PoS) infrastructure service designed to be highly decentralised, distributed and compatible with Casper 2.0, the new consensus protocol that Ethereum will transition to in late 2019.

We offer any user, business, corporation, pool, wallet provider, exchange, hedge fund; just about any service, the ability to provide their users the option to earn interest on their ether holdings for a fixed term without worrying about maintaining an extensive staking infrastructure, just plug and play. For a high level overview, please read our 2.0 announcement article.

Rocket Pool has a long history in Ethereum and work on it originally began in late 2016 after the Mauve paper was released by Vitalik Buterin. This provided an early functional spec for Ethereum's new consensus protocol called Casper which would allow users to earn interest on a deposit of Ethereum. Since then Rocket Pool has grown and evolved into a next generation staking network, aiming to allow businesses and their users to earn interest on their ether and to empower users who wish to stake on their own node by providing them with additional income on top of Casper's interest. 

Rocket Pool isn't just a whitepaper, it's actual code. Be sure to read the [https://medium.com/rocket-pool/rocket-pool-101-faq-ee683af10da9](Rocket Pool 101 - FAQ for more information).

# Test Rocket Pool

<p align="center">
  <img src="https://raw.githubusercontent.com/rocket-pool/rocketpool/master/images/rocket-pool-casper-pos-test.png?raw=true" alt="Rocket Pool - Testing Ethereum Proof-of-Stake (PoS) Pool"/>
</p>

To see Rocket Pool in action, clone the repo and run Ganache with the latest version of truffle installed. A quick and easy way to do this is to use the test script provided with the project:
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
