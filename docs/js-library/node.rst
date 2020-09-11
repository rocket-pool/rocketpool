.. _js-library-node:

####
Node
####


********
Overview
********

The ``node`` module manages nodes in the Rocket Pool network.
It loads node data from the chain, and can be used to register new nodes and make node deposits.


.. _js-library-node-types:

**********
Data Types
**********

``NodeDetails`` objects define the various details of a node::

    NodeDetails {
        address           // The address of the node
        exists            // Whether the node is registered in the network
        trusted           // Whether the node is a trusted (watchtower) node
        timezoneLocation  // The node's timezone location
    }


.. _js-library-node-methods:

*******
Methods
*******

    * ``node.getNodes()``:
      Get the details of all nodes in the network; returns ``Promise<NodeDetails[]>``

    * ``node.getNodeAddresses()``:
      Get the addresses of all nodes in the network; returns ``Promise<string[]>``

    * ``node.getTrustedNodes()``:
      Get the details of all trusted nodes in the network; returns ``Promise<NodeDetails[]>``

    * ``node.getTrustedNodeAddresses()``:
      Get the addresses of all trusted nodes in the network; returns ``Promise<string[]>``

    * ``node.getNodeDetails(address)``:
      Get the details of the specified node; returns ``Promise<NodeDetails>``

    * ``node.getNodeCount()``:
      Get the total number of nodes in the network; returns ``Promise<number>``

    * ``node.getNodeAt(index)``:
      Get the address of a node in the network by index; returns ``Promise<string>``

    * ``node.getTrustedNodeCount()``:
      Get the total number of trusted nodes in the network; returns ``Promise<number>``

    * ``node.getTrustedNodeAt(index)``:
      Get the address of a trusted node in the network by index; returns ``Promise<string>``

    * ``node.getNodeExists(address)``:
      Check whether the node with the specified address is registered; returns ``Promise<bool>``

    * ``node.getNodeTrusted(address)``:
      Check whether the node with the specified address is trusted; returns ``Promise<bool>``

    * ``node.getNodeTimezoneLocation(address)``:
      Get the timezone location of the node with the specified address; returns ``Promise<string>``

    * ``node.registerNode(timezoneLocation, options, onConfirmation)``:
      Register the calling address as a node in the network; returns ``Promise<TransactionReceipt>``

    * ``node.setTimezoneLocation(timezoneLocation, options, onConfirmation)``:
      Update the timezone location of the calling node; returns ``Promise<TransactionReceipt>``

    * ``node.deposit(minimumNodeFee, options, onConfirmation)``:
      Make a deposit to create a minipool, with a minimum acceptable commission rate; returns ``Promise<TransactionReceipt>``
