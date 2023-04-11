const fs = require('fs')
const path = require('path')
const glob = require('glob')
const Web3 = require('web3')
const axios = require('axios')
const querystring = require('query-string')

const INPUT = process.env.INPUT || './build/contracts/'
const OUTPUT = process.env.OUTPUT || './build/packed/'

const PREAMBLE = process.env.PREAMBLE || './scripts/preamble.sol' // Prefixed to all project source code
const LICENSE = process.env.LICENCE || 5 // 5=GPLv3 https://etherscan.io/contract-license-types
const NETWORK = process.env.NETWORK || 'mainnet' // Can be goerli or mainnet
const API_KEY = process.env.API_KEY // Etherscan API key
const PROVIDER = process.env.PROVIDER // Web3 provider

const web3 = new Web3(PROVIDER)

function apiEndpoint (network) {
  switch (network) {
    case 'goerli':
      return 'https://api-goerli.etherscan.io/api'
    case 'mainnet':
      return 'https://api.etherscan.io/api'
  }
  throw new Error(`Unknown network ${network}`)
}

function networkToId (network) {
  switch (network) {
    case 'goerli':
      return '5'
    case 'mainnet':
      return '1'
  }
  throw new Error(`Unknown network ${network}`)
}

async function isVerified (address) {
  const result = await axios.get(`${apiEndpoint(NETWORK)}?module=contract&action=getabi&apikey=${API_KEY}&address=${address}`)
  return result.data.status !== '0'
}

async function submitVerification (json, name, address, compiler, constructorArgs) {
  // Check if it's already verified
  if (await isVerified(address)) {
    console.log(`${name} is already verified`)
    return
  }

  const payload = {
    apikey: API_KEY,
    module: 'contract',
    action: 'verifysourcecode',
    contractaddress: address,
    sourceCode: JSON.stringify(json),
    codeformat: 'solidity-standard-json-input',
    contractname: name,
    compilerversion: 'v' + compiler,
    optimizationUsed: 0, // unused
    runs: 200, // unused
    evmversion: '', // unused
    constructorArguements: constructorArgs,
    licenseType: LICENSE,
    libraryname1: '',
    libraryaddress1: '',
    libraryname2: '',
    libraryaddress2: '',
    libraryname3: '',
    libraryaddress3: '',
    libraryname4: '',
    libraryaddress4: '',
    libraryname5: '',
    libraryaddress5: '',
    libraryname6: '',
    libraryaddress6: '',
    libraryname7: '',
    libraryaddress7: '',
    libraryname8: '',
    libraryaddress8: '',
    libraryname9: '',
    libraryaddress9: '',
    libraryname10: '',
    libraryaddress10: '',
  }
  // Build form data
  const formData = querystring.stringify(payload)
  // Submit to etherscan api
  console.log(`Attempting to verify ${name} at ${address}`)
  const result = await axios.post(apiEndpoint(NETWORK), formData)
  // Check result
  if (result.data.status !== '1') {
    console.error(`Something went wrong`)
    console.log(result.data)
    process.exit()
  } else {
    console.log(`Receipt GUID is ${result.data.result}`)
  }
}

async function getConstructorArgs (txHash, bytecode) {
  const tx = await web3.eth.getTransaction(txHash)
  const input = tx.input
  const constructorArgs = input.substring(bytecode.length)
  return constructorArgs
}

function normaliseContractPath (contractPath) {
  // If the current platform is not Windows, the path does not need to be changed
  if (process.platform !== 'win32') return contractPath
  // If the contract path doesn't start with '/[A-Z]/' it is not a Unixified Windows path
  if (!contractPath.match(/^\/[A-Z]\//i)) return contractPath
  const driveLetter = contractPath.substring(1, 2)
  const normalisedContractPath = path.resolve(`${driveLetter}:/${contractPath.substring(3)}`)
  return normalisedContractPath
}

function processFile (file) {
  // Prepare the JSON payload
  const networkId = networkToId(NETWORK)
  const data = JSON.parse(fs.readFileSync(file))
  const metadata = JSON.parse(data.metadata)
  const libraries = {}
  const inputJSON = {
    language: metadata.language,
    sources: {},
    settings: {
      remappings: metadata.settings.remappings,
      optimizer: metadata.settings.optimizer,
      evmVersion: metadata.settings.evmVersion,
      libraries
    }
  }
  // Load preamble
  const preamble = fs.readFileSync(PREAMBLE, 'utf8')
  // Iterate sources and read in the content from files
  for (const contractPath in metadata.sources) {
    // If we're on Windows we need to de-Unixify the path so that Windows can read the file
    let normalisedContractPath = normaliseContractPath(contractPath)
    // If the path begins with project: then it's one of our files, so add the preamble
    if (normalisedContractPath.startsWith('project:')) {
      normalisedContractPath = normalisedContractPath.substring('project:'.length)
      const content = preamble + fs.readFileSync('.' + normalisedContractPath, 'utf8')
      inputJSON.sources[normalisedContractPath] = { content }
    } else {
      // Otherwise, try to use require to resolve it (likely a dependency in node_modules)
      const absolutePath = require.resolve(normalisedContractPath)
      const content = fs.readFileSync(absolutePath, 'utf8')
      inputJSON.sources[normalisedContractPath] = { content }
    }
  }
  // Find correct address
  let address = null
  let transactionHash = null
  if (data.networks.hasOwnProperty(networkId)) {
    address = data.networks[networkId].address
    transactionHash = data.networks[networkId].transactionHash
  }
  // Calculate the contract name from compilation target
  const compilationTarget = metadata.settings.compilationTarget
  const compilationTargetFile = Object.keys(compilationTarget)[0]
  const compilationTargetContract = compilationTarget[compilationTargetFile]
  // Normalise the filename
  let normalisedCompilationTargetFile = normaliseContractPath(compilationTargetFile)
  if (normalisedCompilationTargetFile.startsWith('project:')) {
    normalisedCompilationTargetFile = normalisedCompilationTargetFile.substring('project:'.length)
  }
  // Return data
  return {
    name: `${normalisedCompilationTargetFile}:${compilationTargetContract}`,
    transactionHash: transactionHash,
    bytecode: data.bytecode,
    compiler: metadata.compiler,
    address: address,
    data: inputJSON
  }
}

function processDirectory (inputDir, outputDir) {
  glob(`${inputDir}*.json`, async function (err, files) {
    if (err) {
      console.error(err)
      return
    }
    // Create output directory if it doesn't exist
    fs.mkdirSync(outputDir, { recursive: true })
    // Loop files in directory and process
    for (const file of files) {
      console.log(`Processing file ${file}`)
      // Process and write result to output directory for troubleshooting
      const output = processFile(file)
      const basename = path.basename(file)
      const outputPath = `${outputDir}${basename}`
      fs.writeFileSync(outputPath, JSON.stringify(output))
      // Submit for verification if it has been deployed
      if (output.address) {
        // Retrieve the constructor args from on chain
        const constructorArgs = await getConstructorArgs(output.transactionHash, output.bytecode)
        // Submit verification
        await submitVerification(output.data, output.name, output.address, output.compiler.version, constructorArgs)
      }
    }
  })
}

processDirectory(INPUT, OUTPUT)
