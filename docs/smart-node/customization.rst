.. _smart-node-customization:

###################################
Customizing the Rocket Pool Service
###################################

This section describes how to customize the Rocket Pool service, and is intended for advanced users with custom setups.
If you're happy to run your smart node as provided "out of the box" by Rocket Pool, skip ahead.

All examples given below assume you are working locally on your smart node.
If you manage your node remotely, SSH into it before running any commands.


.. _smart-node-customization-storage:

****************************
Customizing Storage Location
****************************

By default, chain data for your Eth 1.0 and Eth 2.0 clients will be stored in persistent volumes created by Docker.
These volumes are managed by Docker and are usually stored on your primary partition.

If you would like to change the location at which your chain data is stored (for example, to store it on a different drive), you may instead mount local filesystem paths to your ``eth1`` and ``eth2`` containers.

**Do not mount an existing chain data directory to your client container if it is still in use by a running process**.
**Never share a chain database between multiple processes, as this will result in a corrupted database**.

#. If the Rocket Pool service is already running, stop it with::

    rocketpool service terminate

#. Open ``~/.rocketpool/docker-compose.yml``, and modify the ``eth1`` and ``eth2`` sections as follows:

    * Change ``eth1clientdata:/ethclient`` to ``/path/to/eth1/storage:/ethclient`` (example only) to set a local filesystem path for your Eth 1.0 chain database
    * Change ``eth2clientdata:/ethclient`` to ``/path/to/eth2/storage:/ethclient`` (example only) to set a local filesystem path for your Eth 2.0 chain database

#. Modify the ``volumes`` section at the bottom of the file as follows:

    * Remove the ``eth1clientdata:`` line if you set a custom path for your Eth 1.0 chain database
    * Remove the ``eth2clientdata:`` line if you set a custom path for your Eth 2.0 chain database
    * Remove the ``volumes`` section entirely if it's empty

#. Restart the Rocket Pool service with::

    rocketpool service start


.. _smart-node-customization-client-options:

**********************************************
Customizing Eth 1.0 and Eth 2.0 Client Options
**********************************************

The Eth 1.0 and Eth 2.0 clients are bootstrapped via shell scripts at the following locations:

    * Eth 1.0 Client: ``~/.rocketpool/chains/eth1/start-node.sh``
    * Eth 2.0 Beacon Chain: ``~/.rocketpool/chains/eth2/start-beacon.sh``
    * Eth 2.0 Validator: ``~/.rocketpool/chains/eth2/start-validator.sh``

To customize the command-line options passed to the clients:

#. If the Rocket Pool service is already running, pause it with::

    rocketpool service stop

#. Modify the above files as desired

#. Restart the Rocket Pool service with::

    rocketpool service start

Please consult the documentation for specific Eth 1.0 and Eth 2.0 clients for a full list of command-line options.
