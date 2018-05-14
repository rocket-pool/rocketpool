let _ = require('underscore')._;

const PUSH_OFFSET = 0x5f
const DUP_OFFSET = 0x7f
const SWAP_OFFSET = 0x8f

/** 
 * assemblyToEVM 
 * 
 * A Javascript port of the Vyper function that converts evm assembly opcodes into bytes that can be deployed.
 * https://github.com/ethereum/vyper/blob/master/vyper/compile_lll.py#L253-#L302
 *  
*/
module.exports = function assemblyToEVM(assembly){
    let opcodes = createOpCodeLookup();

    let posmap = {};
    let sub_assemblies = [];
    let codes = [];
    let pos = 0;

    for (let i = 0; i < assembly.length; i++) {
        const item = assembly[i];
        
        if(isSymbol(item)){
            if(assembly[i+1] == 'JUMPDEST' || assembly[i+1] == 'BLANK'){
                posmap[item] = pos // Don't increment position as the symbol itself doesn't go into code                
            }
            else{
                pos += 3 // PUSH2 highbits lowbits
            }
        }
        else if(item === 'BLANK'){
            pos += 0;
        }
        else if(_.isArray(item)){
            let c = assemblyToEVM(item);
            sub_assemblies.push(item);
            codes.push(c);
            pos += c.length;
        }
        else{
            pos += 1;
        }       
    }

    posmap['_sym_codeend'] = pos;
    let o = [];

    for (let j = 0; j < assembly.length; j++) {
        const item = assembly[j];

        if (isSymbol(item)) {
            if (assembly[j+1] != 'JUMPDEST' && assembly[j+1] != 'BLANK') {
                o.push(PUSH_OFFSET + 2);
                o.push(floorDiv(posmap[item], 256));
                o.push(posmap[item] % 256);
            }
        }
        else if (_.isNumber(item)){
            o.push(item);
        }
        else if (_.isString(item) && _.some(opcodes, (op) => op.tag === item.toUpperCase())) {
            let foundOpCode = _.find(opcodes, (op) => op.tag === item.toUpperCase());
            o.push(foundOpCode.hex);
        }
        else if (_.isString(item) && item.startsWith('PUSH')) {
            o.push(PUSH_OFFSET + parseInt(item.substring(4, item.length)));
        }
        else if (_.isString(item) && item.startsWith('DUP')) {
            o.push(DUP_OFFSET + parseInt(item.substring(3, item.length)));                
        }
        else if (_.isString(item) && item.startsWith('SWAP')) {
            o.push(SWAP_OFFSET + parseInt(item.substring(4, item.length)));
        }
        else if (item === 'BLANK') {
            // pass - do nothin'
        }
        else if (_.isArray(item)) {
            for (let k = 0; k < sub_assemblies.length; k++) {
                if (sub_assemblies[k] === item) {
                    o = o.concat(codes[k]);
                    break;
                }                    
            }
        }
        else {
            // Should never reach because, assembly is create in compile_to_assembly.
            throw `Weird symbol in assembly: ${item}`;
        }        
    }

    if(o.length !== pos){
        throw `Byte array doesn't match expected length... ${o.length} should be ${pos}`;
    }

    return o;
}

function isSymbol(item){
    return _.isString(item) && item.startsWith('_sym_');
}

function floorDiv(a,b) {
    var result = a/b;
    if(result>=0)
        return Math.floor(result);
    else
        return Math.ceil(result);
}

/**
 * List of evm opcodes and their hex values
 * https://github.com/ethereum/pyethereum/blob/develop/ethereum/opcodes.py
 */
