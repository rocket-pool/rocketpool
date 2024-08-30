import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import {
    LinkedListStorage
} from '../_utils/artifacts';
import { assert } from 'hardhat';

export default function() {
    contract('LinkedListStorage', async (accounts) => {


        // Accounts
        const [
            random,
        ] = accounts;

        const regularQueue = web3.utils.soliditySha3('regular')
        const expressQueue = web3.utils.soliditySha3('express')

        // Setup
        before(async () => {

        });

        it(printTitle('random', 'pack/unpack shouldnt change values'), async () => {
            const linkedListStorage = await LinkedListStorage.deployed();            
            let item = {
                receiver: random,
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
                receiver: random,
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

            let first = await linkedListStorage.getItem.call(regularQueue, 1);
            assert.equal(first.validatorId, 1)
            let last = await linkedListStorage.getItem.call(regularQueue, 3);
            assert.equal(last.validatorId, 3)
            await linkedListStorage.dequeueItem(regularQueue)
            listLength = await linkedListStorage.getLength.call(regularQueue);
            assert.equal(listLength, 1)
            await linkedListStorage.dequeueItem(regularQueue)
            listLength = await linkedListStorage.getLength.call(regularQueue);
            assert.equal(listLength, 0)
        });

        it(printTitle('random', 'can remove the only queue item'), async () => {
            const linkedListStorage = await LinkedListStorage.deployed();
            let itemIn = {
                receiver: random,
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
                receiver: random,
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
                receiver: random,
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
                receiver: random,
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
