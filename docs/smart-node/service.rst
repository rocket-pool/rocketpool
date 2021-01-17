.. _smart-node-service:

#######################
The Rocket Pool Service
#######################


.. _smart-node-service-start:

********************
Starting the Service
********************

Start the Rocket Pool service by running::

    rocketpool service start

This will "build up" the smart node stack, which runs it and also ensures that it stays running.
If any of the running containers crash or you restart your node, Docker will start them back up to ensure that no uptime is lost.

You can check that the containers are running correctly with::

    rocketpool service status

You should see (in any order) containers with the following names:

    * ``rocketpool_eth1``
    * ``rocketpool_eth2``
    * ``rocketpool_validator``
    * ``rocketpool_api``
    * ``rocketpool_node``
    * ``rocketpool_watchtower``


.. _smart-node-service-pause:

*******************
Pausing the Service
*******************

If you want to pause the Rocket Pool service for any reason, run::

    rocketpool service stop

This will stop all running containers, suspending their execution, but leave them intact.
Note that this will stop validators from performing their validation duties, so use this command with caution.
The service can be started up again with ``rocketpool service start``.


.. _smart-node-service-stop:

********************
Stopping the Service
********************

If you have finished interacting with the Rocket Pool network and want to stop the service entirely, run::

    rocketpool service terminate

This will "tear down" the smart node stack, stopping and removing all running containers, and deleting their state.
Not only will validators stop performing validation duties, but all Ethereum clients will need to re-sync if the service is restarted.
It is advised to use this command only if the node has no active minipools.

As a security measure, node data at ``~/.rocketpool`` (including the node wallet) will be preserved, and must be manually deleted if desired (this is not recommended).


.. _smart-node-service-config:

*************************
Reconfiguring the Service
*************************

If you want to make any configuration changes to the Rocket Pool service, run::

    rocketpool service config

This will repeat the configuration process performed after installation, and will overwrite your node's configuration file accordingly.
For the changes to take effect, restart the Rocket Pool service with ``rocketpool service start``.


.. _smart-node-service-info:

***************************
Viewing Service Information
***************************

You can check the version of the CLI client and the service with::

    rocketpool service version

You can check the current status of the service (its running containers) with::

    rocketpool service status

You can view the logs for all running containers in real-time with::

    rocketpool service logs

To view the logs for a single container, add its name at the end, e.g.::

    rocketpool service logs eth2

Press Ctrl-C to stop.

You can also view the hardware usage for each container with::

    rocketpool service stats

Press Ctrl-C to stop.


.. _smart-node-service-ports:

************************
Forwarding Service Ports
************************

Optionally, you can forward ports for Eth 1.0 and Eth 2.0 client peer discovery to the Rocket Pool service containers.
This may allow you to connect to more peers, and can potentially increase sync times.
The method for forwarding ports depends on your local network setup and is not covered in this document.
The port ranges to forward are:

* **Eth 1.0**: ``30303-30305 (TCP & UDP)``
* **Eth 2.0**: ``9001 (TCP & UDP)``
