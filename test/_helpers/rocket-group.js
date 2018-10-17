// Dependencies
import { RocketGroupAPI, RocketGroupContract, RocketGroupAccessorContract, RocketGroupSettings } from '../_lib/artifacts';


// Create a new group contract
export async function createGroupContract({name, stakingFee, groupOwner}) {

    // Get new group fee
    let rocketGroupSettings = await RocketGroupSettings.deployed();
    let newGroupFee = parseInt(await rocketGroupSettings.getNewFee());

    // Create group
    let rocketGroupAPI = await RocketGroupAPI.deployed();
    let groupAddResult = await rocketGroupAPI.add(name, stakingFee, {from: groupOwner, gas: 7500000, value: newGroupFee});

    // Get & return group contract
    let groupContractAddress = groupAddResult.logs.filter(log => (log.event == 'GroupAdd'))[0].args.ID;
    let groupContract = await RocketGroupContract.at(groupContractAddress);
    return groupContract;

}


// Create a new group default accessor contract
export async function createGroupAccessorContract({groupContractAddress, groupOwner}) {

    // Create accessor
    let rocketGroupAPI = await RocketGroupAPI.deployed();
    let accessorCreateResult = await rocketGroupAPI.createDefaultAccessor(groupContractAddress, {from: groupOwner, gas: 7500000});

    // Get & return accessor contract
    let accessorContractAddress = accessorCreateResult.logs.filter(log => (log.event == 'GroupCreateDefaultAccessor'))[0].args.accessorAddress;
    let accessorContract = await RocketGroupAccessorContract.at(accessorContractAddress);
    return accessorContract;

}


// Add an accessor to a group
export async function addGroupAccessor({groupContract, groupAccessorContractAddress, groupOwner}) {
    await groupContract.addDepositor(groupAccessorContractAddress, {from: groupOwner, gas: 500000});
    await groupContract.addWithdrawer(groupAccessorContractAddress, {from: groupOwner, gas: 500000});
}

