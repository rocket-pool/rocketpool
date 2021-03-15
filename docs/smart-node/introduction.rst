################################
The Rocket Pool Smart Node Stack
################################


************
Introduction
************

The Rocket Pool smart node software stack provides all of the necessary infrastructure for running a smart node in the Rocket Pool network.
The software stack consists of two main components:

* The smart node client, which provides a command-line interface for managing a smart node either locally or remotely (over SSH)
* The smart node service, which provides an API for client communication and performs background node tasks (such as validator duties)

The smart node service consists of a number of `Docker <https://www.docker.com/>`_ containers, in order to ensure consistent behavior across different systems.


********
Contents
********

.. toctree::
    :maxdepth: 2

    getting-started.rst
    upgrading.rst
    customization.rst
    non-docker.rst
    service.rst
    node-setup.rst
    staking-rpl.rst
    depositing.rst
    minipools.rst
    reference.rst
    api.rst
