###############################
The Rocket Pool Smart Contracts
###############################


************
Introduction
************

The Rocket Pool `Smart Contracts <https://www.ethereum.org/learn/#smart-contracts>`_ form the foundation of the Rocket Pool network.
They are the base layer of infrastructure which all other elements of the network are built on top of, including the JavaScript library, the Smart Node software stack, and all web or application interfaces.

Direct interaction with the contracts is usually not necessary, and is facilitated through the use of other software (such as the JavaScript library).
This section provides a detailed description of the contract design, and information on how to build on top of Rocket Pool via the API, for developers wishing to extend it.
All code examples are given as Solidity v0.5.0.


********
Contents
********

.. toctree::
    :maxdepth: 2

    design.rst
    groups.rst
    deposits.rst
    nodes.rst
    reference.rst
