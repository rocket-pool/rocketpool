import { before, describe, it } from 'mocha';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import {
    LinkedListStorage
} from '../_utils/artifacts';
import { globalSnapShot } from '../_utils/snapshotting';
import * as assert from 'node:assert';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

export default function() {
    describe('LinkedListStorage', () => {
        let random;

        const regularQueue = ethers.solidityPackedKeccak256(['string'], ['regular'])
        const expressQueue = ethers.solidityPackedKeccak256(['string'], ['express'])

        // Setup
        before(async () => {
            await globalSnapShot();

            [
                random,
            ] = await ethers.getSigners();
        });

        it(printTitle('random', 'pack/unpack shouldnt change values'), async () => {
            const linkedListStorage = await LinkedListStorage.deployed();            
            let item = {
                receiver: random.address,
                validatorId: 1,
                suppliedValue: 8000,
                requestedValue: 32000,
            }
            let packedItem = await linkedListStorage.packItem(item)
            let unpackedItem = await linkedListStorage.unpackItem(packedItem)
            assert.equal(item.receiver, unpackedItem.receiver)
            assert.equal(item.validatorId, unpackedItem.validatorId)
            assert.equal(item.suppliedValue, unpackedItem.suppliedValue)
            assert.equal(item.requestedValue, unpackedItem.requestedValue)
        });

        it(printTitle('random', 'can enqueue/dequeue items'), async () => {
            const linkedListStorage = await LinkedListStorage.deployed();
            let itemIn = {
                receiver: random.address,
                validatorId: 1,
                suppliedValue: 8000,
                requestedValue: 32000,
            }
            // enqueue 3 items, check for the correct indexOf and length
            await linkedListStorage.enqueueItem(regularQueue, itemIn);
            let indexOfFirst = await linkedListStorage.getIndexOf(regularQueue, itemIn)
            assert.equal(indexOfFirst, 1)
            let listLength = await linkedListStorage.getLength(regularQueue);
            assert.equal(listLength, 1)

            itemIn.validatorId = 2
            await linkedListStorage.enqueueItem(regularQueue, itemIn)
            listLength = await linkedListStorage.getLength(regularQueue);
            assert.equal(listLength, 2)

            itemIn.validatorId = 3
            await linkedListStorage.enqueueItem(regularQueue, itemIn)
            listLength = await linkedListStorage.getLength(regularQueue);
            assert.equal(listLength, 3)

            itemIn.validatorId = 2
            // remove the second item
            await linkedListStorage.removeItem(regularQueue, itemIn)

            let first = await linkedListStorage.getItem(regularQueue, 1);
            assert.equal(first.validatorId, 1)
            let last = await linkedListStorage.getItem(regularQueue, 3);
            assert.equal(last.validatorId, 3)
            await linkedListStorage.dequeueItem(regularQueue)
            listLength = await linkedListStorage.getLength(regularQueue);
            assert.equal(listLength, 1)
            await linkedListStorage.dequeueItem(regularQueue)
            listLength = await linkedListStorage.getLength(regularQueue);
            assert.equal(listLength, 0)
        });

        it(printTitle('random', 'can remove the only queue item'), async () => {
            const linkedListStorage = await LinkedListStorage.deployed();
            let itemIn = {
                receiver: random.address,
                validatorId: 1,
                suppliedValue: 8000,
                requestedValue: 32000,
            }
            await linkedListStorage.enqueueItem(regularQueue, itemIn)
            await linkedListStorage.dequeueItem(regularQueue)
            let listLength = await linkedListStorage.getLength(regularQueue);
            assert.equal(listLength, 0)
        }); 

        it(printTitle('random', 'cannot add the same item twice'), async () => {
            const linkedListStorage = await LinkedListStorage.deployed();
            let itemIn = {
                receiver: random.address,
                validatorId: 1,
                suppliedValue: 8000,
                requestedValue: 32000,
            }
            await linkedListStorage.enqueueItem(regularQueue, itemIn)
            let listLength = await linkedListStorage.getLength(regularQueue);
            assert.equal(listLength, 1)
            await shouldRevert(linkedListStorage.enqueueItem(regularQueue, itemIn))
        });

        it(printTitle('random', 'indexOf for non existing item returns 0'), async () => {
            const linkedListStorage = await LinkedListStorage.deployed();
            let itemIn = {
                receiver: random.address,
                validatorId: 1,
                suppliedValue: 8000,
                requestedValue: 32000,
            }
            let indexOf = await linkedListStorage.getIndexOf(regularQueue, itemIn);
            assert.equal(indexOf, 0)
        });

        it(printTitle('random', 'reverts when trying to remove non existent item'), async () => {
            const linkedListStorage = await LinkedListStorage.deployed();
            let itemIn = {
                receiver: random.address,
                validatorId: 1,
                suppliedValue: 8000,
                requestedValue: 32000,
            }
            await linkedListStorage.enqueueItem(regularQueue, itemIn)
            itemIn.validatorId = 2
            await shouldRevert(linkedListStorage.removeItem(regularQueue, itemIn));
        });
        
    });
}
