// Profiling information
let gasUsed = {};


// Display settings
let indentStr = '  ';

// Indent text
function indent(level, str) {
    return indentStr.repeat(level) + str;
}


// Profile gas usage
export function profileGasUsage(methodName, result) {
    if (gasUsed[methodName] === undefined) gasUsed[methodName] = [];
    gasUsed[methodName].push(result.receipt.gasUsed);
}

// Display profiling information
export function displayProfiling() {
    describe('Profiling', () => {


        // Gas usage
        it('Gas Usage', () => {

            // Title
            console.log('');
            console.log(indent(2, 'Gas Usage:'));

            // Print methods
            let methodName, costs;
            for (methodName in gasUsed) {
                costs = gasUsed[methodName];

                // Method name
                console.log(indent(3, methodName + ':'));

                // Print costs
                costs.forEach((cost, index) => {
                    console.log(indent(4, '#' + (index + 1) + ' - ' + cost));
                });

            }

        });


    });
}
