// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

/// @notice Test-only mock of the EIP-7002 withdrawal request predeploy
contract WithdrawalRequestPredeployMock {
    event WithdrawalRequestQueued(address indexed caller, bytes pubkey, uint64 amount, uint256 value);

    uint256 public fee;
    bool public revertFeeQuery;
    bool public malformedFeeResponse;
    bool public revertRequest;
    uint256 public requestCount;
    address public lastCaller;
    uint256 public lastValue;
    bytes public lastRequest;

    function reset() external {
        fee = 0;
        revertFeeQuery = false;
        malformedFeeResponse = false;
        revertRequest = false;
        requestCount = 0;
        lastCaller = address(0);
        lastValue = 0;
        delete lastRequest;
    }

    function setFee(uint256 _fee) external {
        fee = _fee;
    }

    function setRevertFeeQuery(bool _revertFeeQuery) external {
        revertFeeQuery = _revertFeeQuery;
    }

    function setMalformedFeeResponse(bool _malformedFeeResponse) external {
        malformedFeeResponse = _malformedFeeResponse;
    }

    function setRevertRequest(bool _revertRequest) external {
        revertRequest = _revertRequest;
    }

    fallback() external payable {
        if (msg.data.length == 0) {
            require(!revertFeeQuery, "Fee query reverted");
            if (malformedFeeResponse) {
                assembly {
                    mstore(0, 0)
                    return(0, 1)
                }
            }
            uint256 currentFee = fee;
            assembly {
                mstore(0, currentFee)
                return(0, 32)
            }
        }

        require(!revertRequest, "Request reverted");
        require(msg.data.length == 56, "Invalid request length");
        require(msg.value >= fee, "Insufficient request fee");
        requestCount += 1;
        lastCaller = msg.sender;
        lastValue = msg.value;
        lastRequest = msg.data;
        // The predeploy accepts nonzero partial-withdrawal amounts too; acceptance alone does not imply an exit.
        emit WithdrawalRequestQueued(msg.sender, msg.data[:48], uint64(bytes8(msg.data[48:56])), msg.value);
    }
}
