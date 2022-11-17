/**
 * Modified from https://github.com/Uniswap/merkle-distributor
 */

import { bufferToHex, keccak256 } from 'ethereumjs-util';
import web3 from 'web3';


export class MerkleTree {
  constructor(elements) {
    this.elements = [...elements];
    // Sort elements
    this.elements.sort(Buffer.compare);
    // Deduplicate elements
    this.elements = MerkleTree.bufDedup(this.elements);
    // Pad to power of 2
    let paddedLen = Math.pow(Math.ceil(Math.log2(this.elements.length)), 2);
    for (let i = this.elements.length; i < paddedLen; i++) {
      this.elements.push(Buffer.alloc(32));
    }

    this.bufferElementPositionIndex = this.elements.reduce((memo, el, index) => {
      memo[bufferToHex(el)] = index;
      return memo;
    }, {});

    // Create layers
    this.layers = this.getLayers(this.elements);
  }


  getLayers(elements) {
    if (elements.length === 0) {
      throw new Error('empty tree');
    }

    const layers = [];
    layers.push(elements);

    // Get next layer until we reach the root
    while (layers[layers.length - 1].length > 1) {
      layers.push(this.getNextLayer(layers[layers.length - 1]));
    }

    return layers;
  }


  getNextLayer(elements) {
    return elements.reduce((layer, el, idx, arr) => {
      if (idx % 2 === 0) {
        // Hash the current element with its pair element
        layer.push(MerkleTree.combinedHash(el, arr[idx + 1]));
      }

      return layer;
    }, []);
  }


  static combinedHash(first, second) {
    return keccak256(MerkleTree.sortAndConcat(first, second));
  }


  getRoot() {
    return this.layers[this.layers.length - 1][0];
  }


  getHexRoot() {
    return bufferToHex(this.getRoot());
  }


  getProof(el) {
    let idx = this.bufferElementPositionIndex[bufferToHex(el)];

    if (typeof idx !== 'number') {
      throw new Error('Element does not exist in Merkle tree');
    }

    return this.layers.reduce((proof, layer) => {
      if (layer.length > 1){
        const pairElement = MerkleTree.getPairElement(idx, layer);

        // Dangling element is paired with null
        if (pairElement) {
          proof.push(pairElement);
        } else {
          proof.push(Buffer.alloc(32));
        }
      }

      idx = Math.floor(idx / 2);

      return proof;
    }, []);
  }


  getHexProof(el) {
    const proof = this.getProof(el);

    return MerkleTree.bufArrToHexArr(proof);
  }


  static getPairElement(idx, layer) {
    const pairIdx = idx % 2 === 0 ? idx + 1 : idx - 1;

    if (pairIdx < layer.length) {
      return layer[pairIdx];
    } else {
      return null;
    }
  }


  static bufDedup(elements) {
    return elements.filter((el, idx) => {
      return idx === 0 || !elements[idx - 1].equals(el);
    });
  }


  static bufArrToHexArr(arr) {
    if (arr.some((el) => !Buffer.isBuffer(el))) {
      throw new Error('Array is not an array of buffers');
    }

    return arr.map((el) => '0x' + el.toString('hex'));
  }


  static sortAndConcat(...args) {
    return Buffer.concat([...args].sort(Buffer.compare));
  }
}

export class RewardClaimTree {
  constructor(balances) {
    this.tree = new MerkleTree(
      balances.map(({ address, network, amountRPL, amountETH }) => {
        return RewardClaimTree.toNode(address, network, amountRPL, amountETH);
      })
    );
  }


  static verifyProof(address, network, amountRPL, amountETH, proof, root) {
    let pair = RewardClaimTree.toNode(address, network, amountRPL, amountETH);
    for (const item of proof) {
      pair = MerkleTree.combinedHash(pair, item);
    }

    return pair.equals(root);
  }


