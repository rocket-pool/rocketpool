// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;
pragma abicoder v2;

import "../../types/MinipoolDeposit.sol";

interface RocketNodeDepositInterface {
    struct NodeDeposit {
        uint256 bondAmount;
        bool useExpressTicket;
        bytes validatorPubkey;
        bytes validatorSignature;
        bytes32 depositDataRoot;
    }

    function getBondRequirement(uint256 _numValidators) external view returns (uint256);
    function getNodeDepositCredit(address _nodeAddress) external view returns (uint256);
    function getNodeEthBalance(address _nodeAddress) external view returns (uint256);
    function getNodeCreditAndBalance(address _nodeAddress) external view returns (uint256);
    function getNodeUsableCreditAndBalance(address _nodeAddress) external view returns (uint256);
    function getNodeUsableCredit(address _nodeAddress) external view returns (uint256);
    function increaseDepositCreditBalance(address _nodeOperator, uint256 _amount) external;
    function depositEthFor(address _nodeAddress) external payable;
    function withdrawEth(address _nodeAddress, uint256 _amount) external;
    function deposit(uint256 _depositAmount, bool _useExpressTicket, bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot) external payable;
    function depositWithCredit(uint256 _depositAmount, bool _useExpressTicket, bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot) external payable;
    function depositMulti(NodeDeposit[] calldata _deposits) external payable;
}
