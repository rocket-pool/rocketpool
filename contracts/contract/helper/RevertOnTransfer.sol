// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

/// @notice Helper contract to simulate malicious node withdrawal address or withdrawal address
contract RevertOnTransfer {
    bool public enabled = true;

    function setEnabled(bool _enabled) external {
        enabled = _enabled;
    }

    receive() external payable {
        require(!enabled);
    }

    function call(address _address, bytes calldata _payload) external payable {
        (bool success,) = _address.call{value: msg.value}(_payload);
        require(success, "Failed to transfer");
    }
}