  // keccak256(abi.encode(nodeAddress, network, amountRPL, amountETH))
  static toNode(nodeAddress, network, amountRPL, amountETH) {
    let node = Buffer.from(
      web3.utils.soliditySha3(
        {t: 'address', v: nodeAddress},
        {t: 'uint256', v: network},
        {t: 'uint256', v: amountRPL},
        {t: 'uint256', v: amountETH},
      ).substr(2), 'hex'
    );
    return node;
  }


  getHexRoot() {
    return this.tree.getHexRoot();
  }


  // returns the hex bytes32 values of the proof
  getProof(address, network, amountRPL, amountETH) {
    return this.tree.getHexProof(RewardClaimTree.toNode(address, network, amountRPL, amountETH));
  }
}


// Takes an array of objects with the form [{address, id, network, amountRPL, amountETH},...] and returns a RewardClaimTree object
export function parseRewardsMap(rewards) {

  // Transform input into a mapping of address => { address, network, amountRPL, amountETH }
  const dataByAddress = rewards.reduce((memo, { address, network, trustedNodeRPL, nodeRPL, nodeETH }) => {
    if (!web3.utils.isAddress(address)) {
      throw new Error(`Found invalid address: ${address}`);
    }

    memo[address] = {
      address: web3.utils.toChecksumAddress(address),
      amountRPL: nodeRPL.add(trustedNodeRPL),
      amountETH: nodeETH,
      network: network.BN,
    };
    return memo;
  }, {});

  const rewardsPerNetworkBN = rewards.reduce((perNetwork, {network, trustedNodeRPL, nodeRPL, nodeETH}) => {
    if(!(network in perNetwork)){
      perNetwork[network] = {
        RPL: '0'.BN,
        ETH: '0'.BN,
      };
    }
    perNetwork[network].RPL = perNetwork[network].RPL.add(nodeRPL.add(trustedNodeRPL));
    perNetwork[network].ETH = perNetwork[network].ETH.add(nodeETH);
    return perNetwork;
  }, {})


  const rewardsPerNetworkRPL = {}
  const rewardsPerNetworkETH = {}
  Object.keys(rewardsPerNetworkBN).map(network => rewardsPerNetworkRPL[network] = rewardsPerNetworkBN[network].RPL.toString());
  Object.keys(rewardsPerNetworkBN).map(network => rewardsPerNetworkETH[network] = rewardsPerNetworkBN[network].ETH.toString());

  // Sort
  const sortedAddresses = Object.keys(dataByAddress).sort();

  // Construct a tree
  const tree = new RewardClaimTree(
    sortedAddresses.map((address) => ({
      address: dataByAddress[address].address,
      network: dataByAddress[address].network,
      amountRPL: dataByAddress[address].amountRPL,
      amountETH: dataByAddress[address].amountETH
    }))
  );

  // Generate claims
  const claims = sortedAddresses.reduce((memo, _address) => {
    const { address, network, amountRPL, amountETH } = dataByAddress[_address];
    memo[address] = {
      network: Number(network),
      amountRPL: amountRPL.toString(),
      amountETH: amountETH.toString(),
      proof: tree.getProof(address, network, amountRPL, amountETH),
      leaf: RewardClaimTree.toNode(address, network, amountRPL, amountETH).toString('hex')
    };
    return memo;
  }, {});

  const totalRewardsRPL = sortedAddresses.reduce(
    (memo, key) => memo.add(dataByAddress[key].amountRPL),
    '0'.BN
  );

  const totalRewardsETH = sortedAddresses.reduce(
    (memo, key) => memo.add(dataByAddress[key].amountETH),
    '0'.BN
  );

  return {
    tree: tree,
    proof: {
      merkleRoot: tree.getHexRoot(),
      rewardsPerNetworkRPL: rewardsPerNetworkRPL,
      rewardsPerNetworkETH: rewardsPerNetworkETH,
      totalRewardsRPL: totalRewardsRPL.toString(),
      totalRewardsETH: totalRewardsETH.toString(),
      claims,
    }
  };
}
