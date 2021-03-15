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

#. Open ``~/.rocketpool/docker-compose.yml``, and modify the ``services.eth1`` and ``services.eth2`` sections as follows:

    * Change ``eth1clientdata:/ethclient`` to ``/path/to/eth1/storage:/ethclient`` (example only) to set a local filesystem path for your Eth 1.0 chain database
    * Change ``eth2clientdata:/ethclient`` to ``/path/to/eth2/storage:/ethclient`` (example only) to set a local filesystem path for your Eth 2.0 chain database

#. Modify the ``volumes`` section at the bottom of the file as follows:

    * Remove the ``eth1clientdata:`` line if you set a custom path for your Eth 1.0 chain database
    * Remove the ``eth2clientdata:`` line if you set a custom path for your Eth 2.0 chain database
    * Remove the ``volumes`` section entirely if it's empty

#. Restart the Rocket Pool service with::

    rocketpool service start


.. _smart-node-customization-external-clients:

******************************************
Using External Eth 1.0 and Eth 2.0 Clients
******************************************

By default, the Rocket Pool service will run its own Eth 1.0 (Geth) and Eth 2.0 (Lighthouse / Nimbus / Prysm / Teku) clients.
However, you may already have your own clients running on your host OS which you want to configure Rocket Pool to communicate with.
Note that you should still run the validator process provided by Rocket Pool, as the service performs its own key management and loads validator keys into it.

To configure Rocket Pool to use external Eth 1.0 and/or Eth 2.0 clients:

#. Configure your router's DHCP settings to lease a static IP address to your machine

#. Reconnect to your network, then find your machine's local IP address with ``ifconfig``

#. Ensure your Eth 1.0 and/or Eth 2.0 clients are listening on the address ``0.0.0.0``:

    * Geth: ``--http --http.addr 0.0.0.0 --http.port 8545 --http.vhosts *``
    * Lighthouse: ``--http --http-address 0.0.0.0 --http-port 5052``
    * Nimbus: ``--rpc --rpc-address 0.0.0.0 --rpc-port 5052``
    * Prysm: ``--rpc-host 0.0.0.0 --rpc-port 5052``
    * Teku: ``--rest-api-enabled --rest-api-interface 0.0.0.0 --rest-api-port 5052``

#. If the Rocket Pool service is already running, pause it with::

    rocketpool service stop

#. Open ``~/.rocketpool/docker-compose.yml``, and modify the ``services`` section as follows:

    * If you want to use your own Geth instance, remove the ``eth1`` section, then remove all ``- eth1`` entries under ``depends_on:`` sections
    * If you want to use your own Lighthouse, Nimbus, Prysm or Teku instance, remove the ``eth2`` section, then remove all ``- eth2`` entries under ``depends_on:`` sections
    * Remove any ``depends_on:`` sections which are empty

#. Open ``~/.rocketpool/config.yml``, and make the following changes:

    * To use your own Geth instance, update ``chains.eth1.provider`` to ``http://XXX.XXX.XXX.XXX:8545``, where ``XXX.XXX.XXX.XXX`` is your machine's local IP address
    * To use your own Lighthouse, Nimbus, Prysm or Teku instance, update ``chains.eth2.provider`` to ``XXX.XXX.XXX.XXX:5052``, where ``XXX.XXX.XXX.XXX`` is your machine's local IP address

#. Configure the Rocket Pool service, selecting Geth for your Eth 1.0 client, and the appropriate Eth 2.0 client::

    rocketpool service config

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
