.. _smart-node-upgrading:

#########################
Upgrading Your Smart Node
#########################

Rocket Pool smart nodes are not upgraded automatically, as ethereum client updates may contain breaking changes and prevent validators from working.
As such, node operators need to be aware of Rocket Pool smart node updates, and apply them manually.


.. _smart-node-upgrading-client:

###############################
Upgrading the Smart Node Client
###############################

The smart node client can be upgraded simply by downloading a new version of the binary and replacing the existing version with it.
Follow the :ref:`smart node client installation <smart-node-getting-started-installation>` instructions.


.. _smart-node-upgrading-service:

################################
Upgrading the Smart Node Service
################################

To upgrade the smart node service, first back up your ``~/.rocketpool`` directory (e.g. ``cp -r ~/.rocketpool ~/.rocketpool.bak``).
If you have made any customizations to your service configuration files, these will be overwritten.

Next, pause the service before making changes to it::

    rocketpool service pause

Then, upgrade the service configuration files with::

    rocketpool service install -d

You may optionally specify a version of the Rocket Pool smart node service to use, e.g.::

    rocketpool service install -d -v 0.0.3

Once you've upgraded the service configuration files, restore any customizations you made to the previous ones.
Then, start the service back up::

    rocketpool service start
