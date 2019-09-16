#########
Contracts
#########


********
Overview
********

The ``contracts`` module loads Rocket Pool contract ABIs and addresses from ``RocketStorage``, where all network contracts are registered.
Contract ABIs and addresses are loaded from the chain, the ABIs are decompressed and decoded, and then web3 contract instances are created from them.
This is performed dynamically because Rocket Pool contracts can be upgraded and their ABIs and addresses may change.

This module is used by other library modules internally, and generally does not need to be used directly.
However, it is exposed publicly for when direct access to web3 contract instances is desired or the library wrapper methods are insufficient.


************************
Loading Contracts & ABIs
************************

Network contracts can be loaded via the ``contracts.get()`` method, which accepts either a single contract name as a string, or a list of contract names as an array of strings.
If a single contract name is passed, this method returns a promise resolving to a web3 contract instance.
If a list of contract names is passed, it returns a promise resolving to an array of web3 contract instances, in the same order.

Contract ABIs can be loaded in a similar fashion via the ``contracts.abi()`` method, which accepts either a single contract name, or a list of names, to retrieve ABIs for.
This returns a promise resolving to an ABI as a JavaScript object, or an array of ABIs.


***************************
Creating Contract Instances
***************************

Some network contracts, such as ``RocketGroupContract``, ``RocketNodeContract`` and ``RocketMinipool`` have multiple instances deployed at a number of different addresses.
To create an instance of one of these contracts, use the ``contracts.make(name, address)`` method.
It accepts the name of the contract and the address of the specific instance required, both as strings, and returns a promise resolving to a web3 contract instance.


***************************
Alternate Contract Versions
***************************

When Rocket Pool network contracts are upgraded, old versions remain on the chain and can still be accessed if required.
A "contract version set", consisting of all versions of a contract by name, can be loaded with the ``contracts.versions(name)`` method.
This method accepts the name of the contract to load, and returns a promise resolving to the version set object.

Contract version sets are primarily used for accessing old event data.
They provide the following methods:

    * ``versionSet.current()``: Returns the current version of the contract
    * ``versionSet.first()``: Returns the first version of the contract deployed
    * ``versionSet.at(index)``: Returns the version of the contract at the specified version index (0 = first version)
    * ``versionSet.getPastEvents(eventName, options)``: As per `web3's contract.getPastEvents <https://web3js.readthedocs.io/en/v1.2.1/web3-eth-contract.html#getpastevents>`_, but returns a promise resolving to the events for all versions of the contract