function createOpCodeLookup() {
    let opcodes = [
    { hex: 0x00, tag: 'STOP'},
    { hex: 0x01, tag: 'ADD'},
    { hex: 0x02, tag: 'MUL'},
    { hex: 0x03, tag: 'SUB'},
    { hex: 0x04, tag: 'DIV'},
    { hex: 0x05, tag: 'SDIV'},
    { hex: 0x06, tag: 'MOD'},
    { hex: 0x07, tag: 'SMOD'},
    { hex: 0x08, tag: 'ADDMOD'},
    { hex: 0x09, tag: 'MULMOD'},
    { hex: 0x0a, tag: 'EXP'},
    { hex: 0x0b, tag: 'SIGNEXTEND'},
    { hex: 0x10, tag: 'LT'},
    { hex: 0x11, tag: 'GT'},
    { hex: 0x12, tag: 'SLT'},
    { hex: 0x13, tag: 'SGT'},
    { hex: 0x14, tag: 'EQ'},
    { hex: 0x15, tag: 'ISZERO'},
    { hex: 0x16, tag: 'AND'},
    { hex: 0x17, tag: 'OR'},
    { hex: 0x18, tag: 'XOR'},
    { hex: 0x19, tag: 'NOT'},
    { hex: 0x1a, tag: 'BYTE'},
    { hex: 0x20, tag: 'SHA3'},
    { hex: 0x30, tag: 'ADDRESS'},
    { hex: 0x31, tag: 'BALANCE'},
    { hex: 0x32, tag: 'ORIGIN'},
    { hex: 0x33, tag: 'CALLER'},
    { hex: 0x34, tag: 'CALLVALUE'},
    { hex: 0x35, tag: 'CALLDATALOAD'},
    { hex: 0x36, tag: 'CALLDATASIZE'},
    { hex: 0x37, tag: 'CALLDATACOPY'},
    { hex: 0x38, tag: 'CODESIZE'},
    { hex: 0x39, tag: 'CODECOPY'},
    { hex: 0x3a, tag: 'GASPRICE'},
    { hex: 0x3b, tag: 'EXTCODESIZE'},
    { hex: 0x3c, tag: 'EXTCODECOPY'},
    { hex: 0x3d, tag: 'RETURNDATASIZE'},
    { hex: 0x3e, tag: 'RETURNDATACOPY'},
    { hex: 0x40, tag: 'BLOCKHASH'},
    { hex: 0x41, tag: 'COINBASE'},
    { hex: 0x42, tag: 'TIMESTAMP'},
    { hex: 0x43, tag: 'NUMBER'},
    { hex: 0x44, tag: 'DIFFICULTY'},
    { hex: 0x45, tag: 'GASLIMIT'},
    { hex: 0x50, tag: 'POP'},
    { hex: 0x51, tag: 'MLOAD'},
    { hex: 0x52, tag: 'MSTORE'},
    { hex: 0x53, tag: 'MSTORE8'},
    { hex: 0x54, tag: 'SLOAD'},
    { hex: 0x55, tag: 'SSTORE'},
    { hex: 0x56, tag: 'JUMP'},
    { hex: 0x57, tag: 'JUMPI'},
    { hex: 0x58, tag: 'PC'},
    { hex: 0x59, tag: 'MSIZE'},
    { hex: 0x5a, tag: 'GAS'},
    { hex: 0x5b, tag: 'JUMPDEST'},
    { hex: 0xa0, tag: 'LOG0'},
    { hex: 0xa1, tag: 'LOG1'},
    { hex: 0xa2, tag: 'LOG2'},
    { hex: 0xa3, tag: 'LOG3'},
    { hex: 0xa4, tag: 'LOG4'},
    { hex: 0xf0, tag: 'CREATE'},
    { hex: 0xf1, tag: 'CALL'},
    { hex: 0xf2, tag: 'CALLCODE'},
    { hex: 0xf3, tag: 'RETURN'},
    { hex: 0xf4, tag: 'DELEGATECALL'},
    { hex: 0xf5, tag: 'CALLBLACKBOX'},
    { hex: 0xfa, tag: 'STATICCALL'},
    { hex: 0xfd, tag: 'REVERT'},
    { hex: 0xff, tag: 'SUICIDE'}
    ];

    // insert PUSH opcodes
    for (let i = 1; i < 33; i++) {
        opcodes.push({hex: 0x5f + i, tag: `PUSH${i}`});
    }

    // insert DUP & SWAP opcodes
    for (let j = 1; j < 17; j++) {
        opcodes.push({hex: 0x7f + j, tag: `DUP${j}`});
        opcodes.push({hex: 0x8f + j, tag: `SWAP${j}`});
    }

    return opcodes;
}