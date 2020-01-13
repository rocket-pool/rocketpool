// Dependencies
const fs = require('fs');
const Web3 = require('web3');

// Artifacts
const RocketPoolToken = artifacts.require('./contract/token/DummyRocketPoolToken.sol');

// Load contract data
const ExchangeABI = JSON.parse(fs.readFileSync(__dirname + '/../../../contracts/contract/uniswap/compiled/exchange.abi'));

module.exports = async (done) => {

    // Get command-line arguments (remove args from truffle)
    let args = process.argv.splice(4);

    // Validate arguments
    if (args.length != 3) done('Incorrect number of arguments. Please enter: RPL exchange address, RPL amount, ether amount.');
    if (!Web3.utils.isAddress(args[0])) done('RPL exchange address is invalid.');
    if (isNaN(args[1])) done('RPL amount is invalid.');
    if (isNaN(args[2])) done('Ether amount is invalid.');

    // Parse arguments
    let [rplExchangeAddress, tokenAmount, ethAmount] = args;

    // Initialise web3
    const web3 = new Web3('http://127.0.0.1:8545');

    // Get coinbase
    let from = await web3.eth.getCoinbase();

    // Get token amounts
    let tokenAmountWei = Web3.utils.toWei(tokenAmount, 'ether');
    let ethAmountWei = Web3.utils.toWei(ethAmount, 'ether');

    // Initialise contracts
    let rplExchange = new web3.eth.Contract(ExchangeABI, rplExchangeAddress);
    let rpl = await RocketPoolToken.deployed();

    // Mint RPL & set exchange allowance
    await rpl.mint(from, tokenAmountWei, {from, gas: 8000000});
    await rpl.approve(rplExchangeAddress, tokenAmountWei, {from, gas: 8000000});

    // Add liquidity
    await rplExchange.methods.addLiquidity(0, tokenAmountWei, 5000000000).send({from, gas: 8000000, value: ethAmountWei});

    // Log
    done('Successfully added ' + Web3.utils.fromWei(tokenAmountWei, 'ether') + ' RPL @ ' + Web3.utils.fromWei(ethAmountWei, 'ether') + ' ETH.');

}
