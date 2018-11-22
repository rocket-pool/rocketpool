pragma solidity 0.5.0;

// Libraries
import "../../lib/SafeMath.sol";

/// @title Some common maths functions
/// @author David Rugendyke

contract Maths {

    /**** Libs *****************/
    
    using SafeMath for uint;

     /**** Properties ************/

    uint256 private calcBase = 1 ether;                     // Use this as our base unit to remove the decimal place by multiplying and dividing by it since solidity doesn't support reals yet

   
    /**
    * @dev Calculate the percentage of an amount using a supplied % 
    * @param _amount The value to calculate the % on
    * @param _perc The percentage to calculate on the value given as a % of 1 Ether (eg 0.02 ether = 2%)
    * @return address
    */
    function calcPercAmount(uint256 _amount, uint256 _perc) public view returns (uint256) {
        // Make sure the % is in the range we need
        require(_perc >= 0, "Percentage given in Maths calculation less than 0.");
        require(_perc <= 1 ether, "Percentage given in Maths calculation greater than 100%.");
        // Calculate now
        return (_amount.mul(_perc)).div(calcBase);
    }
    
 
}
