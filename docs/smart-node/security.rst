.. _security-considerations:

#####################################
Security considerations
#####################################

This section is intended for more advanced users. If you misconfigure the things described in this section you could prevent your node from syncing or prevent access altogether.

.. _server-hardening:

*****************
Server hardening
*****************

Especially if your device is directly connected to the internet (if it is in a datacenter for example) it makes sense to implement some best practices such as:

- Only allowing SSH access through key files as opposed to password
- Changing your SSH port to something non-standard
- Configuring automatic security updates
- Enabling a firewall

If you want to explore more advanced options, see `this popular open-source checklist <https://github.com/imthenachoman/How-To-Secure-A-Linux-Server>`. Note that these advanced settings are beyond what most people need.

.. general-firewall:

**************************
General firewall ports
**************************

You might decide to set your firewall to "deny by default" and open up specific ports only. If you do so, consider the following ports carefully:

- SSH port: 22/tcp in/out, unless you actively changed it
- DNS port: 53 out, used by any process that queries domain names (for example update servers used by apt in Ubuntu)
- NTP port: 123 out, used by your time server which is essential for syncing accurately
- HTTP(s) ports: 80 out and 443 out, used by update processes and any others that contact webservers

.. rocketpool-firewall:

**************************
Rocketpool firewall ports
**************************

The docker containers used by Rocket Pool use different ports, depending on your configuration you will likely only need two of these.

In that case the documented ports for the containers are:

- `Go Ethereum (GETH) <https://geth.ethereum.org/docs/interface/private-network#setting-up-networking>`:  3030-30305/udp
- `Prysm <https://docs.prylabs.network/docs/prysm-usage/p2p-host-ip/#incoming-p2p-connection-prerequisites`: 13000/tcp and 13000/udp
- `Lighthouse <https://lighthouse-book.sigmaprime.io/advanced_networking.html>`: 9000/tcp and 9000/udp

Rocketpool itself uses no special ports.
